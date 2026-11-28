import {
  EngagementBadgeId,
  Exchange,
  FIELD_LIMITS,
  MemberBadgeId,
  PublicProfile,
  Story,
} from '../types/story';

export interface MemberBadgeDefinition {
  id: MemberBadgeId;
  label: string;
  description: string;
  toneClass: string;
}

export interface EngagementBadgeDefinition {
  id: EngagementBadgeId;
  label: string;
  description: string;
  criteriaLabel: string;
  toneClass: string;
}

export type AnyProfileBadgeId = MemberBadgeId | EngagementBadgeId;

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

export const ENGAGEMENT_BADGE_DEFINITIONS: readonly EngagementBadgeDefinition[] = [
  {
    id: 'contributeur_bienveillant',
    label: 'Contributeur bienveillant',
    description:
      'Membre impliqué dont les récits, échanges privés et résonances nourrissent la communauté.',
    criteriaLabel: '3+ réactions reçues ou échanges actifs',
    toneClass:
      'bg-[#F2F7F4] dark:bg-emerald-950/50 text-[#1F513B] dark:text-emerald-200 border-[#B9D8C7] dark:border-emerald-800',
  },
  {
    id: 'romancier_prolifique',
    label: 'Romancier prolifique',
    description:
      'Auteur au long cours ayant publié plusieurs romans ou développé une série en plusieurs chapitres.',
    criteriaLabel: '2+ romans ou 3+ chapitres publiés',
    toneClass:
      'bg-[#F7F3FB] dark:bg-purple-950/45 text-[#4C2673] dark:text-purple-200 border-[#D5C3E8] dark:border-purple-800',
  },
  {
    id: 'plume_reguliere',
    label: 'Plume régulière',
    description:
      'Partage fidèlement ses récits et carnets personnels auprès des lecteurs de Lisière.',
    criteriaLabel: '3+ récits publics signés',
    toneClass:
      'bg-[#FDF8F0] dark:bg-amber-950/45 text-[#7A4109] dark:text-amber-200 border-[#DFC296] dark:border-amber-800',
  },
  {
    id: 'voix_des_salons',
    label: 'Voix des salons',
    description:
      'Fait vivre plusieurs salons thématiques par la diversité de ses textes.',
    criteriaLabel: 'Présent dans 2+ salons',
    toneClass:
      'bg-[#F3F6FA] dark:bg-slate-800 text-[#1B365D] dark:text-sky-200 border-[#CBD6E6] dark:border-slate-700',
  },
] as const;

export const MEMBER_BADGE_MAP: Record<MemberBadgeId, MemberBadgeDefinition> = {
  administrateur: MEMBER_BADGE_DEFINITIONS[0],
  moderateur: MEMBER_BADGE_DEFINITIONS[1],
  expert_litteraire: MEMBER_BADGE_DEFINITIONS[2],
  plume_confirmee: MEMBER_BADGE_DEFINITIONS[3],
  grand_lecteur: MEMBER_BADGE_DEFINITIONS[4],
};

export const ENGAGEMENT_BADGE_MAP: Record<EngagementBadgeId, EngagementBadgeDefinition> = {
  contributeur_bienveillant: ENGAGEMENT_BADGE_DEFINITIONS[0],
  romancier_prolifique: ENGAGEMENT_BADGE_DEFINITIONS[1],
  plume_reguliere: ENGAGEMENT_BADGE_DEFINITIONS[2],
  voix_des_salons: ENGAGEMENT_BADGE_DEFINITIONS[3],
};

const VALID_BADGE_SET = new Set<MemberBadgeId>(
  MEMBER_BADGE_DEFINITIONS.map((def) => def.id)
);

const VALID_ENGAGEMENT_BADGE_SET = new Set<EngagementBadgeId>(
  ENGAGEMENT_BADGE_DEFINITIONS.map((def) => def.id)
);

export function isValidMemberBadgeId(value: unknown): value is MemberBadgeId {
  return typeof value === 'string' && VALID_BADGE_SET.has(value as MemberBadgeId);
}

