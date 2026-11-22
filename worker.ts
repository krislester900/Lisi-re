import { analyzeModerationCaseWithGemini, verifyFirebaseIdToken } from './api-helpers.ts';

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnv {
  ASSETS?: AssetsFetcher;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  YOUTUBE_API_KEY?: string;
}

interface SpotifyUserSummary {
  id: string;
  displayName: string;
  product: string;
  avatarUrl?: string;
}

interface SpotifySessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SpotifyUserSummary;
}

interface NormalizedTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  durationMs?: number;
  source: 'spotify' | 'audius' | 'deezer' | 'youtube';
  streamUrl?: string;
  spotifyUri?: string;
  externalUrl?: string;
  isPreview?: boolean;
}

const SPOTIFY_SESSION_COOKIE = 'lisiere_spotify_session';
const SPOTIFY_STATE_COOKIE = 'lisiere_spotify_oauth_state';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonResponse(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { status, headers });
}

function htmlResponse(html: string, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(html, { status, headers });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getAesKey(env: WorkerEnv): Promise<CryptoKey | null> {
  const secret = (env.SESSION_SECRET || env.SPOTIFY_CLIENT_SECRET || '').trim();
  if (!secret) return null;
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sealJson(payload: unknown, env: WorkerEnv): Promise<string> {
  const key = await getAesKey(env);
  if (!key) throw new Error('SESSION_SECRET manquante.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(payload));
  const encryptedBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encryptedBuf))}`;
}

async function unsealJson<T>(token: string | undefined, env: WorkerEnv): Promise<T | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const key = await getAesKey(env);
  if (!key) return null;
  try {
    const iv = fromBase64Url(parts[0]);
    const cipher = fromBase64Url(parts[1]);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(cipher)
    );
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie');
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (name) {
      try {
        result[name] = decodeURIComponent(val);
      } catch {
        result[name] = val;
      }
    }
  }
  return result;
}

function buildCookieHeader(name: string, value: string, maxAgeSec: number, isHttps: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    `SameSite=${isHttps ? 'None' : 'Lax'}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

function getRequestOrigin(request: Request, env: WorkerEnv): string {
  const configured = (env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getSpotifyCredentials(env: WorkerEnv): { clientId: string; clientSecret: string } | null {
  const clientId = (env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = (env.SPOTIFY_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || clientId === 'MY_SPOTIFY_CLIENT_ID') return null;
  return { clientId, clientSecret };
}

async function ensureFreshSpotifySession(
  request: Request,
  env: WorkerEnv,
  headersToAppend: Headers
): Promise<SpotifySessionPayload | null> {
  const cookies = parseCookies(request);
  const session = await unsealJson<SpotifySessionPayload>(cookies[SPOTIFY_SESSION_COOKIE], env);
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60_000) return session;

  const creds = getSpotifyCredentials(env);
  if (!creds || !session.refreshToken) return null;

  const isHttps = request.url.startsWith('https://');
  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });

  const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!tokenResp.ok) {
    headersToAppend.append('Set-Cookie', buildCookieHeader(SPOTIFY_SESSION_COOKIE, '', 0, isHttps));
    return null;
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const refreshed: SpotifySessionPayload = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || session.refreshToken,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    user: session.user,
  };

  const sealed = await sealJson(refreshed, env);
  headersToAppend.append(
    'Set-Cookie',
    buildCookieHeader(SPOTIFY_SESSION_COOKIE, sealed, 30 * 24 * 60 * 60, isHttps)
  );
  return refreshed;
}

function buildAudiusCandidateUrls(
  trackId: string,
  stream?: { url?: string | null; mirrors?: string[] } | null
): string[] {
  const candidates: string[] = [];
  if (stream?.url) {
    candidates.push(stream.url);
    try {
      const parsed = new URL(stream.url);
      const suffix = `${parsed.pathname}${parsed.search}`;
      for (const mirror of stream.mirrors ?? []) {
        candidates.push(`${mirror.replace(/\/+$/, '')}${suffix}`);
      }
    } catch {
      // ignore invalid mirror
    }
  }
  candidates.push(`https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=Lisiere`);
  return Array.from(new Set(candidates));
}

