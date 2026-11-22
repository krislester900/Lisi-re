import { NOVEL_GENRE_LABELS, THEME_MAP } from './themes';
import { NovelGenre, Story, StoryFormat, StoryThemeId } from '../types/story';

export type StorySortMode =
  | 'relevance'
  | 'recent'
  | 'views'
  | 'resonances'
  | 'echoes'
  | 'shortest'
  | 'longest'
  | 'shuffled';

export type StoryFormatFilter = 'all' | StoryFormat;
export type StoryDurationFilter = 'all' | 'short' | 'medium' | 'long';
export type StorySignatureFilter = 'all' | 'named' | 'anonymous';
export type StoryOriginFilter = 'all' | 'hors-salon' | 'salons-publics';
export type StoryNovelGenreFilter = 'all' | NovelGenre;
export type StorySeriesStatusFilter = 'all' | 'en-cours' | 'termine';
export type StorySearchScope = 'all' | 'title' | 'content' | 'author' | 'salon';

export interface StoryFilterState {
  sortMode: StorySortMode;
  format: StoryFormatFilter;
  novelGenre: StoryNovelGenreFilter;
  seriesStatus: StorySeriesStatusFilter;
  duration: StoryDurationFilter;
  signature: StorySignatureFilter;
  theme: 'all' | StoryThemeId;
  origin: StoryOriginFilter;
  search: string;
  searchScope: StorySearchScope;
  shuffleSeed: number;
}

export function createDefaultStoryFilterState(
  initialSort: StorySortMode = 'recent',
  shuffleSeed = 1337
): StoryFilterState {
  return {
    sortMode: initialSort,
    format: 'all',
    novelGenre: 'all',
    seriesStatus: 'all',
    duration: 'all',
    signature: 'all',
    theme: 'all',
    origin: 'all',
    search: '',
    searchScope: 'all',
    shuffleSeed,
  };
}

export function countActiveStoryFilters(state: StoryFilterState): number {
  let count = 0;
  if (state.format !== 'all') count += 1;
  if (state.novelGenre !== 'all') count += 1;
  if (state.seriesStatus !== 'all') count += 1;
  if (state.duration !== 'all') count += 1;
  if (state.signature !== 'all') count += 1;
  if (state.theme !== 'all') count += 1;
  if (state.origin !== 'all') count += 1;
  if (state.searchScope !== 'all') count += 1;
  return count;
}

function getStoryTimestampMs(story: Story): number {
  return (story.updatedAt || story.createdAt)?.toMillis() ?? 0;
}