export function isValidEngagementBadgeId(value: unknown): value is EngagementBadgeId {
  return typeof value === 'string' && VALID_ENGAGEMENT_BADGE_SET.has(value as EngagementBadgeId);
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

export interface MemberEngagementStats {
  publicStoriesCount: number;
  novelCount: number;
  totalNovelChapters: number;
  totalResonances: number;
  totalEchoes: number;
  distinctSalonsCount: number;
  activeExchangesCount: number;
}

export function computeMemberEngagementStats(
  stories: Story[],
  exchanges: Exchange[] = [],
  userId?: string
): MemberEngagementStats {
  let publicStoriesCount = 0;
  let novelCount = 0;
  let totalNovelChapters = 0;
  let totalResonances = 0;
  let totalEchoes = 0;
  const salons = new Set<string>();

  for (const s of stories) {
    if (userId && s.authorId !== userId) continue;
    if (s.visibility !== 'public' || s.isAnonymous) continue;
    publicStoriesCount += 1;
    totalResonances += s.resonanceCount ?? 0;
    totalEchoes += s.echoCount ?? 0;
    if (s.storyFormat === 'roman') {
      novelCount += 1;
      totalNovelChapters += Math.max(1, s.chapterCount ?? 1);
    }
    if (s.customSalonId) {
      salons.add(`custom:${s.customSalonId}`);
    } else if (s.storyScope !== 'pelemele') {
      salons.add(`theme:${s.theme}`);
    }
  }

  let activeExchangesCount = 0;
  if (userId && exchanges.length > 0) {
    for (const ex of exchanges) {
      if (ex.participantIds?.includes(userId)) {
        activeExchangesCount += 1;
      }
    }
  }

  return {
    publicStoriesCount,
    novelCount,
    totalNovelChapters,
    totalResonances,
    totalEchoes,
    distinctSalonsCount: salons.size,
    activeExchangesCount,
  };
}

export function computeMemberEngagementBadges(
  stats: MemberEngagementStats
): EngagementBadgeId[] {
  const earned: EngagementBadgeId[] = [];
  const totalInteractions = stats.totalResonances + stats.totalEchoes;

  if (
    totalInteractions >= 3 ||
    (stats.publicStoriesCount >= 2 && totalInteractions >= 1) ||
    stats.activeExchangesCount >= 2
  ) {
    earned.push('contributeur_bienveillant');
  }

  if (
    stats.novelCount >= 2 ||
    stats.totalNovelChapters >= 3 ||
    (stats.novelCount >= 1 && stats.publicStoriesCount >= 3)
  ) {
    earned.push('romancier_prolifique');
  }

  if (stats.publicStoriesCount >= 3) {
    earned.push('plume_reguliere');
  }

  if (stats.distinctSalonsCount >= 2) {
    earned.push('voix_des_salons');
  }

  return earned;
}

export function buildEngagementBadgesByUser(
  stories: Story[],
  exchanges: Exchange[] = []
): Map<string, { stats: MemberEngagementStats; badges: EngagementBadgeId[] }> {
  const storiesByUser = new Map<string, Story[]>();
  for (const s of stories) {
    if (s.visibility !== 'public' || s.isAnonymous || !s.authorId) continue;
    const list = storiesByUser.get(s.authorId);
    if (list) list.push(s);
    else storiesByUser.set(s.authorId, [s]);
  }

  const exchangeCountByUser = new Map<string, number>();
  for (const ex of exchanges) {
    for (const pid of ex.participantIds ?? []) {
      exchangeCountByUser.set(pid, (exchangeCountByUser.get(pid) ?? 0) + 1);
    }
  }

  const allUserIds = new Set<string>([
    ...storiesByUser.keys(),
    ...exchangeCountByUser.keys(),
  ]);

  const result = new Map<
    string,
    { stats: MemberEngagementStats; badges: EngagementBadgeId[] }
  >();

  for (const uid of allUserIds) {
    const userStories = storiesByUser.get(uid) ?? [];
    const stats = computeMemberEngagementStats(userStories, []);
    stats.activeExchangesCount = exchangeCountByUser.get(uid) ?? 0;
    const badges = computeMemberEngagementBadges(stats);
    result.set(uid, { stats, badges });
  }

  return result;
}

export function profileMatchesBadgeQuery(
  profile: PublicProfile,
  queryLower: string,
  extraRoleLabels: string[] = [],
  engagementBadges: EngagementBadgeId[] = []
): boolean {
  if (!queryLower) return true;
  const badges = getProfileBadges(profile);
  if (
    badges.some((id) => MEMBER_BADGE_MAP[id].label.toLowerCase().includes(queryLower))
  ) {
    return true;
  }
  if (
    engagementBadges.some((id) =>
      ENGAGEMENT_BADGE_MAP[id].label.toLowerCase().includes(queryLower)
    )
  ) {
    return true;
  }
  if (profile.isAdmin && 'administrateur'.includes(queryLower)) {
    return true;
  }
  return extraRoleLabels.some((lbl) => lbl.toLowerCase().includes(queryLower));
}
