import { Story } from '../types/story';

export interface SocialShareTarget {
  id:
    | 'linkedin'
    | 'whatsapp'
    | 'x'
    | 'facebook'
    | 'telegram'
    | 'threads'
    | 'bluesky'
    | 'reddit'
    | 'email';
  label: string;
  href: string;
  isExternal: boolean;
}

export function buildStoryShareUrl(storyId: string): string {
  const path = `/histoires/${encodeURIComponent(storyId)}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function buildStoryShareSummary(
  story: Pick<Story, 'title' | 'storyFormat' | 'isAnonymous' | 'authorName'>
): string {
  const formatShareNoun = story.storyFormat === 'roman' ? 'un roman' : 'une confession';
  return story.isAnonymous
    ? `« ${story.title} » — ${formatShareNoun} anonyme sur Lisière`
    : `« ${story.title} » — ${formatShareNoun} de ${story.authorName} sur Lisière`;
}

export function buildLinkedInShareUrl(url: string, summary?: string): string {
  const encodedUrl = encodeURIComponent(url);
  if (summary) {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&summary=${encodeURIComponent(summary)}`;
  }
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
}

export function buildSocialShareTargets(params: {
  url: string;
  title: string;
  summary: string;
}): SocialShareTarget[] {
  const { url, title, summary } = params;
  const fullText = `${summary}\n${url}`;

  return [
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: buildLinkedInShareUrl(url, summary),
      isExternal: true,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${summary} ${url}`)}`,
      isExternal: true,
    },
    {
      id: 'x',
      label: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(summary)}&url=${encodeURIComponent(url)}`,
      isExternal: true,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(summary)}`,
      isExternal: true,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(summary)}`,
      isExternal: true,
    },
    {
      id: 'threads',
      label: 'Threads',
      href: `https://www.threads.net/intent/post?text=${encodeURIComponent(fullText)}`,
      isExternal: true,
    },
    {
      id: 'bluesky',
      label: 'Bluesky',
      href: `https://bsky.app/intent/compose?text=${encodeURIComponent(fullText)}`,
      isExternal: true,
    },
    {
      id: 'reddit',
      label: 'Reddit',
      href: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
      isExternal: true,
    },
    {
      id: 'email',
      label: 'E-mail',
      href: `mailto:?subject=${encodeURIComponent(summary)}&body=${encodeURIComponent(`${summary}\n\nLire ce récit sur Lisière :\n${url}`)}`,
      isExternal: false,
    },
  ];
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
