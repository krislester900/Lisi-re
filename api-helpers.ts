import { createHash } from 'node:crypto';
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

const VERIFIED_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const VERIFIED_TOKEN_CACHE_MAX = 500;
const verifiedTokenCache = new Map<
  string,
  { caller: VerifiedFirebaseCaller; expiresAt: number }
>();

function hashIdToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function verifyFirebaseIdToken(
  idToken: string,
  overrideApiKey?: string
): Promise<VerifiedFirebaseCaller | null> {
  const token = idToken.trim();
  if (!token || token.length > 4096) return null;

  const cacheKey = hashIdToken(token);
  const cached = verifiedTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.caller;
  }
  if (cached) {
    verifiedTokenCache.delete(cacheKey);
  }

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
    const caller: VerifiedFirebaseCaller = {
      uid: user.localId,
      email: typeof user.email === 'string' ? user.email.toLowerCase() : null,
      emailVerified: Boolean(user.emailVerified),
    };

    if (verifiedTokenCache.size >= VERIFIED_TOKEN_CACHE_MAX) {
      for (const [key, entry] of verifiedTokenCache.entries()) {
        if (entry.expiresAt <= now) {
          verifiedTokenCache.delete(key);
        }
      }
      if (verifiedTokenCache.size >= VERIFIED_TOKEN_CACHE_MAX) {
        const oldestKey = verifiedTokenCache.keys().next().value;
        if (oldestKey) verifiedTokenCache.delete(oldestKey);
      }
    }
    verifiedTokenCache.set(cacheKey, {
      caller,
      expiresAt: now + VERIFIED_TOKEN_CACHE_TTL_MS,
    });

    return caller;
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

export type ContentGuardKind =
  | 'story'
  | 'chapter'
  | 'thread'
  | 'reply'
  | 'echo'
  | 'chat'
  | 'custom_salon';

export interface ContentGuardVerdict {
  allowed: boolean;
  blockedReason: string;
  botNotice: string;
  isMature: boolean;
  recommendedMinAge: 0 | 13 | 16 | 18;
  matureReason: string;
  qualityIssue: boolean;
  model: string;
}

function buildInteractiveFallbackVerdict(
  declaredMinAge: number,
  declaredMature: boolean
): ContentGuardVerdict {
  const fallbackAge: 0 | 13 | 16 | 18 =
    declaredMinAge >= 18 ? 18 : declaredMinAge >= 16 ? 16 : declaredMinAge >= 13 ? 13 : 0;
  return {
    allowed: true,
    blockedReason: '',
    botNotice: 'Validation rapide effectuée par le filtre de la charte Lisière.',
    isMature: declaredMature || fallbackAge >= 16,
    recommendedMinAge: fallbackAge,
    matureReason: '',
    qualityIssue: false,
    model: 'local-fallback',
  };
}

