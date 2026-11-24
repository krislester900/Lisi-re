import { FIELD_LIMITS, MemberBadgeId, PublicProfile } from '../types/story';

export interface MemberBadgeDefinition {
  id: MemberBadgeId;
  label: string;
  description: string;
  toneClass: string;
}

export const MEMBER_BADGE_DEFINITIONS: readonly MemberBadgeDefinition[] = [
  {
    id: 'administrateur',
    label: 'Administrateur',
    description: 'Administration générale et régulation de la plateforme Lisière.',
    toneClass: 'bg-[#1B365D] text-white border-[#1B365D]',
  },
  {
    id: 'moderateur',
    label: 'Modérateur',
    description: 'Veille à la sérénité des salons, commentaires et échanges.',
    toneClass: 'bg-[#F4F7EF] text-[#354220] border-[#B8C79B]',
  },
  {
    id: 'expert_litteraire',
    label: 'Expert littéraire',
    description: 'Plume reconnue pour la finesse de ses retours et analyses de lecture.',
    toneClass: 'bg-[#FAF2F4] text-[#6E2438] border-[#DFB8C2]',
  },
  {
    id: 'plume_confirmee',
    label: 'Plume confirmée',
    description: 'Auteur régulier dont les récits et romans marquent la communauté.',
    toneClass: 'bg-[#FDF8F0] text-[#7A4109] border-[#DFC296]',
  },
  {
    id: 'grand_lecteur',
    label: 'Grand lecteur',
    description: 'Lecteur attentif et bienveillant, actif dans les commentaires.',
    toneClass: 'bg-[#F3F6FA] text-[#1B365D] border-[#CBD6E6]',
  },
] as const;

export const MEMBER_BADGE_MAP: Record<MemberBadgeId, MemberBadgeDefinition> = {
  administrateur: MEMBER_BADGE_DEFINITIONS[0],
  moderateur: MEMBER_BADGE_DEFINITIONS[1],
  expert_litteraire: MEMBER_BADGE_DEFINITIONS[2],
  plume_confirmee: MEMBER_BADGE_DEFINITIONS[3],
  grand_lecteur: MEMBER_BADGE_DEFINITIONS[4],
};

const VALID_BADGE_SET = new Set<MemberBadgeId>(
  MEMBER_BADGE_DEFINITIONS.map((def) => def.id)
);

export function isValidMemberBadgeId(value: unknown): value is MemberBadgeId {
  return typeof value === 'string' && VALID_BADGE_SET.has(value as MemberBadgeId);
}

export function sanitizeMemberBadges(raw: unknown): MemberBadgeId[] {
  if (!Array.isArray(raw)) return [];
  const unique: MemberBadgeId[] = [];
  for (const item of raw) {
    if (isValidMemberBadgeId(item) && !unique.includes(item)) {
      unique.push(item);
      if (unique.length >= FIELD_LIMITS.memberBadgesMax) break;
    }
  }
  return unique;
}

export function getProfileBadges(profile?: PublicProfile | null): MemberBadgeId[] {
  if (!profile) return [];
  return sanitizeMemberBadges(profile.badges);
}

export function profileMatchesBadgeQuery(
  profile: PublicProfile,
  queryLower: string,
  extraRoleLabels: string[] = []
): boolean {
  if (!queryLower) return true;
  const badges = getProfileBadges(profile);
  if (
    badges.some((id) => MEMBER_BADGE_MAP[id].label.toLowerCase().includes(queryLower))
  ) {
    return true;
  }
  if (profile.isAdmin && 'administrateur'.includes(queryLower)) {
    return true;
  }
  return extraRoleLabels.some((lbl) => lbl.toLowerCase().includes(queryLower));
}