async function fetchAudiusTracks(query: string): Promise<NormalizedTrack[]> {
  const endpoints = [
    `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=Lisiere`,
  ];

  try {
    const hostsResp = await fetch('https://api.audius.co', { signal: AbortSignal.timeout(3000) });
    if (hostsResp.ok) {
      const hostsJson = (await hostsResp.json()) as { data?: string[] };
      if (Array.isArray(hostsJson.data)) {
        for (const host of hostsJson.data.slice(0, 2)) {
          endpoints.push(
            `${host.replace(/\/+$/, '')}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=Lisiere`
          );
        }
      }
    }
  } catch {
    // Use primary endpoint
  }

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, { signal: AbortSignal.timeout(5500) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as {
        data?: Array<{
          id: string;
          title: string;
          duration?: number;
          genre?: string;
          permalink?: string;
          is_delete?: boolean;
          is_available?: boolean;
          is_streamable?: boolean;
          access?: { stream?: boolean };
          artwork?: { '150x150'?: string; '480x480'?: string };
          user?: { name?: string; handle?: string };
        }>;
      };

      const items = (json.data ?? [])
        .filter(
          (item) =>
            Boolean(item.id) &&
            !item.is_delete &&
            item.is_available !== false &&
            item.is_streamable !== false &&
            item.access?.stream !== false
        )
        .slice(0, 12);

      return items.map((item) => ({
        id: `audius_${item.id}`,
        title: item.title || 'Morceau sans titre',
        artist: item.user?.name || item.user?.handle || 'Artiste indépendant',
        album: item.genre || undefined,
        coverUrl: item.artwork?.['150x150'] || item.artwork?.['480x480'],
        durationMs: item.duration ? item.duration * 1000 : undefined,
        source: 'audius' as const,
        streamUrl: `/api/music/audius/stream/${encodeURIComponent(item.id)}`,
        externalUrl: item.permalink ? `https://audius.co${item.permalink}` : undefined,
        isPreview: false,
      }));
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchDeezerTracks(query: string): Promise<NormalizedTrack[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!resp.ok) throw new Error('Catalogue Deezer momentanément indisponible.');
  const json = (await resp.json()) as {
    data?: Array<{
      id: number;
      title: string;
      duration?: number;
      preview?: string;
      link?: string;
      artist?: { name?: string };
      album?: { title?: string; cover_medium?: string; cover_small?: string };
    }>;
  };
  return (json.data ?? []).map((item) => ({
    id: `deezer_${item.id}`,
    title: item.title,
    artist: item.artist?.name || 'Artiste',
    album: item.album?.title,
    coverUrl: item.album?.cover_medium || item.album?.cover_small,
    durationMs: item.duration ? item.duration * 1000 : undefined,
    source: 'deezer' as const,
    streamUrl: item.preview ? `/api/music/deezer/stream/${item.id}` : undefined,
    externalUrl: item.link,
    isPreview: true,
  }));
}

function parseYouTubeDurationTextToMs(text?: string): number | undefined {
  if (!text) return undefined;
  const parts = text
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return undefined;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return undefined;
}

function extractYtInitialDataJson(html: string): Record<string, unknown> | null {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = '];
  for (const marker of markers) {
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) continue;
    const jsonStart = html.indexOf('{', startIdx + marker.length);
    if (jsonStart === -1) continue;
    const scriptEnd = html.indexOf('</script>', jsonStart);
    if (scriptEnd === -1) continue;
    let rawSlice = html.slice(jsonStart, scriptEnd).trim();
    if (rawSlice.endsWith(';')) rawSlice = rawSlice.slice(0, -1).trim();
    try {
      return JSON.parse(rawSlice) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchYouTubeTracks(query: string, apiKey?: string): Promise<NormalizedTrack[]> {
  const safeQuery = query.trim().slice(0, 120);
  if (!safeQuery) return [];

  const cleanKey = (apiKey || '').trim();
  if (cleanKey) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=12&q=${encodeURIComponent(
      safeQuery
    )}&key=${encodeURIComponent(cleanKey)}`;
    const apiResp = await fetch(apiUrl, { signal: AbortSignal.timeout(6500) });
    if (apiResp.ok) {
      const json = (await apiResp.json()) as {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: {
            title?: string;
            channelTitle?: string;
            thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
          };
        }>;
      };
      return (json.items ?? [])
        .filter((item) => item.id?.videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(item.id.videoId))
        .map((item) => {
          const videoId = item.id!.videoId!;
          return {
            id: `youtube_${videoId}`,
            title: item.snippet?.title || 'Vidéo YouTube',
            artist: item.snippet?.channelTitle || 'YouTube',
            coverUrl:
              item.snippet?.thumbnails?.medium?.url ||
              item.snippet?.thumbnails?.default?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            source: 'youtube' as const,
            externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
            isPreview: false,
          };
        });
    }
  }

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    safeQuery
  )}&sp=EgIQAQ%3D%3D&hl=fr&gl=FR`;
  const resp = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(7500),
  });
  if (!resp.ok) throw new Error('Recherche YouTube momentanément indisponible.');

  const html = await resp.text();
  const data = extractYtInitialDataJson(html) as {
    contents?: {
      twoColumnSearchResultsRenderer?: {
        primaryContents?: {
          sectionListRenderer?: {
            contents?: Array<{
              itemSectionRenderer?: {
                contents?: Array<{
                  videoRenderer?: {
                    videoId?: string;
                    title?: { runs?: Array<{ text?: string }>; simpleText?: string };
                    ownerText?: { runs?: Array<{ text?: string }> };
                    longBylineText?: { runs?: Array<{ text?: string }> };
                    lengthText?: { simpleText?: string };
                    thumbnail?: { thumbnails?: Array<{ url?: string }> };
                  };
                }>;
              };
            }>;
          };
        };
      };
    };
  } | null;

  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents ?? [];

  const tracks: NormalizedTrack[] = [];
  const seenIds = new Set<string>();

  for (const section of sections) {
    for (const entry of section.itemSectionRenderer?.contents ?? []) {
      const video = entry.videoRenderer;
      const videoId = video?.videoId;
      if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId) || seenIds.has(videoId)) continue;
      seenIds.add(videoId);

      const title =
        video.title?.runs?.map((r) => r.text || '').join('').trim() ||
        video.title?.simpleText?.trim() ||
        'Titre YouTube';
      const artist =
        video.ownerText?.runs?.[0]?.text?.trim() ||
        video.longBylineText?.runs?.[0]?.text?.trim() ||
        'Chaîne YouTube';
      const durationMs = parseYouTubeDurationTextToMs(video.lengthText?.simpleText);
      const thumbUrl =
        video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url ||
        video.thumbnail?.thumbnails?.[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      tracks.push({
        id: `youtube_${videoId}`,
        title,
        artist,
        coverUrl: thumbUrl,
        durationMs,
        source: 'youtube',
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        isPreview: false,
      });

      if (tracks.length >= 12) return tracks;
    }
  }

  return tracks;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/moderation/analyze' && request.method === 'POST') {
      const authHeader = request.headers.get('authorization') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!bearerToken) {
        return jsonResponse(
          { error: 'Authentification requise pour lancer l’analyse IA.' },
          401
        );
      }
      const caller = await verifyFirebaseIdToken(bearerToken);
      if (!caller) {
        return jsonResponse({ error: 'Session expirée ou jeton Firebase invalide.' }, 401);
      }

      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: 'Requête JSON invalide.' }, 400);
      }

      try {
        const analysis = await analyzeModerationCaseWithGemini({
          apiKey: env.GEMINI_API_KEY || '',
          targetType: typeof body.targetType === 'string' ? body.targetType : 'story',
          category: typeof body.category === 'string' ? body.category : 'autre',
          targetUserName:
            typeof body.targetUserName === 'string' ? body.targetUserName : 'Membre',
          targetExcerpt: typeof body.targetExcerpt === 'string' ? body.targetExcerpt : '',
          description: typeof body.description === 'string' ? body.description : '',
        });
        return jsonResponse({ analysis });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const status = typeof e.statusCode === 'number' ? e.statusCode : 502;
        return jsonResponse(
          { error: e.message || 'Impossible de contacter le service de modération IA.' },
          status
        );
      }
    }

    if (pathname === '/api/music/providers') {
      const headers = new Headers();
      const creds = getSpotifyCredentials(env);
      const session = creds ? await ensureFreshSpotifySession(request, env, headers) : null;
      const callbackUrl = `${getRequestOrigin(request, env)}/auth/spotify/callback`;
      return jsonResponse(
        {
          spotify: {
            configured: Boolean(creds),
            connected: Boolean(session),
            user: session?.user ?? null,
            callbackUrl,
          },
        },
        200,
        headers
      );
    }

    if (pathname === '/api/music/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
      const source = url.searchParams.get('source') || 'audius';
      if (!q) return jsonResponse({ tracks: [] });
      try {
        if (source === 'deezer') return jsonResponse({ tracks: await fetchDeezerTracks(q) });
        if (source === 'youtube') {
          return jsonResponse({ tracks: await fetchYouTubeTracks(q, env.YOUTUBE_API_KEY) });
        }
        return jsonResponse({ tracks: await fetchAudiusTracks(q) });
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Erreur lors de la recherche musicale.' },
          502
        );
      }
    }

    if (pathname.startsWith('/api/music/audius/stream/')) {
      const rawId = pathname.slice('/api/music/audius/stream/'.length).trim();
      const trackId = decodeURIComponent(rawId);
      if (!trackId || !/^[a-zA-Z0-9_-]+$/.test(trackId)) {
        return jsonResponse({ error: 'Identifiant de piste invalide.' }, 400);
      }

      let candidates: string[] = [];
      try {
        const metaResp = await fetch(
          `https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}?app_name=Lisiere`,
          { signal: AbortSignal.timeout(3500) }
        );
        if (metaResp.ok) {
          const metaJson = (await metaResp.json()) as {
            data?: {
              is_delete?: boolean;
              is_available?: boolean;
              is_streamable?: boolean;
              stream?: { url?: string | null; mirrors?: string[] } | null;
            };
          };
          const track = metaJson.data;
          if (
            !track ||
            track.is_delete ||
            track.is_available === false ||
            track.is_streamable === false
          ) {
            return jsonResponse({ error: 'Ce morceau n’est plus disponible sur Audius.' }, 404);
          }
          candidates = buildAudiusCandidateUrls(trackId, track.stream);
        }
      } catch {
        // Fallback below
      }
      if (candidates.length === 0) {
        candidates = [`https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=Lisiere`];
      }

      const rangeHeader = request.headers.get('range');
      for (const candidateUrl of candidates.slice(0, 4)) {
        try {
          const upstream = await fetch(candidateUrl, {
            headers: rangeHeader ? { Range: rangeHeader } : undefined,
            redirect: 'follow',
            signal: AbortSignal.timeout(6000),
          });
          if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel().catch(() => {});
            continue;
          }
          const ct = upstream.headers.get('content-type') || 'audio/mpeg';
          if (ct.includes('application/json') || ct.includes('text/html')) {
            await upstream.body.cancel().catch(() => {});
            continue;
          }
          const outHeaders = new Headers();
          outHeaders.set('Content-Type', ct);
          outHeaders.set('Cache-Control', 'public, max-age=300');
          for (const h of ['content-length', 'content-range', 'accept-ranges']) {
            const val = upstream.headers.get(h);
            if (val) outHeaders.set(h, val);
          }
          return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
        } catch {
          continue;
        }
      }
      return jsonResponse({ error: 'Flux audio indisponible sur Audius.' }, 502);
    }

    if (pathname.startsWith('/api/music/deezer/stream/')) {
      const trackId = pathname.slice('/api/music/deezer/stream/'.length).trim();
      if (!trackId || !/^[0-9]+$/.test(trackId)) {
        return jsonResponse({ error: 'Identifiant Deezer invalide.' }, 400);
      }
      try {
        const metaResp = await fetch(`https://api.deezer.com/track/${trackId}`, {
          signal: AbortSignal.timeout(6500),
        });
        if (!metaResp.ok) return jsonResponse({ error: 'Extrait Deezer introuvable.' }, 404);
        const meta = (await metaResp.json()) as { preview?: string; error?: unknown };
        if (!meta.preview || meta.error) {
          return jsonResponse(
            { error: 'Aucun extrait audio disponible sur Deezer pour ce titre.' },
            404
          );
        }
        const rangeHeader = request.headers.get('range');
        const upstream = await fetch(meta.preview, {
          headers: rangeHeader ? { Range: rangeHeader } : undefined,
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel().catch(() => {});
          return jsonResponse({ error: 'Flux extrait Deezer indisponible.' }, 502);
        }
        const outHeaders = new Headers();
        outHeaders.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
        outHeaders.set('Cache-Control', 'private, max-age=120');
        for (const h of ['content-length', 'content-range', 'accept-ranges']) {
          const val = upstream.headers.get(h);
          if (val) outHeaders.set(h, val);
        }
        return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
      } catch {
        return jsonResponse({ error: 'Flux extrait Deezer momentanément indisponible.' }, 502);
      }
    }

    if (pathname === '/api/spotify/auth-url') {
      const creds = getSpotifyCredentials(env);
      const callbackUrl = `${getRequestOrigin(request, env)}/auth/spotify/callback`;
      if (!creds) {
        return jsonResponse({ error: 'SPOTIFY_NOT_CONFIGURED', callbackUrl }, 400);
      }
      const stateBytes = crypto.getRandomValues(new Uint8Array(16));
      const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const sealedState = await sealJson({ state, createdAt: Date.now() }, env);
      const headers = new Headers();
      headers.append(
        'Set-Cookie',
        buildCookieHeader(SPOTIFY_STATE_COOKIE, sealedState, 600, request.url.startsWith('https://'))
      );
      const params = new URLSearchParams({
        client_id: creds.clientId,
        response_type: 'code',
        redirect_uri: callbackUrl,
        state,
        scope:
          'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-top-read',
        show_dialog: 'true',
      });
      return jsonResponse(
        { url: `https://accounts.spotify.com/authorize?${params.toString()}`, callbackUrl },
        200,
        headers
      );
    }

    if (pathname === '/auth/spotify/callback' || pathname === '/auth/spotify/callback/') {
      const isHttps = request.url.startsWith('https://');
      const errorParam = url.searchParams.get('error') || '';
      if (errorParam) {
        return htmlResponse(
          `<!doctype html><html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_ERROR',provider:'spotify',error:${JSON.stringify(
            errorParam
          )}},'*');window.close();}else{window.location.href='/';}</script><p>Connexion Spotify annulée.</p></body></html>`
        );
      }
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      const cookies = parseCookies(request);
      const storedState = await unsealJson<{ state: string; createdAt: number }>(
        cookies[SPOTIFY_STATE_COOKIE],
        env
      );
      const headers = new Headers();
      headers.append('Set-Cookie', buildCookieHeader(SPOTIFY_STATE_COOKIE, '', 0, isHttps));

      if (!code || !state || !storedState || storedState.state !== state) {
        return htmlResponse(
          `<!doctype html><html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_ERROR',provider:'spotify',error:'invalid_state'},'*');window.close();}else{window.location.href='/';}</script><p>Session OAuth expirée ou invalide.</p></body></html>`,
          400,
          headers
        );
      }
      const creds = getSpotifyCredentials(env);
      if (!creds) return new Response('Spotify non configuré.', { status: 500, headers });

      try {
        const callbackUrl = `${getRequestOrigin(request, env)}/auth/spotify/callback`;
        const basic = btoa(`${creds.clientId}:${creds.clientSecret}`);
        const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl,
          }).toString(),
        });
        if (!tokenResp.ok) throw new Error('Échec d’échange du jeton Spotify.');
        const tokenData = (await tokenResp.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };
        const meResp = await fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const meData = meResp.ok
          ? ((await meResp.json()) as {
              id?: string;
              display_name?: string;
              product?: string;
              images?: Array<{ url: string }>;
            })
          : {};
        const sessionPayload: SpotifySessionPayload = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || '',
          expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
          user: {
            id: meData.id || 'spotify_user',
            displayName: meData.display_name || 'Auditeur Spotify',
            product: meData.product || 'open',
            avatarUrl: meData.images?.[0]?.url,
          },
        };
        const sealed = await sealJson(sessionPayload, env);
        headers.append(
          'Set-Cookie',
          buildCookieHeader(SPOTIFY_SESSION_COOKIE, sealed, 30 * 24 * 60 * 60, isHttps)
        );
        return htmlResponse(
          `<!doctype html><html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_SUCCESS',provider:'spotify'},'*');window.close();}else{window.location.href='/';}</script><p>Compte Spotify connecté.</p></body></html>`,
          200,
          headers
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'oauth_failed';
        return htmlResponse(
          `<!doctype html><html><body><script>if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_ERROR',provider:'spotify',error:${JSON.stringify(
            msg
          )}},'*');window.close();}</script><p>Erreur Spotify.</p></body></html>`,
          500,
          headers
        );
      }
    }

    if (pathname.startsWith('/api/spotify/')) {
      const headers = new Headers();
      if (pathname === '/api/spotify/logout' && request.method === 'POST') {
        headers.append(
          'Set-Cookie',
          buildCookieHeader(SPOTIFY_SESSION_COOKIE, '', 0, request.url.startsWith('https://'))
        );
        return jsonResponse({ ok: true }, 200, headers);
      }

      const session = await ensureFreshSpotifySession(request, env, headers);
      if (!session) return jsonResponse({ error: 'Non connecté à Spotify.' }, 401, headers);

      if (pathname === '/api/spotify/token') {
        return jsonResponse(
          {
            accessToken: session.accessToken,
            product: session.user.product,
            displayName: session.user.displayName,
          },
          200,
          headers
        );
      }

      if (pathname === '/api/spotify/top-tracks' || pathname === '/api/spotify/search') {
        const target =
          pathname === '/api/spotify/top-tracks'
            ? 'https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=8'
            : `https://api.spotify.com/v1/search?q=${encodeURIComponent(
                (url.searchParams.get('q') || '').trim()
              )}&type=track&limit=12`;
        if (pathname === '/api/spotify/search' && !(url.searchParams.get('q') || '').trim()) {
          return jsonResponse({ tracks: [] }, 200, headers);
        }
        const resp = await fetch(target, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!resp.ok) {
          return jsonResponse({ error: 'Erreur Spotify.' }, resp.status, headers);
        }
        const raw = (await resp.json()) as {
          items?: Array<{
            id: string;
            name: string;
            uri: string;
            duration_ms?: number;
            preview_url?: string | null;
            external_urls?: { spotify?: string };
            artists?: Array<{ name: string }>;
            album?: { name?: string; images?: Array<{ url: string }> };
          }>;
          tracks?: {
            items?: Array<{
              id: string;
              name: string;
              uri: string;
              duration_ms?: number;
              preview_url?: string | null;
              external_urls?: { spotify?: string };
              artists?: Array<{ name: string }>;
              album?: { name?: string; images?: Array<{ url: string }> };
            }>;
          };
        };
        const items = raw.items ?? raw.tracks?.items ?? [];
        const tracks: NormalizedTrack[] = items.map((item) => ({
          id: `spotify_${item.id}`,
          title: item.name,
          artist: (item.artists ?? []).map((a) => a.name).join(', ') || 'Artiste Spotify',
          album: item.album?.name,
          coverUrl:
            item.album?.images?.[item.album.images.length - 1]?.url || item.album?.images?.[0]?.url,
          durationMs: item.duration_ms,
          source: 'spotify',
          spotifyUri: item.uri,
          streamUrl: item.preview_url || undefined,
          externalUrl: item.external_urls?.spotify,
          isPreview: false,
        }));
        return jsonResponse({ tracks }, 200, headers);
      }

      if (pathname === '/api/spotify/play' && request.method === 'PUT') {
        const body = (await request.json().catch(() => ({}))) as { uri?: string; deviceId?: string };
        if (!body.uri) return jsonResponse({ error: 'URI Spotify manquante.' }, 400, headers);
        const endpoint = body.deviceId
          ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(body.deviceId)}`
          : 'https://api.spotify.com/v1/me/player/play';
        const resp = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [body.uri] }),
        });
        if (resp.status === 204 || resp.ok) return jsonResponse({ ok: true }, 200, headers);
        return jsonResponse({ error: 'Impossible de démarrer la lecture Spotify.' }, resp.status, headers);
      }

      if (pathname === '/api/spotify/pause' && request.method === 'PUT') {
        const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
        const endpoint = body.deviceId
          ? `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(body.deviceId)}`
          : 'https://api.spotify.com/v1/me/player/pause';
        await fetch(endpoint, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }).catch(() => {});
        return jsonResponse({ ok: true }, 200, headers);
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Ressource introuvable.', { status: 404 });
  },
};