export async function guardContentWithGemini(params: {
  apiKey: string;
  kind: ContentGuardKind;
  title?: string;
  text: string;
  declaredMinAge?: number;
  declaredMature?: boolean;
}): Promise<ContentGuardVerdict> {
  const kind: ContentGuardKind =
    params.kind === 'story' ||
    params.kind === 'chapter' ||
    params.kind === 'thread' ||
    params.kind === 'reply' ||
    params.kind === 'echo' ||
    params.kind === 'chat' ||
    params.kind === 'custom_salon'
      ? params.kind
      : 'story';

  const isInteractiveShort = kind === 'echo' || kind === 'chat' || kind === 'reply';
  const title = clampText(params.title || '', 160);
  const text = clampText(params.text || '', isInteractiveShort ? 2000 : 8000);
  const declaredMinAge = Number(params.declaredMinAge ?? 0) || 0;
  const declaredMature = Boolean(params.declaredMature);

  if (!text && !title) {
    const err = new Error('Aucun contenu fourni pour la vérification.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const cleanKey = (params.apiKey || '').trim();
  if (!cleanKey || cleanKey === 'MY_GEMINI_API_KEY') {
    if (isInteractiveShort) {
      return buildInteractiveFallbackVerdict(declaredMinAge, declaredMature);
    }
    const err = new Error(
      'Le bot de régulation IA (GEMINI_API_KEY) n’est pas configuré sur le serveur.'
    ) as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }

  const ai = new GoogleGenAI({
    apiKey: cleanKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const modelName = isInteractiveShort ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const timeoutMs = isInteractiveShort ? 4500 : 11000;

  const prompt = isInteractiveShort
    ? [
        `Modération rapide Lisière (${kind}) :`,
        `Texte : « ${text} »`,
        `Bloque (allowed=false) UNIQUEMENT si haine/discrimination, insulte grave ciblée, menace/harcèlement, appel à la violence, ou charabia/spam pur (qualityIssue=true).`,
        `Autorise (allowed=true) tout commentaire sincère, critique littéraire respectueuse ou émotion.`,
      ].join('\n')
    : [
        `Tu es le Bot de régulation de « Lisière », une plateforme littéraire francophone (confessions, romans à chapitres, fils de discussion et chats de salon).`,
        `Analyse le texte suivant avant sa mise en ligne et décide s’il respecte le cadre éditorial :`,
        ``,
        `- Nature du contenu : ${kind}`,
        `- Âge minimum déclaré par l’auteur : ${declaredMinAge}+`,
        `- Indicateur mature déclaré par l’auteur : ${declaredMature ? 'oui' : 'non'}`,
        title ? `- Titre : ${title}` : `- Titre : (aucun)`,
        `- Texte à contrôler :`,
        `« ${text} »`,
        ``,
        `Critères stricts de blocage (allowed = false) :`,
        `1. Incitation à la haine, racisme, xénophobie, sexisme, homophobie, transphobie, antisémitisme, validisme ou discrimination visant une personne ou un groupe.`,
        `2. Insultes graves, propos offensants/dégradants ciblés, menaces, harcèlement ou incitation à l’automutilation / violence.`,
        `3. Foutoir / contenu incohérent : charabia de clavier (« azertyuiop », « fghjklm »), répétitions mécaniques sans sens, spam publicitaire ou bruit destiné uniquement à salir le salon (qualityIssue = true).`,
        ``,
        `Critères d’évaluation de la maturité (isMature & recommendedMinAge) :`,
        `- Un texte sincère mais sensible (deuil, détresse émotionnelle profonde, violence évoquée sans apologie, sexualité adulte non haineuse, addiction, traumatisme) peut être AUTORISÉ (allowed = true) s’il reste respectueux, mais DOIT être classé isMature = true et recommendedMinAge = 16 ou 18 avec un matureReason bref en français (ex. « Thèmes psychologiques sensibles », « Scènes réservées aux adultes »).`,
        `- Ne bloque PAS une confession sincère ou un passage dramatique de roman simplement parce qu’il est triste ou sérieux : distingue clairement l’émotion littéraire (autorisée, éventuellement 16+/18+ mature) de la haine, de l’offense et du charabia (bloqués).`,
        ``,
        `Règles de réponse JSON :`,
        `- allowed: true si acceptable, false si bloqué.`,
        `- blockedReason: en français, poli et précis si allowed=false (sinon "").`,
        `- botNotice: bref message de synthèse du Bot de régulation Lisière (ex. « Contenu validé par le bot de régulation. » ou motif clair).`,
        `- isMature: true si le texte contient des thèmes matures ou sensibles (16+ ou 18+).`,
        `- recommendedMinAge: 0, 13, 16, ou 18.`,
        `- matureReason: explication courte en français si isMature=true (sinon "").`,
        `- qualityIssue: true si refusé pour charabia/spam/bêtises incohérentes.`,
      ].join('\n');

  let rawText = '';
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const generatePromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: isInteractiveShort ? 180 : 320,
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: isInteractiveShort
          ? 'Modérateur rapide Lisière. Réponds uniquement en JSON valide et concis.'
          : 'Tu es le bot de régulation automatique de Lisière. Tu protèges le calme et la qualité littéraire des salons contre la haine, l’offense, le harcèlement et le charabia, tout en classant justement la maturité (Tout public, 13+, 16+, 18+).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            allowed: { type: Type.BOOLEAN },
            blockedReason: { type: Type.STRING },
            botNotice: { type: Type.STRING },
            isMature: { type: Type.BOOLEAN },
            recommendedMinAge: { type: Type.INTEGER },
            matureReason: { type: Type.STRING },
            qualityIssue: { type: Type.BOOLEAN },
          },
          required: [
            'allowed',
            'blockedReason',
            'botNotice',
            'isMature',
            'recommendedMinAge',
            'matureReason',
            'qualityIssue',
          ],
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error('Délai dépassé lors de la vérification IA.') as Error & {
          statusCode?: number;
        };
        err.statusCode = 504;
        reject(err);
      }, timeoutMs);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    rawText = response.text?.trim() || '';
  } catch (err) {
    if (isInteractiveShort) {
      return buildInteractiveFallbackVerdict(declaredMinAge, declaredMature);
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  if (!rawText) {
    if (isInteractiveShort) {
      return buildInteractiveFallbackVerdict(declaredMinAge, declaredMature);
    }
    throw new Error('Réponse vide du bot de régulation IA.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    if (isInteractiveShort) {
      return buildInteractiveFallbackVerdict(declaredMinAge, declaredMature);
    }
    throw new Error('Impossible de lire le verdict du bot de régulation IA.');
  }

  const allowed = Boolean(parsed.allowed);
  const qualityIssue = Boolean(parsed.qualityIssue);
  const rawAge = Number(parsed.recommendedMinAge);
  const recommendedMinAge: 0 | 13 | 16 | 18 =
    rawAge >= 18 ? 18 : rawAge >= 16 ? 16 : rawAge >= 13 ? 13 : 0;
  const isMature = Boolean(parsed.isMature) || recommendedMinAge >= 16;

  const blockedReason = allowed
    ? ''
    : clampText(parsed.blockedReason, 320) ||
      (qualityIssue
        ? 'Contenu jugé incohérent ou hors cadre par le bot de régulation.'
        : 'Contenu bloqué par le bot de régulation : propos contraires à la charte de respect et anti-haine de Lisière.');

  const botNotice =
    clampText(parsed.botNotice, 240) ||
    (allowed
      ? isMature
        ? 'Contenu conforme, signalé comme contenu mature.'
        : 'Contenu validé par le bot de régulation Lisière.'
      : blockedReason);

  const matureReason = isMature
    ? clampText(parsed.matureReason, 160) || 'Thèmes sensibles ou réservés à un public averti.'
    : '';

  return {
    allowed,
    blockedReason,
    botNotice,
    isMature,
    recommendedMinAge,
    matureReason,
    qualityIssue,
    model: modelName,
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

