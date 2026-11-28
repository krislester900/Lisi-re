import React from 'react';
import { Award, Check, ShieldCheck, Sparkles } from 'lucide-react';
import {
  ENGAGEMENT_BADGE_DEFINITIONS,
  ENGAGEMENT_BADGE_MAP,
  getProfileBadges,
  MEMBER_BADGE_DEFINITIONS,
  MemberEngagementStats,
} from '../lib/memberBadges';
import {
  EngagementBadgeId,
  FIELD_LIMITS,
  MemberBadgeId,
  PublicProfile,
} from '../types/story';
import { EngagementBadgeChip, ProfileBadgeChip, RoleBadge } from './RoleBadge';

interface ProfileBadgesSectionProps {
  memberProfile: PublicProfile;
  isOwner: boolean;
  isGlobalAdmin: boolean;
  isProfileAdmin: boolean;
  moderatedSalonNames: string[];
  engagementBadges: EngagementBadgeId[];
  engagementStats: MemberEngagementStats;
  showAdminBadgesPanel: boolean;
  onToggleAdminBadgesPanel: () => void;
  adminBadgeBusy: MemberBadgeId | null;
  adminBadgeFeedback: { kind: 'success' | 'error'; message: string } | null;
  onToggleMemberBadge: (badgeId: MemberBadgeId, hasBadge: boolean) => Promise<void>;
}

function getEngagementProgressLabel(
  badgeId: EngagementBadgeId,
  stats: MemberEngagementStats
): string {
  const interactions = stats.totalResonances + stats.totalEchoes;
  switch (badgeId) {
    case 'contributeur_bienveillant':
      return `${interactions}/3 interactions · ${stats.activeExchangesCount}/2 passerelles`;
    case 'romancier_prolifique':
      return `${stats.novelCount}/2 romans · ${stats.totalNovelChapters}/3 chapitres`;
    case 'plume_reguliere':
      return `${stats.publicStoriesCount}/3 récits publics`;
    case 'voix_des_salons':
      return `${stats.distinctSalonsCount}/2 salons distincts`;
  }
}

