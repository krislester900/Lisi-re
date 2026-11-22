import { GoogleGenAI, Type } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

export const VALID_CASE_CRITERIA_IDS = [
  'propos_insultants',
  'atteinte_dignite',
  'harcelement_repete',
  'propos_haineux',
  'violation_charte',
  'recidive_constatee',
] as const;

export interface VerifiedFirebaseCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface ModerationAiAnalysisResult {
  analyzedAtIso: string;
  model: string;
  verdict: 'outrage_confirme' | 'incertain_a_verifier' | 'aucun_outrage';
  confidencePercent: number;
  recommendedAction: 'avertir' | 'examen_manuel' | 'classer';
  suggestedGravity: 'aucune' | 'moderee' | 'grave' | 'critique';
  suggestedCriteria: string[];
  summary: string;
  suggestedDecisionReason: string;
  needsAdminIntervention: boolean;
  interventionReason: string;
}

function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function verifyFirebaseIdToken(
  idToken: string,
  overrideApiKey?: string
): Promise<VerifiedFirebaseCaller | null> {
  const token = idToken.trim();
  if (!token || token.length > 4096) return null;

  const apiKey = (overrideApiKey || firebaseConfig.apiKey || '').trim();
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!resp.ok) return null;

    const json = (await resp.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
      }>;
    };
    const user = json.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

export async function analyzeModerationCaseWithGemini(params: {
  apiKey: string;
  targetType: string;
  category: string;
  targetUserName: string;
  targetExcerpt: string;
  description: string;
}): Promise<ModerationAiAnalysisResult> {
  const cleanKey = (params.apiKey || '').trim();
  if (!cleanKey || cleanKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'La clé GEMINI_API_KEY n’est pas configurée sur le serveur.'
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }

  const ai = new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const targetType = clampText(params.targetType, 40);
  const category = clampText(params.category, 40);
  const targetUserName = clampText(params.targetUserName, 60) || 'Membre';
  const targetExcerpt = clampText(params.targetExcerpt, 1000);
  const description = clampText(params.description, 800);

  if (description.length < 10) {
    const err = new Error('Description du signalement trop courte pour l’analyse.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const prompt = [
    `Analyse ce dossier de signalement pour le salon littéraire francophone « Lisière ».`,
    ``,
    `- Type de contenu signalé : ${targetType}`,
    `- Catégorie déclarée par le signalant : ${category}`,
    `- Membre visé : ${targetUserName}`,
    `- Extrait figé du contenu signalé : ${targetExcerpt ? `« ${targetExcerpt} »` : '(aucun extrait textuel joint)'}`,
    `- Récit / contexte fourni par le signalant : ${description}`,
    ``,
    `Identifiants de critères officiels autorisés pour suggestedCriteria :`,
    `- "propos_insultants" : Propos directement insultants, humiliants ou outrageants`,
    `- "atteinte_dignite" : Atteinte manifeste à la dignité ou à la sécurité d’un membre`,
    `- "harcelement_repete" : Insistance abusive ou harcèlement malgré un refus clair`,
    `- "propos_haineux" : Discours haineux, discriminatoire ou menaçant`,
    `- "violation_charte" : Manquement caractérisé à la charte d’écoute de Lisière`,
    `- "recidive_constatee" : Réitération ou antécédents de signalements avérés`,
    ``,
    `Règles d’évaluation :`,
    `1. Reste factuel, neutre et rédigé en français clair.`,
    `2. Si l’acte outrageant est évident et caractérisé (insultes directes, menaces, haine, harcèlement explicite), mets verdict="outrage_confirme" et recommendedAction="avertir".`,
    `3. Si le contexte est ambigu, s’il manque l’extrait exact, s’il s’agit d’un différend littéraire, d’une accusation de plagiat nécessitant vérification, ou d’une gravité "critique", mets needsAdminIntervention=true (et verdict="incertain_a_verifier" / recommendedAction="examen_manuel" si l’issue est incertaine).`,
    `4. Si les faits ne montrent aucun manquement réel, mets verdict="aucun_outrage", recommendedAction="classer", suggestedGravity="aucune".`,
    `5. Dans suggestedDecisionReason, rédige une proposition de justification prête à être relue (au moins 20 caractères) expliquant objectivement pourquoi un avertissement ou un classement est proposé.`,
  ].join('\n');

  const modelName = 'gemini-4-hydrogen';

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction:
        'Tu es l’assistant de modération IA de la communauté littéraire Lisière. Tu produis une pré-étude de cas structurée, impartiale et bienveillante en français, en signalant les cas ambigus ou graves qui requièrent l’intervention manuelle de l’administrateur.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            enum: ['outrage_confirme', 'incertain_a_verifier', 'aucun_outrage'],
          },
          confidencePercent: {
            type: Type.INTEGER,
          },
          recommendedAction: {
            type: Type.STRING,
            enum: ['avertir', 'examen_manuel', 'classer'],
          },
          suggestedGravity: {
            type: Type.STRING,
            enum: ['aucune', 'moderee', 'grave', 'critique'],
          },
          suggestedCriteria: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [...VALID_CASE_CRITERIA_IDS],
            },
          },
          summary: {
            type: Type.STRING,
          },
          suggestedDecisionReason: {
            type: Type.STRING,
          },
          needsAdminIntervention: {
            type: Type.BOOLEAN,
          },
          interventionReason: {
            type: Type.STRING,
          },
        },
        required: [
          'verdict',
          'confidencePercent',
          'recommendedAction',
          'suggestedGravity',
          'suggestedCriteria',
          'summary',
          'suggestedDecisionReason',
          'needsAdminIntervention',
          'interventionReason',
        ],
      },
    },
  });

  const rawText = response.text?.trim() || '';
  if (!rawText) {
    throw new Error('Réponse vide reçue du service de modération IA.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error('Impossible d’interpréter l’analyse renvoyée par l’IA.');
  }

  const verdict =
    parsed.verdict === 'outrage_confirme' ||
    parsed.verdict === 'incertain_a_verifier' ||
    parsed.verdict === 'aucun_outrage'
      ? parsed.verdict
      : 'incertain_a_verifier';

  const rawConfidence = Number(parsed.confidencePercent);
  const confidencePercent = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(100, Math.round(rawConfidence)))
    : 50;

  const recommendedAction =
    parsed.recommendedAction === 'avertir' ||
    parsed.recommendedAction === 'examen_manuel' ||
    parsed.recommendedAction === 'classer'
      ? parsed.recommendedAction
      : verdict === 'outrage_confirme'
        ? 'avertir'
        : verdict === 'aucun_outrage'
          ? 'classer'
          : 'examen_manuel';

  let suggestedGravity: 'aucune' | 'moderee' | 'grave' | 'critique' =
    parsed.suggestedGravity === 'aucune' ||
    parsed.suggestedGravity === 'moderee' ||
    parsed.suggestedGravity === 'grave' ||
    parsed.suggestedGravity === 'critique'
      ? parsed.suggestedGravity
      : verdict === 'outrage_confirme'
        ? 'moderee'
        : 'aucune';

  if (recommendedAction === 'avertir' && suggestedGravity === 'aucune') {
    suggestedGravity = 'moderee';
  }
  if (verdict === 'aucun_outrage') {
    suggestedGravity = 'aucune';
  }

  const allowedCriteria = new Set<string>(VALID_CASE_CRITERIA_IDS);
  const suggestedCriteria = Array.isArray(parsed.suggestedCriteria)
    ? Array.from(
        new Set(
          parsed.suggestedCriteria
            .filter((item): item is string => typeof item === 'string' && allowedCriteria.has(item))
            .slice(0, 6)
        )
      )
    : [];

  const needsAdminIntervention =
    Boolean(parsed.needsAdminIntervention) ||
    verdict === 'incertain_a_verifier' ||
    recommendedAction === 'examen_manuel' ||
    suggestedGravity === 'critique' ||
    confidencePercent < 70;

  const summary =
    clampText(parsed.summary, 1000) ||
    'Analyse préliminaire réalisée à partir des éléments du signalement.';

  let suggestedDecisionReason = clampText(parsed.suggestedDecisionReason, 800);
  if (suggestedDecisionReason.length < 15) {
    suggestedDecisionReason =
      verdict === 'outrage_confirme'
        ? 'Les propos signalés contreviennent aux règles de respect et de bienveillance de Lisière.'
        : 'Après examen préliminaire des éléments fournis, le dossier nécessite vérification ou classement.';
  }

  const interventionReason = clampText(parsed.interventionReason, 400);

  return {
    analyzedAtIso: new Date().toISOString(),
    model: modelName,
    verdict,
    confidencePercent,
    recommendedAction,
    suggestedGravity,
    suggestedCriteria,
    summary,
    suggestedDecisionReason,
    needsAdminIntervention,
    interventionReason:
      interventionReason ||
      (needsAdminIntervention
        ? 'Une vérification humaine est recommandée avant décision définitive.'
        : 'Dossier clair pré-qualifié par la modération artificielle.'),
  };
}

