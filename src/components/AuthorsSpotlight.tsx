import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Crown,
  EyeOff,
  Feather,
  Heart,
  Star,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  formatFriendlyFirestoreError,
  setStoriesAnonymityBatch,
  setStoryAnonymity,
  toggleFavoriteAuthor,
} from '../lib/storyService';
import {
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import { PublicProfile, Story } from '../types/story';
import { NovelCoverArt } from './NovelCoverArt';

export type AuthorSpotlightCriteria = 'most-read' | 'best-rated' | 'combined';
export type SpotlightPeriod = 'week' | 'month' | 'all';
export type SpotlightFormatFilter = 'all' | 'roman' | 'confession';

const PERIOD_OPTIONS: ReadonlyArray<{
  id: SpotlightPeriod;
  label: string;
  caption: string;
  days: number | null;
}> = [
  { id: 'week', label: 'Semaine', caption: 'Activité des 7 derniers jours', days: 7 },
  { id: 'month', label: 'Mois', caption: 'Activité des 30 derniers jours', days: 30 },
  { id: 'all', label: 'Tout le temps', caption: 'Depuis l’ouverture de Lisière', days: null },
];

interface AuthorsSpotlightProps {
  stories: Story[];
  storiesLoaded: boolean;
  myStories: Story[];
  discoverableProfiles: PublicProfile[];
  onReadStory: (story: Story) => void;
  onOpenMemberWall: (userId: string) => void;
  onWriteNovel: () => void;
  onShowNotice?: (message: string) => void;
}

interface SpotlightAuthorEntry {
  authorId: string;
  authorName: string;
  avatarUrl?: string;
  bio?: string;
  novelViews: number;
  totalViews: number;
  totalResonances: number;
  averageResonance: number;
  totalEchoes: number;
  novelCount: number;
  confessionCount: number;
  storyCount: number;
  combinedScore: number;
  topReadStory: Story;
  topRatedStory: Story;
}

function formatFrenchDecimal(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function SpotlightAvatar({
  name,
  avatarUrl,
  size = 'md',
  ringClass = 'border-stone-200',
}: {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  ringClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] || 'A').toUpperCase();
  const sizeClass =
    size === 'xl'
      ? 'w-16 h-16 text-xl'
      : size === 'lg'
        ? 'w-14 h-14 text-lg'
        : size === 'md'
          ? 'w-10 h-10 text-sm'
          : 'w-8 h-8 text-xs';

  if (avatarUrl && !failed) {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden border-2 ${ringClass} bg-stone-100 dark:bg-stone-800 shrink-0`}
      >
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full border-2 ${ringClass} bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300 font-display font-medium flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export function AuthorsSpotlight({
  stories,
  storiesLoaded,
  myStories,
  discoverableProfiles,
  onReadStory,
  onOpenMemberWall,
  onWriteNovel,
  onShowNotice,
}: AuthorsSpotlightProps) {
  const { user, profile, favoriteAuthors, signInWithGoogle } = useAuth();
  const [criteria, setCriteria] = useState<AuthorSpotlightCriteria>('most-read');
  const [period, setPeriod] = useState<SpotlightPeriod>('all');
  const [formatFilter, setFormatFilter] = useState<SpotlightFormatFilter>('all');
  const [busyFollowId, setBusyFollowId] = useState<string | null>(null);
  const [identityBusyId, setIdentityBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [confirmBatchTarget, setConfirmBatchTarget] = useState<'anonymous' | 'real' | null>(null);
  const [showPerStoryDrawer, setShowPerStoryDrawer] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const profileMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const prof of discoverableProfiles) {
      map.set(prof.userId, prof);
    }
    return map;
  }, [discoverableProfiles]);

  const favoriteAuthorIds = useMemo(
    () => new Set(favoriteAuthors.map((a) => a.authorId)),
    [favoriteAuthors]
  );

  const myPublicStories = useMemo(
    () =>
      myStories.filter(
        (s) => s.visibility === 'public' && s.customSalonVisibility !== 'private'
      ),
    [myStories]
  );

  const mySignedPublicStories = useMemo(
    () => myPublicStories.filter((s) => !s.isAnonymous),
    [myPublicStories]
  );

  const myAnonymousPublicStories = useMemo(
    () => myPublicStories.filter((s) => Boolean(s.isAnonymous)),
    [myPublicStories]
  );

  const realDisplayName =
    profile?.displayName?.trim() || user?.displayName?.trim() || 'Auteur';

  const currentAuthorMode: 'real' | 'anonymous' | 'mixed' | 'none' = useMemo(() => {
    if (myPublicStories.length === 0) return 'none';
    if (myAnonymousPublicStories.length === 0) return 'real';
    if (mySignedPublicStories.length === 0) return 'anonymous';
    return 'mixed';
  }, [myPublicStories.length, myAnonymousPublicStories.length, mySignedPublicStories.length]);

  const activePeriodMeta = useMemo(
    () => PERIOD_OPTIONS.find((p) => p.id === period) ?? PERIOD_OPTIONS[2],
    [period]
  );

  // Filter signed public stories according to the selected time window and category (all / roman / confession)
  const periodStories = useMemo(() => {
    const signed = stories.filter((story) => {
      if (story.isAnonymous || !story.authorId) return false;
      const fmt = story.storyFormat === 'roman' ? 'roman' : 'confession';
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;
      return true;
    });
    if (activePeriodMeta.days === null) return signed;
    const cutoffMs = Date.now() - activePeriodMeta.days * 86_400_000;
    return signed.filter((story) => {
      const activityMs =
        story.updatedAt?.toMillis() ?? story.createdAt?.toMillis() ?? Date.now();
      return activityMs >= cutoffMs;
    });
  }, [stories, activePeriodMeta.days, formatFilter]);

  // Aggregate ONLY signed public stories within the period so anonymous writings stay strictly confidential
  const rankedAuthors = useMemo<SpotlightAuthorEntry[]>(() => {
    const byAuthor = new Map<
      string,
      {
        authorId: string;
        authorName: string;
        novelViews: number;
        totalViews: number;
        totalResonances: number;
        totalEchoes: number;
        novelCount: number;
        confessionCount: number;
        storyCount: number;
        stories: Story[];
      }
    >();

    for (const story of periodStories) {
      const views = story.viewCount ?? 0;
      const resonances = story.resonanceCount ?? 0;
      const echoes = story.echoCount ?? 0;
      const isNovel = story.storyFormat === 'roman';

      const existing = byAuthor.get(story.authorId);
      if (existing) {
        existing.totalViews += views;
        existing.totalResonances += resonances;
        existing.totalEchoes += echoes;
        existing.storyCount += 1;
        if (isNovel) {
          existing.novelCount += 1;
          existing.novelViews += views;
        } else {
          existing.confessionCount += 1;
        }
        existing.stories.push(story);
      } else {
        byAuthor.set(story.authorId, {
          authorId: story.authorId,
          authorName: story.authorName || 'Auteur',
          novelViews: isNovel ? views : 0,
          totalViews: views,
          totalResonances: resonances,
          totalEchoes: echoes,
          novelCount: isNovel ? 1 : 0,
          confessionCount: isNovel ? 0 : 1,
          storyCount: 1,
          stories: [story],
        });
      }
    }

    const entries: SpotlightAuthorEntry[] = [];
    for (const item of byAuthor.values()) {
      const prof = profileMap.get(item.authorId);
      const byRead = item.stories
        .slice()
        .sort(
          (a, b) =>
            (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
            (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0)
        );
      const byRated = item.stories
        .slice()
        .sort(
          (a, b) =>
            (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0) ||
            (b.viewCount ?? 0) - (a.viewCount ?? 0)
        );
      const averageResonance = item.totalResonances / item.storyCount;

      entries.push({
        authorId: item.authorId,
        authorName: prof?.displayName || item.authorName,
        avatarUrl: prof?.avatarUrl,
        bio:
          prof?.bio ||
          (prof?.favoriteNovel ? `Roman marquant : ${prof.favoriteNovel}` : undefined),
        novelViews: item.novelViews,
        totalViews: item.totalViews,
        totalResonances: item.totalResonances,
        averageResonance,
        totalEchoes: item.totalEchoes,
        novelCount: item.novelCount,
        confessionCount: item.confessionCount,
        storyCount: item.storyCount,
        combinedScore: item.totalViews + item.totalResonances * 3,
        topReadStory: byRead[0],
        topRatedStory: byRated[0],
      });
    }

    entries.sort((a, b) => {
      if (criteria === 'best-rated') {
        const resDiff = b.totalResonances - a.totalResonances;
        if (resDiff !== 0) return resDiff;
        const avgDiff = b.averageResonance - a.averageResonance;
        if (Math.abs(avgDiff) > 0.001) return avgDiff;
        return b.totalViews - a.totalViews;
      }
      if (criteria === 'combined') {
        const scoreDiff = b.combinedScore - a.combinedScore;
        if (scoreDiff !== 0) return scoreDiff;
        return b.totalViews - a.totalViews;
      }
      const viewDiff = b.totalViews - a.totalViews;
      if (viewDiff !== 0) return viewDiff;
      const novelViewDiff = b.novelViews - a.novelViews;
      if (novelViewDiff !== 0) return novelViewDiff;
      return b.totalResonances - a.totalResonances;
    });

    return entries;
  }, [periodStories, profileMap, criteria]);

  const podiumAuthors = rankedAuthors.slice(0, 3);
  const remainingAuthors = rankedAuthors.slice(3, 10);

  const handleToggleFollowAuthor = async (authorId: string, authorName: string) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (user.uid === authorId || busyFollowId) return;
    setBusyFollowId(authorId);
    try {
      const added = await toggleFavoriteAuthor(user.uid, authorId, authorName);
      onShowNotice?.(
        added
          ? `${authorName} ajouté à vos auteurs suivis (« Pour vous »).`
          : `${authorName} retiré de vos auteurs suivis.`
      );
    } catch {
      onShowNotice?.('Impossible de mettre à jour votre suivi pour le moment.');
    } finally {
      setBusyFollowId(null);
    }
  };

  const handleSwitchAllMode = async (targetAnonymous: boolean) => {
    setIdentityError(null);
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (myPublicStories.length === 0) return;

    const targetList = targetAnonymous ? mySignedPublicStories : myAnonymousPublicStories;
    if (targetList.length === 0) return;

    const batchKey = targetAnonymous ? 'anonymous' : 'real';
    if (targetList.length > 1 && confirmBatchTarget !== batchKey) {
      setConfirmBatchTarget(batchKey);
      return;
    }

    setBatchBusy(true);
    try {
      const updatedName = await setStoriesAnonymityBatch(
        targetList.map((s) => s.storyId),
        targetAnonymous,
        realDisplayName
      );
      setConfirmBatchTarget(null);
      onShowNotice?.(
        targetAnonymous
          ? `${targetList.length} récit${targetList.length > 1 ? 's' : ''} basculé${targetList.length > 1 ? 's' : ''} en anonymat (« Auteur anonyme »).`
          : `${targetList.length} récit${targetList.length > 1 ? 's' : ''} désormais publié${targetList.length > 1 ? 's' : ''} sous votre identité réelle (${updatedName}).`
      );
    } catch (err) {
      setIdentityError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de basculer la signature de vos récits pour le moment.'
        )
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const handleToggleSingleStoryAnonymity = async (story: Story) => {
    if (!user || identityBusyId) return;
    setIdentityError(null);
    setIdentityBusyId(story.storyId);
    const nextAnonymous = !Boolean(story.isAnonymous);
    try {
      const updatedName = await setStoryAnonymity(
        story.storyId,
        nextAnonymous,
        realDisplayName
      );
      onShowNotice?.(
        nextAnonymous
          ? `« ${story.title} » est désormais affiché en anonyme.`
          : `« ${story.title} » est désormais signé de votre identité réelle (${updatedName}).`
      );
    } catch (err) {
      setIdentityError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de modifier le mode de signature de ce texte.'
        )
      );
    } finally {
      setIdentityBusyId(null);
    }
  };

  const renderPodiumCard = (author: SpotlightAuthorEntry, rank: 1 | 2 | 3) => {
    const featuredStory =
      criteria === 'best-rated' ? author.topRatedStory : author.topReadStory;
    const isChampion = rank === 1;
    const isSecond = rank === 2;
    const isFollowing = favoriteAuthorIds.has(author.authorId);

    const cardOrderClass =
      podiumAuthors.length >= 3
        ? isChampion
          ? 'order-1 lg:order-2'
          : isSecond
            ? 'order-2 lg:order-1'
            : 'order-3 lg:order-3'
        : podiumAuthors.length === 2
          ? isChampion
            ? 'order-1'
            : 'order-2'
          : 'max-w-2xl mx-auto w-full';

    const surfaceClass = isChampion
      ? 'bg-[#FFFDF8] dark:bg-[#1E1A14] border-[#C9A227]/80 dark:border-amber-600/60 shadow-[0_14px_34px_-20px_rgba(122,82,16,0.28)] lg:min-h-[340px]'
      : isSecond
        ? 'bg-white dark:bg-[#1A1815] border-stone-300 dark:border-stone-700 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.18)] lg:min-h-[310px]'
        : 'bg-white dark:bg-[#1A1815] border-[#D9B9AE] dark:border-[#6A382E] shadow-[0_10px_24px_-20px_rgba(154,59,41,0.14)] lg:min-h-[290px]';

    const topStripColor = isChampion
      ? 'bg-[#7A5210] text-[#FFFDF8]'
      : isSecond
        ? 'bg-[#44403C] text-white'
        : 'bg-[#9A3B29] text-white';

    const avatarRing = isChampion
      ? 'border-[#C9A227]'
      : isSecond
        ? 'border-stone-400 dark:border-stone-600'
        : 'border-[#C97B6B] dark:border-[#9A3B29]';

    const plinthStyle = isChampion
      ? 'h-16 bg-gradient-to-b from-[#F4E7C3] to-[#E8D295] dark:from-[#3D2E14] dark:to-[#2B200E] border-x border-t border-[#C9A227]/70 dark:border-amber-700/60 text-[#5C3D0B] dark:text-amber-200'
      : isSecond
        ? 'h-11 bg-gradient-to-b from-stone-100 to-stone-200/90 dark:from-stone-800 dark:to-stone-900 border-x border-t border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
        : 'h-7 bg-gradient-to-b from-[#F8EBE7] to-[#EED5CE] dark:from-[#3A201B] dark:to-[#2B1713] border-x border-t border-[#D9B9AE] dark:border-[#6A382E] text-[#7A2D1F] dark:text-amber-200';

    const plinthLabel = isChampion ? '1re marche' : isSecond ? '2e marche' : '3e marche';

    const rankTitle =
      rank === 1
        ? criteria === 'best-rated'
          ? 'N° 1 · Mieux noté'
          : criteria === 'combined'
            ? 'N° 1 · Palmarès'
            : 'N° 1 · Plus lu'
        : rank === 2
          ? 'N° 2 · Argent'
          : 'N° 3 · Bronze';

    const showPedestal = podiumAuthors.length >= 2;

    return (
      <div key={author.authorId} className={`${cardOrderClass} flex flex-col`}>
        <article
          className={`${surfaceClass} border ${
            showPedestal ? 'rounded-xl lg:rounded-b-none' : 'rounded-xl'
          } overflow-hidden flex flex-col justify-between flex-1 transition-transform duration-200`}
        >
          <div>
            {/* Architectural Podium Crown / Rank Header */}
            <div
              className={`${topStripColor} px-4 py-2 flex items-center justify-between gap-2 text-xs font-medium`}
            >
              <span className="inline-flex items-center gap-1.5 tracking-wide whitespace-nowrap">
                {isChampion ? (
                  <Crown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Award className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{rankTitle}</span>
              </span>
              <span className="font-display text-sm tabular-nums">0{rank}</span>
            </div>

            <div className={isChampion ? 'p-5 sm:p-6 space-y-5' : 'p-5 space-y-4'}>
              {/* Author Identity Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <SpotlightAvatar
                    name={author.authorName}
                    avatarUrl={author.avatarUrl}
                    size={isChampion ? 'xl' : 'lg'}
                    ringClass={avatarRing}
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenMemberWall(author.authorId)}
                      className={`font-display font-medium text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline text-left truncate max-w-full block ${
                        isChampion ? 'text-2xl' : 'text-xl'
                      }`}
                    >
                      {author.authorName}
                    </button>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 tabular-nums">
                      {[
                        author.novelCount > 0
                          ? `${author.novelCount} roman${author.novelCount > 1 ? 's' : ''}`
                          : null,
                        author.confessionCount > 0
                          ? `${author.confessionCount} confession${author.confessionCount > 1 ? 's' : ''}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {author.bio ? '' : ` · ${activePeriodMeta.label}`}
                    </p>
                  </div>
                </div>

                {user?.uid !== author.authorId && (
                  <button
                    type="button"
                    disabled={busyFollowId === author.authorId}
                    onClick={() =>
                      void handleToggleFollowAuthor(author.authorId, author.authorName)
                    }
                    aria-pressed={isFollowing}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                      isFollowing
                        ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:border-[#1B365D] hover:text-[#1B365D]'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isFollowing ? 'fill-current' : ''}`} />
                    <span>{isFollowing ? 'Suivi' : 'Suivre'}</span>
                  </button>
                )}
              </div>

              {author.bio && (
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 line-clamp-2 leading-relaxed">
                  {author.bio}
                </p>
              )}

              {/* Metrics Bar */}
              <div className="grid grid-cols-3 gap-3 py-3 border-y border-stone-200/80 dark:border-stone-800">
                <div>
                  <p className="font-display text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {author.totalViews}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">Lectures</p>
                </div>
                <div>
                  <p className="font-display text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {author.totalResonances}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">Résonances</p>
                </div>
                <div>
                  <p className="font-display text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                    {formatFrenchDecimal(author.averageResonance)}
                  </p>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">Moy. / texte</p>
                </div>
              </div>

              {/* Featured Work (unbordered warm inset) */}
              {featuredStory && (
                <div className="rounded-md bg-[#F7F4EE] dark:bg-stone-900 p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {featuredStory.storyFormat === 'roman' && (
                      <NovelCoverArt
                        coverUrl={featuredStory.coverUrl}
                        title={featuredStory.title}
                        genre={featuredStory.novelGenre}
                        size="xs"
                        showFallbackWhenMissing={true}
                      />
                    )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          featuredStory.storyFormat === 'roman'
                            ? 'text-[#1B365D] dark:text-sky-300'
                            : 'text-[#9A3B29] dark:text-amber-300'
                        }`}
                      >
                        {featuredStory.storyFormat === 'roman' ? (
                          <BookOpen className="w-3 h-3 shrink-0" />
                        ) : (
                          <Feather className="w-3 h-3 shrink-0" />
                        )}
                        <span>
                          {featuredStory.storyFormat === 'roman'
                            ? featuredStory.novelGenre
                              ? `Roman · ${NOVEL_GENRE_LABELS[featuredStory.novelGenre]}`
                              : 'Roman à chapitres'
                            : `Confession · ${
                                featuredStory.customSalonName ||
                                (featuredStory.storyScope === 'pelemele'
                                  ? 'Pêle-mêle'
                                  : THEME_MAP[featuredStory.theme]?.shortSalonName || 'Salon')
                              }`}
                        </span>
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => onReadStory(featuredStory)}
                      className="font-display text-base font-medium text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline text-left block truncate max-w-full"
                    >
                      {featuredStory.title}
                    </button>
                    <p className="text-[11px] text-stone-600 dark:text-stone-400 tabular-nums">
                      {featuredStory.viewCount ?? 0} vue
                      {(featuredStory.viewCount ?? 0) > 1 ? 's' : ''} ·{' '}
                      {featuredStory.resonanceCount} rés.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onReadStory(featuredStory)}
                  className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-[#1B365D] dark:text-sky-300 bg-white dark:bg-stone-800 border border-[#CBD6E6] dark:border-stone-700 rounded hover:bg-[#F3F6FA] whitespace-nowrap shrink-0 self-center"
                >
                  Lire
                </button>
              </div>
            )}
          </div>
        </div>

          <div className="px-5 py-3 bg-[#FAF8F4] dark:bg-stone-900/90 border-t border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenMemberWall(author.authorId)}
              className="text-xs font-medium text-[#1B365D] dark:text-sky-300 hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Voir son mur littéraire</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
              {author.totalEchoes} comm.
            </span>
          </div>
        </article>

        {/* Architectural Stepped Podium Plinth (Desktop 2-3+ steps) */}
        {showPedestal && (
          <div
            aria-hidden="true"
            className={`hidden lg:flex items-center justify-between px-4 ${plinthStyle}`}
          >
            <span className="text-[11px] uppercase tracking-widest font-medium">
              {plinthLabel}
            </span>
            <span
              className={`font-display font-semibold tabular-nums leading-none ${
                isChampion ? 'text-2xl' : isSecond ? 'text-xl' : 'text-base'
              }`}
            >
              0{rank}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-label="Auteurs en lumière" className="space-y-6">
      {/* Component Header + Criteria Tabs + Period Selector */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Palmarès des plumes · {activePeriodMeta.caption}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100 mt-1">
              Auteurs en lumière
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 mt-1">
              Podium en direct des plumes les plus lues et les mieux notées sur la période choisie, à partir de leurs écrits signés.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Format Category Selector (All / Romans / Confessions) */}
            <div
              role="group"
              aria-label="Catégorie d’œuvres pour le classement des auteurs"
              className="inline-flex items-center gap-1 p-1 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800"
            >
              {(
                [
                  { id: 'all', label: 'Toutes catégories' },
                  { id: 'roman', label: 'Romans' },
                  { id: 'confession', label: 'Confessions' },
                ] as const
              ).map((fmt) => {
                const active = formatFilter === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFormatFilter(fmt.id)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? fmt.id === 'confession'
                          ? 'bg-[#9A3B29] text-white'
                          : 'bg-[#1B365D] text-white'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>

            {/* Period Dropdown Selector (Semaine / Mois / Tout le temps) */}
            <div className="relative flex items-center shrink-0">
              <Calendar className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 absolute left-2.5 pointer-events-none" />
              <select
                aria-label="Période d’activité"
                value={period}
                onChange={(e) => setPeriod(e.target.value as SpotlightPeriod)}
                className="min-h-[40px] pl-8 pr-7 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg text-xs font-medium text-stone-800 dark:text-stone-200 hover:border-stone-400 focus:outline-none focus:border-[#1B365D] cursor-pointer"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ranking Criteria Tabs */}
            <div
              role="tablist"
              aria-label="Critère de classement des auteurs"
              className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800"
            >
              {(
                [
                  { id: 'most-read', label: 'Les plus lus' },
                  { id: 'best-rated', label: 'Les mieux notés' },
                  { id: 'combined', label: 'Palmarès global' },
                ] as const
              ).map((tab) => {
                const active = criteria === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCriteria(tab.id)}
                    className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white dark:bg-stone-800 text-[#1B365D] dark:text-amber-300 shadow-xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Author Identity Mode Switcher (Anonymat <-> Identité réelle) */}
      <div className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Votre signature au palmarès : anonymat ou identité réelle
              </p>
              {user && myPublicStories.length > 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                  {mySignedPublicStories.length} signé{mySignedPublicStories.length > 1 ? 's' : ''} ·{' '}
                  {myAnonymousPublicStories.length} anonyme
                  {myAnonymousPublicStories.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              {!user
                ? 'Connectez-vous pour choisir si vos récits apparaissent sous votre identité réelle sur le podium ou restent anonymes.'
                : myPublicStories.length === 0
                  ? 'Aucun récit public publié pour le moment. Vous pourrez basculer entre anonymat et identité réelle dès votre première publication.'
                  : currentAuthorMode === 'anonymous'
                    ? 'Tous vos textes publics sont actuellement en anonymat : votre nom reste confidentiel et n’apparaît pas sur le podium.'
                    : currentAuthorMode === 'real'
                      ? `Vos textes publics sont publiés sous votre identité réelle (${realDisplayName}) et comptent pour le podium.`
                      : `Une partie de vos textes est signée (${realDisplayName}) et une autre reste anonyme.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!user ? (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] whitespace-nowrap shrink-0"
              >
                Se connecter pour gérer ma signature
              </button>
            ) : myPublicStories.length === 0 ? (
              <button
                type="button"
                onClick={onWriteNovel}
                className="min-h-[38px] px-3.5 py-1.5 rounded-md border border-[#1B365D] dark:border-stone-700 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-sky-300 text-xs font-medium hover:bg-[#E7EEF7] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Feather className="w-3.5 h-3.5" />
                <span>Publier un roman</span>
              </button>
            ) : (
              <>
                <div
                  role="group"
                  aria-label="Basculer entre identité réelle et anonymat"
                  className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800"
                >
                  <button
                    type="button"
                    disabled={batchBusy || currentAuthorMode === 'real'}
                    onClick={() => void handleSwitchAllMode(false)}
                    aria-pressed={currentAuthorMode === 'real'}
                    className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      currentAuthorMode === 'real'
                        ? 'bg-[#1B365D] text-white shadow-xs'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Identité réelle</span>
                  </button>
                  <button
                    type="button"
                    disabled={batchBusy || currentAuthorMode === 'anonymous'}
                    onClick={() => void handleSwitchAllMode(true)}
                    aria-pressed={currentAuthorMode === 'anonymous'}
                    className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      currentAuthorMode === 'anonymous'
                        ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 shadow-xs'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Anonymat</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPerStoryDrawer((prev) => !prev)}
                  aria-expanded={showPerStoryDrawer}
                  className="min-h-[38px] px-3 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <span>Par texte ({myPublicStories.length})</span>
                  {showPerStoryDrawer ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Batch Confirmation Banner (when switching >1 stories at once) */}
        {confirmBatchTarget && (
          <div className="rounded-md border border-[#CBD6E6] dark:border-stone-700 bg-[#F3F6FA] dark:bg-stone-900 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <p className="text-stone-800 dark:text-stone-200">
              {confirmBatchTarget === 'real'
                ? `Afficher votre identité réelle (${realDisplayName}) sur vos ${myAnonymousPublicStories.length} récits actuellement anonymes ?`
                : `Basculer vos ${mySignedPublicStories.length} récits signés en « Auteur anonyme » et les retirer du palmarès des auteurs ?`}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => void handleSwitchAllMode(confirmBatchTarget === 'anonymous')}
                className="min-h-[32px] px-3 py-1 rounded bg-[#1B365D] text-white font-medium hover:bg-[#132744] disabled:opacity-50 whitespace-nowrap"
              >
                {batchBusy ? 'Mise à jour…' : 'Confirmer'}
              </button>
              <button
                type="button"
                disabled={batchBusy}
                onClick={() => setConfirmBatchTarget(null)}
                className="min-h-[32px] px-3 py-1 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:border-stone-500 whitespace-nowrap"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {identityError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {identityError}
          </p>
        )}

        {/* Per-Story Anonymity / Identity List */}
        {user && showPerStoryDrawer && myPublicStories.length > 0 && (
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
            {myPublicStories.map((story) => {
              const isAnon = Boolean(story.isAnonymous);
              const busy = identityBusyId === story.storyId;
              const formatLabel =
                STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label ?? 'Confession';
              return (
                <div
                  key={story.storyId}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => onReadStory(story)}
                      className="text-sm font-medium text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline truncate block max-w-full text-left"
                    >
                      {story.title}
                    </button>
                    <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                      {formatLabel}
                      {story.storyFormat === 'roman' && story.novelGenre
                        ? ` · ${NOVEL_GENRE_LABELS[story.novelGenre]}`
                        : ''}{' '}
                      · {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''} ·{' '}
                      {story.resonanceCount} résonance{story.resonanceCount > 1 ? 's' : ''} ·{' '}
                      {formatFrenchDate(story.createdAt?.toDate() ?? null)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-stone-600 dark:text-stone-400 inline-flex items-center gap-1 whitespace-nowrap">
                      {isAnon ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                          <span>Anonyme</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-[#1B365D] dark:text-sky-300" />
                          <span className="font-medium text-stone-800 dark:text-stone-200">{realDisplayName}</span>
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleSingleStoryAnonymity(story)}
                      className="min-h-[32px] px-2.5 py-1 rounded border border-stone-200 dark:border-stone-700 bg-[#FAF8F4] dark:bg-stone-900 text-xs font-medium text-[#1B365D] dark:text-sky-300 hover:border-[#1B365D] disabled:opacity-50 whitespace-nowrap"
                    >
                      {busy
                        ? 'En cours…'
                        : isAnon
                          ? 'Afficher mon identité'
                          : 'Passer en anonyme'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Podium & Runners-up */}
      {!storiesLoaded ? (
        <div className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-8 text-sm text-stone-500 dark:text-stone-400">
          Chargement des auteurs en lumière…
        </div>
      ) : podiumAuthors.length === 0 ? (
        <div className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-8 text-center space-y-3">
          <p className="font-display text-xl text-stone-900 dark:text-stone-100">
            {period === 'all' && formatFilter === 'all'
              ? 'Aucun auteur signé n’apparaît encore sur le podium'
              : `Aucun auteur signé trouvé pour « ${
                  formatFilter === 'roman'
                    ? 'Romans'
                    : formatFilter === 'confession'
                      ? 'Confessions'
                      : 'Toutes catégories'
                } » (${activePeriodMeta.label.toLowerCase()})`}
          </p>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-lg mx-auto">
            {period === 'all' && formatFilter === 'all'
              ? 'Publiez un texte ou basculez l’un de vos écrits anonymes vers votre identité réelle ci-dessus pour entrer sur le podium.'
              : 'Essayez une période plus large, affichez toutes les catégories ou publiez un nouveau texte.'}
          </p>
          {(period !== 'all' || formatFilter !== 'all') && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {formatFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFormatFilter('all')}
                  className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-[#1B365D] dark:text-sky-300 bg-[#F3F6FA] dark:bg-stone-800 border border-[#CBD6E6] dark:border-stone-700 rounded-md hover:border-[#1B365D]"
                >
                  Toutes catégories
                </button>
              )}
              {period !== 'all' && (
                <button
                  type="button"
                  onClick={() => setPeriod('all')}
                  className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-[#1B365D] dark:text-sky-300 bg-[#F3F6FA] dark:bg-stone-800 border border-[#CBD6E6] dark:border-stone-700 rounded-md hover:border-[#1B365D]"
                >
                  Afficher tout le temps
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {podiumAuthors.length >= 2 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Podium · Top {podiumAuthors.length} des plumes ·{' '}
                {criteria === 'best-rated'
                  ? 'Les mieux notées'
                  : criteria === 'combined'
                    ? 'Palmarès global'
                    : 'Les plus lues'}
              </p>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                {activePeriodMeta.label} · {rankedAuthors.length} plume
                {rankedAuthors.length > 1 ? 's' : ''} classée{rankedAuthors.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Stepped Podium Grid (#2 Left, #1 Center Elevated, #3 Right) */}
          <div
            className={
              podiumAuthors.length >= 3
                ? 'grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-4 items-stretch lg:items-end lg:border-b-2 lg:border-stone-300/90 dark:lg:border-stone-700'
                : podiumAuthors.length === 2
                  ? 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-4 items-stretch lg:items-end max-w-4xl mx-auto lg:border-b-2 lg:border-stone-300/90 dark:lg:border-stone-700'
                  : 'grid grid-cols-1 gap-5'
            }
          >
            {podiumAuthors.map((author, idx) =>
              renderPodiumCard(author, (idx + 1) as 1 | 2 | 3)
            )}
          </div>

          {/* Ranks #4+ */}
          {remainingAuthors.length > 0 && (
            <div className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-800 pb-3">
                <h3 className="font-display text-lg font-medium text-stone-900 dark:text-stone-100">
                  Au pied du podium · {activePeriodMeta.label}
                </h3>
                <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                  Rangs 04 à {rankedAuthors.length < 10 ? `0${rankedAuthors.length}` : rankedAuthors.length > 10 ? '10' : rankedAuthors.length}
                </span>
              </div>

              <ol className="divide-y divide-stone-200 dark:divide-stone-800">
                {remainingAuthors.map((author, idx) => {
                  const rank = idx + 4;
                  const rankLabel = rank < 10 ? `0${rank}` : `${rank}`;
                  const featuredStory =
                    criteria === 'best-rated' ? author.topRatedStory : author.topReadStory;
                  return (
                    <li
                      key={author.authorId}
                      className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-display text-base font-medium text-stone-400 dark:text-stone-500 tabular-nums w-6 shrink-0">
                          {rankLabel}
                        </span>
                        <SpotlightAvatar
                          name={author.authorName}
                          avatarUrl={author.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(author.authorId)}
                            className="text-sm font-medium text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline truncate block max-w-full text-left"
                          >
                            {author.authorName}
                          </button>
                          <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                            {[
                              author.novelCount > 0
                                ? `${author.novelCount} roman${author.novelCount > 1 ? 's' : ''}`
                                : null,
                              author.confessionCount > 0
                                ? `${author.confessionCount} confession${author.confessionCount > 1 ? 's' : ''}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}{' '}
                            · {author.totalViews} lecture{author.totalViews > 1 ? 's' : ''} ·{' '}
                            <span className="inline-flex items-center gap-0.5 text-stone-700 dark:text-stone-300 font-medium">
                              <Heart className="w-3 h-3 text-stone-400 inline" />{' '}
                              {author.totalResonances}
                            </span>{' '}
                            ({formatFrenchDecimal(author.averageResonance)}/texte)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {user?.uid !== author.authorId && (
                          <button
                            type="button"
                            disabled={busyFollowId === author.authorId}
                            onClick={() =>
                              void handleToggleFollowAuthor(author.authorId, author.authorName)
                            }
                            aria-label={
                              favoriteAuthorIds.has(author.authorId)
                                ? `Ne plus suivre ${author.authorName}`
                                : `Suivre ${author.authorName}`
                            }
                            aria-pressed={favoriteAuthorIds.has(author.authorId)}
                            className={`min-h-[32px] px-2.5 py-1 inline-flex items-center gap-1 rounded border text-xs transition-colors whitespace-nowrap ${
                              favoriteAuthorIds.has(author.authorId)
                                ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D]'
                            }`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                favoriteAuthorIds.has(author.authorId) ? 'fill-current' : ''
                              }`}
                            />
                            <span>
                              {favoriteAuthorIds.has(author.authorId) ? 'Suivi' : 'Suivre'}
                            </span>
                          </button>
                        )}
                        {featuredStory && (
                          <button
                            type="button"
                            onClick={() => onReadStory(featuredStory)}
                            className="min-h-[32px] px-3 py-1 rounded border border-[#CBD6E6] dark:border-stone-700 bg-[#F3F6FA] dark:bg-stone-800 text-xs font-medium text-[#1B365D] dark:text-sky-300 hover:bg-[#E7EEF7] inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span
                              className={
                                featuredStory.storyFormat === 'roman'
                                  ? 'text-[#1B365D] dark:text-sky-300 font-semibold'
                                  : 'text-[#9A3B29] dark:text-amber-300 font-semibold'
                              }
                            >
                              {featuredStory.storyFormat === 'roman' ? 'Roman' : 'Confession'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="max-w-[180px] truncate">{featuredStory.title}</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Les écrits marqués « Anonyme » restent strictement exclus du podium des auteurs tant qu’ils ne sont pas basculés vers l’identité réelle.
          </p>
        </div>
      )}
    </section>
  );
}
