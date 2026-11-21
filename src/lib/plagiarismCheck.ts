import { Story } from '../types/story';

export interface PlagiarismCheckResult {
  isSuspicious: boolean;
  isModerateOverlap: boolean;
  similarityPercent: number;
  matchedStoryTitle: string | null;
  matchedAuthorId: string | null;
  matchedIsOwnStory: boolean;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function buildShingles(words: string[], size: number): Set<string> {
  const shingles = new Set<string>();
  if (words.length < size) return shingles;
  for (let i = 0; i <= words.length - size; i += 1) {
    shingles.add(words.slice(i, i + size).join(' '));
  }
  return shingles;
}

/**
 * Compares candidate novel or chapter text against existing stories on Lisière
 * using overlapping 5-word shingles to detect copied passages before publication.
 */
export function checkNovelPlagiarism(params: {
  candidateText: string;
  candidateTitle?: string;
  currentAuthorId: string;
  existingStories: Story[];
  excludeStoryId?: string | null;
}): PlagiarismCheckResult {
  const words = normalizeWords(params.candidateText);
  if (words.length < 10) {
    return {
      isSuspicious: false,
      isModerateOverlap: false,
      similarityPercent: 0,
      matchedStoryTitle: null,
      matchedAuthorId: null,
      matchedIsOwnStory: false,
    };
  }

  const shingleSize = words.length >= 20 ? 5 : 3;
  const candidateShingles = buildShingles(words, shingleSize);
  if (candidateShingles.size === 0) {
    return {
      isSuspicious: false,
      isModerateOverlap: false,
      similarityPercent: 0,
      matchedStoryTitle: null,
      matchedAuthorId: null,
      matchedIsOwnStory: false,
    };
  }

  let bestRatio = 0;
  let bestStory: Story | null = null;

  for (const story of params.existingStories) {
    if (params.excludeStoryId && story.storyId === params.excludeStoryId) {
      continue;
    }

    const refWords = normalizeWords(`${story.content} ${story.excerpt || ''}`);
    if (refWords.length < shingleSize) continue;

    const refShingles = buildShingles(refWords, shingleSize);
    let overlapCount = 0;
    for (const s of candidateShingles) {
      if (refShingles.has(s)) overlapCount += 1;
    }

    const containment = overlapCount / candidateShingles.size;
    if (containment > bestRatio) {
      bestRatio = containment;
      bestStory = story;
    }
  }

  const similarityPercent = Math.round(bestRatio * 100);
  const matchedIsOwnStory = Boolean(bestStory && bestStory.authorId === params.currentAuthorId);
  const isSuspicious = similarityPercent >= 55 && Boolean(bestStory);
  const isModerateOverlap = !isSuspicious && similarityPercent >= 30 && Boolean(bestStory);

  return {
    isSuspicious,
    isModerateOverlap,
    similarityPercent,
    matchedStoryTitle: bestStory?.title ?? null,
    matchedAuthorId: bestStory?.authorId ?? null,
    matchedIsOwnStory,
  };
}
