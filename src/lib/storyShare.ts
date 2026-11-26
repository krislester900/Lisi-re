import { Story } from '../types/story';

export function buildStoryShareUrl(storyId: string): string {
  const path = `/histoires/${encodeURIComponent(storyId)}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function buildStoryShareSummary(story: Pick<Story, 'title' | 'storyFormat' | 'isAnonymous' | 'authorName'>): string {
  const formatShareNoun = story.storyFormat === 'roman' ? 'un roman' : 'une confession';
  return story.isAnonymous
    ? `« ${story.title} » — ${formatShareNoun} anonyme sur Lisière`
    : `« ${story.title} » — ${formatShareNoun} de ${story.authorName} sur Lisière`;
}

const STORY_URL_REGEX = /(?:https?:\/\/[^\s]+)?\/histoires\/([a-zA-Z0-9_-]+)/i;

export function extractSharedStoryIdFromText(text: string): string | null {
  if (!text) return null;
  const match = text.match(STORY_URL_REGEX);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function stripSharedStoryUrlFromText(text: string): string {
  if (!text) return '';
  return text
    .replace(/https?:\/\/[^\s]*\/histoires\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/\/histoires\/[a-zA-Z0-9_-]+/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
