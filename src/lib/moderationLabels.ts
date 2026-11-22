import {
  ModerationAiVerdict,
  ModerationCaseStatus,
  ModerationGravityLevel,
  ModerationReportCategory,
  ModerationReviewStep,
  ModerationTargetType,
  WarningSeverity,
} from '../types/story';

export const MODERATION_ADMIN_EMAIL = 'krislester900@gmail.com';

export function isModerationAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === MODERATION_ADMIN_EMAIL);
}

export const MODERATION_AI_VERDICT_LABELS: Record<
  ModerationAiVerdict,
  { label: string; shortLabel: string; toneClass: string }
> = {
  outrage_confirme: {
    label: 'IA : Acte outrageant détecté',
    shortLabel: 'IA : Outrage détecté',
    toneClass: 'border-red-300 bg-red-50 text-red-900',
  },
  incertain_a_verifier: {
    label: 'IA : Cas ambigu — intervention admin requise',
    shortLabel: 'IA : Intervention requise',
    toneClass: 'border-amber-300 bg-amber-50 text-amber-950',
  },
  aucun_outrage: {
    label: 'IA : Aucun manquement caractérisé',
    shortLabel: 'IA : Aucun outrage',
    toneClass: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  },
};

export const MODERATION_CATEGORY_LABELS: Record<
  ModerationReportCategory,
  { label: string; hint: string }
> = {
  'propos-outrageants': {
    label: 'Propos outrageants ou insultants',
    hint: 'Injures, humiliation, propos blessants ou gravement irrespectueux.',
  },
  harcelement: {
    label: 'Harcèlement ou pression répétée',
    hint: 'Messages insistants, intimidation ou contact non désiré répété.',
  },
  'haine-discrimination': {
    label: 'Propos haineux ou discriminatoires',
    hint: 'Attaques visant l’origine, le genre, la religion, l’orientation ou un handicap.',
  },
  'contenu-inapproprie': {
    label: 'Contenu choquant ou inapproprié',
    hint: 'Contenu explicite non consenti, menaces ou mise en danger.',
  },
  'usurpation-spam': {
    label: 'Usurpation d’identité ou spam',
    hint: 'Faux profil, sollicitation commerciale ou messages indésirables.',
  },
  plagiat: {
    label: 'Plagiat ou copie d’œuvre',
    hint: 'Reproduction non autorisée d’un texte ou d’un roman.',
  },
  autre: {
    label: 'Autre manquement grave',
    hint: 'Autre comportement contraire aux règles de bienveillance de Lisière.',
  },
};

export const MODERATION_TARGET_LABELS: Record<ModerationTargetType, string> = {
  private_message: 'Message privé',
  story: 'Récit ou roman',
  echo: 'Commentaire / écho',
  salon_message: 'Message de salon',
  profile: 'Profil membre',
};

export const MODERATION_STATUS_LABELS: Record<
  ModerationCaseStatus,
  { label: string; toneClass: string }
> = {
  open: {
    label: 'À étudier',
    toneClass: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  under_review: {
    label: 'Étude de cas en cours',
    toneClass: 'border-[#CBD6E6] bg-[#F3F6FA] text-[#1B365D]',
  },
  resolved_warned: {
    label: 'Acte justifié · Avertissement émis',
    toneClass: 'border-red-300 bg-red-50 text-red-900',
  },
  resolved_dismissed: {
    label: 'Classé sans suite',
    toneClass: 'border-stone-300 bg-stone-100 text-stone-700',
  },
};

export const MODERATION_REVIEW_STEPS: Array<{
  id: ModerationReviewStep;
  stepNumber: number;
  label: string;
  description: string;
}> = [
  {
    id: 'recu',
    stepNumber: 1,
    label: '1. Réception & conservation',
    description: 'Signalement enregistré avec capture figée des faits.',
  },
  {
    id: 'analyse_faits',
    stepNumber: 2,
    label: '2. Analyse des faits',
    description: 'Examen du contenu rapporté, du contexte et des antécédents.',
  },
  {
    id: 'evaluation_gravite',
    stepNumber: 3,
    label: '3. Qualification & gravité',
    description: 'Vérification des critères objectifs de l’acte outrageant.',
  },
  {
    id: 'decision_prise',
    stepNumber: 4,
    label: '4. Décision & notification',
    description: 'Justification écrite et envoi d’un avertissement officiel ou classement.',
  },
];

export const MODERATION_GRAVITY_LABELS: Record<
  ModerationGravityLevel,
  { label: string; toneClass: string }
> = {
  aucune: {
    label: 'Non qualifiée',
    toneClass: 'border-stone-200 bg-stone-50 text-stone-600',
  },
  moderee: {
    label: 'Gravité modérée',
    toneClass: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  grave: {
    label: 'Gravité sérieuse',
    toneClass: 'border-orange-300 bg-orange-50 text-orange-900',
  },
  critique: {
    label: 'Gravité critique',
    toneClass: 'border-red-300 bg-red-50 text-red-900',
  },
};

export const WARNING_SEVERITY_LABELS: Record<
  WarningSeverity,
  { label: string; toneClass: string }
> = {
  moderee: {
    label: 'Avertissement — Niveau modéré',
    toneClass: 'border-amber-300 bg-amber-50 text-amber-950',
  },
  grave: {
    label: 'Avertissement sérieux',
    toneClass: 'border-orange-300 bg-orange-50 text-orange-950',
  },
  critique: {
    label: 'Avertissement critique',
    toneClass: 'border-red-300 bg-red-50 text-red-950',
  },
};

export const CASE_STUDY_CRITERIA: Array<{ id: string; label: string }> = [
  { id: 'propos_insultants', label: 'Propos directement insultants, humiliants ou outrageants' },
  { id: 'atteinte_dignite', label: 'Atteinte manifeste à la dignité ou à la sécurité d’un membre' },
  { id: 'harcelement_repete', label: 'Insistance abusive ou harcèlement malgré un refus clair' },
  { id: 'propos_haineux', label: 'Discours haineux, discriminatoire ou menaçant' },
  { id: 'violation_charte', label: 'Manquement caractérisé à la charte d’écoute de Lisière' },
  { id: 'recidive_constatee', label: 'Réitération ou antécédents de signalements avérés' },
];
