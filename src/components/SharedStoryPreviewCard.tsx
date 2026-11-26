import React from 'react';
import { ArrowRight, BookOpen, Feather } from 'lucide-react';
import { isStoryCompliantForPublicFeed } from '../lib/contentRegulation';
import { extractSharedStoryIdFromText } from '../lib/storyShare';
import { Story } from '../types/story';

interface SharedStoryPreviewCardProps {
  content: string;
  stories: Story[];
  onReadStory?: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  isMineBubble?: boolean;
}

export function SharedStoryPreviewCard({
  content,
  stories,
  onReadStory,
  onOpenStoryById,
  isMineBubble = false,
}: SharedStoryPreviewCardProps) {
  const storyId = extractSharedStoryIdFromText(content);
  if (!storyId) return null;

  const matchedStory = stories.find((s) => s.storyId === storyId) ?? null;
  const canPreviewDetails = Boolean(
    matchedStory &&
      matchedStory.visibility === 'public' &&
      matchedStory.customSalonVisibility !== 'private' &&
      isStoryCompliantForPublicFeed(matchedStory)
  );

  const handleOpen = () => {
    if (matchedStory && onReadStory) {
      onReadStory(matchedStory);
    } else if (onOpenStoryById) {
      onOpenStoryById(storyId);
    }
  };

  if (!onReadStory && !onOpenStoryById) return null;

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={`mt-2 w-full text-left rounded-md border p-3 transition-colors block group ${
        isMineBubble
          ? 'bg-white/12 border-white/25 hover:bg-white/20 text-white'
          : 'bg-[#FBF9F5] dark:bg-stone-900 border-stone-200 dark:border-stone-700 hover:border-[#1B365D] dark:hover:border-amber-400/60 text-stone-900 dark:text-stone-100'
      }`}
    >
      {canPreviewDetails && matchedStory ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isMineBubble
                  ? 'text-amber-200'
                  : matchedStory.storyFormat === 'roman'
                    ? 'text-[#1B365D] dark:text-sky-300'
                    : 'text-[#9A3B29] dark:text-amber-300'
              }`}
            >
              {matchedStory.storyFormat === 'roman' ? (
                <BookOpen className="w-3 h-3 shrink-0" />
              ) : (
                <Feather className="w-3 h-3 shrink-0" />
              )}
              <span>{matchedStory.storyFormat === 'roman' ? 'Roman' : 'Confession'}</span>
            </span>
            <span className={isMineBubble ? 'text-white/75' : 'text-stone-500 dark:text-stone-400'}>
              {matchedStory.readingMinutes} min
            </span>
          </div>

          <p className="font-display text-sm sm:text-base font-medium leading-snug line-clamp-2">
            {matchedStory.title}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
            <span
              className={`truncate ${
                isMineBubble ? 'text-white/80' : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {matchedStory.isAnonymous ? 'Auteur anonyme' : `Par ${matchedStory.authorName}`}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-medium shrink-0 group-hover:underline ${
                isMineBubble ? 'text-white' : 'text-[#1B365D] dark:text-sky-300'
              }`}
            >
              <span>Lire</span>
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[11px] uppercase tracking-wider font-medium ${
                isMineBubble ? 'text-white/75' : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              Récit Lisière partagé
            </p>
            <p className="font-display text-sm font-medium truncate">
              Ouvrir l’histoire dans l’application
            </p>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0 opacity-85" />
        </div>
      )}
    </button>
  );
}
