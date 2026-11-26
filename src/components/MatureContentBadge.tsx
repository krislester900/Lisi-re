import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { formatAgeBadge, shouldShowMatureWarning } from '../lib/contentRegulation';
import { AgeRating } from '../types/story';

interface MatureContentBadgeProps {
  minAge?: AgeRating;
  isMature?: boolean;
  compact?: boolean;
  className?: string;
}

export function MatureContentBadge({
  minAge,
  isMature,
  compact = false,
  className = '',
}: MatureContentBadgeProps) {
  const mature = shouldShowMatureWarning({ minAge, isMature });
  const ageLabel = formatAgeBadge(minAge, isMature);

  if (!mature && !ageLabel) return null;

  if (mature) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 text-[11px] font-medium whitespace-nowrap shrink-0 ${className}`}
        title="Contenu mature : thèmes sensibles ou réservés à un public averti"
      >
        <ShieldAlert className="w-3 h-3 text-amber-700 dark:text-amber-400 shrink-0" />
        <span>
          {compact
            ? ageLabel && ageLabel !== 'Mature'
              ? `Mature · ${ageLabel}`
              : 'Mature'
            : ageLabel && ageLabel !== 'Mature'
              ? `Contenu mature (${ageLabel})`
              : 'Contenu mature'}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[11px] font-medium whitespace-nowrap shrink-0 ${className}`}
      title={`Contenu conseillé à partir de ${ageLabel}`}
    >
      {ageLabel}
    </span>
  );
}