export const PUBLIC_INDEXABLE_ROUTES: ReadonlyArray<{
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/histoires', changefreq: 'daily', priority: '0.9' },
  { path: '/themes', changefreq: 'weekly', priority: '0.8' },
  { path: '/profils', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/creation', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/premiers-elans', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/rencontres', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/solitudes', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/quotidien', changefreq: 'daily', priority: '0.8' },
  { path: '/salons/faq', changefreq: 'weekly', priority: '0.8' },
  { path: '/confidentialite', changefreq: 'monthly', priority: '0.4' },
];

export function normalizeGoogleSiteVerificationToken(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const contentMatch = value.match(/content=["']([^"']+)["']/i);
  const candidate = (contentMatch ? contentMatch[1] : value).trim();
  // Accept standard Google verification token characters or google<hex>.html filename
  if (/^[a-zA-Z0-9_-]{8,128}$/.test(candidate)) {
    return candidate;
  }
  return '';
}

export function normalizeGoogleVerificationFile(raw?: string): string {
  const value = (raw || '').trim().replace(/^\/+/, '');
  if (/^google[a-zA-Z0-9_-]{6,64}\.html$/.test(value)) {
    return value;
  }
  return '';
}

export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /auth/',
    'Disallow: /moderation',
    'Disallow: /passerelles',
    'Disallow: /carnet',
    '',
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(origin: string, lastModIso = new Date().toISOString().slice(0, 10)): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const urls = PUBLIC_INDEXABLE_ROUTES.map(
    (route) => `  <url>
    <loc>${cleanOrigin}${route.path}</loc>
    <lastmod>${lastModIso}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

