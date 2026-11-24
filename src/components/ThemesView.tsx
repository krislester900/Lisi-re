import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Bookmark,
  BookOpen,
  Crown,
  Eye,
  EyeOff,
  Feather,
  Heart,
  MessageCircle,
  Repeat2,
  User as UserIcon,
} from 'lucide-react';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  NOVEL_GENRES,
  SERIES_STATUS_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import {
  CustomSalon,
  NovelGenre,
  PublicProfile,
  Story,
  StoryThemeId,
} from '../types/story';
import { AuthorsSpotlight } from './AuthorsSpotlight';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';
import { StoryFormatKicker } from './StoryFormatKicker';

interface ThemesViewProps {
  stories: Story[];
  storiesLoaded: boolean;
  myStories?: Story[];
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
  onWriteConfession?: (theme?: StoryThemeId) => void;
  onShowNotice?: (message: string) => void;
}

type RankingWorkCategory = 'roman' | 'confession';
type ConfessionThemeFilter = 'all' | StoryThemeId | 'pelemele';

function getNovelCategory(story: Story): NovelGenre {
  return story.novelGenre ?? 'autre';
}

function getConfessionBucket(story: Story): StoryThemeId | 'pelemele' {
  if (story.storyScope === 'pelemele' && !story.customSalonId) return 'pelemele';
  return story.theme;
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

export function ThemesView({
  stories,
  storiesLoaded,
  myStories = [],
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
  onWriteConfession,
  onShowNotice,
}: ThemesViewProps) {
  const [workCategory, setWorkCategory] = useState<RankingWorkCategory>('roman');
  const [selectedGenre, setSelectedGenre] = useState<'all' | NovelGenre>('all');
  const [selectedConfessionTheme, setSelectedConfessionTheme] =
    useState<ConfessionThemeFilter>('all');

  // Public novels sorted by readership (strictly separated from confessions)
  const allPublicNovels = useMemo(
    () =>
      stories
        .filter((s) => s.storyFormat === 'roman')
        .slice()
        .sort(compareStoriesByPopularity),
    [stories]
  );

  // Public confessions sorted by readership (strictly separated from novels)
  const allPublicConfessions = useMemo(
    () =>
      stories
        .filter((s) => (s.storyFormat ?? 'confession') !== 'roman')
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

  const confessionsByTheme = useMemo(() => {
    const map = new Map<StoryThemeId | 'pelemele', Story[]>();
    for (const t of STORY_THEMES) {
      map.set(t.id, []);
    }
    map.set('pelemele', []);
    for (const conf of allPublicConfessions) {
      const bucket = getConfessionBucket(conf);
      const list = map.get(bucket);
      if (list) list.push(conf);
    }
    return map;
  }, [allPublicConfessions]);

  const activeGenreNovels = useMemo(() => {
    if (selectedGenre === 'all') return allPublicNovels;
    return novelsByGenre.get(selectedGenre) ?? [];
  }, [selectedGenre, allPublicNovels, novelsByGenre]);

  const activeConfessions = useMemo(() => {
    if (selectedConfessionTheme === 'all') return allPublicConfessions;
    return confessionsByTheme.get(selectedConfessionTheme) ?? [];
  }, [selectedConfessionTheme, allPublicConfessions, confessionsByTheme]);

  const totalAllViews = useMemo(
    () => stories.reduce((sum, s) => sum + (s.viewCount ?? 0), 0),
    [stories]
  );

  const podiumNovels = activeGenreNovels.slice(0, 3);
  const otherNovels = activeGenreNovels.slice(3);

  const podiumConfessions = activeConfessions.slice(0, 3);
  const otherConfessions = activeConfessions.slice(3);

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
        <div className="lg:col-span-7 space-y-3">
          <p className="text-xs uppercase tracking-widest text-stone-500 flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-[#1B365D]" />
            <span>Palmarès littéraire · Romans &amp; Confessions séparés</span>
          </p>
          <h1
            className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Classement des romans par genre &amp; des confessions par salon
          </h1>
          <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
            Les romans à chapitres et les confessions forment deux catégories distinctes dans le palmarès comme dans la lecture, afin de ne jamais mélanger feuilletons longs et textes intimes.
          </p>
        </div>

        <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col lg:items-end justify-between gap-4">
          <div className="grid grid-cols-3 gap-5 text-left lg:text-right">
            <div>
              <p className="font-display text-2xl font-medium text-[#1B365D] tabular-nums">
                {allPublicNovels.length}
              </p>
              <p className="text-xs text-stone-500">Romans</p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-[#9A3B29] tabular-nums">
                {allPublicConfessions.length}
              </p>
              <p className="text-xs text-stone-500">Confessions</p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {totalAllViews}
              </p>
              <p className="text-xs text-stone-500">Lectures</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-end">
            {onWriteConfession && (
              <button
                type="button"
                onClick={() =>
                  onWriteConfession(
                    selectedConfessionTheme !== 'all' && selectedConfessionTheme !== 'pelemele'
                      ? selectedConfessionTheme
                      : undefined
                  )
                }
                className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#9A3B29] bg-[#FDF4F2] border border-[#ECC9C1] rounded-md hover:border-[#9A3B29] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Feather className="w-4 h-4" />
                <span>Écrire une confession</span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onWriteNovel(selectedGenre === 'all' ? undefined : selectedGenre)
              }
              className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>Publier un roman</span>
            </button>
          </div>
        </div>
      </section>

      {/* Authors Spotlight ("Auteurs en lumière") */}
      <AuthorsSpotlight
        stories={stories}
        storiesLoaded={storiesLoaded}
        myStories={myStories}
        discoverableProfiles={discoverableProfiles}
        onReadStory={onReadStory}
        onOpenMemberWall={onOpenMemberWall}
        onWriteNovel={() =>
          onWriteNovel(selectedGenre === 'all' ? undefined : selectedGenre)
        }
        onShowNotice={onShowNotice}
      />

      {/* Separated Works Ranking: Romans à chapitres vs Confessions */}
      <section
        aria-label="Classement des romans et des confessions"
        className="space-y-6 pt-4 border-t border-stone-200"
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Classement par catégorie d’œuvre
            </p>
            <h2 className="font-display text-2xl font-medium text-stone-900">
              {workCategory === 'roman'
                ? 'Romans à chapitres · Les plus lus par genre'
                : 'Confessions · Les plus lues par salon'}
            </h2>
          </div>

          {/* Primary Category Switcher: Romans vs Confessions */}
          <div
            role="tablist"
            aria-label="Choisir la catégorie du classement"
            className="inline-flex items-center gap-1.5 p-1 bg-stone-100 rounded-lg border border-stone-200 self-start lg:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={workCategory === 'roman'}
              onClick={() => setWorkCategory('roman')}
              className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                workCategory === 'roman'
                  ? 'bg-[#1B365D] text-white shadow-xs'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-white/70'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Romans ({allPublicNovels.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workCategory === 'confession'}
              onClick={() => setWorkCategory('confession')}
              className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                workCategory === 'confession'
                  ? 'bg-[#9A3B29] text-white shadow-xs'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-white/70'
              }`}
            >
              <Feather className="w-4 h-4 shrink-0" />
              <span>Confessions ({allPublicConfessions.length})</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CATEGORY 1: ROMANS À CHAPITRES                               */}
        {/* ============================================================ */}
        {workCategory === 'roman' && (
          <div className="space-y-6">
            {/* Genre Sub-Tabs for Novels */}
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
                Tous les romans ({allPublicNovels.length})
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
                <BookOpen className="w-8 h-8 text-[#1B365D]/70 mx-auto" />
                <div className="space-y-1.5">
                  <h3 className="font-display text-2xl text-stone-900">
                    {selectedGenre === 'all'
                      ? 'Aucun roman n’est encore paru'
                      : `Aucun roman dans le genre « ${NOVEL_GENRE_LABELS[selectedGenre]} »`}
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
                  <BookOpen className="w-4 h-4" />
                  <span>Écrire le premier roman</span>
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Podium des meilleurs romans (#2 gauche, #1 surélevé au centre, #3 droite) */}
                {podiumNovels.length === 1 ? (
                  (() => {
                    const leadNovel = podiumNovels[0];
                    return (
                      <article className="bg-[#FFFDF8] border border-[#C9A227]/70 rounded-xl overflow-hidden shadow-[0_14px_34px_-20px_rgba(140,77,14,0.28)]">
                        <div className="bg-[#B4822B] text-[#FFFDF8] px-5 py-2 flex items-center justify-between gap-2 text-xs font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Crown className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              N° 1 Roman{' '}
                              {selectedGenre === 'all'
                                ? '· Tous genres'
                                : `· ${NOVEL_GENRE_LABELS[selectedGenre]}`}
                            </span>
                          </span>
                          <span className="font-display text-sm tabular-nums">01</span>
                        </div>

                        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
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
                              <StoryFormatKicker story={leadNovel} showDetails={true} />
                              <span aria-hidden="true">·</span>
                              {renderOriginLink(leadNovel)}
                              <MatureContentBadge
                                minAge={leadNovel.minAge}
                                isMature={leadNovel.isMature}
                              />
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

                            <div className="pt-3 border-t border-stone-200/70 flex flex-wrap items-center justify-between gap-4">
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
                                  {leadNovel.viewCount ?? 0} vue
                                  {(leadNovel.viewCount ?? 0) > 1 ? 's' : ''}
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
                        </div>
                      </article>
                    );
                  })()
                ) : (
                  <div
                    className={
                      podiumNovels.length >= 3
                        ? 'grid grid-cols-1 lg:grid-cols-3 gap-5 items-start'
                        : 'grid grid-cols-1 lg:grid-cols-2 gap-5 items-start max-w-4xl mx-auto'
                    }
                  >
                    {podiumNovels.map((novel, idx) => {
                      const rank = (idx + 1) as 1 | 2 | 3;
                      const isChampion = rank === 1;
                      const isSecond = rank === 2;

                      const orderClass =
                        podiumNovels.length >= 3
                          ? isChampion
                            ? 'order-1 lg:order-2'
                            : isSecond
                              ? 'order-2 lg:order-1 lg:mt-8'
                              : 'order-3 lg:order-3 lg:mt-12'
                          : isChampion
                            ? 'order-1'
                            : 'order-2 lg:mt-6';

                      const cardSurface = isChampion
                        ? 'bg-[#FFFDF8] border-[#C9A227]/70 shadow-[0_14px_34px_-20px_rgba(140,77,14,0.3)]'
                        : isSecond
                          ? 'bg-white border-stone-300 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.2)]'
                          : 'bg-white border-[#D9B9AE] shadow-[0_10px_24px_-20px_rgba(154,59,41,0.16)]';

                      const stripClass = isChampion
                        ? 'bg-[#B4822B] text-[#FFFDF8]'
                        : isSecond
                          ? 'bg-[#57534E] text-white'
                          : 'bg-[#9A3B29] text-white';

                      const stepHeading =
                        rank === 1
                          ? `N° 1 Roman ${selectedGenre === 'all' ? '· Tête d’affiche' : `· ${NOVEL_GENRE_LABELS[selectedGenre]}`}`
                          : rank === 2
                            ? 'N° 2 · Deuxième marche'
                            : 'N° 3 · Troisième marche';

                      return (
                        <article
                          key={novel.storyId}
                          className={`${orderClass} ${cardSurface} border rounded-xl overflow-hidden flex flex-col justify-between`}
                        >
                          <div>
                            <div
                              className={`${stripClass} px-4 py-2 flex items-center justify-between gap-2 text-xs font-medium`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {isChampion ? (
                                  <Crown className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <Award className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{stepHeading}</span>
                              </span>
                              <span className="font-display text-sm tabular-nums">0{rank}</span>
                            </div>

                            <div className={isChampion ? 'p-5 sm:p-6 space-y-4' : 'p-5 space-y-3.5'}>
                              <div className="flex items-start gap-4">
                                <NovelCoverArt
                                  coverUrl={novel.coverUrl}
                                  title={novel.title}
                                  genre={novel.novelGenre}
                                  accentColor={getSalonDisplayInfo(novel, customSalons).accentColor}
                                  size={isChampion ? 'md' : 'sm'}
                                  showFallbackWhenMissing={true}
                                />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <StoryFormatKicker story={novel} showDetails={false} />
                                  <p className="text-[11px] text-stone-500 tabular-nums">
                                    {NOVEL_GENRE_LABELS[getNovelCategory(novel)]} ·{' '}
                                    {novel.chapterCount ?? 1} chap.
                                  </p>
                                  <h3
                                    className={`font-display font-medium text-stone-900 leading-snug ${
                                      isChampion ? 'text-2xl' : 'text-xl'
                                    }`}
                                    style={{ textWrap: 'balance' }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onReadStory(novel)}
                                      className="hover:text-[#1B365D] text-left transition-colors"
                                    >
                                      {novel.title}
                                    </button>
                                  </h3>
                                  <p className="text-xs text-stone-600">
                                    {novel.isAnonymous ? (
                                      <span className="inline-flex items-center gap-1">
                                        <EyeOff className="w-3 h-3 text-stone-400" />
                                        <span>Auteur anonyme</span>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => onOpenMemberWall(novel.authorId)}
                                        className="font-medium text-stone-700 hover:text-[#1B365D] hover:underline"
                                      >
                                        {novel.authorName}
                                      </button>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <p className="text-xs sm:text-sm text-stone-600 line-clamp-3 leading-relaxed">
                                {novel.excerpt}
                              </p>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
                                {renderOriginLink(novel)}
                                <span aria-hidden="true">·</span>
                                <span>{SERIES_STATUS_LABELS[novel.seriesStatus ?? 'en-cours']}</span>
                                <MatureContentBadge
                                  minAge={novel.minAge}
                                  isMature={novel.isMature}
                                  compact
                                />
                              </div>
                            </div>
                          </div>

                          <div className="px-5 py-3 bg-[#FAF8F4] border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-3 text-xs text-stone-600 tabular-nums">
                              <span className="inline-flex items-center gap-1 font-medium text-stone-800">
                                <Eye className="w-3.5 h-3.5 text-stone-400" />
                                {novel.viewCount ?? 0}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Heart className="w-3.5 h-3.5 text-stone-400" />
                                {novel.resonanceCount}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                                {novel.echoCount}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onToggleBookmark(novel)}
                                aria-label="Enregistrer pour lire plus tard"
                                className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                  bookmarkedStoryIds.has(novel.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                }`}
                              >
                                <Bookmark
                                  className={`w-3.5 h-3.5 ${
                                    bookmarkedStoryIds.has(novel.storyId) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>

                              {isChampion && (
                                <button
                                  type="button"
                                  onClick={() => onOpenRepost(novel)}
                                  aria-label="Repartager"
                                  className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                    repostedStoryIds.has(novel.storyId)
                                      ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                  }`}
                                >
                                  <Repeat2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onReadStory(novel)}
                                className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                                  isChampion
                                    ? 'bg-[#1B365D] text-white hover:bg-[#132744]'
                                    : 'bg-white border border-[#CBD6E6] text-[#1B365D] hover:bg-[#F3F6FA]'
                                }`}
                              >
                                <span>Lire le roman</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {/* Ranked List #4+ for Novels */}
                {otherNovels.length > 0 && (
                  <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-200">
                    {otherNovels.map((novel, idx) => {
                      const rank = idx + 4;
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
                                <StoryFormatKicker story={novel} showDetails={true} />
                                <span aria-hidden="true">·</span>
                                {renderOriginLink(novel)}
                                <MatureContentBadge
                                  minAge={novel.minAge}
                                  isMature={novel.isMature}
                                />
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
          </div>
        )}

        {/* ============================================================ */}
        {/* CATEGORY 2: CONFESSIONS                                      */}
        {/* ============================================================ */}
        {workCategory === 'confession' && (
          <div className="space-y-6">
            {/* Thematic Salon Sub-Tabs for Confessions */}
            <div
              role="tablist"
              aria-label="Catégories de confessions par salon"
              className="flex items-center gap-2 overflow-x-auto pb-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedConfessionTheme === 'all'}
                onClick={() => setSelectedConfessionTheme('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  selectedConfessionTheme === 'all'
                    ? 'border-[#9A3B29] bg-[#9A3B29] text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                }`}
              >
                Toutes les confessions ({allPublicConfessions.length})
              </button>
              {STORY_THEMES.map((theme) => {
                const count = confessionsByTheme.get(theme.id)?.length ?? 0;
                const active = selectedConfessionTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedConfessionTheme(theme.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'border-[#9A3B29] bg-[#9A3B29] text-white'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    {theme.shortSalonName} ({count})
                  </button>
                );
              })}
              {(confessionsByTheme.get('pelemele')?.length ?? 0) > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedConfessionTheme === 'pelemele'}
                  onClick={() => setSelectedConfessionTheme('pelemele')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    selectedConfessionTheme === 'pelemele'
                      ? 'border-[#9A3B29] bg-[#9A3B29] text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                  }`}
                >
                  Hors salon · Pêle-mêle ({confessionsByTheme.get('pelemele')?.length ?? 0})
                </button>
              )}
            </div>

            {!storiesLoaded ? (
              <div className="bg-white border border-stone-200 rounded-lg p-8 text-sm text-stone-500">
                Chargement des confessions…
              </div>
            ) : activeConfessions.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
                <Feather className="w-8 h-8 text-[#9A3B29]/70 mx-auto" />
                <div className="space-y-1.5">
                  <h3 className="font-display text-2xl text-stone-900">
                    {selectedConfessionTheme === 'all'
                      ? 'Aucune confession n’est encore parue'
                      : selectedConfessionTheme === 'pelemele'
                        ? 'Aucune confession hors salon pour le moment'
                        : `Aucune confession dans « ${THEME_MAP[selectedConfessionTheme].salonName} »`}
                  </h3>
                  <p className="text-sm text-stone-600 max-w-md mx-auto">
                    Déposez une confession personnelle (plus de 3 lignes) pour ouvrir le classement de cette pièce.
                  </p>
                </div>
                {onWriteConfession && (
                  <button
                    type="button"
                    onClick={() =>
                      onWriteConfession(
                        selectedConfessionTheme !== 'all' && selectedConfessionTheme !== 'pelemele'
                          ? selectedConfessionTheme
                          : undefined
                      )
                    }
                    className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#9A3B29] rounded-md hover:bg-[#7F2F20] inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Feather className="w-4 h-4" />
                    <span>Écrire la première confession</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {/* Podium des meilleures confessions (#2 gauche, #1 surélevé au centre, #3 droite) */}
                {podiumConfessions.length === 1 ? (
                  (() => {
                    const leadConf = podiumConfessions[0];
                    return (
                      <article className="bg-[#FFFBF9] border border-[#C97B6B]/70 rounded-xl overflow-hidden shadow-[0_14px_34px_-20px_rgba(154,59,41,0.25)]">
                        <div className="bg-[#9A3B29] text-white px-5 py-2 flex items-center justify-between gap-2 text-xs font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Crown className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              N° 1 Confession{' '}
                              {selectedConfessionTheme === 'all'
                                ? '· Tous salons'
                                : selectedConfessionTheme === 'pelemele'
                                  ? '· Hors salon'
                                  : `· ${THEME_MAP[selectedConfessionTheme].shortSalonName}`}
                            </span>
                          </span>
                          <span className="font-display text-sm tabular-nums">01</span>
                        </div>

                        <div className="p-6 sm:p-8 space-y-4">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
                            <StoryFormatKicker story={leadConf} showDetails={false} />
                            <span aria-hidden="true">·</span>
                            {renderOriginLink(leadConf)}
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{leadConf.readingMinutes} min de lecture</span>
                            <MatureContentBadge
                              minAge={leadConf.minAge}
                              isMature={leadConf.isMature}
                            />
                          </div>

                          <div className="space-y-2">
                            <h3
                              className="font-display text-2xl sm:text-3xl font-medium text-stone-900 leading-snug"
                              style={{ textWrap: 'balance' }}
                            >
                              <button
                                type="button"
                                onClick={() => onReadStory(leadConf)}
                                className="hover:text-[#9A3B29] text-left transition-colors"
                              >
                                {leadConf.title}
                              </button>
                            </h3>
                            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-prose">
                              {leadConf.excerpt}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-stone-200/70 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                              {leadConf.isAnonymous ? (
                                <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
                                  <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                                  <span>Auteur anonyme</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onOpenMemberWall(leadConf.authorId)}
                                  className="inline-flex items-center gap-1.5 font-medium text-stone-800 hover:text-[#9A3B29] hover:underline"
                                >
                                  <UserIcon className="w-3.5 h-3.5 text-stone-400" />
                                  <span>{leadConf.authorName}</span>
                                </button>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>{formatFrenchDate(leadConf.createdAt?.toDate() ?? null)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums font-medium text-stone-800">
                                <Eye className="w-3.5 h-3.5 text-stone-400" />
                                {leadConf.viewCount ?? 0} vue
                                {(leadConf.viewCount ?? 0) > 1 ? 's' : ''}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Heart className="w-3.5 h-3.5 text-stone-400" />
                                {leadConf.resonanceCount}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                                {leadConf.echoCount}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => onToggleBookmark(leadConf)}
                                aria-label="Enregistrer pour lire plus tard"
                                className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded border transition-colors ${
                                  bookmarkedStoryIds.has(leadConf.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                }`}
                              >
                                <Bookmark
                                  className={`w-4 h-4 ${
                                    bookmarkedStoryIds.has(leadConf.storyId) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenRepost(leadConf)}
                                aria-label="Repartager"
                                className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded border transition-colors ${
                                  repostedStoryIds.has(leadConf.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                }`}
                              >
                                <Repeat2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onReadStory(leadConf)}
                                className="min-h-[36px] px-3.5 py-1.5 rounded-md bg-[#9A3B29] text-white text-xs font-medium hover:bg-[#7F2F20] inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <span>Lire la confession</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })()
                ) : (
                  <div
                    className={
                      podiumConfessions.length >= 3
                        ? 'grid grid-cols-1 lg:grid-cols-3 gap-5 items-start'
                        : 'grid grid-cols-1 lg:grid-cols-2 gap-5 items-start max-w-4xl mx-auto'
                    }
                  >
                    {podiumConfessions.map((conf, idx) => {
                      const rank = (idx + 1) as 1 | 2 | 3;
                      const isChampion = rank === 1;
                      const isSecond = rank === 2;

                      const orderClass =
                        podiumConfessions.length >= 3
                          ? isChampion
                            ? 'order-1 lg:order-2'
                            : isSecond
                              ? 'order-2 lg:order-1 lg:mt-8'
                              : 'order-3 lg:order-3 lg:mt-12'
                          : isChampion
                            ? 'order-1'
                            : 'order-2 lg:mt-6';

                      const cardSurface = isChampion
                        ? 'bg-[#FFFBF9] border-[#C97B6B]/80 shadow-[0_14px_34px_-20px_rgba(154,59,41,0.28)]'
                        : isSecond
                          ? 'bg-white border-stone-300 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.2)]'
                          : 'bg-white border-stone-200 shadow-[0_10px_24px_-20px_rgba(28,25,23,0.14)]';

                      const stripClass = isChampion
                        ? 'bg-[#9A3B29] text-white'
                        : isSecond
                          ? 'bg-[#57534E] text-white'
                          : 'bg-[#78716C] text-white';

                      const stepHeading =
                        rank === 1
                          ? `N° 1 Confession ${
                              selectedConfessionTheme === 'all'
                                ? '· La plus lue'
                                : selectedConfessionTheme === 'pelemele'
                                  ? '· Hors salon'
                                  : `· ${THEME_MAP[selectedConfessionTheme].shortSalonName}`
                            }`
                          : rank === 2
                            ? 'N° 2 · Deuxième marche'
                            : 'N° 3 · Troisième marche';

                      return (
                        <article
                          key={conf.storyId}
                          className={`${orderClass} ${cardSurface} border rounded-xl overflow-hidden flex flex-col justify-between`}
                        >
                          <div>
                            <div
                              className={`${stripClass} px-4 py-2 flex items-center justify-between gap-2 text-xs font-medium`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {isChampion ? (
                                  <Crown className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <Award className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{stepHeading}</span>
                              </span>
                              <span className="font-display text-sm tabular-nums">0{rank}</span>
                            </div>

                            <div className={isChampion ? 'p-5 sm:p-6 space-y-3.5' : 'p-5 space-y-3'}>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                                <StoryFormatKicker story={conf} showDetails={false} />
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">{conf.readingMinutes} min</span>
                                <MatureContentBadge
                                  minAge={conf.minAge}
                                  isMature={conf.isMature}
                                  compact
                                />
                              </div>

                              <h3
                                className={`font-display font-medium text-stone-900 leading-snug ${
                                  isChampion ? 'text-2xl' : 'text-xl'
                                }`}
                                style={{ textWrap: 'balance' }}
                              >
                                <button
                                  type="button"
                                  onClick={() => onReadStory(conf)}
                                  className="hover:text-[#9A3B29] text-left transition-colors"
                                >
                                  {conf.title}
                                </button>
                              </h3>

                              <p className="text-xs sm:text-sm text-stone-600 line-clamp-3 leading-relaxed">
                                {conf.excerpt}
                              </p>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
                                {conf.isAnonymous ? (
                                  <span className="inline-flex items-center gap-1">
                                    <EyeOff className="w-3 h-3 text-stone-400" />
                                    <span>Auteur anonyme</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onOpenMemberWall(conf.authorId)}
                                    className="font-medium text-stone-700 hover:text-[#9A3B29] hover:underline"
                                  >
                                    {conf.authorName}
                                  </button>
                                )}
                                <span aria-hidden="true">·</span>
                                {renderOriginLink(conf)}
                              </div>
                            </div>
                          </div>

                          <div className="px-5 py-3 bg-[#FAF8F4] border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-3 text-xs text-stone-600 tabular-nums">
                              <span className="inline-flex items-center gap-1 font-medium text-stone-800">
                                <Eye className="w-3.5 h-3.5 text-stone-400" />
                                {conf.viewCount ?? 0}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Heart className="w-3.5 h-3.5 text-stone-400" />
                                {conf.resonanceCount}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                                {conf.echoCount}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onToggleBookmark(conf)}
                                aria-label="Enregistrer pour lire plus tard"
                                className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                  bookmarkedStoryIds.has(conf.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                }`}
                              >
                                <Bookmark
                                  className={`w-3.5 h-3.5 ${
                                    bookmarkedStoryIds.has(conf.storyId) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>

                              {isChampion && (
                                <button
                                  type="button"
                                  onClick={() => onOpenRepost(conf)}
                                  aria-label="Repartager"
                                  className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                    repostedStoryIds.has(conf.storyId)
                                      ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                  }`}
                                >
                                  <Repeat2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onReadStory(conf)}
                                className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                                  isChampion
                                    ? 'bg-[#9A3B29] text-white hover:bg-[#7F2F20]'
                                    : 'bg-white border border-[#ECC9C1] text-[#9A3B29] hover:bg-[#FDF4F2]'
                                }`}
                              >
                                <span>Lire la confession</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {/* Ranked List #4+ for Confessions */}
                {otherConfessions.length > 0 && (
                  <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-200">
                    {otherConfessions.map((conf, idx) => {
                      const rank = idx + 4;
                      const rankLabel = rank < 10 ? `0${rank}` : `${rank}`;
                      return (
                        <article
                          key={conf.storyId}
                          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF8F4] transition-colors"
                        >
                          <div className="flex items-start gap-3.5 min-w-0 flex-1">
                            <span className="font-display text-xl font-medium text-stone-400 tabular-nums w-7 shrink-0 pt-1">
                              {rankLabel}
                            </span>
                            <div className="min-w-0 space-y-1 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                                <StoryFormatKicker story={conf} showDetails={false} />
                                <span aria-hidden="true">·</span>
                                {renderOriginLink(conf)}
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">{conf.readingMinutes} min</span>
                                <MatureContentBadge
                                  minAge={conf.minAge}
                                  isMature={conf.isMature}
                                />
                              </div>

                              <h3 className="font-display text-xl font-medium text-stone-900">
                                <button
                                  type="button"
                                  onClick={() => onReadStory(conf)}
                                  className="hover:text-[#9A3B29] text-left transition-colors"
                                >
                                  {conf.title}
                                </button>
                              </h3>

                              <p className="text-xs sm:text-sm text-stone-600 line-clamp-2 max-w-2xl">
                                {conf.excerpt}
                              </p>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 pt-1">
                                {conf.isAnonymous ? (
                                  <span className="inline-flex items-center gap-1 text-stone-700 font-medium">
                                    <EyeOff className="w-3 h-3 text-stone-400" />
                                    <span>Auteur anonyme</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onOpenMemberWall(conf.authorId)}
                                    className="inline-flex items-center gap-1 text-stone-700 font-medium hover:text-[#9A3B29] hover:underline"
                                  >
                                    <UserIcon className="w-3 h-3 text-stone-400" />
                                    <span>{conf.authorName}</span>
                                  </button>
                                )}
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums text-stone-700 font-medium">
                                  <Eye className="w-3 h-3 text-stone-400" />
                                  {conf.viewCount ?? 0} vue{(conf.viewCount ?? 0) > 1 ? 's' : ''}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Heart className="w-3 h-3 text-stone-400" />
                                  {conf.resonanceCount}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <MessageCircle className="w-3 h-3 text-stone-400" />
                                  {conf.echoCount}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => onToggleBookmark(conf)}
                              aria-label="Enregistrer pour lire plus tard"
                              className={`min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded border transition-colors ${
                                bookmarkedStoryIds.has(conf.storyId)
                                  ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                  : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400'
                              }`}
                            >
                              <Bookmark
                                className={`w-3.5 h-3.5 ${
                                  bookmarkedStoryIds.has(conf.storyId) ? 'fill-current' : ''
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => onReadStory(conf)}
                              className="min-h-[34px] px-3 py-1 text-xs font-medium text-[#9A3B29] border border-[#ECC9C1] bg-[#FDF4F2] rounded hover:bg-[#FAE7E3] inline-flex items-center gap-1.5 whitespace-nowrap"
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
          </div>
        )}
      </section>

      {/* Per-Genre Panorama (when viewing Romans -> Tous les romans) */}
      {workCategory === 'roman' && selectedGenre === 'all' && storiesLoaded && (
        <section
          aria-label="Meilleur roman dans chaque catégorie"
          className="space-y-6 pt-4 border-t border-stone-200"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500">
                Panorama des genres de romans
              </p>
              <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
                En tête dans chaque catégorie de roman
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Cliquez sur un genre pour afficher son classement complet
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
                            N° 1 · Roman
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
                        <BookOpen className="w-3 h-3" />
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

      {/* Per-Salon Panorama (when viewing Confessions -> Toutes les confessions) */}
      {workCategory === 'confession' && selectedConfessionTheme === 'all' && storiesLoaded && (
        <section
          aria-label="Meilleure confession par salon"
          className="space-y-6 pt-4 border-t border-stone-200"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500">
                Panorama des confessions par salon
              </p>
              <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
                En tête dans chaque salon de confession
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Cliquez sur un salon pour afficher son classement complet de confessions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {STORY_THEMES.map((theme) => {
              const themeList = confessionsByTheme.get(theme.id) ?? [];
              const champion = themeList[0] ?? null;

              return (
                <div
                  key={theme.id}
                  className="bg-white border border-stone-200 rounded-lg p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-100">
                      <button
                        type="button"
                        onClick={() => setSelectedConfessionTheme(theme.id)}
                        className="font-display text-lg font-medium text-stone-900 hover:text-[#9A3B29] hover:underline text-left"
                      >
                        {theme.shortSalonName}
                      </button>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {themeList.length} confession{themeList.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {champion ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-[#9A3B29] font-medium">
                          N° 1 · Confession
                        </p>
                        <button
                          type="button"
                          onClick={() => onReadStory(champion)}
                          className="font-display text-lg font-medium text-stone-900 hover:text-[#9A3B29] text-left leading-snug line-clamp-2 block"
                        >
                          {champion.title}
                        </button>
                        <p className="text-xs text-stone-600 line-clamp-2">{champion.excerpt}</p>
                        <p className="text-xs text-stone-500 tabular-nums pt-0.5">
                          {champion.isAnonymous ? 'Auteur anonyme' : champion.authorName} ·{' '}
                          {champion.viewCount ?? 0} vue
                          {(champion.viewCount ?? 0) > 1 ? 's' : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="py-4 text-xs text-stone-500">
                        Aucune confession dans ce salon pour l’instant.
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    {champion ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedConfessionTheme(theme.id)}
                          className="text-xs font-medium text-stone-600 hover:text-stone-900"
                        >
                          Voir les {themeList.length}
                        </button>
                        <button
                          type="button"
                          onClick={() => onReadStory(champion)}
                          className="text-xs font-medium text-[#9A3B29] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Lire le n° 1</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </>
                    ) : onWriteConfession ? (
                      <button
                        type="button"
                        onClick={() => onWriteConfession(theme.id)}
                        className="text-xs font-medium text-[#9A3B29] hover:underline inline-flex items-center gap-1"
                      >
                        <Feather className="w-3 h-3" />
                        <span>Écrire dans {theme.shortSalonName}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onEnterSalon(theme.id)}
                        className="text-xs font-medium text-[#9A3B29] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Visiter le salon</span>
                        <ArrowRight className="w-3 h-3" />
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
