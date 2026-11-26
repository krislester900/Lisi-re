import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Feather,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  countActiveStoryFilters,
  parseAdvancedSearchQuery,
  StoryDurationFilter,
  StoryFilterState,
  StoryFormatFilter,
  StoryNovelGenreFilter,
  StoryOriginFilter,
  StorySearchScope,
  StorySeriesStatusFilter,
  StorySignatureFilter,
  StorySortMode,
} from '../lib/storyFilter';
import { NOVEL_GENRE_LABELS, NOVEL_GENRES, STORY_THEMES } from '../lib/themes';
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

const SEARCH_SCOPE_OPTIONS: Array<{ id: StorySearchScope; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'title', label: 'Titres' },
  { id: 'content', label: 'Texte' },
  { id: 'author', label: 'Auteurs' },
  { id: 'salon', label: 'Salons & genres' },
];

const KEYWORD_SYNTAX_HELPERS: Array<{ label: string; snippet: string; hint: string }> = [
  { label: '"phrase exacte"', snippet: '" "', hint: 'Chercher une suite de mots exacte' },
  { label: '-exclure', snippet: '-', hint: 'Exclure un mot-clé des résultats' },
  { label: 'OR', snippet: ' OR ', hint: 'Inclure l’un ou l’autre mot' },
  { label: 'titre:', snippet: 'titre:', hint: 'Cibler uniquement le titre' },
  { label: 'auteur:', snippet: 'auteur:', hint: 'Cibler le nom de l’auteur' },
  { label: 'texte:', snippet: 'texte:', hint: 'Cibler le corps du récit' },
];

