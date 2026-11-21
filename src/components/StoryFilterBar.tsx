import React, { useState } from 'react';
import {
  Clock,
  Eye,
  Heart,
  MessageCircle,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import {
  countActiveStoryFilters,
  StoryDurationFilter,
  StoryFilterState,
  StoryFormatFilter,
  StoryOriginFilter,
  StorySignatureFilter,
  StorySortMode,
} from '../lib/storyFilter';
import { STORY_THEMES } from '../lib/themes';
import { StoryThemeId } from '../types/story';

interface StoryFilterBarProps {
  value: StoryFilterState;
  onChange: (next: StoryFilterState) => void;
  defaultSort?: StorySortMode;
  allowShuffle?: boolean;
  showOriginFilter?: boolean;
  showThemeFilter?: boolean;
  searchPlaceholder?: string;
  ariaLabel?: string;
  totalCount?: number;
  filteredCount?: number;
}

export function StoryFilterBar({
  value,
  onChange,
  defaultSort = 'recent',
  allowShuffle = false,
  showOriginFilter = false,
  showThemeFilter = false,
  searchPlaceholder = 'Titre, auteur ou salon…',
  ariaLabel = 'Trier et filtrer les récits',
  totalCount,
  filteredCount,
}: StoryFilterBarProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const activeFiltersCount = countActiveStoryFilters(value);
  const hasAnyModification =
    activeFiltersCount > 0 || value.search.trim().length > 0 || value.sortMode !== defaultSort;

  const sortOptions: Array<{
    id: StorySortMode;
    label: string;
    icon: typeof Eye;
  }> = [
    ...(allowShuffle ? [{ id: 'shuffled' as const, label: 'Pêle-mêle', icon: Shuffle }] : []),
    { id: 'recent', label: 'Plus récents', icon: Clock },
    { id: 'views', label: 'Plus vus', icon: Eye },
    { id: 'resonances', label: 'Plus aimés', icon: Heart },
    { id: 'echoes', label: 'Plus commentés', icon: MessageCircle },
  ];

  const handleReset = () => {
    onChange({
      ...value,
      sortMode: defaultSort,
      format: 'all',
      duration: 'all',
      signature: 'all',
      theme: 'all',
      origin: 'all',
      search: '',
    });
  };

  return (
    <section aria-label={ariaLabel} className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Sort Controls + Filters Drawer Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Critère de tri"
            className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-md"
          >
            {sortOptions.map((opt) => {
              const Icon = opt.icon;
              const active = value.sortMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, sortMode: opt.id })}
                  className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((prev) => !prev)}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              filtersExpanded || activeFiltersCount > 0 || value.sortMode === 'shortest' || value.sortMode === 'longest'
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Filtres</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-white/20 text-[11px] leading-none tabular-nums">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {hasAnyModification && (
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>

        {/* Search Input + Live Count */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {typeof filteredCount === 'number' && typeof totalCount === 'number' && (
            <span className="text-xs text-stone-500 tabular-nums whitespace-nowrap">
              {filteredCount === totalCount
                ? `${totalCount} récit${totalCount > 1 ? 's' : ''}`
                : `${filteredCount} / ${totalCount} récit${totalCount > 1 ? 's' : ''}`}
            </span>
          )}
          <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={value.search}
              onChange={(e) => onChange({ ...value, search: e.target.value })}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
            />
          </div>
        </div>
      </div>

      {/* Expandable Multi-Criteria Filter Panel */}
      {filtersExpanded && (
        <div className="bg-white border border-stone-200 rounded-lg p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Format */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500">Format</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 'confession', label: 'Confessions' },
                    { id: 'roman', label: 'Romans' },
                  ] as Array<{ id: StoryFormatFilter; label: string }>
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => onChange({ ...value, format: fmt.id })}
                    className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.format === fmt.id
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading Duration */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500">
                Temps de lecture
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Toutes' },
                    { id: 'short', label: 'Courte (≤ 3 min)' },
                    { id: 'medium', label: '4–8 min' },
                    { id: 'long', label: 'Longue (9+ min)' },
                  ] as Array<{ id: StoryDurationFilter; label: string }>
                ).map((dur) => (
                  <button
                    key={dur.id}
                    type="button"
                    onClick={() => onChange({ ...value, duration: dur.id })}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.duration === dur.id
                        ? 'bg-[#1B365D] text-white border-[#1B365D]'
                        : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {dur.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Signature / Anonymity + Duration Sort */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500">
                Publication &amp; ordre de durée
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Tout auteur' },
                    { id: 'named', label: 'Signés' },
                    { id: 'anonymous', label: 'Anonymes' },
                  ] as Array<{ id: StorySignatureFilter; label: string }>
                ).map((sig) => (
                  <button
                    key={sig.id}
                    type="button"
                    onClick={() => onChange({ ...value, signature: sig.id })}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.signature === sig.id
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {sig.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      sortMode: value.sortMode === 'shortest' ? defaultSort : 'shortest',
                    })
                  }
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                    value.sortMode === 'shortest'
                      ? 'bg-[#1B365D] text-white border-[#1B365D]'
                      : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  Plus courts d’abord
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      sortMode: value.sortMode === 'longest' ? defaultSort : 'longest',
                    })
                  }
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                    value.sortMode === 'longest'
                      ? 'bg-[#1B365D] text-white border-[#1B365D]'
                      : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  Plus longs d’abord
                </button>
              </div>
            </div>
          </div>

          {(showOriginFilter || showThemeFilter) && (
            <div className="pt-3 border-t border-stone-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              {showOriginFilter && (
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-stone-500">Origine</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Tout' },
                        { id: 'hors-salon', label: 'Hors salons' },
                        { id: 'salons-publics', label: 'Salons publics' },
                      ] as Array<{ id: StoryOriginFilter; label: string }>
                    ).map((orig) => (
                      <button
                        key={orig.id}
                        type="button"
                        onClick={() => onChange({ ...value, origin: orig.id })}
                        className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                          value.origin === orig.id
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {orig.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showThemeFilter && (
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-stone-500">
                    Thème littéraire
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, theme: 'all' })}
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        value.theme === 'all'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Tous les thèmes
                    </button>
                    {STORY_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onChange({ ...value, theme: t.id as StoryThemeId })}
                        style={
                          value.theme === t.id
                            ? {
                                backgroundColor: t.palette.accent,
                                borderColor: t.palette.accent,
                                color: '#FFFFFF',
                              }
                            : undefined
                        }
                        className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                          value.theme === t.id
                            ? ''
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {t.shortSalonName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
