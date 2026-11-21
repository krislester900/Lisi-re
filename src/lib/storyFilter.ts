import { THEME_MAP } from './themes';
import { Story, StoryFormat, StoryThemeId } from '../types/story';

export type StorySortMode =
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

export interface StoryFilterState {
  sortMode: StorySortMode;
  format: StoryFormatFilter;
  duration: StoryDurationFilter;
  signature: StorySignatureFilter;
  theme: 'all' | StoryThemeId;
  origin: StoryOriginFilter;
  search: string;
  shuffleSeed: number;
}

export function createDefaultStoryFilterState(
  initialSort: StorySortMode = 'recent',
  shuffleSeed = 1337
): StoryFilterState {
  return {
    sortMode: initialSort,
    format: 'all',
    duration: 'all',
    signature: 'all',
    theme: 'all',
    origin: 'all',
    search: '',
    shuffleSeed,
  };
}

export function countActiveStoryFilters(state: StoryFilterState): number {
  let count = 0;
  if (state.format !== 'all') count += 1;
  if (state.duration !== 'all') count += 1;
  if (state.signature !== 'all') count += 1;
  if (state.theme !== 'all') count += 1;
  if (state.origin !== 'all') count += 1;
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

export function sortStories(
  stories: Story[],
  sortMode: StorySortMode,
  shuffleSeed = 1337
): Story[] {
  const copy = [...stories];
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
  const q = state.search.trim().toLowerCase();

  const filtered = stories.filter((story) => {
    const fmt: StoryFormat = story.storyFormat ?? 'confession';
    if (state.format !== 'all' && fmt !== state.format) return false;

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

    if (!q) return true;
    const isHorsSalon = story.storyScope === 'pelemele' && !story.customSalonId;
    const salonLabel = (
      story.customSalonName ||
      (isHorsSalon ? 'Hors salon Pêle-mêle' : THEME_MAP[story.theme]?.salonName || '')
    ).toLowerCase();

    return (
      story.title.toLowerCase().includes(q) ||
      story.excerpt.toLowerCase().includes(q) ||
      (!story.isAnonymous && story.authorName.toLowerCase().includes(q)) ||
      salonLabel.includes(q)
    );
  });

  return sortStories(filtered, state.sortMode, state.shuffleSeed);
}
