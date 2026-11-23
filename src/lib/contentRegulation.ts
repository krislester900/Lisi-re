import { AgeRating, FIELD_LIMITS } from '../types/story';

export const ROMAN_PAGE_CHARS = 1500;
export const ROMAN_MIN_PAGES = 2;
export const ROMAN_MIN_CHARS = FIELD_LIMITS.romanChapterMinChars; // 3000 chars (~2 pages)

export const CONFESSION_MIN_LINES = FIELD_LIMITS.confessionMinLines; // > 3 lines => 4+ lines
export const CONFESSION_MIN_CHARS = FIELD_LIMITS.confessionMinChars; // 160 chars

export const AGE_RATING_OPTIONS: ReadonlyArray<{
  value: AgeRating;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 0,
    label: 'Tout public',
    shortLabel: 'Tout public',
    description: 'Accessible à tous les lecteurs, sans thème sensible particulier.',
  },
  {
    value: 13,
    label: '13 ans et +',
    shortLabel: '13+',
    description: 'Récits abordant les émotions adolescentes ou des sujets de vie un peu plus graves.',
  },
  {
    value: 16,
    label: '16 ans et + (Mature)',
    shortLabel: '16+ · Mature',
    description: 'Thèmes adultes, détresse psychologique, romance intense ou langue crue (avertissement affiché).',
  },
  {
    value: 18,
    label: '18 ans et + (Adulte)',
    shortLabel: '18+ · Mature',
    description: 'Strictement réservé aux membres majeurs avec avertissement « Contenu mature ».',
  },
];

export const CONTENT_CHARTER_RULES: ReadonlyArray<string> = [
  'Aucun propos haineux, raciste, sexiste, homophobe, validiste, diffamatoire ou discriminatoire.',
  'Aucune insulte, menace, moquerie ciblée, harcèlement ni appel à la violence.',
  'Aucun texte incohérent, suite de caractères aléatoires, spam ou message hors-sujet visant à encombrer les salons.',
  'Respect strict des limites d’âge et signalement honnête des récits comportant des thèmes matures.',
];

export interface NovelLengthEvaluation {
  chars: number;
  estimatedPages: number;
  minPages: number;
  minChars: number;
  remainingChars: number;
  ok: boolean;
  message: string;
}

export function estimateNovelPages(text: string): number {
  const cleanLen = text.trim().length;
  if (cleanLen === 0) return 0;
  return Math.round((cleanLen / ROMAN_PAGE_CHARS) * 10) / 10;
}

export function evaluateNovelChapterLength(text: string): NovelLengthEvaluation {
  const chars = text.trim().length;
  const estimatedPages = estimateNovelPages(text);
  const remainingChars = Math.max(0, ROMAN_MIN_CHARS - chars);
  const ok = chars >= ROMAN_MIN_CHARS;
  const message = ok
    ? `Longueur conforme : environ ${estimatedPages.toFixed(1).replace('.', ',')} pages (${chars.toLocaleString('fr-FR')} caractères).`
    : `Un chapitre de roman doit contenir au moins ${ROMAN_MIN_PAGES} pages (${ROMAN_MIN_CHARS.toLocaleString('fr-FR')} caractères minimum ; il manque encore ${remainingChars.toLocaleString('fr-FR')} caractères).`;

  return {
    chars,
    estimatedPages,
    minPages: ROMAN_MIN_PAGES,
    minChars: ROMAN_MIN_CHARS,
    remainingChars,
    ok,
    message,
  };
}

export function countMeaningfulLines(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const nonEmptyLines = trimmed
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6);

  if (nonEmptyLines.length >= CONFESSION_MIN_LINES) {
    return nonEmptyLines.length;
  }

  // Also allow continuous prose paragraphs if they contain >= 4 distinct constructed sentences
  const sentences = trimmed
    .split(/[.!?…]+(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);

  return Math.max(nonEmptyLines.length, sentences.length);
}

export interface ConfessionLengthEvaluation {
  chars: number;
  lines: number;
  minLines: number;
  minChars: number;
  remainingChars: number;
  remainingLines: number;
  ok: boolean;
  message: string;
}

export function evaluateConfessionLength(text: string): ConfessionLengthEvaluation {
  const chars = text.trim().length;
  const lines = countMeaningfulLines(text);
  const remainingChars = Math.max(0, CONFESSION_MIN_CHARS - chars);
  const remainingLines = Math.max(0, CONFESSION_MIN_LINES - lines);
  const ok = lines >= CONFESSION_MIN_LINES && chars >= CONFESSION_MIN_CHARS;
  const message = ok
    ? `Confession recevable (${lines} lignes / phrases construites · ${chars} caractères).`
    : `Une confession doit dépasser 3 lignes (au moins ${CONFESSION_MIN_LINES} lignes ou phrases construites et ${CONFESSION_MIN_CHARS} caractères minimum).`;

  return {
    chars,
    lines,
    minLines: CONFESSION_MIN_LINES,
    minChars: CONFESSION_MIN_CHARS,
    remainingChars,
    remainingLines,
    ok,
    message,
  };
}

