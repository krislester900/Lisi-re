import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Eye,
  Heart,
  MessageCircle,
  Search,
  Shuffle,
} from 'lucide-react';
import {
  formatFrenchDate,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import { Story, StoryFormat, StoryThemeId } from '../types/story';

type SortMode = 'shuffled' | 'recent' | 'views' | 'resonances';

interface PeleMeleStoriesViewProps {
  publicStories: Story[];
  storiesLoaded: boolean;
  onReadStory: (story: Story) => void;
  onEnterSalon: (salonId: StoryThemeId) => void;
  onEnterCustomSalon: (customSalonId: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onBackToSalons: () => void;
  onWriteStory: () => void;
}

function hashSeed(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

export function PeleMeleStoriesView({
  publicStories,
  storiesLoaded,
  onReadStory,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenMemberWall,
  onBackToSalons,
  onWriteStory,
}: PeleMeleStoriesViewProps) {
  const [sortMode, setSortMode] = useState<SortMode>('shuffled');
  const [shuffleSeed, setShuffleSeed] = useState<number>(() => Date.now() % 100000);
  const [formatFilter, setFormatFilter] = useState<'all' | StoryFormat>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const displayedStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = publicStories.filter((story) => {
      const fmt: StoryFormat = story.storyFormat ?? 'confession';
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;
      if (!q) return true;
      const salonLabel = (
        story.customSalonName ||
        THEME_MAP[story.theme]?.salonName ||
        ''
      ).toLowerCase();
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        story.authorName.toLowerCase().includes(q) ||
        salonLabel.includes(q)
      );
    });

    const copy = [...filtered];
    if (sortMode === 'shuffled') {
      copy.sort((a, b) => hashSeed(a.storyId, shuffleSeed) - hashSeed(b.storyId, shuffleSeed));
    } else if (sortMode === 'views') {
      copy.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    } else if (sortMode === 'resonances') {
      copy.sort((a, b) => (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0));
    } else {
      copy.sort((a, b) => {
        const aMs = (a.updatedAt || a.createdAt)?.toMillis() ?? 0;
        const bMs = (b.updatedAt || b.createdAt)?.toMillis() ?? 0;
        return bMs - aMs;
      });
    }
    return copy;
  }, [publicStories, formatFilter, searchQuery, sortMode, shuffleSeed]);

  const handleReshuffle = () => {
    setSortMode('shuffled');
    setShuffleSeed((prev) => (prev * 1664525 + 1013904223) >>> 0);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 sm:py-14 space-y-10">
      {/* Header */}
      <section className="space-y-6 pb-8 border-b border-stone-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToSalons}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Vue des salons</span>
          </button>

          <button
            type="button"
            onClick={handleReshuffle}
            className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] bg-white border border-[#1B365D]/30 rounded-md hover:border-[#1B365D] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Mélanger l’ordre pêle-mêle</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs uppercase tracking-widest text-stone-500 inline-flex items-center gap-2">
              <Compass className="w-3.5 h-3.5" />
              <span>Promenade libre · Tous salons confondus</span>
            </p>
            <h1
              className="font-display text-3xl sm:text-5xl font-medium text-stone-900 leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Histoires pêle-mêle
            </h1>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
              Naviguez librement d’une plume à l’autre sans entrer dans un salon précis. Confessions, romans à chapitres et récits issus des salons de la communauté se mêlent ici au fil de votre curiosité.
            </p>
          </div>

          <div className="lg:col-span-4 flex lg:justify-end">
            <div className="bg-white border border-stone-200 rounded-md px-5 py-3.5 flex items-center gap-6">
              <div>
                <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                  {publicStories.length}
                </p>
                <p className="text-xs text-stone-500">Récits ouverts</p>
              </div>
              <div className="h-8 w-px bg-stone-200" aria-hidden="true" />
              <div>
                <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                  {displayedStories.length}
                </p>
                <p className="text-xs text-stone-500">Affichés</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Toolbar: Sort mode, Format filter, Search */}
      <section
        aria-label="Trier et filtrer les histoires pêle-mêle"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-md">
            {(
              [
                { id: 'shuffled', label: 'Pêle-mêle' },
                { id: 'recent', label: 'Récents' },
                { id: 'views', label: 'Plus lus' },
                { id: 'resonances', label: 'Plus résonnants' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortMode(opt.id)}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  sortMode === opt.id
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Tous formats' },
                { id: 'roman', label: 'Romans' },
                { id: 'confession', label: 'Confessions' },
              ] as const
            ).map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setFormatFilter(fmt.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  formatFilter === fmt.id
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Titre, auteur ou salon…"
            aria-label="Rechercher dans les histoires pêle-mêle"
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
          />
        </div>
      </section>

      {/* Content */}
      {!storiesLoaded ? (
        <div className="py-12 text-center text-sm text-stone-500">
          Ouverture des pages de la bibliothèque…
        </div>
      ) : publicStories.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
          <p className="font-display text-2xl text-stone-900">
            Aucun récit public n’a encore été déposé
          </p>
          <p className="text-sm text-stone-600 max-w-lg mx-auto">
            Soyez le premier à ouvrir cette bibliothèque pêle-mêle en publiant une confession ou le premier chapitre d’un roman.
          </p>
          <button
            type="button"
            onClick={onWriteStory}
            className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors whitespace-nowrap"
          >
            Écrire le premier récit
          </button>
        </div>
      ) : displayedStories.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
          <p className="font-display text-xl text-stone-900">
            Aucune histoire ne correspond à votre recherche
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFormatFilter('all');
            }}
            className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedStories.map((story) => {
            const themeInfo = THEME_MAP[story.theme];
            const format: StoryFormat = story.storyFormat ?? 'confession';
            const originName = story.customSalonName || themeInfo?.salonName || 'Salon';
            const accentColor = themeInfo?.palette.textAccent ?? '#1B365D';
            const borderTop = themeInfo?.palette.swatch ?? '#1B365D';

            return (
              <article
                key={story.storyId}
                style={{ borderTopColor: borderTop }}
                className="bg-white border border-stone-200 border-t-2 rounded-lg p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <button
                      type="button"
                      onClick={() =>
                        story.customSalonId
                          ? onEnterCustomSalon(story.customSalonId)
                          : onEnterSalon(story.theme)
                      }
                      style={{ color: accentColor }}
                      className="font-medium hover:underline text-left"
                    >
                      {originName}
                    </button>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-stone-700">
                      {STORY_FORMAT_LABELS[format].label}
                      {format === 'roman' ? ` · ${story.chapterCount ?? 1} ch.` : ''}
                    </span>
                  </div>

                  <h2 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                    <button
                      type="button"
                      onClick={() => onReadStory(story)}
                      className="text-left hover:underline focus-visible:outline-none"
                    >
                      {story.title}
                    </button>
                  </h2>

                  <p className="text-sm text-stone-600 leading-relaxed line-clamp-4">
                    {story.excerpt}
                  </p>
                </div>

                <div className="space-y-4 pt-3 border-t border-stone-100">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                    <button
                      type="button"
                      onClick={() => onOpenMemberWall(story.authorId)}
                      className="font-medium text-stone-800 hover:underline"
                    >
                      Par {story.authorName}
                    </button>
                    <span className="tabular-nums">
                      {story.readingMinutes} min · {formatFrenchDate(story.createdAt?.toDate() ?? null)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 text-xs text-stone-500 tabular-nums">
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

                    <button
                      type="button"
                      onClick={() => onReadStory(story)}
                      style={{ color: accentColor }}
                      className="min-h-[36px] px-2.5 py-1 text-xs font-medium hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>Lire</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
