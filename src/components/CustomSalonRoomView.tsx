import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Feather,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  MessageSquare,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteCustomSalon,
  deleteCustomSalonMessage,
  joinOrRequestCustomSalon,
  leaveOrRemoveSalonMember,
  respondToSalonMemberRequest,
  sendCustomSalonMessage,
  subscribeToCustomSalonMessages,
  subscribeToCustomSalonStories,
  subscribeToSalonMemberRecord,
  subscribeToSalonMembersForOwner,
} from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  STORY_FORMAT_LABELS,
} from '../lib/themes';
import {
  CustomSalon,
  CustomSalonMessage,
  FIELD_LIMITS,
  SalonMember,
  Story,
  StoryFormat,
} from '../types/story';

interface CustomSalonRoomViewProps {
  salon: CustomSalon | null;
  salonsLoaded: boolean;
  onBackToSalons: () => void;
  onEditSalon: (salon: CustomSalon) => void;
  onReadStory: (story: Story) => void;
  onWriteInCustomSalon: (salon: CustomSalon) => void;
  onOpenMemberWall: (userId: string) => void;
}

export function CustomSalonRoomView({
  salon,
  salonsLoaded,
  onBackToSalons,
  onEditSalon,
  onReadStory,
  onWriteInCustomSalon,
  onOpenMemberWall,
}: CustomSalonRoomViewProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [memberRecord, setMemberRecord] = useState<SalonMember | null>(null);
  const [ownerMembers, setOwnerMembers] = useState<SalonMember[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [messages, setMessages] = useState<CustomSalonMessage[]>([]);

  const [roomSection, setRoomSection] = useState<'stories' | 'chat' | 'members'>('stories');
  const [formatFilter, setFormatFilter] = useState<'all' | StoryFormat>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [requestNote, setRequestNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSalon, setDeletingSalon] = useState(false);

  const salonId = salon?.salonId ?? '';
  const isOwner = Boolean(user && salon && user.uid === salon.ownerId);
  const isApprovedMember = Boolean(
    isOwner || (memberRecord && memberRecord.status === 'approved')
  );
  const canViewContent = Boolean(
    salon && (salon.visibility === 'public' || isApprovedMember)
  );

  useEffect(() => {
    setRoomSection('stories');
    setSearchQuery('');
    setFormatFilter('all');
    setActionFeedback(null);
    setActionError(null);
    setConfirmDelete(false);
  }, [salonId]);

  useEffect(() => {
    if (!salon || !user) {
      setMemberRecord(null);
      return;
    }
    return subscribeToSalonMemberRecord(salon.salonId, user.uid, setMemberRecord);
  }, [salon?.salonId, user?.uid]);

  useEffect(() => {
    if (!salon || !user || !isOwner) {
      setOwnerMembers([]);
      return;
    }
    return subscribeToSalonMembersForOwner(salon.salonId, salon.ownerId, setOwnerMembers);
  }, [salon?.salonId, salon?.ownerId, user?.uid, isOwner]);

  useEffect(() => {
    if (!salon || !canViewContent) {
      setStories([]);
      return;
    }
    return subscribeToCustomSalonStories(salon.salonId, setStories);
  }, [salon?.salonId, canViewContent]);

  useEffect(() => {
    if (!salon || !user || !canViewContent) {
      setMessages([]);
      return;
    }
    return subscribeToCustomSalonMessages(salon.salonId, setMessages);
  }, [salon?.salonId, user?.uid, canViewContent]);

  const filteredStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stories.filter((story) => {
      const fmt: StoryFormat = story.storyFormat ?? 'confession';
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        story.authorName.toLowerCase().includes(q)
      );
    });
  }, [stories, formatFilter, searchQuery]);

  const pendingRequests = useMemo(
    () => ownerMembers.filter((m) => m.status === 'pending'),
    [ownerMembers]
  );
  const approvedMembers = useMemo(
    () => ownerMembers.filter((m) => m.status === 'approved'),
    [ownerMembers]
  );

  if (!salonsLoaded && !salon) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 text-center text-sm text-stone-500">
        Ouverture du salon de la communauté…
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center space-y-5">
        <p className="font-display text-2xl text-stone-900">Ce salon n’existe plus ou a été fermé</p>
        <button
          type="button"
          onClick={onBackToSalons}
          className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744]"
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
      setActionError(err instanceof Error ? err.message : 'Impossible de retirer ce membre.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setChatError(null);
    setChatBusy(true);
    try {
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
    <div className="max-w-6xl mx-auto px-6 py-8 sm:py-12 space-y-10">
      {/* Top Rail */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-stone-200">
        <button
          type="button"
          onClick={onBackToSalons}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Tous les salons</span>
        </button>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEditSalon(salon)}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Modifier règles et accès</span>
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 rounded-md hover:border-red-400 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Fermer le salon</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-1">
                <span className="text-xs text-red-900">Confirmer ?</span>
                <button
                  type="button"
                  disabled={deletingSalon}
                  onClick={() => void handleDeleteSalon()}
                  className="text-xs font-semibold text-red-800 hover:underline"
                >
                  {deletingSalon ? 'Fermeture…' : 'Oui, fermer'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-stone-600 hover:text-stone-900"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Salon Identity & Admission Rules Banner */}
      <section
        style={{
          backgroundColor: palette.softBg,
          borderColor: palette.borderTint,
          borderTopColor: palette.swatch,
        }}
        className="border border-t-2 rounded-lg p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        <div className="lg:col-span-7 space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              style={{ color: palette.textAccent }}
              className="uppercase tracking-widest font-semibold inline-flex items-center gap-1.5"
            >
              {salon.visibility === 'private' ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Salon privé · Sur admission</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Salon public · Accès libre</span>
                </>
              )}
            </span>
            <span aria-hidden="true" className="text-stone-400">
              ·
            </span>
            <span className="text-stone-600 tabular-nums inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {salon.memberCount} membre{salon.memberCount > 1 ? 's' : ''}
            </span>
            <span aria-hidden="true" className="text-stone-400">
              ·
            </span>
            <button
              type="button"
              onClick={() => onOpenMemberWall(salon.ownerId)}
              className="text-stone-700 hover:underline font-medium"
            >
              Animé par {salon.ownerName}
            </button>
          </div>

          <h1
            className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            {salon.name}
          </h1>

          <p className="text-base text-stone-700 leading-relaxed max-w-2xl">
            {salon.description}
          </p>

          {salon.promptQuestion && (
            <div className="pt-4 border-t border-stone-900/10">
              <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">
                Question sur la table
              </p>
              <p className="font-display text-lg text-stone-900 italic">
                « {salon.promptQuestion} »
              </p>
            </div>
          )}

          {/* Actions for members / visitors */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            {canViewContent && (
              <button
                type="button"
                onClick={() => onWriteInCustomSalon(salon)}
                style={{ backgroundColor: palette.accent }}
                className="min-h-[42px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Feather className="w-4 h-4" />
                <span>Publier dans ce salon</span>
              </button>
            )}

            {!isOwner && salon.visibility === 'public' && (
              isApprovedMember ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleLeaveOrCancel()}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span>Membre · Quitter</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleJoinOrRequest()}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
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
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-2 whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4 text-emerald-700" />
                <span>Membre admis · Quitter</span>
              </button>
            )}
          </div>
        </div>

        {/* Admission Rules Card */}
        <aside className="lg:col-span-5 bg-white border border-stone-200 rounded-md p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500">
            <ShieldCheck className="w-4 h-4" style={{ color: palette.textAccent }} />
            <span>Règles d’admission du salon</span>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
            {salon.admissionRules.trim()
              ? salon.admissionRules
              : salon.visibility === 'private'
                ? 'Ce salon est privé. Envoyez une courte note de présentation au créateur pour demander votre admission.'
                : 'Salon ouvert à tous dans un esprit d’écoute, de respect mutuel et de bienveillance littéraire.'}
          </p>
        </aside>
      </section>

      {actionFeedback && (
        <div className="bg-white border border-stone-300 rounded-md px-4 py-3 text-sm text-stone-900">
          {actionFeedback}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-800"
        >
          {actionError}
        </div>
      )}

      {/* Private Salon Gate (when visitor is not yet approved) */}
      {!canViewContent ? (
        <section className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 max-w-2xl mx-auto space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-stone-100 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-stone-700" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-medium text-stone-900">
                Ce salon privé demande une admission
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
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
            <div className="bg-[#FBF9F5] border border-stone-200 rounded-md p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-900">
                <Clock className="w-4 h-4 text-amber-700" />
                <span>Votre demande d’admission est en attente de validation</span>
              </div>
              {memberRecord.requestNote && (
                <p className="text-xs text-stone-600 italic">
                  Votre message : « {memberRecord.requestNote} »
                </p>
              )}
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleLeaveOrCancel()}
                className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:border-stone-500"
              >
                Retirer ma demande
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoinOrRequest} className="space-y-4">
              {memberRecord?.status === 'rejected' && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3.5 py-2.5">
                  Votre précédente demande n’avait pas été retenue. Vous pouvez préciser votre démarche et soumettre une nouvelle demande.
                </p>
              )}
              <div>
                <label
                  htmlFor="admission-request-note"
                  className="block text-sm font-medium text-stone-800 mb-1.5"
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
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-md w-fit">
              <button
                type="button"
                onClick={() => setRoomSection('stories')}
                className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  roomSection === 'stories'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Récits ({stories.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setRoomSection('chat')}
                className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  roomSection === 'chat'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Discussion ({messages.length})</span>
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setRoomSection('members')}
                  className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    roomSection === 'members'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    Admissions
                    {pendingRequests.length > 0 ? ` (${pendingRequests.length} en attente)` : ''}
                  </span>
                </button>
              )}
            </div>

            {roomSection === 'stories' && stories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 'roman', label: 'Romans' },
                    { id: 'confession', label: 'Confessions' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormatFilter(opt.id)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      formatFilter === opt.id
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Section 1: Stories */}
          {roomSection === 'stories' && (
            <section className="space-y-6">
              {stories.length > 1 && (
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher dans ce salon…"
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
              )}

              {stories.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
                  <p className="font-display text-2xl text-stone-900">
                    Ce salon attend sa première histoire
                  </p>
                  <p className="text-sm text-stone-600 max-w-lg mx-auto">
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
                <div className="bg-white border border-stone-200 rounded-lg p-8 text-center">
                  <p className="text-sm text-stone-600">
                    Aucun récit ne correspond à ce filtre dans ce salon.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredStories.map((story) => (
                    <article
                      key={story.storyId}
                      className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span style={{ color: palette.textAccent }} className="font-medium">
                            {STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label}
                          </span>
                          {story.storyFormat === 'roman' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{story.chapterCount ?? 1} chap.</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(story.authorId)}
                            className="font-medium text-stone-800 hover:underline"
                          >
                            {story.authorName}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span>{story.readingMinutes} min</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                        </div>

                        <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                          {story.title}
                        </h3>
                        <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>
                      </div>

                      <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 text-xs text-stone-500 tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Heart className="w-3.5 h-3.5" />
                            {story.resonanceCount}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {story.echoCount}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onReadStory(story)}
                          style={{ color: palette.textAccent }}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>Lire</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 2: Custom Salon Chat */}
          {roomSection === 'chat' && (
            <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-200 bg-[#FBF9F5] flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Discussion du salon
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {salon.visibility === 'private'
                      ? 'Échange réservé aux membres admis dans ce salon privé.'
                      : 'Échange écrit ouvert aux membres du salon.'}
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="p-8 text-center space-y-4">
                  <p className="text-sm text-stone-600">
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
                    {messages.length === 0 ? (
                      <p className="text-sm text-stone-500 italic text-center py-8">
                        Aucun message pour le moment. Ouvrez la conversation !
                      </p>
                    ) : (
                      messages.map((msg) => {
                        const canDeleteMsg = msg.senderId === user.uid || isOwner;
                        return (
                          <div
                            key={msg.messageId}
                            className="p-4 rounded-md border border-stone-200 bg-[#FBF9F5] space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenMemberWall(msg.senderId)}
                                  className="font-semibold text-stone-900 hover:underline"
                                >
                                  {msg.senderName}
                                </button>
                                <span className="text-stone-400">·</span>
                                <span className="text-stone-500">
                                  {formatFrenchDate(msg.createdAt?.toDate() ?? null)}
                                </span>
                              </div>
                              {canDeleteMsg && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void deleteCustomSalonMessage(salon.salonId, msg.messageId)
                                  }
                                  aria-label="Supprimer le message"
                                  className="text-stone-400 hover:text-red-700 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form
                    onSubmit={handleSendChat}
                    className="p-4 sm:p-5 border-t border-stone-200 bg-[#FBF9F5] space-y-3"
                  >
                    {chatError && (
                      <p role="alert" className="text-xs text-red-800">
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
                        className="flex-1 px-3.5 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
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

          {/* Section 3: Owner Admission & Members Management */}
          {roomSection === 'members' && isOwner && (
            <section className="space-y-8">
              <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-4">
                <h2 className="font-display text-2xl font-medium text-stone-900">
                  Demandes d’admission en attente ({pendingRequests.length})
                </h2>
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-stone-600">
                    Aucune demande d’admission en attente pour ce salon.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.userId}
                        className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(req.userId)}
                            className="text-sm font-semibold text-stone-900 hover:underline"
                          >
                            {req.userName}
                          </button>
                          {req.requestNote ? (
                            <p className="text-sm text-stone-700 leading-relaxed">
                              « {req.requestNote} »
                            </p>
                          ) : (
                            <p className="text-xs text-stone-500 italic">
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
                            className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:border-red-400 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
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

              <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-4">
                <h2 className="font-display text-2xl font-medium text-stone-900">
                  Membres admis ({approvedMembers.length})
                </h2>
                <div className="divide-y divide-stone-100">
                  {approvedMembers.map((member) => (
                    <div
                      key={member.userId}
                      className="py-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onOpenMemberWall(member.userId)}
                          className="text-sm font-medium text-stone-900 hover:underline"
                        >
                          {member.userName}
                        </button>
                        <span className="text-xs text-stone-500">
                          {member.role === 'owner' ? 'Créateur du salon' : 'Membre'}
                        </span>
                      </div>
                      {member.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(member)}
                          className="min-h-[34px] px-3 py-1 text-xs font-medium text-stone-600 hover:text-red-800 inline-flex items-center gap-1"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>Retirer</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