const EXPLICIT_HATE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(sale\s+(?:arabe|noir|n[eè]gre|juif|bougnoule|p[eé]d[eé]|tapette|chinois|musulman|blanc))\b/i,
  /\b(n[eè]gre|bougnoule|bamboula|youpin|feuj\s+de\s+merde|raton|bicot|trou\s+du\s+cul)\b/i,
  /\b(mort\s+aux?\s+(?:juifs|arabes|noirs|blancs|homos|gays|trans|femmes|étrangers|migrants))\b/i,
  /\b(va\s+crever|suicide[-\s]?toi|tue[-\s]?toi|je\s+vais\s+te\s+tuer)\b/i,
  /\b(nigger|faggot|kike|spic|kill\s+yourself)\b/i,
];

export interface HygieneCheckResult {
  ok: boolean;
  reason?: string;
}

export function checkLocalContentHygiene(
  rawText: string,
  options?: {
    minWords?: number;
    label?: string;
    strictSentenceQuality?: boolean;
  }
): HygieneCheckResult {
  const text = rawText.trim();
  const label = options?.label ?? 'Ce texte';

  if (!text) {
    return { ok: false, reason: `${label} ne peut pas être vide.` };
  }

  for (const pattern of EXPLICIT_HATE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        ok: false,
        reason:
          'Publication refusée : ce message contient des propos haineux, discriminatoires ou injurieux contraires à la charte de Lisière.',
      };
    }
  }

  // Repeated same character >= 7 times (e.g. aaaaaaaa, !!!!!!!!)
  if (/(.)\1{6,}/i.test(text)) {
    return {
      ok: false,
      reason: `${label} contient de longues suites de caractères répétés. Rédigez un propos lisible et soigné.`,
    };
  }

  const lettersOnly = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (text.length >= 12 && lettersOnly.length < Math.max(4, Math.floor(text.length * 0.35))) {
    return {
      ok: false,
      reason: `${label} contient trop de symboles ou de chiffres par rapport au texte rédigé.`,
    };
  }

  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, ''))
    .filter(Boolean);

  if (options?.minWords && words.length < options.minWords) {
    return {
      ok: false,
      reason: `${label} doit contenir au moins ${options.minWords} mots construits.`,
    };
  }

  if (options?.strictSentenceQuality && text.length >= 40) {
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    if (words.length >= 15 && uniqueWords.size / words.length < 0.22) {
      return {
        ok: false,
        reason: `${label} répète les mêmes mots de façon mécanique. Prenez le temps d’écrire un texte authentique.`,
      };
    }
    const longGibberishToken = words.some((w) => w.length >= 28);
    if (longGibberishToken) {
      return {
        ok: false,
        reason: `${label} comporte une suite de lettres sans séparation ni sens apparent.`,
      };
    }
  }

  return { ok: true };
}

export function getEffectiveMinAge(item: { minAge?: AgeRating; isMature?: boolean }): AgeRating {
  const base = item.minAge ?? 0;
  if (item.isMature && base < 16) return 16;
  return base;
}

export function shouldShowMatureWarning(item: {
  minAge?: AgeRating;
  isMature?: boolean;
}): boolean {
  return Boolean(item.isMature || (item.minAge ?? 0) >= 16);
}

export function isContentAllowedForAge(
  item: { minAge?: AgeRating; isMature?: boolean },
  viewerAge: number | null,
  isAuthor = false
): boolean {
  if (isAuthor) return true;
  const requiredAge = getEffectiveMinAge(item);
  if (requiredAge <= 0) return true;
  if (viewerAge === null || !Number.isFinite(viewerAge)) return false;
  return viewerAge >= requiredAge;
}

export function formatAgeBadge(minAge?: AgeRating, isMature?: boolean): string | null {
  const effective = getEffectiveMinAge({ minAge, isMature });
  if (effective === 18) return '18+';
  if (effective === 16) return '16+';
  if (effective === 13) return '13+';
  return isMature ? 'Mature' : null;
}

export function getStoryAgeAccessBlockReason(
  item: { minAge?: AgeRating; isMature?: boolean },
  viewerAge: number | null,
  isSignedIn: boolean,
  isAuthor = false
): string | null {
  if (isAuthor) return null;
  const requiredAge = getEffectiveMinAge(item);
  if (requiredAge <= 0) return null;
  if (!isSignedIn) {
    return `Ce contenu est réservé aux lecteurs de ${requiredAge} ans et plus. Connectez-vous et renseignez votre âge dans votre compte pour vérifier votre accès.`;
  }
  if (viewerAge === null || !Number.isFinite(viewerAge)) {
    return `Ce contenu est classé ${requiredAge}+. Renseignez votre âge dans les paramètres de votre compte pour confirmer qu’il est adapté à votre profil.`;
  }
  if (viewerAge < requiredAge) {
    return `Ce contenu est réservé aux membres de ${requiredAge} ans et plus (votre âge enregistré : ${viewerAge} ans).`;
  }
  return null;
}
