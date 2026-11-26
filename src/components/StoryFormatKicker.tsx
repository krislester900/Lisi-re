import React from 'react';
import { BookOpen, Feather } from 'lucide-react';
import {
  NOVEL_GENRE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
} from '../lib/themes';
import { Story } from '../types/story';

interface StoryFormatKickerProps {
  story: Pick<Story, 'storyFormat' | 'novelGenre' | 'chapterCount' | 'seriesStatus'>;
  showDetails?: boolean;
  uppercase?: boolean;
  className?: string;
}

export function StoryFormatKicker({
  story,
  showDetails = true,
  uppercase = false,
  className = '',
}: StoryFormatKickerProps) {
  const format = story.storyFormat === 'roman' ? 'roman' : 'confession';
  const isRoman = format === 'roman';
  const label = STORY_FORMAT_LABELS[format].label;

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
        uppercase ? 'uppercase tracking-wider text-[11px]' : 'text-xs'
      } ${className}`}
    >
      <span
        className={`inline-flex items-center gap-1 font-semibold ${
          isRoman ? 'text-[#1B365D] dark:text-sky-300' : 'text-[#9A3B29] dark:text-amber-300'
        }`}
      >
        {isRoman ? (
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Feather className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{label}</span>
      </span>

      {showDetails && isRoman && story.novelGenre && (
        <>
          <span aria-hidden="true" className="text-stone-400 dark:text-stone-500">
            ·
          </span>
          <span className="text-stone-700 dark:text-stone-300 font-medium">
            {NOVEL_GENRE_LABELS[story.novelGenre]}
          </span>
        </>
      )}

      {showDetails && isRoman && (
        <>
          <span aria-hidden="true" className="text-stone-400 dark:text-stone-500">
            ·
          </span>
          <span className="text-stone-600 dark:text-stone-400 tabular-nums">
            {story.chapterCount ?? 1} chap. ·{' '}
            {SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']}
          </span>
        </>
      )}
    </span>
  );
}