export function StoryFilterBar({
  value,
  onChange,
  defaultSort = 'recent',
  allowShuffle = false,
  showOriginFilter = false,
  showThemeFilter = false,
  searchPlaceholder = 'Rechercher par mots-clés, titre, auteur…',
  ariaLabel = 'Trier et filtrer les récits',
  totalCount,
  filteredCount,
}: StoryFilterBarProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [keywordHelpExpanded, setKeywordHelpExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hasSearchQuery = value.search.trim().length > 0;
  const parsedQuery = useMemo(
    () => (hasSearchQuery ? parseAdvancedSearchQuery(value.search) : null),
    [hasSearchQuery, value.search]
  );

  const activeFiltersCount = countActiveStoryFilters(value);
  const hasAnyModification =
    activeFiltersCount > 0 ||
    hasSearchQuery ||
    (value.sortMode !== defaultSort && !(value.sortMode === 'relevance' && !hasSearchQuery));

  const sortOptions: Array<{ id: StorySortMode; label: string }> = [
    ...(hasSearchQuery ? [{ id: 'relevance' as const, label: 'Pertinence' }] : []),
    ...(allowShuffle ? [{ id: 'shuffled' as const, label: 'Pêle-mêle' }] : []),
    { id: 'recent', label: 'Plus récents' },
    { id: 'views', label: 'Plus vus' },
    { id: 'resonances', label: 'Plus aimés' },
    { id: 'echoes', label: 'Plus commentés' },
    { id: 'shortest', label: 'Plus courts' },
    { id: 'longest', label: 'Plus longs' },
  ];

  const effectiveSortValue =
    value.sortMode === 'relevance' && !hasSearchQuery ? defaultSort : value.sortMode;

  const handleSearchChange = (nextRaw: string) => {
    const trimmed = nextRaw.trim();
    const hadSearch = value.search.trim().length > 0;
    let nextSortMode = value.sortMode;
    if (!hadSearch && trimmed.length > 0 && value.sortMode === defaultSort) {
      nextSortMode = 'relevance';
    } else if (hadSearch && trimmed.length === 0 && value.sortMode === 'relevance') {
      nextSortMode = defaultSort;
    }
    onChange({ ...value, search: nextRaw, sortMode: nextSortMode });
  };

  const handleInsertSyntax = (snippet: string) => {
    const current = value.search;
    const spacer = current && !current.endsWith(' ') && snippet !== ' OR ' ? ' ' : '';
    const nextSearch = `${current}${spacer}${snippet}`;
    handleSearchChange(nextSearch);
    window.requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      if (snippet === '" "') {
        const pos = Math.max(0, nextSearch.length - 2);
        input.setSelectionRange(pos, pos);
      }
    });
  };

  const handleReset = () => {
    onChange({
      ...value,
      sortMode: defaultSort,
      format: 'all',
      novelGenre: 'all',
      seriesStatus: 'all',
      duration: 'all',
      signature: 'all',
      theme: 'all',
      origin: 'all',
      search: '',
      searchScope: 'all',
    });
  };

  return (
    <section aria-label={ariaLabel} className="space-y-2.5">
      {/* Compact Single-Row Toolbar: Search + Sort Dropdown + Filters Drawer */}
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={value.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full min-h-[40px] pl-9 pr-8 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
            {value.search.length > 0 && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            aria-expanded={keywordHelpExpanded}
            onClick={() => {
              setKeywordHelpExpanded((prev) => !prev);
              if (!keywordHelpExpanded) setFiltersExpanded(false);
            }}
            title="Options de recherche par mots-clés"
            aria-label="Options de recherche par mots-clés"
            className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              keywordHelpExpanded || value.searchScope !== 'all'
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Mots-clés</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 shrink-0">
          {/* Always-visible Category Segmented Filter: Tout / Confessions / Romans */}
          <div
            role="group"
            aria-label="Filtrer par catégorie : confessions ou romans"
            className="inline-flex items-center rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-900 p-0.5 shrink-0"
          >
            {(
              [
                { id: 'all', label: 'Tout' },
                { id: 'confession', label: 'Confessions' },
                { id: 'roman', label: 'Romans' },
              ] as Array<{ id: StoryFormatFilter; label: string }>
            ).map((cat) => {
              const active = value.format === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange({
                      ...value,
                      format: cat.id,
                      ...(cat.id === 'confession'
                        ? { novelGenre: 'all', seriesStatus: 'all' }
                        : {}),
                    })
                  }
                  className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
                    active
                      ? cat.id === 'confession'
                        ? 'bg-[#9A3B29] text-white'
                        : cat.id === 'roman'
                          ? 'bg-[#1B365D] text-white'
                          : 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950'
                      : 'text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-100'
                  }`}
                >
                  {cat.id === 'confession' && <Feather className="w-3 h-3 shrink-0" />}
                  {cat.id === 'roman' && <BookOpen className="w-3 h-3 shrink-0" />}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 absolute left-2.5 pointer-events-none" />
              <select
                aria-label="Trier les récits"
                value={effectiveSortValue}
                onChange={(e) => onChange({ ...value, sortMode: e.target.value as StorySortMode })}
                className="min-h-[40px] pl-8 pr-7 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-xs font-medium text-stone-800 dark:text-stone-200 hover:border-stone-400 focus:outline-none focus:border-[#1B365D] cursor-pointer"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              aria-expanded={filtersExpanded}
              onClick={() => {
                setFiltersExpanded((prev) => !prev);
                if (!filtersExpanded) setKeywordHelpExpanded(false);
              }}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                filtersExpanded || activeFiltersCount > 0
                  ? 'bg-[#1B365D] text-white border-[#1B365D]'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
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
                title="Réinitialiser la recherche et les filtres"
                aria-label="Réinitialiser"
                className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Réinitialiser</span>
              </button>
            )}
          </div>

          {typeof filteredCount === 'number' && typeof totalCount === 'number' && (
            <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums whitespace-nowrap pl-1">
              {filteredCount === totalCount
                ? `${totalCount} récit${totalCount > 1 ? 's' : ''}`
                : `${filteredCount}/${totalCount}`}
            </span>
          )}
        </div>
      </div>

      {/* Expandable Advanced Keyword Search Panel */}
      {(keywordHelpExpanded || (parsedQuery && (parsedQuery.hasAdvancedSyntax || value.searchScope !== 'all'))) && (
        <div className="bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400 mr-1">
              Chercher dans :
            </span>
            {SEARCH_SCOPE_OPTIONS.map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => onChange({ ...value, searchScope: scope.id })}
                className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                  value.searchScope === scope.id
                    ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                }`}
              >
                {scope.label}
              </button>
            ))}
          </div>

          {keywordHelpExpanded && (
            <div className="pt-2 border-t border-stone-200/80 dark:border-stone-800 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-stone-500 dark:text-stone-400 mr-1">Opérateurs :</span>
              {KEYWORD_SYNTAX_HELPERS.map((helper) => (
                <button
                  key={helper.label}
                  type="button"
                  title={helper.hint}
                  onClick={() => handleInsertSyntax(helper.snippet)}
                  className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:border-[#1B365D] hover:text-[#1B365D] dark:hover:text-sky-300 text-stone-700 dark:text-stone-200 transition-colors"
                >
                  {helper.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expandable Multi-Criteria Filter Panel */}
      {filtersExpanded && (
        <div className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Format */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Format</p>
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
                    onClick={() =>
                      onChange({
                        ...value,
                        format: fmt.id,
                        ...(fmt.id === 'confession'
                          ? { novelGenre: 'all', seriesStatus: 'all' }
                          : {}),
                      })
                    }
                    className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.format === fmt.id
                        ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                        : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading Duration */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Durée</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Toutes' },
                    { id: 'short', label: '≤ 3 min' },
                    { id: 'medium', label: '4–8 min' },
                    { id: 'long', label: '9+ min' },
                  ] as Array<{ id: StoryDurationFilter; label: string }>
                ).map((dur) => (
                  <button
                    key={dur.id}
                    type="button"
                    onClick={() => onChange({ ...value, duration: dur.id })}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.duration === dur.id
                        ? 'bg-[#1B365D] text-white border-[#1B365D]'
                        : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                    }`}
                  >
                    {dur.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Signature / Anonymity */}
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Signature</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Tous' },
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
                        ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                        : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                    }`}
                  >
                    {sig.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Genre & Status for Novels */}
          {value.format !== 'confession' && (
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 space-y-1.5">
                <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  Type de roman
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, novelGenre: 'all' })}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                      value.novelGenre === 'all'
                        ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                        : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                    }`}
                  >
                    Tous genres
                  </button>
                  {NOVEL_GENRES.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          novelGenre: genre as StoryNovelGenreFilter,
                          format: 'roman',
                        })
                      }
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        value.novelGenre === genre
                          ? 'bg-[#1B365D] text-white border-[#1B365D]'
                          : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                      }`}
                    >
                      {NOVEL_GENRE_LABELS[genre]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-1.5">
                <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Statut</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Tous' },
                      { id: 'en-cours', label: 'En cours' },
                      { id: 'termine', label: 'Terminés' },
                    ] as Array<{ id: StorySeriesStatusFilter; label: string }>
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          seriesStatus: st.id,
                          format: st.id !== 'all' ? 'roman' : value.format,
                        })
                      }
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        value.seriesStatus === st.id
                          ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                          : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(showOriginFilter || showThemeFilter) && (
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 grid grid-cols-1 md:grid-cols-2 gap-4">
              {showOriginFilter && (
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Origine</p>
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
                            : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
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
                  <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">Salon</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, theme: 'all' })}
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                        value.theme === 'all'
                          ? 'bg-stone-900 dark:bg-amber-400 text-white dark:text-stone-950 border-stone-900 dark:border-amber-400'
                          : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                      }`}
                    >
                      Tous
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
                            : 'bg-[#FBF9F5] dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
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
