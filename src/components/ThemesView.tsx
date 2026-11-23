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
  User as UserIcon,
} from 'lucide-react';
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
import { AuthorsSpotlight } from './AuthorsSpotlight';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';

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
  onShowNotice?: (message: string) => void;
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
  onShowNotice,
}: ThemesViewProps) {
  const [selectedGenre, setSelectedGenre] = useState<'all' | NovelGenre>('all');

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

  const leadNovel = activeGenreNovels[0] ?? null;
  const otherNovels = activeGenreNovels.slice(1);

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