function hashSeed(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

export function normalizeSearchText(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`\-_/.,;:!?()[\]{}«»"“”\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeNormalized(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

interface IndexedStoryDoc {
  fingerprint: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  salon: string;
  genre: string;
  prompt: string;
  combined: string;
  titleTokens: string[];
  excerptTokens: string[];
  contentTokens: string[];
  authorTokens: string[];
  salonTokens: string[];
  genreTokens: string[];
  allTokens: string[];
  allTokenSet: Set<string>;
}

const STORY_INDEX_CACHE = new WeakMap<Story, IndexedStoryDoc>();

function buildFingerprint(story: Story): string {
  return [
    story.title,
    story.excerpt.length,
    story.content.length,
    story.authorName,
    story.isAnonymous ? '1' : '0',
    story.theme,
    story.customSalonName || '',
    story.storyScope || '',
    story.storyFormat || '',
    story.novelGenre || '',
    story.seriesStatus || '',
    story.updatedAt?.toMillis() ?? 0,
  ].join('|');
}

function getIndexedStory(story: Story): IndexedStoryDoc {
  const fingerprint = buildFingerprint(story);
  const cached = STORY_INDEX_CACHE.get(story);
  if (cached && cached.fingerprint === fingerprint) {
    return cached;
  }

  const fmt: StoryFormat = story.storyFormat ?? 'confession';
  const isHorsSalon = story.storyScope === 'pelemele' && !story.customSalonId;
  const salonRaw =
    story.customSalonName ||
    (isHorsSalon ? 'Hors salon Pêle-mêle' : THEME_MAP[story.theme]?.salonName || '');
  const genreRaw = [
    fmt === 'roman' ? 'roman' : 'confession',
    fmt === 'roman' && story.novelGenre ? NOVEL_GENRE_LABELS[story.novelGenre] || story.novelGenre : '',
    fmt === 'roman' ? (story.seriesStatus === 'termine' ? 'termine' : 'en cours') : '',
  ]
    .filter(Boolean)
    .join(' ');

  const title = normalizeSearchText(story.title);
  const excerpt = normalizeSearchText(story.excerpt);
  const content = normalizeSearchText(story.content);
  const author = normalizeSearchText(story.isAnonymous ? 'anonyme' : story.authorName);
  const salon = normalizeSearchText(salonRaw);
  const genre = normalizeSearchText(genreRaw);
  const prompt = normalizeSearchText(story.promptQuestion || '');
  const combined = [title, excerpt, author, salon, genre, prompt, content]
    .filter(Boolean)
    .join(' ');

  const titleTokens = tokenizeNormalized(title);
  const excerptTokens = tokenizeNormalized(excerpt);
  const contentTokens = tokenizeNormalized(content);
  const authorTokens = tokenizeNormalized(author);
  const salonTokens = tokenizeNormalized(salon);
  const genreTokens = tokenizeNormalized(genre);
  const allTokens = tokenizeNormalized(combined);

  const indexed: IndexedStoryDoc = {
    fingerprint,
    title,
    excerpt,
    content,
    author,
    salon,
    genre,
    prompt,
    combined,
    titleTokens,
    excerptTokens,
    contentTokens,
    authorTokens,
    salonTokens,
    genreTokens,
    allTokens,
    allTokenSet: new Set(allTokens),
  };

  STORY_INDEX_CACHE.set(story, indexed);
  return indexed;
}

type ClauseField = 'any' | 'title' | 'content' | 'author' | 'salon' | 'genre';

interface SearchClause {
  field: ClauseField;
  alternatives: Array<{ value: string; exact: boolean }>;
  negated: boolean;
}

export interface ParsedSearchQuery {
  clauses: SearchClause[];
  positiveLabels: string[];
  excludedLabels: string[];
  fieldLabels: string[];
  hasAdvancedSyntax: boolean;
}

const FIELD_PREFIX_MAP: Record<string, ClauseField> = {
  titre: 'title',
  title: 'title',
  auteur: 'author',
  author: 'author',
  texte: 'content',
  contenu: 'content',
  corps: 'content',
  salon: 'salon',
  theme: 'salon',
  genre: 'genre',
};

const QUERY_PARSE_CACHE = new Map<string, ParsedSearchQuery>();

export function parseAdvancedSearchQuery(rawQuery: string): ParsedSearchQuery {
  const key = rawQuery.trim();
  const cached = QUERY_PARSE_CACHE.get(key);
  if (cached) return cached;

  const rawTokens: Array<{
    negated: boolean;
    field: ClauseField;
    value: string;
    exact: boolean;
    isOrOp: boolean;
  }> = [];

  // Tokenize supporting optional field: prefix, leading -, and "..." exact phrases
  const tokenRegex = /(-)?(?:(titre|title|auteur|author|texte|contenu|corps|salon|theme|genre):)?(?:"([^"]+)"|([^\s]+))/gi;
  let match: RegExpExecArray | null;
  let hasAdvancedSyntax = false;

  while ((match = tokenRegex.exec(key)) !== null) {
    const negated = Boolean(match[1]);
    const rawPrefix = match[2]?.toLowerCase() || '';
    const field: ClauseField = rawPrefix ? FIELD_PREFIX_MAP[rawPrefix] || 'any' : 'any';
    const quoted = match[3];
    const bare = match[4];

    if (negated || rawPrefix || quoted !== undefined) {
      hasAdvancedSyntax = true;
    }

    if (bare && (bare.toUpperCase() === 'OR' || bare === '|')) {
      hasAdvancedSyntax = true;
      rawTokens.push({ negated: false, field: 'any', value: 'OR', exact: false, isOrOp: true });
      continue;
    }

    const normalized = normalizeSearchText(quoted ?? bare ?? '');
    if (!normalized) continue;

    rawTokens.push({
      negated,
      field,
      value: normalized,
      exact: quoted !== undefined,
      isOrOp: false,
    });
  }

  const clauses: SearchClause[] = [];
  const positiveLabels: string[] = [];
  const excludedLabels: string[] = [];
  const fieldLabelsSet = new Set<string>();

  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i];
    if (tok.isOrOp) continue;

    if (tok.field !== 'any') {
      fieldLabelsSet.add(tok.field);
    }

    if (tok.negated) {
      excludedLabels.push(tok.exact ? `"${tok.value}"` : tok.value);
      clauses.push({
        field: tok.field,
        alternatives: [{ value: tok.value, exact: tok.exact }],
        negated: true,
      });
      continue;
    }

    // Group chained OR tokens: A OR B OR C
    const alternatives: Array<{ value: string; exact: boolean }> = [
      { value: tok.value, exact: tok.exact },
    ];
    while (
      i + 2 < rawTokens.length &&
      rawTokens[i + 1].isOrOp &&
      !rawTokens[i + 2].isOrOp &&
      !rawTokens[i + 2].negated
    ) {
      const nextTok = rawTokens[i + 2];
      alternatives.push({ value: nextTok.value, exact: nextTok.exact });
      i += 2;
    }

    positiveLabels.push(
      alternatives.map((alt) => (alt.exact ? `"${alt.value}"` : alt.value)).join(' ou ')
    );
    clauses.push({
      field: tok.field,
      alternatives,
      negated: false,
    });
  }

  const parsed: ParsedSearchQuery = {
    clauses,
    positiveLabels,
    excludedLabels,
    fieldLabels: Array.from(fieldLabelsSet),
    hasAdvancedSyntax,
  };

  if (QUERY_PARSE_CACHE.size > 120) {
    QUERY_PARSE_CACHE.clear();
  }
  QUERY_PARSE_CACHE.set(key, parsed);
  return parsed;
}

function isWithinEditDistanceOne(a: string, b: string): boolean {
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (a.length > b.length) i += 1;
      else if (b.length > a.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function scoreTermInField(
  haystack: string,
  tokens: string[],
  term: string,
  exact: boolean,
  baseWeight: number
): number {
  if (!haystack || !term) return 0;

  if (exact || term.includes(' ')) {
    const idx = haystack.indexOf(term);
    if (idx === -1) return 0;
    // Word-boundary boost
    const atStart = idx === 0 || haystack[idx - 1] === ' ';
    return baseWeight * (atStart ? 1.5 : 1.15);
  }

  // Exact token or prefix match (fast path)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === term) return baseWeight * 1.4;
    if (token.startsWith(term)) return baseWeight * 1.15;
  }

  if (haystack.includes(term)) {
    return baseWeight * 0.9;
  }

  // Bounded typo tolerance for >= 4 char words
  if (term.length >= 4 && tokens.length <= 280) {
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.length >= 3 && Math.abs(token.length - term.length) <= 1) {
        if (isWithinEditDistanceOne(token, term)) {
          return baseWeight * 0.65;
        }
      }
    }
  }

  return 0;
}

function scoreTermAgainstDoc(
  doc: IndexedStoryDoc,
  term: string,
  exact: boolean,
  effectiveField: ClauseField
): number {
  if (effectiveField === 'title') {
    return scoreTermInField(doc.title, doc.titleTokens, term, exact, 14);
  }
  if (effectiveField === 'author') {
    return scoreTermInField(doc.author, doc.authorTokens, term, exact, 10);
  }
  if (effectiveField === 'salon') {
    return (
      scoreTermInField(doc.salon, doc.salonTokens, term, exact, 9) ||
      scoreTermInField(doc.genre, doc.genreTokens, term, exact, 7)
    );
  }
  if (effectiveField === 'genre') {
    return scoreTermInField(doc.genre, doc.genreTokens, term, exact, 9);
  }
  if (effectiveField === 'content') {
    return (
      scoreTermInField(doc.excerpt, doc.excerptTokens, term, exact, 8) +
      scoreTermInField(doc.content, doc.contentTokens, term, exact, 5)
    );
  }

  // Fast global check before granular scoring
  if (
    !exact &&
    !term.includes(' ') &&
    term.length < 4 &&
    !doc.combined.includes(term)
  ) {
    return 0;
  }

  let total = 0;
  total += scoreTermInField(doc.title, doc.titleTokens, term, exact, 14);
  total += scoreTermInField(doc.excerpt, doc.excerptTokens, term, exact, 8);
  total += scoreTermInField(doc.author, doc.authorTokens, term, exact, 6);
  total += scoreTermInField(doc.salon, doc.salonTokens, term, exact, 5);
  total += scoreTermInField(doc.genre, doc.genreTokens, term, exact, 4);
  total += scoreTermInField(doc.content, doc.contentTokens, term, exact, 4);
  return total;
}

function mapScopeToField(scope: StorySearchScope): ClauseField {
  if (scope === 'title') return 'title';
  if (scope === 'content') return 'content';
  if (scope === 'author') return 'author';
  if (scope === 'salon') return 'salon';
  return 'any';
}

export function evaluateStorySearch(
  story: Story,
  rawQuery: string,
  searchScope: StorySearchScope = 'all'
): { matched: boolean; score: number } {
  const parsed = parseAdvancedSearchQuery(rawQuery);
  if (parsed.clauses.length === 0) {
    return { matched: true, score: 0 };
  }

  const doc = getIndexedStory(story);
  const fallbackField = mapScopeToField(searchScope);
  let totalScore = 0;

  for (const clause of parsed.clauses) {
    const targetField = clause.field !== 'any' ? clause.field : fallbackField;

    if (clause.negated) {
      const alt = clause.alternatives[0];
      const hitScore = scoreTermAgainstDoc(doc, alt.value, alt.exact, targetField);
      if (hitScore > 0) {
        return { matched: false, score: 0 };
      }
      continue;
    }

    let bestAltScore = 0;
    for (const alt of clause.alternatives) {
      const altScore = scoreTermAgainstDoc(doc, alt.value, alt.exact, targetField);
      if (altScore > bestAltScore) {
        bestAltScore = altScore;
      }
    }

    if (bestAltScore <= 0) {
      return { matched: false, score: 0 };
    }
    totalScore += bestAltScore;
  }

  return { matched: true, score: totalScore };
}

export function extractKeywordSnippet(story: Story, rawQuery: string, maxLength = 155): string | null {
  const parsed = parseAdvancedSearchQuery(rawQuery);
  const terms = parsed.clauses
    .filter((c) => !c.negated)
    .flatMap((c) => c.alternatives.map((a) => a.value));
  if (terms.length === 0 || !story.content) return null;

  const rawLower = story.content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const term of terms) {
    const firstWord = term.split(' ')[0];
    if (!firstWord) continue;
    const idx = rawLower.indexOf(firstWord);
    if (idx !== -1) {
      const start = Math.max(0, idx - 45);
      const end = Math.min(story.content.length, start + maxLength);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < story.content.length ? '…' : '';
      return `${prefix}${story.content.slice(start, end).trim()}${suffix}`;
    }
  }
  return null;
}

export function sortStories(
  stories: Story[],
  sortMode: StorySortMode,
  shuffleSeed = 1337,
  relevanceScores?: WeakMap<Story, number>
): Story[] {
  const copy = [...stories];
  if (sortMode === 'relevance' && relevanceScores) {
    copy.sort(
      (a, b) =>
        (relevanceScores.get(b) ?? 0) - (relevanceScores.get(a) ?? 0) ||
        (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
        (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  if (sortMode === 'shuffled') {
    copy.sort((a, b) => hashSeed(a.storyId, shuffleSeed) - hashSeed(b.storyId, shuffleSeed));
    return copy;
  }
  if (sortMode === 'views') {
    copy.sort(
      (a, b) =>
        (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
        (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  if (sortMode === 'resonances') {
    copy.sort(
      (a, b) =>
        (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0) ||
        (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  if (sortMode === 'echoes') {
    copy.sort(
      (a, b) =>
        (b.echoCount ?? 0) - (a.echoCount ?? 0) ||
        (b.viewCount ?? 0) - (a.viewCount ?? 0) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  if (sortMode === 'shortest') {
    copy.sort(
      (a, b) =>
        (a.readingMinutes ?? 1) - (b.readingMinutes ?? 1) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  if (sortMode === 'longest') {
    copy.sort(
      (a, b) =>
        (b.readingMinutes ?? 1) - (a.readingMinutes ?? 1) ||
        getStoryTimestampMs(b) - getStoryTimestampMs(a)
    );
    return copy;
  }
  copy.sort((a, b) => getStoryTimestampMs(b) - getStoryTimestampMs(a));
  return copy;
}

export function filterAndSortStories(stories: Story[], state: StoryFilterState): Story[] {
  const hasSearch = state.search.trim().length > 0;
  const relevanceScores = hasSearch ? new WeakMap<Story, number>() : undefined;

  const filtered = stories.filter((story) => {
    const fmt: StoryFormat = story.storyFormat ?? 'confession';
    if (state.format !== 'all' && fmt !== state.format) return false;

    if (state.novelGenre !== 'all') {
      if (fmt !== 'roman') return false;
      if ((story.novelGenre ?? 'contemporain') !== state.novelGenre) return false;
    }

    if (state.seriesStatus !== 'all') {
      if (fmt !== 'roman') return false;
      const effectiveStatus = story.seriesStatus === 'termine' ? 'termine' : 'en-cours';
      if (effectiveStatus !== state.seriesStatus) return false;
    }

    const mins = story.readingMinutes ?? 1;
    if (state.duration === 'short' && mins > 3) return false;
    if (state.duration === 'medium' && (mins < 4 || mins > 8)) return false;
    if (state.duration === 'long' && mins < 9) return false;

    if (state.signature === 'anonymous' && !story.isAnonymous) return false;
    if (state.signature === 'named' && story.isAnonymous) return false;

    if (state.theme !== 'all' && story.theme !== state.theme) return false;

    if (state.origin !== 'all') {
      const isHorsSalon = story.storyScope === 'pelemele' && !story.customSalonId;
      if (state.origin === 'hors-salon' && !isHorsSalon) return false;
      if (state.origin === 'salons-publics' && isHorsSalon) return false;
    }

    if (!hasSearch) return true;

    const searchResult = evaluateStorySearch(story, state.search, state.searchScope);
    if (!searchResult.matched) return false;
    relevanceScores?.set(story, searchResult.score);
    return true;
  });

  const effectiveSort =
    state.sortMode === 'relevance' && !hasSearch ? 'recent' : state.sortMode;

  return sortStories(filtered, effectiveSort, state.shuffleSeed, relevanceScores);
}
