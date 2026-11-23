import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Bookmark,
  BookOpen,
  Eye,
  EyeOff,
  Feather,
  Heart,
  MessageCircle,
  Repeat2,
  Star,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toggleFavoriteAuthor } from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  NOVEL_GENRES,
  SERIES_STATUS_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  CustomSalon,
  NovelGenre,
  PublicProfile,
  Story,
  StoryThemeId,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';

interface ThemesViewProps {
  stories: Story[];
  storiesLoaded: boolean;
  customSalons: CustomSalon[];
  discoverableProfiles: PublicProfile[];
  bookmarkedStoryIds: Set<string>;
  repostedStoryIds: Set<string>;
  onToggleBookmark: (story: Story) => void;
  onOpenRepost: (story: Story) => void;
  onReadStory: (story: Story) => void;
  onOpenMemberWall: (userId: string) => void;
  onEnterSalon: (salonId: StoryThemeId) => void;
  onEnterCustomSalon: (customSalonId: string) => void;
  onOpenPeleMele: () => void;
  onWriteNovel: (genre?: NovelGenre) => void;
  onShowNotice?: (message: string) => void;
}

interface RankedAuthorEntry {
  authorId: string;
  authorName: string;
  avatarUrl?: string;
  bio?: string;
  novelViews: number;
  totalViews: number;
  totalResonances: number;
  totalEchoes: number;
  novelCount: number;
  storyCount: number;
  topStory: Story;
}

function getNovelCategory(story: Story): NovelGenre {
  return story.novelGenre ?? 'autre';
}

function compareStoriesByPopularity(a: Story, b: Story): number {
  const viewDiff = (b.viewCount ?? 0) - (a.viewCount ?? 0);
  if (viewDiff !== 0) return viewDiff;
  const resDiff = (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0);
  if (resDiff !== 0) return resDiff;
  const echoDiff = (b.echoCount ?? 0) - (a.echoCount ?? 0);
  if (echoDiff !== 0) return echoDiff;
  return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
}

function getSalonDisplayInfo(story: Story, customSalons: CustomSalon[]) {
  const matchedCustom = story.customSalonId
    ? customSalons.find((cs) => cs.salonId === story.customSalonId)
    : undefined;
  const themeDef = THEME_MAP[story.theme];
  const label =
    story.customSalonName ||
    matchedCustom?.name ||
    (story.storyScope === 'pelemele' ? 'Hors salon · Pêle-mêle' : themeDef?.salonName ?? 'Salon');
  const accentColor = matchedCustom
    ? ACCENT_TONE_PALETTES[matchedCustom.accentTone]?.textAccent ?? '#1B365D'
    : story.storyScope === 'pelemele' && !story.customSalonId
      ? '#1B365D'
      : themeDef?.palette.textAccent ?? '#1B365D';
  return { label, accentColor };
}

function AuthorAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] || 'A').toUpperCase();
  const sizeClass =
    size === 'lg'
      ? 'w-14 h-14 text-lg'
      : size === 'md'
        ? 'w-10 h-10 text-sm'
        : 'w-8 h-8 text-xs';

  if (avatarUrl && !failed) {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden border border-stone-200 bg-stone-100 shrink-0`}
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
      className={`${sizeClass} rounded-full border border-stone-300 bg-[#F3F6FA] text-[#1B365D] font-display font-medium flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export function ThemesView({
  stories,
  storiesLoaded,
  customSalons,
  discoverableProfiles,
  bookmarkedStoryIds,
  repostedStoryIds,
  onToggleBookmark,
  onOpenRepost,
  onReadStory,
  onOpenMemberWall,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenPeleMele,
  onWriteNovel,
  onShowNotice,
}: ThemesViewProps) {
  const { user, favoriteAuthors, signInWithGoogle } = useAuth();
  const [selectedGenre, setSelectedGenre] = useState<'all' | NovelGenre>('all');
  const [busyFollowId, setBusyFollowId] = useState<string | null>(null);

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

  // Public novels sorted by readership
  const allPublicNovels = useMemo(
    () =>
      stories
        .filter((s) => s.storyFormat === 'roman')
        .slice()
        .sort(compareStoriesByPopularity),
    [stories]
  );

  const novelsByGenre = useMemo(() => {
    const map = new Map<NovelGenre, Story[]>();
    for (const genre of NOVEL_GENRES) {
      map.set(genre, []);
    }
    for (const novel of allPublicNovels) {
      const cat = getNovelCategory(novel);
      const list = map.get(cat);
      if (list) list.push(novel);
    }
    return map;
  }, [allPublicNovels]);

  const activeGenreNovels = useMemo(() => {
    if (selectedGenre === 'all') return allPublicNovels;
    return novelsByGenre.get(selectedGenre) ?? [];
  }, [selectedGenre, allPublicNovels, novelsByGenre]);

  const totalNovelViews = useMemo(
    () => allPublicNovels.reduce((sum, s) => sum + (s.viewCount ?? 0), 0),
    [allPublicNovels]
  );

  const activeGenreCount = useMemo(
    () => NOVEL_GENRES.filter((g) => (novelsByGenre.get(g)?.length ?? 0) > 0).length,
    [novelsByGenre]
  );

  // Strictly aggregate ONLY signed (!isAnonymous) public stories for author rankings
  // so anonymous works never leak author identity until claimed.
  const rankedAuthors = useMemo<RankedAuthorEntry[]>(() => {
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
        storyCount: number;
        stories: Story[];
      }
    >();

    for (const story of stories) {
      if (story.isAnonymous) continue;
      if (!story.authorId) continue;
      const existing = byAuthor.get(story.authorId);
      const views = story.viewCount ?? 0;
      const isNovel = story.storyFormat === 'roman';

      if (existing) {
        existing.totalViews += views;
        existing.totalResonances += story.resonanceCount ?? 0;
        existing.totalEchoes += story.echoCount ?? 0;
        existing.storyCount += 1;
        if (isNovel) {
          existing.novelCount += 1;
          existing.novelViews += views;
        }
        existing.stories.push(story);
      } else {
        byAuthor.set(story.authorId, {
          authorId: story.authorId,
          authorName: story.authorName || 'Auteur',
          novelViews: isNovel ? views : 0,
          totalViews: views,
          totalResonances: story.resonanceCount ?? 0,
          totalEchoes: story.echoCount ?? 0,
          novelCount: isNovel ? 1 : 0,
          storyCount: 1,
          stories: [story],
        });
      }
    }

    const entries: RankedAuthorEntry[] = [];
    for (const item of byAuthor.values()) {
      const sortedAuthorStories = item.stories
        .slice()
        .sort((a, b) => {
          const novelBias =
            (b.storyFormat === 'roman' ? 1 : 0) - (a.storyFormat === 'roman' ? 1 : 0);
          if (novelBias !== 0 && ((b.viewCount ?? 0) > 0 || (a.viewCount ?? 0) > 0)) {
            return compareStoriesByPopularity(a, b);
          }
          return compareStoriesByPopularity(a, b);
        });
      const prof = profileMap.get(item.authorId);
      entries.push({
        authorId: item.authorId,
        authorName: prof?.displayName || item.authorName,
        avatarUrl: prof?.avatarUrl,
        bio: prof?.bio || (prof?.favoriteNovel ? `Roman marquant : ${prof.favoriteNovel}` : undefined),
        novelViews: item.novelViews,
        totalViews: item.totalViews,
        totalResonances: item.totalResonances,
        totalEchoes: item.totalEchoes,
        novelCount: item.novelCount,
        storyCount: item.storyCount,
        topStory: sortedAuthorStories[0],
      });
    }

    entries.sort((a, b) => {
      const viewDiff = b.totalViews - a.totalViews;
      if (viewDiff !== 0) return viewDiff;
      const novelViewDiff = b.novelViews - a.novelViews;
      if (novelViewDiff !== 0) return novelViewDiff;
      const resDiff = b.totalResonances - a.totalResonances;
      if (resDiff !== 0) return resDiff;
      const novelCountDiff = b.novelCount - a.novelCount;
      if (novelCountDiff !== 0) return novelCountDiff;
      return b.storyCount - a.storyCount;
    });

    return entries;
  }, [stories, profileMap]);

  const topAuthor = rankedAuthors[0] ?? null;
  const runnerUpAuthors = rankedAuthors.slice(1, 5);
  const leadNovel = activeGenreNovels[0] ?? null;
  const otherNovels = activeGenreNovels.slice(1);

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

  const renderOriginLink = (story: Story) => {
    const { label, accentColor } = getSalonDisplayInfo(story, customSalons);
    return (
      <button
        type="button"
        onClick={() => {
          if (story.customSalonId) {
            onEnterCustomSalon(story.customSalonId);
          } else if (story.storyScope === 'pelemele') {
            onOpenPeleMele();
          } else {
            onEnterSalon(story.theme);
          }
        }}
        style={{ color: accentColor }}
        className="font-medium hover:underline inline-flex items-center gap-1"
      >
        <span>{label}</span>
        <ArrowUpRight className="w-3 h-3 shrink-0" />
      </button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-12">
      {/* Editorial Header */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end pb-8 border-b border-stone-200">
        <div className="lg:col-span-8 space-y-3">
          <p className="text-xs uppercase tracking-widest text-stone-500 flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-[#1B365D]" />
            <span>Palmarès littéraire · Classement en direct</span>
          </p>
          <h1
            className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Les romans les plus lus par catégorie &amp; l’auteur le plus lu
          </h1>
          <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
            Découvrez les feuilletons qui captivent le plus de lecteurs dans chaque genre, ainsi que les plumes les plus suivies. Les récits publiés sous anonymat restent exclus du palmarès des auteurs tant que leur créateur choisit de garder le silence.
          </p>
        </div>

        <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col lg:items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-5 text-left lg:text-right">
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {allPublicNovels.length}
              </p>
              <p className="text-xs text-stone-500">Romans publiés</p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {totalNovelViews}
              </p>
              <p className="text-xs text-stone-500">Lectures</p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {activeGenreCount}
              </p>
              <p className="text-xs text-stone-500">Catégories</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onWriteNovel(selectedGenre === 'all' ? undefined : selectedGenre)
            }
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start lg:self-end"
          >
            <Feather className="w-4 h-4" />
            <span>Publier un roman</span>
          </button>
        </div>
      </section>

      {/* Most-Read Author Spotlight + Top Authors */}
      <section aria-label="L’auteur le plus lu" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Plume à l’honneur
            </p>
            <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
              L’auteur le plus lu
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Calculé uniquement sur les textes signés (hors écrits anonymes)
          </p>
        </div>

        {!storiesLoaded ? (
          <div className="bg-white border border-stone-200 rounded-lg p-8 text-sm text-stone-500">
            Chargement du palmarès des auteurs…
          </div>
        ) : !topAuthor ? (
          <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
            <p className="font-display text-xl text-stone-900">
              Aucun auteur signé n’apparaît encore au palmarès
            </p>
            <p className="text-sm text-stone-600 max-w-lg mx-auto">
              Publiez un roman ou revendiquez l’un de vos écrits anonymes depuis votre carnet pour entrer dans le classement des auteurs lus.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* #1 Most-Read Author Card */}
            <article className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-6 sm:p-7 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <AuthorAvatar
                      name={topAuthor.authorName}
                      avatarUrl={topAuthor.avatarUrl}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-widest text-[#1B365D] font-medium">
                        N° 1 · Auteur le plus lu
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenMemberWall(topAuthor.authorId)}
                        className="font-display text-2xl sm:text-3xl font-medium text-stone-900 hover:text-[#1B365D] hover:underline text-left truncate max-w-full block"
                      >
                        {topAuthor.authorName}
                      </button>
                      {topAuthor.bio && (
                        <p className="text-xs sm:text-sm text-stone-600 line-clamp-2 mt-1">
                          {topAuthor.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {user?.uid !== topAuthor.authorId && (
                    <button
                      type="button"
                      disabled={busyFollowId === topAuthor.authorId}
                      onClick={() =>
                        void handleToggleFollowAuthor(topAuthor.authorId, topAuthor.authorName)
                      }
                      aria-pressed={favoriteAuthorIds.has(topAuthor.authorId)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        favoriteAuthorIds.has(topAuthor.authorId)
                          ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-[#1B365D] hover:text-[#1B365D]'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          favoriteAuthorIds.has(topAuthor.authorId) ? 'fill-current' : ''
                        }`}
                      />
                      <span>
                        {favoriteAuthorIds.has(topAuthor.authorId) ? 'Suivi' : 'Suivre'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-stone-200">
                  <div>
                    <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                      {topAuthor.totalViews}
                    </p>
                    <p className="text-xs text-stone-500">Lectures totales</p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                      {topAuthor.novelCount}
                    </p>
                    <p className="text-xs text-stone-500">
                      Roman{topAuthor.novelCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                      {topAuthor.storyCount}
                    </p>
                    <p className="text-xs text-stone-500">
                      Texte{topAuthor.storyCount > 1 ? 's' : ''} signé{topAuthor.storyCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                      {topAuthor.totalResonances}
                    </p>
                    <p className="text-xs text-stone-500">Résonances</p>
                  </div>
                </div>

                <div className="rounded-md bg-[#F7F4EE] border border-stone-200 p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {topAuthor.topStory.storyFormat === 'roman' && (
                      <NovelCoverArt
                        coverUrl={topAuthor.topStory.coverUrl}
                        title={topAuthor.topStory.title}
                        genre={topAuthor.topStory.novelGenre}
                        size="xs"
                        showFallbackWhenMissing={true}
                      />
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="text-[11px] uppercase tracking-widest text-stone-500">
                        Œuvre la plus lue
                      </p>
                      <button
                        type="button"
                        onClick={() => onReadStory(topAuthor.topStory)}
                        className="font-display text-lg font-medium text-stone-900 hover:text-[#1B365D] hover:underline text-left block truncate max-w-full"
                      >
                        {topAuthor.topStory.title}
                      </button>
                      <p className="text-xs text-stone-600 tabular-nums">
                        {topAuthor.topStory.viewCount ?? 0} vue
                        {(topAuthor.topStory.viewCount ?? 0) > 1 ? 's' : ''} ·{' '}
                        {topAuthor.topStory.resonanceCount} résonance
                        {topAuthor.topStory.resonanceCount > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onReadStory(topAuthor.topStory)}
                    className="min-h-[34px] px-3 py-1 text-xs font-medium text-[#1B365D] bg-white border border-[#CBD6E6] rounded hover:bg-[#F3F6FA] whitespace-nowrap shrink-0 self-center"
                  >
                    Lire
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenMemberWall(topAuthor.authorId)}
                  className="text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5"
                >
                  <span>Découvrir tout son mur littéraire</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>

            {/* Runner-up Most-Read Authors */}
            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-5 sm:p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                  <h3 className="font-display text-lg font-medium text-stone-900">
                    Autres plumes les plus lues
                  </h3>
                  <span className="text-xs text-stone-500 tabular-nums">
                    Top {rankedAuthors.length > 5 ? 5 : rankedAuthors.length}
                  </span>
                </div>

                {runnerUpAuthors.length === 0 ? (
                  <p className="text-sm text-stone-500 py-6 text-center">
                    Les prochains auteurs signés apparaîtront ici dès que leurs récits seront lus.
                  </p>
                ) : (
                  <ol className="divide-y divide-stone-200">
                    {runnerUpAuthors.map((author, idx) => {
                      const rank = idx + 2;
                      return (
                        <li
                          key={author.authorId}
                          className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-display text-base font-medium text-stone-400 tabular-nums w-5 shrink-0">
                              0{rank}
                            </span>
                            <AuthorAvatar
                              name={author.authorName}
                              avatarUrl={author.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenMemberWall(author.authorId)}
                                className="text-sm font-medium text-stone-900 hover:text-[#1B365D] hover:underline truncate block max-w-full text-left"
                              >
                                {author.authorName}
                              </button>
                              <p className="text-xs text-stone-500 tabular-nums">
                                {author.totalViews} lecture{author.totalViews > 1 ? 's' : ''} ·{' '}
                                {author.novelCount} roman{author.novelCount > 1 ? 's' : ''} ·{' '}
                                {author.totalResonances} résonance
                                {author.totalResonances > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onReadStory(author.topStory)}
                              className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap"
                            >
                              Lire
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <p className="text-[11px] text-stone-500 pt-4 mt-4 border-t border-stone-100">
                Vous publiez sous anonymat ? Vous pouvez revendiquer votre texte à tout moment depuis votre carnet ou votre lecture pour rejoindre le classement.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Most-Read Novels by Category */}
      <section aria-label="Romans les plus lus par catégorie" className="space-y-6 pt-4 border-t border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Classement des feuilletons
            </p>
            <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
              Les romans les plus lus par catégorie
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Classés par nombre de lectures, puis par résonances et commentaires
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div
          role="tablist"
          aria-label="Catégories de romans"
          className="flex items-center gap-2 overflow-x-auto pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedGenre === 'all'}
            onClick={() => setSelectedGenre('all')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              selectedGenre === 'all'
                ? 'border-[#1B365D] bg-[#1B365D] text-white'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
            }`}
          >
            Toutes les catégories ({allPublicNovels.length})
          </button>
          {NOVEL_GENRES.map((genre) => {
            const count = novelsByGenre.get(genre)?.length ?? 0;
            const active = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedGenre(genre)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'border-[#1B365D] bg-[#1B365D] text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                }`}
              >
                {NOVEL_GENRE_LABELS[genre]} ({count})
              </button>
            );
          })}
        </div>

        {!storiesLoaded ? (
          <div className="bg-white border border-stone-200 rounded-lg p-8 text-sm text-stone-500">
            Chargement des romans…
          </div>
        ) : activeGenreNovels.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
            <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
            <div className="space-y-1.5">
              <h3 className="font-display text-2xl text-stone-900">
                {selectedGenre === 'all'
                  ? 'Aucun roman n’est encore paru'
                  : `Aucun roman dans la catégorie « ${NOVEL_GENRE_LABELS[selectedGenre]} »`}
              </h3>
              <p className="text-sm text-stone-600 max-w-md mx-auto">
                Soyez la première plume à inaugurer cette catégorie avec un chapitre de deux pages ou plus.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onWriteNovel(selectedGenre === 'all' ? undefined : selectedGenre)
              }
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Feather className="w-4 h-4" />
              <span>Écrire le premier roman</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Lead Novel (#1 in selection) */}
            {leadNovel && (
              <article className="bg-white border border-stone-200 rounded-lg p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
                <NovelCoverArt
                  coverUrl={leadNovel.coverUrl}
                  title={leadNovel.title}
                  genre={leadNovel.novelGenre}
                  accentColor={getSalonDisplayInfo(leadNovel, customSalons).accentColor}
                  size="lg"
                  showFallbackWhenMissing={true}
                />

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
                    <span className="font-medium text-[#1B365D] uppercase tracking-wider">
                      N° 1 {selectedGenre === 'all' ? 'général' : `· ${NOVEL_GENRE_LABELS[selectedGenre]}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{NOVEL_GENRE_LABELS[getNovelCategory(leadNovel)]}</span>
                    <span aria-hidden="true">·</span>
                    {renderOriginLink(leadNovel)}
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {leadNovel.chapterCount ?? 1} chap. ·{' '}
                      {SERIES_STATUS_LABELS[leadNovel.seriesStatus ?? 'en-cours']}
                    </span>
                    <MatureContentBadge minAge={leadNovel.minAge} isMature={leadNovel.isMature} />
                  </div>

                  <div className="space-y-2">
                    <h3
                      className="font-display text-2xl sm:text-3xl font-medium text-stone-900 leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      <button
                        type="button"
                        onClick={() => onReadStory(leadNovel)}
                        className="hover:text-[#1B365D] text-left transition-colors"
                      >
                        {leadNovel.title}
                      </button>
                    </h3>
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-prose">
                      {leadNovel.excerpt}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                      {leadNovel.isAnonymous ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
                          <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                          <span>Auteur anonyme</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenMemberWall(leadNovel.authorId)}
                          className="inline-flex items-center gap-1.5 font-medium text-stone-800 hover:text-[#1B365D] hover:underline"
                        >
                          <UserIcon className="w-3.5 h-3.5 text-stone-400" />
                          <span>{leadNovel.authorName}</span>
                        </button>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{formatFrenchDate(leadNovel.createdAt?.toDate() ?? null)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums font-medium text-stone-800">
                        <Eye className="w-3.5 h-3.5 text-stone-400" />
                        {leadNovel.viewCount ?? 0} vue{(leadNovel.viewCount ?? 0) > 1 ? 's' : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Heart className="w-3.5 h-3.5 text-stone-400" />
                        {leadNovel.resonanceCount}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                        {leadNovel.echoCount}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(leadNovel)}
                        aria-label="Enregistrer pour lire plus tard"
                        title={
                          bookmarkedStoryIds.has(leadNovel.storyId)
                            ? 'Retirer des favoris'
                            : 'Enregistrer pour lire plus tard'
                        }
                        className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded border transition-colors ${
                          bookmarkedStoryIds.has(leadNovel.storyId)
                            ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                        }`}
                      >
                        <Bookmark
                          className={`w-4 h-4 ${
                            bookmarkedStoryIds.has(leadNovel.storyId) ? 'fill-current' : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenRepost(leadNovel)}
                        aria-label="Repartager"
                        title="Repartager sur mon compte"
                        className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded border transition-colors ${
                          repostedStoryIds.has(leadNovel.storyId)
                            ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                        }`}
                      >
                        <Repeat2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onReadStory(leadNovel)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span>Lire le roman</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* Ranked List #2+ */}
            {otherNovels.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-200">
                {otherNovels.map((novel, idx) => {
                  const rank = idx + 2;
                  const rankLabel = rank < 10 ? `0${rank}` : `${rank}`;
                  return (
                    <article
                      key={novel.storyId}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF8F4] transition-colors"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <span className="font-display text-xl font-medium text-stone-400 tabular-nums w-7 shrink-0 pt-1">
                          {rankLabel}
                        </span>
                        <NovelCoverArt
                          coverUrl={novel.coverUrl}
                          title={novel.title}
                          genre={novel.novelGenre}
                          accentColor={getSalonDisplayInfo(novel, customSalons).accentColor}
                          size="xs"
                          showFallbackWhenMissing={true}
                        />
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                            <span>{NOVEL_GENRE_LABELS[getNovelCategory(novel)]}</span>
                            <span aria-hidden="true">·</span>
                            {renderOriginLink(novel)}
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {novel.chapterCount ?? 1} chap. ·{' '}
                              {SERIES_STATUS_LABELS[novel.seriesStatus ?? 'en-cours']}
                            </span>
                            <MatureContentBadge minAge={novel.minAge} isMature={novel.isMature} />
                          </div>

                          <h3 className="font-display text-xl font-medium text-stone-900">
                            <button
                              type="button"
                              onClick={() => onReadStory(novel)}
                              className="hover:text-[#1B365D] text-left transition-colors"
                            >
                              {novel.title}
                            </button>
                          </h3>

                          <p className="text-xs sm:text-sm text-stone-600 line-clamp-2 max-w-2xl">
                            {novel.excerpt}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 pt-1">
                            {novel.isAnonymous ? (
                              <span className="inline-flex items-center gap-1 text-stone-700 font-medium">
                                <EyeOff className="w-3 h-3 text-stone-400" />
                                <span>Auteur anonyme</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenMemberWall(novel.authorId)}
                                className="inline-flex items-center gap-1 text-stone-700 font-medium hover:text-[#1B365D] hover:underline"
                              >
                                <UserIcon className="w-3 h-3 text-stone-400" />
                                <span>{novel.authorName}</span>
                              </button>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums text-stone-700 font-medium">
                              <Eye className="w-3 h-3 text-stone-400" />
                              {novel.viewCount ?? 0} vue{(novel.viewCount ?? 0) > 1 ? 's' : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Heart className="w-3 h-3 text-stone-400" />
                              {novel.resonanceCount}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <MessageCircle className="w-3 h-3 text-stone-400" />
                              {novel.echoCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => onToggleBookmark(novel)}
                          aria-label="Enregistrer pour lire plus tard"
                          className={`min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded border transition-colors ${
                            bookmarkedStoryIds.has(novel.storyId)
                              ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                              : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400'
                          }`}
                        >
                          <Bookmark
                            className={`w-3.5 h-3.5 ${
                              bookmarkedStoryIds.has(novel.storyId) ? 'fill-current' : ''
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReadStory(novel)}
                          className="min-h-[34px] px-3 py-1 text-xs font-medium text-[#1B365D] border border-[#CBD6E6] bg-[#F3F6FA] rounded hover:bg-[#E7EEF7] inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>Lire</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Per-Category #1 Shelf Overview (visible on "Toutes les catégories") */}
      {selectedGenre === 'all' && storiesLoaded && (
        <section
          aria-label="Meilleur roman dans chaque catégorie"
          className="space-y-6 pt-4 border-t border-stone-200"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500">
                Panorama des genres
              </p>
              <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
                En tête dans chaque catégorie
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Cliquez sur une catégorie pour afficher son classement complet
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {NOVEL_GENRES.map((genre) => {
              const genreList = novelsByGenre.get(genre) ?? [];
              const champion = genreList[0] ?? null;

              return (
                <div
                  key={genre}
                  className="bg-white border border-stone-200 rounded-lg p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-100">
                      <button
                        type="button"
                        onClick={() => setSelectedGenre(genre)}
                        className="font-display text-lg font-medium text-stone-900 hover:text-[#1B365D] hover:underline text-left"
                      >
                        {NOVEL_GENRE_LABELS[genre]}
                      </button>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {genreList.length} roman{genreList.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {champion ? (
                      <div className="flex items-start gap-3.5">
                        <NovelCoverArt
                          coverUrl={champion.coverUrl}
                          title={champion.title}
                          genre={champion.novelGenre}
                          accentColor={getSalonDisplayInfo(champion, customSalons).accentColor}
                          size="sm"
                          showFallbackWhenMissing={true}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-[11px] uppercase tracking-wider text-[#1B365D] font-medium">
                            N° 1 du genre
                          </p>
                          <button
                            type="button"
                            onClick={() => onReadStory(champion)}
                            className="font-display text-lg font-medium text-stone-900 hover:text-[#1B365D] text-left leading-snug line-clamp-2 block"
                          >
                            {champion.title}
                          </button>
                          <p className="text-xs text-stone-600">
                            {champion.isAnonymous ? (
                              <span className="inline-flex items-center gap-1">
                                <EyeOff className="w-3 h-3 text-stone-400" />
                                <span>Auteur anonyme</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenMemberWall(champion.authorId)}
                                className="hover:text-[#1B365D] hover:underline"
                              >
                                {champion.authorName}
                              </button>
                            )}
                          </p>
                          <p className="text-xs text-stone-500 tabular-nums">
                            {champion.viewCount ?? 0} vue
                            {(champion.viewCount ?? 0) > 1 ? 's' : ''} · {champion.chapterCount ?? 1}{' '}
                            chap.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-xs text-stone-500 space-y-2">
                        <p>Aucun roman n’occupe encore ce rayon.</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    {champion ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedGenre(genre)}
                          className="text-xs font-medium text-stone-600 hover:text-stone-900"
                        >
                          Voir les {genreList.length}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReadStory(champion)}
                          className="text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Lire le n° 1</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onWriteNovel(genre)}
                        className="text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1"
                      >
                        <Feather className="w-3 h-3" />
                        <span>Écrire le premier en {NOVEL_GENRE_LABELS[genre].toLowerCase()}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
