import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { NovelGenre } from '../types/story';
import { NOVEL_GENRE_LABELS } from '../lib/themes';

interface NovelCoverArtProps {
  coverUrl?: string;
  title: string;
  genre?: NovelGenre;
  accentColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showFallbackWhenMissing?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'w-9 aspect-[2/3] rounded-[3px]',
  sm: 'w-16 sm:w-20 aspect-[2/3] rounded-sm',
  md: 'w-24 sm:w-28 aspect-[2/3] rounded',
  lg: 'w-28 sm:w-36 aspect-[2/3] rounded',
};

export function NovelCoverArt({
  coverUrl,
  title,
  genre,
  accentColor = '#1B365D',
  size = 'sm',
  showFallbackWhenMissing = false,
  className = '',
}: NovelCoverArtProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [coverUrl]);

  const cleanUrl = coverUrl?.trim() || '';
  if (!cleanUrl && !showFallbackWhenMissing) {
    return null;
  }

  const sizeClass = SIZE_CLASSES[size];

  if (cleanUrl && !imgFailed) {
    return (
      <div
        className={`${sizeClass} overflow-hidden border border-stone-200 bg-stone-100 shadow-xs shrink-0 ${className}`}
      >
        <img
          src={cleanUrl}
          alt={`Couverture de ${title}`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      style={{ borderTopColor: accentColor }}
      className={`${sizeClass} overflow-hidden border border-stone-200 border-t-2 bg-[#F4EFE4] flex flex-col justify-between p-2 text-left shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <BookOpen
        style={{ color: accentColor }}
        className={size === 'xs' ? 'w-3 h-3 opacity-80' : 'w-4 h-4 opacity-80'}
      />
      {size !== 'xs' && (
        <div className="space-y-0.5 min-w-0">
          <p className="font-display text-[11px] leading-tight font-medium text-stone-900 line-clamp-3">
            {title || 'Roman'}
          </p>
          {genre && (
            <p className="text-[9px] uppercase tracking-wider text-stone-500 truncate">
              {NOVEL_GENRE_LABELS[genre]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