export function ProfileBadgesSection({
  memberProfile,
  isOwner,
  isGlobalAdmin,
  isProfileAdmin,
  moderatedSalonNames,
  engagementBadges,
  engagementStats,
  showAdminBadgesPanel,
  onToggleAdminBadgesPanel,
  adminBadgeBusy,
  adminBadgeFeedback,
  onToggleMemberBadge,
}: ProfileBadgesSectionProps) {
  const manualBadges = getProfileBadges(memberProfile);
  const distinctionBadges = manualBadges.filter(
    (id) => id !== 'administrateur' && id !== 'moderateur'
  );
  const showAdminRole = isProfileAdmin || manualBadges.includes('administrateur');
  const showModRole = moderatedSalonNames.length > 0 || manualBadges.includes('moderateur');
  const earnedSet = new Set<EngagementBadgeId>(engagementBadges);
  const totalEarnedCount =
    (showAdminRole ? 1 : 0) +
    (showModRole ? 1 : 0) +
    distinctionBadges.length +
    engagementBadges.length;

  return (
    <section
      aria-label="Badges et distinctions du profil"
      className="bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-xl p-4 sm:p-6 space-y-5"
    >
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-stone-800">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#1B365D] dark:text-amber-300 shrink-0" />
            <h2 className="font-display text-lg sm:text-xl font-medium text-stone-900 dark:text-stone-100">
              Badges &amp; distinctions
            </h2>
            <span className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[11px] font-medium text-stone-700 dark:text-stone-300 tabular-nums">
              {totalEarnedCount} obtenu{totalEarnedCount > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Rôles éditoriaux, distinctions et paliers d’engagement de {memberProfile.displayName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] text-stone-600 dark:text-stone-400 tabular-nums bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md px-2.5 py-1">
            {engagementStats.publicStoriesCount} récit
            {engagementStats.publicStoriesCount > 1 ? 's' : ''} ·{' '}
            {engagementStats.novelCount} roman{engagementStats.novelCount > 1 ? 's' : ''} ·{' '}
            {engagementStats.totalResonances + engagementStats.totalEchoes} interaction
            {engagementStats.totalResonances + engagementStats.totalEchoes > 1 ? 's' : ''}
          </div>

          {isGlobalAdmin && (
            <button
              type="button"
              onClick={onToggleAdminBadgesPanel}
              className="min-h-[34px] px-3 py-1 rounded-md border border-[#CBD6E6] dark:border-stone-700 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-sky-300 text-xs font-medium hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{showAdminBadgesPanel ? 'Fermer l’édition' : 'Attribuer des badges'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Block 1: Roles & Editorial Distinctions */}
      <div className="space-y-2.5">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
          Rôles &amp; distinctions de la maison
        </p>

        {showAdminRole || showModRole || distinctionBadges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {showAdminRole && <RoleBadge role="admin" />}
            {showModRole && (
              <RoleBadge
                role="moderator"
                label={
                  moderatedSalonNames.length === 1
                    ? `Modérateur · ${moderatedSalonNames[0]}`
                    : moderatedSalonNames.length > 1
                      ? `Modérateur (${moderatedSalonNames.length} salons)`
                      : 'Modérateur'
                }
              />
            )}
            {distinctionBadges.map((badgeId) => (
              <ProfileBadgeChip key={badgeId} badgeId={badgeId} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-stone-500 dark:text-stone-400 italic">
            {isOwner
              ? 'Aucune distinction éditoriale attribuée pour le moment.'
              : `${memberProfile.displayName} ne porte pas encore de distinction éditoriale particulière.`}
          </p>
        )}

        {isGlobalAdmin && showAdminBadgesPanel && (
          <div className="p-3.5 rounded-lg border border-[#CBD6E6] dark:border-stone-700 bg-[#F3F6FA]/70 dark:bg-stone-900 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#1B365D] dark:text-sky-300 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Gestion des distinctions (administration)</span>
              </p>
              <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                {manualBadges.length}/{FIELD_LIMITS.memberBadgesMax}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MEMBER_BADGE_DEFINITIONS.map((def) => {
                const hasBadge = manualBadges.includes(def.id);
                const busy = adminBadgeBusy === def.id;
                return (
                  <button
                    key={def.id}
                    type="button"
                    disabled={adminBadgeBusy !== null}
                    onClick={() => void onToggleMemberBadge(def.id, hasBadge)}
                    title={def.description}
                    className={`min-h-[34px] px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                      hasBadge
                        ? 'border-[#1B365D] bg-white dark:bg-stone-800 ring-1 ring-[#1B365D]/35'
                        : 'border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-950 opacity-85 hover:opacity-100 hover:border-stone-400'
                    }`}
                  >
                    {hasBadge && <Check className="w-3 h-3 text-[#1B365D] dark:text-amber-300" />}
                    <ProfileBadgeChip badgeId={def.id} compact />
                    {busy && <span className="text-[10px] text-stone-500">…</span>}
                  </button>
                );
              })}
            </div>
            {adminBadgeFeedback && (
              <p
                className={`text-xs ${
                  adminBadgeFeedback.kind === 'error'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {adminBadgeFeedback.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Block 2: Structured Engagement Badges Grid */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Badges d’engagement automatique</span>
          </p>
          <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {engagementBadges.length}/{ENGAGEMENT_BADGE_DEFINITIONS.length} débloqués
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ENGAGEMENT_BADGE_DEFINITIONS.map((def) => {
            const unlocked = earnedSet.has(def.id);
            const progressText = getEngagementProgressLabel(def.id, engagementStats);
            const info = ENGAGEMENT_BADGE_MAP[def.id];
            return (
              <div
                key={def.id}
                className={`rounded-lg border p-3.5 flex flex-col justify-between gap-2.5 transition-colors ${
                  unlocked
                    ? 'border-stone-300 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-900/90'
                    : 'border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/60 opacity-75'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <EngagementBadgeChip badgeId={def.id} compact />
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider ${
                        unlocked
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-stone-400 dark:text-stone-500'
                      }`}
                    >
                      {unlocked ? 'Obtenu' : 'En cours'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                    {info.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-200/80 dark:border-stone-800 space-y-0.5 text-[11px]">
                  <p className="font-medium text-stone-600 dark:text-stone-400">
                    Critère : {info.criteriaLabel}
                  </p>
                  <p className="text-stone-500 dark:text-stone-400 tabular-nums">
                    {progressText}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
