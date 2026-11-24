import React from 'react';
import { Award, BookOpen, Crown, Feather, Shield, ShieldCheck } from 'lucide-react';
import { MEMBER_BADGE_MAP, sanitizeMemberBadges } from '../lib/memberBadges';
import { MemberBadgeId } from '../types/story';

export type MemberRoleBadgeKind = 'admin' | 'owner' | 'moderator';

interface RoleBadgeProps {
  role: MemberRoleBadgeKind;
  compact?: boolean;
  label?: string;
  title?: string;
}

const ROLE_STYLES: Record<
  MemberRoleBadgeKind,
  { defaultLabel: string; defaultTitle: string; className: string }
> = {
  admin: {
    defaultLabel: 'Administrateur',
    defaultTitle: 'Administrateur de Lisière',
    className: 'bg-[#1B365D] text-white border-[#1B365D]',
  },
  owner: {
    defaultLabel: 'Créateur',
    defaultTitle: 'Fondateur du salon',
    className: 'bg-[#FDF8F0] text-[#7A4109] border-[#DFC296]',
  },
  moderator: {
    defaultLabel: 'Modérateur',
    defaultTitle: 'Modérateur du salon',
    className: 'bg-[#F4F7EF] text-[#354220] border-[#B8C79B]',
  },
};

export function RoleBadge({ role, compact = false, label, title }: RoleBadgeProps) {
  const cfg = ROLE_STYLES[role];
  const Icon = role === 'admin' ? ShieldCheck : role === 'owner' ? Crown : Shield;

  return (
    <span
      title={title ?? cfg.defaultTitle}
      className={`inline-flex items-center gap-1 rounded border font-medium whitespace-nowrap shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-0.5 text-[11px] leading-tight'
      } ${cfg.className}`}
    >
      <Icon className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
      <span>{label ?? cfg.defaultLabel}</span>
    </span>
  );
}

function BadgeGlyph({ badgeId, compact }: { badgeId: MemberBadgeId; compact: boolean }) {
  const sizeClass = compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0';
  switch (badgeId) {
    case 'administrateur':
      return <ShieldCheck className={sizeClass} />;
    case 'moderateur':
      return <Shield className={sizeClass} />;
    case 'expert_litteraire':
      return <Award className={sizeClass} />;
    case 'plume_confirmee':
      return <Feather className={sizeClass} />;
    case 'grand_lecteur':
      return <BookOpen className={sizeClass} />;
  }
}

export function ProfileBadgeChip({
  badgeId,
  compact = false,
  label,
  title,
}: {
  badgeId: MemberBadgeId;
  compact?: boolean;
  label?: string;
  title?: string;
}) {
  const def = MEMBER_BADGE_MAP[badgeId];
  return (
    <span
      title={title ?? def.description}
      className={`inline-flex items-center gap-1 rounded border font-medium whitespace-nowrap shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px] leading-tight' : 'px-2 py-0.5 text-[11px] leading-tight'
      } ${def.toneClass}`}
    >
      <BadgeGlyph badgeId={badgeId} compact={compact} />
      <span>{label ?? def.label}</span>
    </span>
  );
}

interface RoleBadgesRowProps {
  isAdmin?: boolean;
  isOwner?: boolean;
  isModerator?: boolean;
  profileBadges?: MemberBadgeId[];
  compact?: boolean;
  moderatorLabel?: string;
}

export function RoleBadgesRow({
  isAdmin = false,
  isOwner = false,
  isModerator = false,
  profileBadges,
  compact = false,
  moderatorLabel,
}: RoleBadgesRowProps) {
  const cleanBadges = sanitizeMemberBadges(profileBadges);
  const showAdmin = isAdmin || cleanBadges.includes('administrateur');
  const showModerator = isModerator || cleanBadges.includes('moderateur');
  const extraBadges = cleanBadges.filter(
    (id) => id !== 'administrateur' && id !== 'moderateur'
  );

  if (!showAdmin && !isOwner && !showModerator && extraBadges.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1 shrink-0">
      {showAdmin && <RoleBadge role="admin" compact={compact} />}
      {isOwner && <RoleBadge role="owner" compact={compact} />}
      {showModerator && (
        <RoleBadge
          role="moderator"
          compact={compact}
          label={isModerator ? moderatorLabel : undefined}
          title={
            isModerator && moderatorLabel
              ? `Modérateur · ${moderatorLabel}`
              : 'Modérateur de la communauté'
          }
        />
      )}
      {extraBadges.map((badgeId) => (
        <ProfileBadgeChip key={badgeId} badgeId={badgeId} compact={compact} />
      ))}
    </span>
  );
}
