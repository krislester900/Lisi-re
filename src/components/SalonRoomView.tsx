import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronDown,
  Compass,
  Eye,
  Feather,
  Heart,
  HelpCircle,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Repeat2,
  Share2,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  isContentAllowedForAge,
  isStoryCompliantForPublicFeed,
} from '../lib/contentRegulation';
import { isModerationAdminEmail } from '../lib/moderationLabels';
import {
  createDefaultStoryFilterState,
  filterAndSortStories,
  StoryFilterState,
} from '../lib/storyFilter';
import {
  assignPredefinedSalonModerator,
  formatFriendlyFirestoreError,
  revokePredefinedSalonModerator,
} from '../lib/storyService';
import {
  formatCumulativeMinutes,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  SALON_FAQ_ITEMS,
  SalonFaqItem,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import {
  PredefinedSalonModerator,
  PublicProfile,
  Story,
  StoryThemeId,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';
import type { ReportDraft } from './ReportModal';
import { RoleBadge, RoleBadgesRow } from './RoleBadge';
import { SalonChatPanel } from './SalonChatPanel';
import { SalonEmblem } from './SalonEmblem';
import { SalonThreadsPanel } from './SalonThreadsPanel';
import { StoryFilterBar } from './StoryFilterBar';
import { StoryFormatKicker } from './StoryFormatKicker';

interface SalonRoomViewProps {
  salonId: StoryThemeId;
  publicStories: Story[];
  storiesLoaded: boolean;
  hiddenUserIds?: Set<string>;
  bookmarkedStoryIds?: Set<string>;
  repostedStoryIds?: Set<string>;
  adminUserIds?: Set<string>;
  moderators?: PredefinedSalonModerator[];
  discoverableProfiles?: PublicProfile[];
  onToggleBookmark?: (story: Story) => void;
  onOpenRepost?: (story: Story) => void;
  onShareStory?: (story: Story) => void;
  onSelectSalon: (salonId: StoryThemeId | null) => void;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onWriteInSalon: (theme: StoryThemeId, promptQuestion?: string, starter?: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

type SalonTabId = 'stories' | 'threads' | 'chat' | 'guide';

export function SalonRoomView({
  salonId,
  publicStories,
  storiesLoaded,
  hiddenUserIds,
  bookmarkedStoryIds,
  repostedStoryIds,
  adminUserIds,
  moderators = [],
  discoverableProfiles = [],
  onToggleBookmark,
  onOpenRepost,
  onShareStory,
  onSelectSalon,
  onReadStory,
  onOpenStoryById,
  onWriteInSalon,
  onOpenMemberWall,
  onOpenReport,
}: SalonRoomViewProps) {
  const { user, viewerAge } = useAuth();
  const [filterState, setFilterState] = useState<StoryFilterState>(() =>
    createDefaultStoryFilterState('recent')
  );
  const [roomSection, setRoomSection] = useState<SalonTabId>('stories');
  const [imgFailed, setImgFailed] = useState(false);
  const [faqCategory, setFaqCategory] = useState<'all' | SalonFaqItem['category']>('all');
  const [openFaqId, setOpenFaqId] = useState<string>(SALON_FAQ_ITEMS[0]?.id ?? '');
  const [showModeratorsPanel, setShowModeratorsPanel] = useState(false);
  const [modSearch, setModSearch] = useState('');
  const [modBusyId, setModBusyId] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [modFeedback, setModFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFilterState(createDefaultStoryFilterState('recent'));
    setRoomSection('stories');
    setImgFailed(false);
    setShowModeratorsPanel(false);
    setModSearch('');
    setModError(null);
    setModFeedback(null);
  }, [salonId]);

  const profilesByUserId = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const p of discoverableProfiles) {
      map.set(p.userId, p);
    }
    return map;
  }, [discoverableProfiles]);

  const deferredFilter = useDeferredValue(filterState);
  const salon = THEME_MAP[salonId];
  const currentIndex = STORY_THEMES.findIndex((t) => t.id === salonId);
  const prevSalon =
    STORY_THEMES[(currentIndex - 1 + STORY_THEMES.length) % STORY_THEMES.length];
  const nextSalon = STORY_THEMES[(currentIndex + 1) % STORY_THEMES.length];

  const { allInSalon, hiddenByAgeCount } = useMemo(() => {
    const allowed: Story[] = [];
    let hiddenCount = 0;
    for (const story of publicStories) {
      if (
        story.theme === salonId &&
        !story.customSalonId &&
        story.storyScope !== 'pelemele' &&
        !(hiddenUserIds && hiddenUserIds.has(story.authorId))
      ) {
        const isAuthor = Boolean(user && story.authorId === user.uid);
        if (isContentAllowedForAge(story, viewerAge, isAuthor)) {
          allowed.push(story);
        } else {
          hiddenCount += 1;
        }
      }
    }
    return { allInSalon: allowed, hiddenByAgeCount: hiddenCount };
  }, [publicStories, salonId, hiddenUserIds, user, viewerAge]);

  const salonStories = useMemo(
    () => filterAndSortStories(allInSalon, deferredFilter),
    [allInSalon, deferredFilter]
  );

  const filteredFaqItems = useMemo(
    () =>
      faqCategory === 'all'
        ? SALON_FAQ_ITEMS
        : SALON_FAQ_ITEMS.filter((item) => item.category === faqCategory),
    [faqCategory]
  );

  const totalInSalon = allInSalon.length;
  const totalEchoesInSalon = useMemo(
    () => allInSalon.reduce((sum, s) => sum + (s.echoCount || 0), 0),
    [allInSalon]
  );
  const totalMinutesInSalon = useMemo(
    () => allInSalon.reduce((sum, s) => sum + (s.readingMinutes || 0), 0),
    [allInSalon]
  );

  const isGlobalAdmin = isModerationAdminEmail(user?.email);
  const moderatorIds = useMemo(
    () => new Set(moderators.map((m) => m.userId)),
    [moderators]
  );
  const canModerateSalon = Boolean(
    isGlobalAdmin || (user && moderatorIds.has(user.uid))
  );

  const candidateProfiles = useMemo(() => {
    const q = modSearch.trim().toLowerCase();
    return discoverableProfiles
      .filter((p) => !moderatorIds.has(p.userId))
      .filter((p) => {
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          (p.bio ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [discoverableProfiles, moderatorIds, modSearch]);

  const handleAppointModerator = async (target: PublicProfile) => {
    if (!user || !isGlobalAdmin || modBusyId) return;
    setModError(null);
    setModFeedback(null);
    setModBusyId(target.userId);
    try {
      await assignPredefinedSalonModerator({
        salonId,
        targetUserId: target.userId,
        targetUserName: target.displayName,
        assignedById: user.uid,
      });
      setModFeedback(`${target.displayName} a été nommé modérateur de ${salon.shortSalonName}.`);
    } catch (err) {
      setModError(
        formatFriendlyFirestoreError(err, 'Impossible de nommer ce modérateur.')
      );
    } finally {
      setModBusyId(null);
    }
  };

  const handleRevokeModerator = async (mod: PredefinedSalonModerator) => {
    if (!user || !isGlobalAdmin || modBusyId) return;
    setModError(null);
    setModFeedback(null);
    setModBusyId(mod.userId);
    try {
      await revokePredefinedSalonModerator(salonId, mod.userId);
      setModFeedback(`${mod.userName} n’est plus modérateur de ${salon.shortSalonName}.`);
    } catch (err) {
      setModError(
        formatFriendlyFirestoreError(err, 'Impossible de retirer ce modérateur.')
      );
    } finally {
      setModBusyId(null);
    }
  };

  const leadStory = salonStories[0] ?? null;
  const secondaryStories = salonStories.slice(1);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* Clean Salon Breadcrumb & Prev/Next Bar (all 6 salons live in the sidebar) */}
      <div className="flex items-center justify-between gap-2 pb-4 border-b border-stone-200 dark:border-stone-800">
        <button
          type="button"
          onClick={() => onSelectSalon(null)}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Tous les salons</span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onSelectSalon(prevSalon.id)}
            title={`Salon précédent : ${prevSalon.shortSalonName}`}
            aria-label={`Salon précédent : ${prevSalon.shortSalonName}`}
            className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{prevSalon.shortSalonName}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSalon(nextSalon.id)}
            title={`Salon suivant : ${nextSalon.shortSalonName}`}
            aria-label={`Salon suivant : ${nextSalon.shortSalonName}`}
            className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 hover:text-stone-900 dark:hover:text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap"
          >
            <span className="sm:hidden">Suivant</span>
            <span className="hidden sm:inline">{nextSalon.shortSalonName}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact Salon Header Banner (no wall of prose before stories) */}
      <section
        aria-labelledby="salon-room-heading"
        style={{
          ['--salon-bg' as string]: salon.palette.softBg,
          borderColor: salon.palette.borderTint,
          borderTopColor: salon.palette.swatch,
        }}
        className="bg-[var(--salon-bg)] dark:bg-stone-900 border dark:border-stone-800 border-t-2 rounded-lg p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center"
      >
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              style={{
                borderColor: salon.palette.borderTint,
              }}
              className="w-9 h-9 rounded-md border bg-white dark:bg-stone-800 flex items-center justify-center shrink-0"
            >
              <SalonEmblem
                type={salon.emblem}
                color={salon.palette.textAccent}
                className="w-4 h-4"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-stone-600 dark:text-stone-400 tabular-nums">
                Salon {salon.romanIndex} · {salon.atmosphere} · {totalInSalon} récit
                {totalInSalon > 1 ? 's' : ''}
              </p>
              <h1
                id="salon-room-heading"
                className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {salon.salonName}
              </h1>
            </div>
          </div>

          <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed max-w-2xl">
            « {salon.promptQuestion} »
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() =>
                onWriteInSalon(
                  salon.id,
                  salon.promptQuestion,
                  `${salon.starterSentence} `
                )
              }
              style={{ backgroundColor: salon.palette.accent }}
              className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Feather className="w-4 h-4" />
              <span>Publier dans ce salon</span>
            </button>

            {salonId === 'faq' && roomSection !== 'guide' && (
              <button
                type="button"
                onClick={() => setRoomSection('guide')}
                className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <HelpCircle className="w-4 h-4 text-[#2D4A53] dark:text-sky-300" />
                <span>Lire la FAQ ({SALON_FAQ_ITEMS.length})</span>
              </button>
            )}

            {isGlobalAdmin && (
              <button
                type="button"
                aria-expanded={showModeratorsPanel}
                onClick={() => setShowModeratorsPanel((prev) => !prev)}
                className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#1B365D] dark:text-sky-300 bg-white dark:bg-stone-800 border border-[#1B365D]/35 dark:border-sky-400/35 rounded-md hover:border-[#1B365D] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  Gérer les modérateurs{moderators.length > 0 ? ` (${moderators.length})` : ''}
                </span>
              </button>
            )}
          </div>

          {moderators.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-stone-700 dark:text-stone-300">
              <RoleBadge role="moderator" compact />
              <span className="text-stone-500 dark:text-stone-400">Modération du salon :</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {moderators.map((mod, idx) => (
                  <React.Fragment key={mod.userId}>
                    <button
                      type="button"
                      onClick={() => onOpenMemberWall(mod.userId)}
                      className="font-medium text-stone-900 dark:text-stone-100 hover:underline"
                    >
                      {mod.userName}
                    </button>
                    {idx < moderators.length - 1 && (
                      <span className="text-stone-400" aria-hidden="true">
                        ·
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>

        <figure className="lg:col-span-4 hidden sm:block">
          {!imgFailed ? (
            <img
              src={salon.imageUrl}
              alt={salon.imageAlt}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              style={{
                objectPosition: salon.imagePosition ?? 'center',
              }}
              className={`w-full h-44 lg:h-48 rounded-sm border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 ${
                salon.imageFit === 'contain' ? 'object-contain p-4' : 'object-cover'
              }`}
            />
          ) : (
            <div
              style={{ borderColor: salon.palette.borderTint }}
              className="w-full h-44 lg:h-48 rounded-sm border bg-white dark:bg-stone-800 flex flex-col items-center justify-center p-6 text-center"
            >
              <SalonEmblem
                type={salon.emblem}
                color={salon.palette.textAccent}
                className="w-8 h-8 mb-2"
              />
              <p className="font-display text-base text-stone-800 dark:text-stone-200">{salon.salonName}</p>
            </div>
          )}
        </figure>
      </section>

      {isGlobalAdmin && showModeratorsPanel && (
        <section
          aria-label={`Gestion des modérateurs de ${salon.salonName}`}
          className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role="admin" compact />
                <h2 className="font-display text-xl font-medium text-stone-900 dark:text-stone-100">
                  Modérateurs de {salon.salonName}
                </h2>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Les modérateurs désignés reçoivent un badge dans ce salon et peuvent supprimer des messages, fils ou réponses contraires à l’esprit du lieu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowModeratorsPanel(false)}
              aria-label="Fermer le panneau de gestion des modérateurs"
              className="p-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {modFeedback && (
            <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded px-3 py-2">
              {modFeedback}
            </p>
          )}
          {modError && (
            <p role="alert" className="text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              {modError}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Modérateurs actuels ({moderators.length})
              </p>
              {moderators.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-stone-400 italic bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md p-3">
                  Aucun modérateur dédié pour ce salon pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-md bg-[#FBF9F5] dark:bg-stone-950">
                  {moderators.map((mod) => (
                    <div
                      key={mod.userId}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenMemberWall(mod.userId)}
                          className="text-xs font-semibold text-stone-900 dark:text-stone-100 hover:underline truncate"
                        >
                          {mod.userName}
                        </button>
                        <RoleBadge role="moderator" compact />
                      </div>
                      <button
                        type="button"
                        disabled={modBusyId === mod.userId}
                        onClick={() => void handleRevokeModerator(mod)}
                        className="min-h-[30px] px-2.5 py-1 text-xs font-medium text-red-800 dark:text-red-300 bg-white dark:bg-stone-900 border border-red-200 dark:border-red-900 rounded hover:border-red-400 disabled:opacity-60 whitespace-nowrap"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <label
                htmlFor={`salon-mod-search-${salonId}`}
                className="block text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400"
              >
                Nommer un membre modérateur
              </label>
              <input
                id={`salon-mod-search-${salonId}`}
                type="search"
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
                placeholder="Rechercher un membre par nom…"
                className="w-full min-h-[36px] px-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
              />
              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-md max-h-52 overflow-y-auto">
                {candidateProfiles.length === 0 ? (
                  <p className="p-3 text-xs text-stone-500 dark:text-stone-400">
                    Aucun autre profil public correspondant.
                  </p>
                ) : (
                  candidateProfiles.map((candidate) => (
                    <div
                      key={candidate.userId}
                      className="px-3.5 py-2 flex items-center justify-between gap-2 bg-white dark:bg-stone-900"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                          {candidate.displayName}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={modBusyId === candidate.userId}
                        onClick={() => void handleAppointModerator(candidate)}
                        className="min-h-[30px] px-2.5 py-1 text-xs font-medium text-[#1B365D] dark:text-sky-300 bg-[#F3F6FA] dark:bg-stone-800 border border-[#CBD6E6] dark:border-stone-700 rounded hover:border-[#1B365D] disabled:opacity-60 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Nommer</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Clean 3-Tab Room Switcher: Stories | Chat | Repères & Pistes (or FAQ Guide) */}
      <div
        role="tablist"
        aria-label={`Espaces de ${salon.salonName}`}
        className="flex items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-md overflow-x-auto w-full sm:w-fit"
      >
        <button
          type="button"
          role="tab"
          aria-selected={roomSection === 'stories'}
          onClick={() => setRoomSection('stories')}
          className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            roomSection === 'stories'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Récits ({totalInSalon})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={roomSection === 'threads'}
          onClick={() => setRoomSection('threads')}
          className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            roomSection === 'threads'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          <span>Fils de discussion</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={roomSection === 'chat'}
          onClick={() => setRoomSection('chat')}
          className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            roomSection === 'chat'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat du salon</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={roomSection === 'guide'}
          onClick={() => setRoomSection('guide')}
          className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            roomSection === 'guide'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
          }`}
        >
          {salonId === 'faq' ? (
            <>
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Guide FAQ &amp; repères</span>
            </>
          ) : (
            <>
              <Compass className="w-3.5 h-3.5" />
              <span>Repères &amp; pistes</span>
            </>
          )}
        </button>
      </div>

      {/* TAB 1: Salon Stories & Novels Feed */}
      {roomSection === 'stories' && (
        !storiesLoaded ? (
          <div className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Ouverture des pages de ce salon…
          </div>
        ) : totalInSalon === 0 ? (
          <section
            aria-label="Invitation à ouvrir ce salon"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
                  Ce salon attend sa première histoire
                </h2>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Choisissez une piste rapide ci-dessous ou écrivez librement.
                </p>
              </div>
              {salonId === 'faq' && (
                <button
                  type="button"
                  onClick={() => setRoomSection('guide')}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#2D4A53] dark:text-sky-300 bg-[#EFF5F7] dark:bg-stone-800 border border-[#2D4A53]/25 dark:border-stone-700 rounded-md hover:border-[#2D4A53] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Consulter les réponses FAQ</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {salon.invitationTopics.map((topic, index) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() =>
                    onWriteInSalon(salon.id, topic, `${salon.starterSentence} `)
                  }
                  className="text-left p-4 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md hover:border-stone-400 dark:hover:border-stone-600 transition-colors flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-1">
                    <p
                      style={{ color: salon.palette.textAccent }}
                      className="text-[11px] font-mono tabular-nums dark:brightness-125"
                    >
                      Piste 0{index + 1}
                    </p>
                    <p className="font-display text-base font-medium text-stone-900 dark:text-stone-100 leading-snug">
                      {topic}
                    </p>
                  </div>
                  <span
                    style={{ color: salon.palette.textAccent }}
                    className="text-xs font-medium inline-flex items-center gap-1 group-hover:underline dark:brightness-125"
                  >
                    <span>Écrire</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-6" aria-label={`Récits dans ${salon.salonName}`}>
            {hiddenByAgeCount > 0 && (
              <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100">
                {hiddenByAgeCount} récit{hiddenByAgeCount > 1 ? 's' : ''} classé{hiddenByAgeCount > 1 ? 's' : ''} pour un public plus âgé ou mature {hiddenByAgeCount > 1 ? 'sont masqués' : 'est masqué'} selon votre profil d’âge{viewerAge === null ? ' (renseignez votre âge dans Profils pour adapter le filtre)' : ''}.
              </div>
            )}

            <StoryFilterBar
              value={filterState}
              onChange={setFilterState}
              defaultSort="recent"
              searchPlaceholder="Rechercher dans ce salon…"
              ariaLabel={`Trier et filtrer les récits dans ${salon.salonName}`}
              totalCount={totalInSalon}
              filteredCount={salonStories.length}
            />

            {salonStories.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8 text-center space-y-3">
                <p className="font-display text-lg text-stone-900 dark:text-stone-100">
                  Aucune histoire ne correspond à ce filtre dans ce salon
                </p>
                <button
                  type="button"
                  onClick={() => setFilterState(createDefaultStoryFilterState('recent'))}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {leadStory && (
                  <article className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                    <div className="lg:col-span-8 space-y-3.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                        <StoryFormatKicker story={leadStory} showDetails={true} uppercase={true} />
                        {leadStory.storyFormat === 'roman' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {RELEASE_CADENCE_LABELS[leadStory.releaseCadence ?? 'hebdomadaire']}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        {leadStory.isAnonymous ? (
                          <span className="font-medium text-stone-600 dark:text-stone-400">Par Auteur anonyme</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenMemberWall(leadStory.authorId)}
                              className="font-medium text-stone-800 dark:text-stone-200 hover:underline"
                            >
                              Par {leadStory.authorName}
                            </button>
                            <RoleBadgesRow
                              isAdmin={Boolean(
                                profilesByUserId.get(leadStory.authorId)?.isAdmin ||
                                  adminUserIds?.has(leadStory.authorId)
                              )}
                              isModerator={moderatorIds.has(leadStory.authorId)}
                              profileBadges={profilesByUserId.get(leadStory.authorId)?.badges}
                              compact
                            />
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{leadStory.readingMinutes} min</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFrenchDate(leadStory.createdAt?.toDate() ?? null)}</span>
                        <MatureContentBadge
                          minAge={leadStory.minAge}
                          isMature={leadStory.isMature}
                          compact
                        />
                      </div>

                      {leadStory.storyFormat === 'roman' && leadStory.coverUrl ? (
                        <div className="flex flex-col sm:flex-row items-start gap-5">
                          <NovelCoverArt
                            coverUrl={leadStory.coverUrl}
                            title={leadStory.title}
                            genre={leadStory.novelGenre}
                            accentColor={salon.palette.accent}
                            size="md"
                          />
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <h3
                              className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                              style={{ textWrap: 'balance' }}
                            >
                              {leadStory.title}
                            </h3>

                            <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed editorial-drop-cap max-w-2xl">
                              {leadStory.excerpt}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3
                            className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                            style={{ textWrap: 'balance' }}
                          >
                            {leadStory.title}
                          </h3>

                          <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed editorial-drop-cap max-w-2xl">
                            {leadStory.excerpt}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="lg:col-span-4 lg:border-l lg:border-stone-200 dark:lg:border-stone-800 lg:pl-7 flex flex-col justify-between h-full space-y-5">
                      {leadStory.promptQuestion && (
                        <div>
                          <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
                            Amorce
                          </p>
                          <p className="text-sm text-stone-700 dark:text-stone-300 italic leading-relaxed">
                            « {leadStory.promptQuestion} »
                          </p>
                        </div>
                      )}

                      <div className="space-y-3.5">
                        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 dark:text-stone-400 tabular-nums">
                          <span className="inline-flex items-center gap-1.5" title="Vues">
                            <Eye className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                            {leadStory.viewCount ?? 0}
                          </span>
                          <span className="inline-flex items-center gap-1.5" title="Résonances">
                            <Heart className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                            {leadStory.resonanceCount}
                          </span>
                          <span className="inline-flex items-center gap-1.5" title="Commentaires">
                            <MessageCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                            {leadStory.echoCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onReadStory(leadStory)}
                            style={{ backgroundColor: salon.palette.accent }}
                            className="flex-1 min-h-[40px] px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] inline-flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <span>Lire le récit</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>

                          {onToggleBookmark && (
                            <button
                              type="button"
                              onClick={() => onToggleBookmark(leadStory)}
                              title={
                                bookmarkedStoryIds?.has(leadStory.storyId)
                                  ? 'Retirer des favoris'
                                  : 'Enregistrer pour lire plus tard'
                              }
                              aria-label="Enregistrer pour lire plus tard"
                              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                bookmarkedStoryIds?.has(leadStory.storyId)
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400'
                              }`}
                            >
                              <Bookmark
                                className={`w-4 h-4 ${
                                  bookmarkedStoryIds?.has(leadStory.storyId) ? 'fill-current' : ''
                                }`}
                              />
                            </button>
                          )}

                          {onOpenRepost && (
                            <button
                              type="button"
                              onClick={() => onOpenRepost(leadStory)}
                              title={
                                repostedStoryIds?.has(leadStory.storyId)
                                  ? 'Repartagé — Modifier'
                                  : 'Repartager sur mon compte'
                              }
                              aria-label="Repartager"
                              className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                repostedStoryIds?.has(leadStory.storyId)
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400'
                              }`}
                            >
                              <Repeat2 className="w-4 h-4" />
                            </button>
                          )}

                          {onShareStory &&
                            isStoryCompliantForPublicFeed(leadStory) &&
                            leadStory.customSalonVisibility !== 'private' && (
                              <button
                                type="button"
                                onClick={() => onShareStory(leadStory)}
                                title="Partager ce récit"
                                aria-label={`Partager ${leadStory.title}`}
                                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D] dark:hover:text-amber-300 transition-colors shrink-0"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  </article>
                )}

                {secondaryStories.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {secondaryStories.map((story) => (
                      <article
                        key={story.storyId}
                        className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-6 flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                            <StoryFormatKicker story={story} showDetails={true} />
                            <span aria-hidden="true">·</span>
                            {story.isAnonymous ? (
                              <span className="font-medium text-stone-600 dark:text-stone-400">Auteur anonyme</span>
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
                                accentColor={salon.palette.accent}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <h3 className="font-display text-xl sm:text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                  {story.title}
                                </h3>
                                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3">
                                  {story.excerpt}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-display text-xl sm:text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                {story.title}
                              </h3>
                              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3">
                                {story.excerpt}
                              </p>
                            </>
                          )}
                        </div>

                        <div className="pt-3.5 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
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
                                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800'
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
                                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800'
                                }`}
                              >
                                <Repeat2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onShareStory &&
                              isStoryCompliantForPublicFeed(story) &&
                              story.customSalonVisibility !== 'private' && (
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
                              style={{ color: salon.palette.textAccent }}
                              className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.96] dark:brightness-125"
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
              </div>
            )}
          </section>
        )
      )}

      {/* TAB 2: Discussion Threads / Topics */}
      {roomSection === 'threads' && (
        <SalonThreadsPanel
          scope="predefined"
          salonId={salonId}
          salonTitle={salon.salonName}
          viewerAge={viewerAge}
          canPost={true}
          adminUserIds={adminUserIds}
          moderatorIds={moderatorIds}
          profilesByUserId={profilesByUserId}
          canModerate={canModerateSalon}
          onOpenMemberWall={onOpenMemberWall}
          onWriteFromThread={(tTitle, tBody) =>
            onWriteInSalon(salon.id, tTitle, tBody ? `${tBody.slice(0, 140)} ` : '')
          }
          onOpenReport={onOpenReport}
        />
      )}

      {/* TAB 3: Public Text-Only Salon Chat */}
      {roomSection === 'chat' && (
        <SalonChatPanel
          salonId={salonId}
          stories={publicStories}
          hiddenUserIds={hiddenUserIds}
          adminUserIds={adminUserIds}
          moderatorIds={moderatorIds}
          profilesByUserId={profilesByUserId}
          canModerate={canModerateSalon}
          onReadStory={onReadStory}
          onOpenStoryById={onOpenStoryById}
          onOpenMemberWall={onOpenMemberWall}
          onOpenReport={onOpenReport}
        />
      )}

      {/* TAB 3: Repères, Pistes d'écriture & Guide FAQ (cleanly tucked here instead of cluttering the stories view) */}
      {roomSection === 'guide' && (
        <div className="space-y-6">
          {salonId === 'faq' && (
            <section
              aria-label="Questions fréquentes sur l’utilisation de Lisière"
              className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-7 space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 inline-flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-[#2D4A53] dark:text-sky-300" />
                    <span>Questions fréquentes</span>
                  </p>
                  <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
                    Comment fonctionne Lisière ?
                  </h2>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Toutes' },
                      { id: 'ecriture', label: 'Écriture' },
                      { id: 'lecture', label: 'Lecture & recherche' },
                      { id: 'securite', label: 'Échanges & sécurité' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFaqCategory(cat.id)}
                      className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        faqCategory === cat.id
                          ? 'bg-[#2D4A53] text-white border-[#2D4A53]'
                          : 'bg-[#FBF9F5] dark:bg-stone-950 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-md overflow-hidden">
                {filteredFaqItems.map((item) => {
                  const isOpen = openFaqId === item.id;
                  return (
                    <div key={item.id} className="bg-white dark:bg-stone-900">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                        className="w-full px-4 sm:px-5 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-[#FBF9F5] dark:hover:bg-stone-800/60 transition-colors"
                      >
                        <span className="font-medium text-sm sm:text-base text-stone-900 dark:text-stone-100">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-4 pt-1 text-sm text-stone-600 dark:text-stone-300 leading-relaxed bg-[#FBF9F5]/60 dark:bg-stone-950/60">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Curatorial Note + Epigraph + Metrics */}
          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-7 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-stone-200 dark:border-stone-800">
              <div className="space-y-2 max-w-2xl">
                <blockquote className="font-display italic text-lg sm:text-xl text-stone-900 dark:text-stone-100 leading-snug">
                  {salon.epigraph}
                </blockquote>
                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{salon.curatorialNote}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 sm:gap-6 shrink-0 pt-3 lg:pt-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-stone-800">
                <div>
                  <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {totalInSalon}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Histoire{totalInSalon > 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {totalEchoesInSalon}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Écho{totalEchoesInSalon > 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {formatCumulativeMinutes(totalMinutesInSalon)}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Lecture</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {salon.roomPillars.map((pillar, idx) => (
                <div
                  key={pillar.title}
                  className="bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md p-4 space-y-1.5"
                >
                  <p
                    style={{ color: salon.palette.textAccent }}
                    className="text-xs font-mono tabular-nums dark:brightness-125"
                  >
                    0{idx + 1}. {pillar.title}
                  </p>
                  <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{pillar.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Writing Starters */}
          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-xl font-medium text-stone-900 dark:text-stone-100">
                Pistes pour commencer à écrire
              </h2>
              <button
                type="button"
                onClick={() =>
                  onWriteInSalon(
                    salon.id,
                    salon.promptQuestion,
                    `${salon.starterSentence} `
                  )
                }
                style={{ color: salon.palette.textAccent }}
                className="text-xs font-medium hover:underline inline-flex items-center gap-1.5 self-start sm:self-auto dark:brightness-125"
              >
                <Feather className="w-3.5 h-3.5" />
                <span>Utiliser la phrase d’élan</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {salon.invitationTopics.map((topic, index) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() =>
                    onWriteInSalon(salon.id, topic, `${salon.starterSentence} `)
                  }
                  className="text-left p-4 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-md hover:border-stone-400 dark:hover:border-stone-600 transition-colors flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-1">
                    <p
                      style={{ color: salon.palette.textAccent }}
                      className="text-[11px] font-mono tabular-nums dark:brightness-125"
                    >
                      Piste 0{index + 1}
                    </p>
                    <p className="font-display text-base font-medium text-stone-900 dark:text-stone-100 leading-snug">
                      {topic}
                    </p>
                  </div>
                  <span
                    style={{ color: salon.palette.textAccent }}
                    className="text-xs font-medium inline-flex items-center gap-1 group-hover:underline dark:brightness-125"
                  >
                    <span>Écrire à partir de cette piste</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Bottom Salon-to-Salon Passageway */}
      <nav
        aria-label="Passage vers les autres salons"
        className="pt-6 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3"
      >
        <button
          type="button"
          onClick={() => onSelectSalon(prevSalon.id)}
          className="min-h-[38px] px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{prevSalon.shortSalonName}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSalon(null)}
          className="text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap"
        >
          Tous les salons
        </button>

        <button
          type="button"
          onClick={() => onSelectSalon(nextSalon.id)}
          className="min-h-[38px] px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span>{nextSalon.shortSalonName}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </nav>
    </div>
  );
}
