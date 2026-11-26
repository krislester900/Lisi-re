import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Eye,
  Feather,
  Flag,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Repeat2,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkLocalContentHygiene,
  isContentAllowedForAge,
  isStoryCompliantForPublicFeed,
} from '../lib/contentRegulation';
import { isModerationAdminEmail } from '../lib/moderationLabels';
import { stripSharedStoryUrlFromText } from '../lib/storyShare';
import {
  createDefaultStoryFilterState,
  filterAndSortStories,
  StoryFilterState,
} from '../lib/storyFilter';
import {
  deleteCustomSalon,
  deleteCustomSalonMessage,
  formatFriendlyFirestoreError,
  joinOrRequestCustomSalon,
  leaveOrRemoveSalonMember,
  respondToSalonMemberRequest,
  runAutomatedContentBotGuard,
  sendCustomSalonMessage,
  setCustomSalonMemberRole,
  subscribeToApprovedCustomSalonMembers,
  subscribeToCustomSalonMessages,
  subscribeToCustomSalonStories,
  subscribeToSalonMemberRecord,
  subscribeToSalonMembersForOwner,
} from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
} from '../lib/themes';
import {
  CustomSalon,
  CustomSalonMessage,
  FIELD_LIMITS,
  PublicProfile,
  SalonMember,
  Story,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';
import type { ReportDraft } from './ReportModal';
import { RoleBadge, RoleBadgesRow } from './RoleBadge';
import { SalonThreadsPanel } from './SalonThreadsPanel';
import { SharedStoryPreviewCard } from './SharedStoryPreviewCard';
import { StoryFilterBar } from './StoryFilterBar';
import { StoryFormatKicker } from './StoryFormatKicker';

interface CustomSalonRoomViewProps {
  salon: CustomSalon | null;
  salonsLoaded: boolean;
  publicStories?: Story[];
  myStories?: Story[];
  hiddenUserIds?: Set<string>;
  bookmarkedStoryIds?: Set<string>;
  repostedStoryIds?: Set<string>;
  adminUserIds?: Set<string>;
  discoverableProfiles?: PublicProfile[];
  onToggleBookmark?: (story: Story) => void;
  onOpenRepost?: (story: Story) => void;
  onShareStory?: (story: Story) => void;
  onBackToSalons: () => void;
  onEditSalon: (salon: CustomSalon) => void;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onWriteInCustomSalon: (salon: CustomSalon, initialPrompt?: string, starter?: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

export function CustomSalonRoomView({
  salon,
  salonsLoaded,
  publicStories = [],
  myStories = [],
  hiddenUserIds,
  bookmarkedStoryIds,
  repostedStoryIds,
  adminUserIds,
  discoverableProfiles = [],
  onToggleBookmark,
  onOpenRepost,
  onShareStory,
  onBackToSalons,
  onEditSalon,
  onReadStory,
  onOpenStoryById,
  onWriteInCustomSalon,
  onOpenMemberWall,
  onOpenReport,
}: CustomSalonRoomViewProps) {
  const { user, profile, viewerAge, signInWithGoogle } = useAuth();
  const profilesByUserId = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const p of discoverableProfiles) {
      map.set(p.userId, p);
    }
    if (profile) {
      map.set(profile.userId, profile);
    }
    return map;
  }, [discoverableProfiles, profile]);
  const [memberRecord, setMemberRecord] = useState<SalonMember | null>(null);
  const [ownerMembers, setOwnerMembers] = useState<SalonMember[]>([]);
  const [publicApprovedMembers, setPublicApprovedMembers] = useState<SalonMember[]>([]);
  const [privateSalonStories, setPrivateSalonStories] = useState<Story[]>([]);
  const [messages, setMessages] = useState<CustomSalonMessage[]>([]);

  const [roomSection, setRoomSection] = useState<'stories' | 'threads' | 'chat' | 'members'>('stories');
  const [filterState, setFilterState] = useState<StoryFilterState>(() =>
    createDefaultStoryFilterState('recent')
  );

  const [requestNote, setRequestNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [roleBusyUserId, setRoleBusyUserId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSalon, setDeletingSalon] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const salonId = salon?.salonId ?? '';
  const isOwner = Boolean(user && salon && user.uid === salon.ownerId);
  const isGlobalAdmin = isModerationAdminEmail(user?.email);
  const isApprovedModerator = Boolean(
    memberRecord && memberRecord.status === 'approved' && memberRecord.role === 'moderator'
  );
  const canModerateSalon = Boolean(isOwner || isApprovedModerator || isGlobalAdmin);
  const isApprovedMember = Boolean(
    isOwner || isGlobalAdmin || (memberRecord && memberRecord.status === 'approved')
  );
  const canViewContent = Boolean(
    salon && (salon.visibility === 'public' || isApprovedMember)
  );

  useEffect(() => {
    setRoomSection('stories');
    setFilterState(createDefaultStoryFilterState('recent'));
    setActionFeedback(null);
    setActionError(null);
    setConfirmDelete(false);
    setShowRulesPanel(false);
    setAvatarFailed(false);
  }, [salonId]);

  useEffect(() => {
    if (!salon || !user) {
      setMemberRecord(null);
      return;
    }
    return subscribeToSalonMemberRecord(salon.salonId, user.uid, setMemberRecord);
  }, [salon?.salonId, user?.uid]);

  useEffect(() => {
    if (!salon || !user || !canModerateSalon) {
      setOwnerMembers([]);
      return;
    }
    return subscribeToSalonMembersForOwner(salon.salonId, salon.ownerId, setOwnerMembers);
  }, [salon?.salonId, salon?.ownerId, user?.uid, canModerateSalon]);

  useEffect(() => {
    if (!salon || !user || !canViewContent) {
      setPublicApprovedMembers([]);
      return;
    }
    return subscribeToApprovedCustomSalonMembers(salon.salonId, setPublicApprovedMembers);
  }, [salon?.salonId, user?.uid, canViewContent]);

  useEffect(() => {
    if (!salon || salon.visibility !== 'private' || !canViewContent) {
      setPrivateSalonStories([]);
      return;
    }
    return subscribeToCustomSalonStories(salon.salonId, 'private', setPrivateSalonStories);
  }, [salon?.salonId, salon?.visibility, canViewContent]);

  const { stories, hiddenByAgeCount } = useMemo(() => {
    if (!salon) return { stories: [] as Story[], hiddenByAgeCount: 0 };
    const byId = new Map<string, Story>();
    const sourceList = salon.visibility === 'private' ? privateSalonStories : publicStories;
    for (const s of sourceList) {
      if (
        s.customSalonId === salon.salonId &&
        !(hiddenUserIds && hiddenUserIds.has(s.authorId) && s.authorId !== user?.uid)
      ) {
        byId.set(s.storyId, s);
      }
    }
    for (const s of myStories) {
      if (s.customSalonId === salon.salonId && !byId.has(s.storyId)) {
        byId.set(s.storyId, s);
      }
    }
    const merged = Array.from(byId.values());
    const allowed: Story[] = [];
    let hidden = 0;
    for (const item of merged) {
      const isAuthor = Boolean(user && item.authorId === user.uid);
      if (isContentAllowedForAge(item, viewerAge, isAuthor)) {
        allowed.push(item);
      } else {
        hidden += 1;
      }
    }
    allowed.sort((a, b) => {
      const aMs = (a.updatedAt || a.createdAt)?.toMillis() ?? 0;
      const bMs = (b.updatedAt || b.createdAt)?.toMillis() ?? 0;
      return bMs - aMs;
    });
    return { stories: allowed, hiddenByAgeCount: hidden };
  }, [salon, privateSalonStories, publicStories, myStories, hiddenUserIds, user, viewerAge]);

  useEffect(() => {
    if (!salon || !user || !canViewContent) {
      setMessages([]);
      return;
    }
    return subscribeToCustomSalonMessages(salon.salonId, setMessages);
  }, [salon?.salonId, user?.uid, canViewContent]);

  const visibleMessages = useMemo(() => {
    if (!hiddenUserIds || hiddenUserIds.size === 0) return messages;
    return messages.filter((msg) => !hiddenUserIds.has(msg.senderId));
  }, [messages, hiddenUserIds]);

  const deferredFilter = useDeferredValue(filterState);
  const filteredStories = useMemo(
    () => filterAndSortStories(stories, deferredFilter),
    [stories, deferredFilter]
  );

  const pendingRequests = useMemo(
    () => ownerMembers.filter((m) => m.status === 'pending'),
    [ownerMembers]
  );
  const approvedMembers = useMemo(() => {
    const list = ownerMembers.filter((m) => m.status === 'approved');
    return list.length > 0 ? list : publicApprovedMembers;
  }, [ownerMembers, publicApprovedMembers]);

  const moderatorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of publicApprovedMembers) {
      if (m.status === 'approved' && m.role === 'moderator') ids.add(m.userId);
    }
    for (const m of ownerMembers) {
      if (m.status === 'approved' && m.role === 'moderator') ids.add(m.userId);
    }
    return ids;
  }, [publicApprovedMembers, ownerMembers]);

  if (!salonsLoaded && !salon) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 text-center text-sm text-stone-500 dark:text-stone-400">
        Ouverture du salon de la communauté…
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-5">
        <p className="font-display text-2xl text-stone-900 dark:text-stone-100">Ce salon n’existe plus ou a été fermé</p>
        <button
          type="button"
          onClick={onBackToSalons}
          className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744]"
        >
          Retour aux salons
        </button>
      </div>
    );
  }

  const palette = ACCENT_TONE_PALETTES[salon.accentTone] ?? ACCENT_TONE_PALETTES.ink;
  const senderDisplayName = profile?.displayName || user?.displayName || 'Auteur';

  const handleJoinOrRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setActionError(null);
    setActionFeedback(null);
    setActionBusy(true);
    try {
      const resultStatus = await joinOrRequestCustomSalon({
        salon,
        userId: user.uid,
        userName: senderDisplayName,
        requestNote,
      });
      setRequestNote('');
      setActionFeedback(
        resultStatus === 'approved'
          ? 'Vous avez rejoint ce salon. Bienvenue !'
          : 'Votre demande d’admission a bien été transmise au créateur du salon.'
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Impossible de traiter votre demande.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeaveOrCancel = async () => {
    if (!user || !memberRecord) return;
    setActionError(null);
    setActionFeedback(null);
    setActionBusy(true);
    try {
      await leaveOrRemoveSalonMember({
        salonId: salon.salonId,
        targetUserId: user.uid,
        wasApproved: memberRecord.status === 'approved',
      });
      setActionFeedback(
        memberRecord.status === 'approved'
          ? 'Vous avez quitté ce salon.'
          : 'Votre demande d’admission a été retirée.'
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleOwnerDecision = async (
    target: SalonMember,
    decision: 'approved' | 'rejected'
  ) => {
    setActionError(null);
    try {
      await respondToSalonMemberRequest({
        salonId: salon.salonId,
        targetUserId: target.userId,
        decision,
        previousStatus: target.status,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Impossible de mettre à jour ce membre.');
    }
  };

  const handleRemoveMember = async (target: SalonMember) => {
    setActionError(null);
    try {
      await leaveOrRemoveSalonMember({
        salonId: salon.salonId,
        targetUserId: target.userId,
        wasApproved: target.status === 'approved',
      });
    } catch (err) {
      setActionError(
        formatFriendlyFirestoreError(err, 'Impossible de retirer ce membre.')
      );
    }
  };

  const handleToggleModeratorRole = async (target: SalonMember) => {
    if ((!isOwner && !isGlobalAdmin) || target.role === 'owner' || roleBusyUserId) return;
    setActionError(null);
    setActionFeedback(null);
    const nextRole = target.role === 'moderator' ? 'member' : 'moderator';
    setRoleBusyUserId(target.userId);
    try {
      await setCustomSalonMemberRole({
        salonId: salon.salonId,
        targetUserId: target.userId,
        nextRole,
      });
      setActionFeedback(
        nextRole === 'moderator'
          ? `${target.userName} est désormais modérateur de ce salon.`
          : `${target.userName} n’est plus modérateur de ce salon.`
      );
    } catch (err) {
      setActionError(
        formatFriendlyFirestoreError(err, 'Impossible de modifier le rôle de ce membre.')
      );
    } finally {
      setRoleBusyUserId(null);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setChatError(null);
    if (!chatInput.trim()) return;

    const hygiene = checkLocalContentHygiene(chatInput, {
      label: 'Votre message',
      minWords: 1,
      strictSentenceQuality: false,
    });
    if (!hygiene.ok) {
      setChatError(hygiene.reason ?? 'Message non conforme.');
      return;
    }

    setChatBusy(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'chat',
        title: salon.name,
        text: chatInput,
      });
      if (!verdict.allowed) {
        setChatError(
          verdict.blockedReason ||
            'Le bot de régulation a bloqué ce message (propos offensants, haineux ou incohérents).'
        );
        return;
      }

      await sendCustomSalonMessage({
        salonId: salon.salonId,
        senderId: user.uid,
        senderName: senderDisplayName,
        rawContent: chatInput,
      });
      setChatInput('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setChatBusy(false);
    }
  };

  const handleDeleteSalon = async () => {
    setDeletingSalon(true);
    try {
      await deleteCustomSalon(salon.salonId);
      onBackToSalons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Suppression impossible.');
      setDeletingSalon(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* Top Rail */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-stone-800">
        <button
          type="button"
          onClick={onBackToSalons}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Tous les salons</span>
        </button>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEditSalon(salon)}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Modifier règles et accès</span>
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-red-800 dark:text-red-300 bg-white dark:bg-stone-900 border border-red-200 dark:border-red-900/60 rounded-md hover:border-red-400 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Fermer le salon</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-md px-3 py-1">
                <span className="text-xs text-red-900 dark:text-red-200">Confirmer ?</span>
                <button
                  type="button"
                  disabled={deletingSalon}
                  onClick={() => void handleDeleteSalon()}
                  className="text-xs font-semibold text-red-800 dark:text-red-300 hover:underline"
                >
                  {deletingSalon ? 'Fermeture…' : 'Oui, fermer'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact Salon Identity & Admission Rules Banner */}
      <section
        style={{
          ['--salon-bg' as string]: palette.softBg,
          borderColor: palette.borderTint,
          borderTopColor: palette.swatch,
        }}
        className="bg-[var(--salon-bg)] dark:bg-stone-900 border border-t-2 rounded-lg p-5 sm:p-7 space-y-4"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            {salon.avatarUrl && !avatarFailed ? (
              <img
                src={salon.avatarUrl}
                alt={`Photo du salon ${salon.name}`}
                onError={() => setAvatarFailed(true)}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-md object-cover border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shrink-0"
              />
            ) : (
              <div
                style={{ borderColor: palette.borderTint }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-md border bg-white dark:bg-stone-800 flex items-center justify-center shrink-0"
              >
                {salon.visibility === 'private' ? (
                  <Lock className="w-6 h-6" style={{ color: palette.textAccent }} />
                ) : (
                  <Globe className="w-6 h-6" style={{ color: palette.textAccent }} />
                )}
              </div>
            )}

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  style={{ color: palette.textAccent }}
                  className="uppercase tracking-widest font-semibold inline-flex items-center gap-1.5 dark:brightness-125"
                >
                  {salon.visibility === 'private' ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Salon privé</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Salon public</span>
                    </>
                  )}
                </span>
                <span aria-hidden="true" className="text-stone-400">
                  ·
                </span>
                <span className="text-stone-600 dark:text-stone-300 tabular-nums inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {salon.memberCount} membre{salon.memberCount > 1 ? 's' : ''}
                </span>
                <span aria-hidden="true" className="text-stone-400">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onOpenMemberWall(salon.ownerId)}
                  className="text-stone-700 dark:text-stone-200 hover:underline font-medium"
                >
                  Animé par {salon.ownerName}
                </button>
                <RoleBadgesRow
                  isAdmin={Boolean(adminUserIds?.has(salon.ownerId))}
                  isOwner
                  compact
                />
                {moderatorIds.size > 0 && (
                  <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-300">
                    <span aria-hidden="true">·</span>
                    <RoleBadge role="moderator" compact />
                    <span className="tabular-nums">{moderatorIds.size}</span>
                  </span>
                )}
                <MatureContentBadge minAge={salon.minAge} compact />
              </div>

              <h1
                className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {salon.name}
              </h1>
            </div>
          </div>

          {salon.description && (
            <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed max-w-2xl">
              {salon.description}
            </p>
          )}

          {salon.promptQuestion && (
            <p className="text-sm text-stone-700 dark:text-stone-300 italic">« {salon.promptQuestion} »</p>
          )}

          {/* Actions for members / visitors */}
          <div className="pt-1 flex flex-wrap items-center gap-2.5">
            {canViewContent && (
              <button
                type="button"
                onClick={() => onWriteInCustomSalon(salon)}
                style={{ backgroundColor: palette.accent }}
                className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Feather className="w-4 h-4" />
                <span>Publier dans ce salon</span>
              </button>
            )}

            {canViewContent && (
              <button
                type="button"
                aria-expanded={showRulesPanel}
                onClick={() => setShowRulesPanel((prev) => !prev)}
                className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: palette.textAccent }} />
                <span>Règles d’admission</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-stone-500 dark:text-stone-400 transition-transform duration-200 ${
                    showRulesPanel ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}

            {!isOwner && salon.visibility === 'public' && (
              isApprovedMember ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleLeaveOrCancel()}
                  className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Membre · Quitter</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleJoinOrRequest()}
                  className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-800 dark:text-stone-100 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Users className="w-4 h-4" />
                  <span>{actionBusy ? 'Adhésion…' : 'Rejoindre ce salon'}</span>
                </button>
              )
            )}

            {!isOwner && salon.visibility === 'private' && isApprovedMember && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleLeaveOrCancel()}
                className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Membre admis · Quitter</span>
              </button>
            )}
          </div>
        </div>

        {/* Admission Rules Card: always visible when requesting admission, collapsible once inside */}
        {(!canViewContent || showRulesPanel) && (
          <aside className="bg-white dark:bg-stone-950/70 border border-stone-200 dark:border-stone-700 rounded-md p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: palette.textAccent }} />
              <span>Règles d’admission</span>
            </div>
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line">
              {salon.admissionRules.trim()
                ? salon.admissionRules
                : salon.visibility === 'private'
                  ? 'Ce salon est privé. Envoyez une courte note de présentation au créateur pour demander votre admission.'
                  : 'Salon ouvert à tous dans un esprit d’écoute, de respect mutuel et de bienveillance littéraire.'}
            </p>
          </aside>
        )}
      </section>

      {actionFeedback && (
        <div className="bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md px-4 py-3 text-sm text-stone-900 dark:text-stone-100">
          {actionFeedback}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-md px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          {actionError}
        </div>
      )}

      {/* Private Salon Gate (when visitor is not yet approved) */}
      {!canViewContent ? (
        <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-7 sm:p-10 max-w-2xl mx-auto space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-stone-700 dark:text-stone-300" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
                Ce salon privé demande une admission
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Les récits et le fil de discussion de « {salon.name} » sont réservés aux membres acceptés par {salon.ownerName}.
              </p>
            </div>
          </div>

          {!user ? (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              style={{ backgroundColor: palette.accent }}
              className="min-h-[42px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity"
            >
              Se connecter pour demander l’accès
            </button>
          ) : memberRecord?.status === 'pending' ? (
            <div className="bg-[#FBF9F5] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-md p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>Votre demande d’admission est en attente de validation</span>
              </div>
              {memberRecord.requestNote && (
                <p className="text-xs text-stone-600 dark:text-stone-400 italic">
                  Votre message : « {memberRecord.requestNote} »
                </p>
              )}
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleLeaveOrCancel()}
                className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500"
              >
                Retirer ma demande
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoinOrRequest} className="space-y-4">
              {memberRecord?.status === 'rejected' && (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md px-3.5 py-2.5">
                  Votre précédente demande n’avait pas été retenue. Vous pouvez préciser votre démarche et soumettre une nouvelle demande.
                </p>
              )}
              <div>
                <label
                  htmlFor="admission-request-note"
                  className="block text-sm font-medium text-stone-800 dark:text-stone-200 mb-1.5"
                >
                  Mot de présentation pour {salon.ownerName} (facultatif)
                </label>
                <textarea
                  id="admission-request-note"
                  rows={3}
                  maxLength={FIELD_LIMITS.salonRequestNote.max}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Expliquez brièvement pourquoi ce salon vous parle ou répondez aux règles d’admission ci-dessus…"
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={actionBusy}
                style={{ backgroundColor: palette.accent }}
                className="min-h-[42px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {actionBusy ? 'Envoi en cours…' : 'Demander l’admission au salon'}
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
          {/* Section Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-4">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-800 rounded-md w-fit">
              <button
                type="button"
                onClick={() => setRoomSection('stories')}
                className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  roomSection === 'stories'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Récits ({stories.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setRoomSection('threads')}
                className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  roomSection === 'threads'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                <MessagesSquare className="w-3.5 h-3.5" />
                <span>Fils de discussion</span>
              </button>
              <button
                type="button"
                onClick={() => setRoomSection('chat')}
                className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  roomSection === 'chat'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Discussion ({visibleMessages.length})</span>
              </button>
              {canModerateSalon && (
                <button
                  type="button"
                  onClick={() => setRoomSection('members')}
                  className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    roomSection === 'members'
                      ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    Membres &amp; modération
                    {pendingRequests.length > 0 ? ` (${pendingRequests.length} en attente)` : ''}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Section 1: Stories */}
          {roomSection === 'stories' && (
            <section className="space-y-6">
              {hiddenByAgeCount > 0 && (
                <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-md px-4 py-2.5 text-xs text-amber-950 dark:text-amber-200">
                  {hiddenByAgeCount} récit{hiddenByAgeCount > 1 ? 's' : ''} classé{hiddenByAgeCount > 1 ? 's' : ''} pour un public plus âgé ou mature {hiddenByAgeCount > 1 ? 'sont masqués' : 'est masqué'} selon votre profil d’âge{viewerAge === null ? ' (renseignez votre âge dans Profils pour adapter le filtre)' : ''}.
                </div>
              )}

              {stories.length > 0 && (
                <StoryFilterBar
                  value={filterState}
                  onChange={setFilterState}
                  defaultSort="recent"
                  searchPlaceholder="Rechercher dans ce salon…"
                  ariaLabel={`Trier et filtrer les récits de ${salon.name}`}
                  totalCount={stories.length}
                  filteredCount={filteredStories.length}
                />
              )}

              {stories.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-10 text-center space-y-4">
                  <p className="font-display text-2xl text-stone-900 dark:text-stone-100">
                    Ce salon attend sa première histoire
                  </p>
                  <p className="text-sm text-stone-600 dark:text-stone-400 max-w-lg mx-auto">
                    Déposez une confession ou le premier chapitre d’un roman pour lancer la vie littéraire de ce lieu.
                  </p>
                  <button
                    type="button"
                    onClick={() => onWriteInCustomSalon(salon)}
                    style={{ backgroundColor: palette.accent }}
                    className="min-h-[40px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90"
                  >
                    Écrire le premier texte
                  </button>
                </div>
              ) : filteredStories.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8 text-center space-y-3">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Aucun récit ne correspond à ce filtre dans ce salon.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilterState(createDefaultStoryFilterState('recent'))}
                    className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredStories.map((story) => (
                    <article
                      key={story.storyId}
                      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                          <StoryFormatKicker story={story} showDetails={true} />
                          <span aria-hidden="true">·</span>
                          {story.isAnonymous ? (
                            <span className="font-medium text-stone-600 dark:text-stone-300">Auteur anonyme</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenMemberWall(story.authorId)}
                                className="font-medium text-stone-800 dark:text-stone-200 hover:underline"
                              >
                                {story.authorName}
                              </button>
                              <RoleBadgesRow
                                isAdmin={Boolean(
                                  profilesByUserId.get(story.authorId)?.isAdmin ||
                                    adminUserIds?.has(story.authorId)
                                )}
                                isOwner={story.authorId === salon.ownerId}
                                isModerator={moderatorIds.has(story.authorId)}
                                profileBadges={profilesByUserId.get(story.authorId)?.badges}
                                compact
                              />
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{story.readingMinutes} min</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                          <MatureContentBadge
                            minAge={story.minAge}
                            isMature={story.isMature}
                            compact
                          />
                        </div>

                        {story.storyFormat === 'roman' && story.coverUrl ? (
                          <div className="flex items-start gap-4">
                            <NovelCoverArt
                              coverUrl={story.coverUrl}
                              title={story.title}
                              genre={story.novelGenre}
                              accentColor={palette.accent}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <h3 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                {story.title}
                              </h3>
                              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                                {story.excerpt}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                              {story.title}
                            </h3>
                            <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{story.excerpt}</p>
                          </>
                        )}
                      </div>

                      <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3.5 text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                          <span className="inline-flex items-center gap-1" title="Vues">
                            <Eye className="w-3.5 h-3.5" />
                            {story.viewCount ?? 0}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Résonances">
                            <Heart className="w-3.5 h-3.5" />
                            {story.resonanceCount}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Commentaires">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {story.echoCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {onToggleBookmark && (
                            <button
                              type="button"
                              onClick={() => onToggleBookmark(story)}
                              title={
                                bookmarkedStoryIds?.has(story.storyId)
                                  ? 'Retirer des favoris'
                                  : 'Enregistrer pour lire plus tard'
                              }
                              aria-label="Enregistrer pour lire plus tard"
                              className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                bookmarkedStoryIds?.has(story.storyId)
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800 dark:hover:text-stone-100'
                              }`}
                            >
                              <Bookmark
                                className={`w-3.5 h-3.5 ${
                                  bookmarkedStoryIds?.has(story.storyId) ? 'fill-current' : ''
                                }`}
                              />
                            </button>
                          )}
                          {onOpenRepost && (
                            <button
                              type="button"
                              onClick={() => onOpenRepost(story)}
                              title={
                                repostedStoryIds?.has(story.storyId)
                                  ? 'Repartagé — Modifier'
                                  : 'Repartager sur mon compte'
                              }
                              aria-label="Repartager"
                              className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                repostedStoryIds?.has(story.storyId)
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800 dark:hover:text-stone-100'
                              }`}
                            >
                              <Repeat2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onShareStory &&
                            salon.visibility !== 'private' &&
                            isStoryCompliantForPublicFeed(story) && (
                              <button
                                type="button"
                                onClick={() => onShareStory(story)}
                                title="Partager ce récit"
                                aria-label={`Partager ${story.title}`}
                                className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D] dark:hover:text-amber-300 transition-colors"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => onReadStory(story)}
                            style={{ color: palette.textAccent }}
                            className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap dark:brightness-125"
                          >
                            <span>Lire</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 1b: Discussion Threads / Topics */}
          {roomSection === 'threads' && (
            <SalonThreadsPanel
              scope="custom"
              salonId={salon.salonId}
              salonTitle={salon.name}
              salonOwnerId={salon.ownerId}
              viewerAge={viewerAge}
              canPost={canViewContent}
              adminUserIds={adminUserIds}
              moderatorIds={moderatorIds}
              profilesByUserId={profilesByUserId}
              canModerate={canModerateSalon}
              onOpenMemberWall={onOpenMemberWall}
              onWriteFromThread={(tTitle, tBody) =>
                onWriteInCustomSalon(
                  salon,
                  tTitle,
                  tBody ? `${tBody.slice(0, 140)} ` : ''
                )
              }
              onOpenReport={onOpenReport}
            />
          )}

          {/* Section 2: Custom Salon Chat */}
          {roomSection === 'chat' && (
            <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-stone-950 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-medium text-stone-900 dark:text-stone-100">
                    Discussion du salon
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {salon.visibility === 'private'
                      ? 'Échange réservé aux membres admis dans ce salon privé.'
                      : 'Échange écrit ouvert aux membres du salon.'}
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="p-8 text-center space-y-4">
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Connectez-vous pour lire et participer au chat de ce salon.
                  </p>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    style={{ backgroundColor: palette.accent }}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white rounded-md"
                  >
                    Se connecter
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6 space-y-4 max-h-[440px] overflow-y-auto">
                    {visibleMessages.length === 0 ? (
                      <p className="text-sm text-stone-500 dark:text-stone-400 italic text-center py-8">
                        Aucun message pour le moment. Ouvrez la conversation !
                      </p>
                    ) : (
                      visibleMessages.map((msg) => {
                        const canDeleteMsg = msg.senderId === user.uid || canModerateSalon;
                        const canReportMsg = Boolean(onOpenReport && msg.senderId !== user.uid);
                        const cleanText = stripSharedStoryUrlFromText(msg.content);
                        return (
                          <div
                            key={msg.messageId}
                            className="p-4 rounded-md border border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-stone-950 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenMemberWall(msg.senderId)}
                                  className="font-semibold text-stone-900 dark:text-stone-100 hover:underline"
                                >
                                  {msg.senderName}
                                </button>
                                <RoleBadgesRow
                                  isAdmin={Boolean(
                                    profilesByUserId.get(msg.senderId)?.isAdmin ||
                                      adminUserIds?.has(msg.senderId)
                                  )}
                                  isOwner={msg.senderId === salon.ownerId}
                                  isModerator={moderatorIds.has(msg.senderId)}
                                  profileBadges={profilesByUserId.get(msg.senderId)?.badges}
                                  compact
                                />
                                <span className="text-stone-400">·</span>
                                <span className="text-stone-500 dark:text-stone-400">
                                  {formatFrenchDate(msg.createdAt?.toDate() ?? null)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {canReportMsg && onOpenReport && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenReport({
                                        targetUserId: msg.senderId,
                                        targetUserName: msg.senderName,
                                        targetType: 'salon_message',
                                        targetId: msg.messageId,
                                        targetContextId: salon.salonId,
                                        targetExcerpt: msg.content,
                                        targetSummaryLabel: `Signaler un message dans ${salon.name}`,
                                      })
                                    }
                                    title="Signaler ce message"
                                    aria-label="Signaler ce message"
                                    className="text-stone-400 hover:text-red-700 dark:hover:text-red-400 p-1"
                                  >
                                    <Flag className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canDeleteMsg && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void deleteCustomSalonMessage(salon.salonId, msg.messageId)
                                    }
                                    aria-label="Supprimer le message"
                                    className="text-stone-400 hover:text-red-700 dark:hover:text-red-400 p-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {cleanText && (
                              <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap">
                                {cleanText}
                              </p>
                            )}
                            <SharedStoryPreviewCard
                              content={msg.content}
                              stories={publicStories.length > 0 ? publicStories : stories}
                              onReadStory={onReadStory}
                              onOpenStoryById={onOpenStoryById}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form
                    onSubmit={handleSendChat}
                    className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-stone-950 space-y-3"
                  >
                    {chatError && (
                      <p role="alert" className="text-xs text-red-800 dark:text-red-300">
                        {chatError}
                      </p>
                    )}
                    <div className="flex items-end gap-3">
                      <textarea
                        rows={2}
                        maxLength={FIELD_LIMITS.salonChatContent.max}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={`Écrire dans ${salon.name}…`}
                        className="flex-1 px-3.5 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-amber-400"
                      />
                      <button
                        type="submit"
                        disabled={chatBusy || !chatInput.trim()}
                        style={{ backgroundColor: palette.accent }}
                        className="min-h-[42px] px-4 py-2 text-xs font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Envoyer</span>
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          )}

          {/* Section 3: Owner & Moderator Admission & Members Management */}
          {roomSection === 'members' && canModerateSalon && (
            <section className="space-y-8">
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 space-y-4">
                <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
                  Demandes d’admission en attente ({pendingRequests.length})
                </h2>
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    Aucune demande d’admission en attente pour ce salon.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.userId}
                        className="p-4 bg-[#FBF9F5] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(req.userId)}
                            className="text-sm font-semibold text-stone-900 dark:text-stone-100 hover:underline"
                          >
                            {req.userName}
                          </button>
                          {req.requestNote ? (
                            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                              « {req.requestNote} »
                            </p>
                          ) : (
                            <p className="text-xs text-stone-500 dark:text-stone-400 italic">
                              Aucun mot de présentation joint.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleOwnerDecision(req, 'approved')}
                            className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-800 rounded-md hover:bg-emerald-900 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accepter</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOwnerDecision(req, 'rejected')}
                            className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-red-400 hover:text-red-800 dark:hover:text-red-300 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 space-y-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
                    Membres admis ({approvedMembers.length})
                  </h2>
                  {(isOwner || isGlobalAdmin) && (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      Vous pouvez nommer des modérateurs parmi les membres admis pour veiller sur les discussions et les admissions de ce salon.
                    </p>
                  )}
                </div>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {approvedMembers.map((member) => {
                    const canPromoteOrDemote =
                      (isOwner || isGlobalAdmin) && member.role !== 'owner';
                    const canRemoveThisMember =
                      member.role !== 'owner' &&
                      (isOwner ||
                        isGlobalAdmin ||
                        (isApprovedModerator && member.role === 'member'));
                    return (
                      <div
                        key={member.userId}
                        className="py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(member.userId)}
                            className="text-sm font-medium text-stone-900 dark:text-stone-100 hover:underline"
                          >
                            {member.userName}
                          </button>
                          <RoleBadgesRow
                            isAdmin={Boolean(
                              profilesByUserId.get(member.userId)?.isAdmin ||
                                adminUserIds?.has(member.userId)
                            )}
                            isOwner={member.role === 'owner'}
                            isModerator={member.role === 'moderator'}
                            profileBadges={profilesByUserId.get(member.userId)?.badges}
                            compact
                          />
                          {member.role === 'member' && (
                            <span className="text-xs text-stone-500 dark:text-stone-400">Membre</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {canPromoteOrDemote && (
                            <button
                              type="button"
                              disabled={roleBusyUserId === member.userId}
                              onClick={() => void handleToggleModeratorRole(member)}
                              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                                member.role === 'moderator'
                                  ? 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:border-stone-500'
                                  : 'border-[#CBD6E6] dark:border-sky-800 bg-[#F3F6FA] dark:bg-sky-950/50 text-[#1B365D] dark:text-sky-200 hover:border-[#1B365D]'
                              }`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>
                                {member.role === 'moderator'
                                  ? 'Retirer modérateur'
                                  : 'Nommer modérateur'}
                              </span>
                            </button>
                          )}
                          {canRemoveThisMember && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(member)}
                              className="min-h-[34px] px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-red-800 dark:hover:text-red-400 inline-flex items-center gap-1"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              <span>Retirer</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
