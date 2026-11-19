/// <reference types="node" />
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SPOTIFY_SESSION_COOKIE = 'lisiere_spotify_session';
const SPOTIFY_STATE_COOKIE = 'lisiere_spotify_oauth_state';
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

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
  source: 'spotify' | 'apple' | 'audius' | 'deezer';
  streamUrl?: string;
  spotifyUri?: string;
  externalUrl?: string;
  isPreview?: boolean;
}

function getAppUrl(): string {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `http://localhost:${PORT}`;
}

function getSpotifyCallbackUrl(): string {
  return `${getAppUrl()}/auth/spotify/callback`;
}

function getCookieOptions(req: Request, maxAgeMs: number) {
  const appUrl = getAppUrl();
  const isHttps = appUrl.startsWith('https://') || req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET?.trim() ||
    process.env.SPOTIFY_CLIENT_SECRET?.trim() ||
    EPHEMERAL_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
}

function sealJson(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(encoded), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function unsealJson<T>(token: string | undefined): T | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const data = Buffer.from(dataB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
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

function getSpotifyCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.SPOTIFY_CLIENT_ID || '').trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || clientId === 'MY_SPOTIFY_CLIENT_ID') {
    return null;
  }
  return { clientId, clientSecret };
}

async function ensureFreshSpotifySession(
  req: Request,
  res: Response
): Promise<SpotifySessionPayload | null> {
  const cookies = parseCookies(req);
  const session = unsealJson<SpotifySessionPayload>(cookies[SPOTIFY_SESSION_COOKIE]);
  if (!session) return null;

  if (Date.now() < session.expiresAt - 60_000) {
    return session;
  }

  const creds = getSpotifyCredentials();
  if (!creds || !session.refreshToken) {
    return null;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
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
    res.clearCookie(SPOTIFY_SESSION_COOKIE, getCookieOptions(req, 0));
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

  res.cookie(
    SPOTIFY_SESSION_COOKIE,
    sealJson(refreshed),
    getCookieOptions(req, 30 * 24 * 60 * 60 * 1000)
  );
  return refreshed;
}

async function fetchAudiusTracks(query: string): Promise<NormalizedTrack[]> {
  const endpoints = [
    `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=Lisiere`,
  ];

  try {
    const hostsResp = await fetch('https://api.audius.co');
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
    // Fallback to primary endpoint
  }

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, { signal: AbortSignal.timeout(6500) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as {
        data?: Array<{
          id: string;
          title: string;
          duration?: number;
          genre?: string;
          permalink?: string;
          artwork?: { '150x150'?: string; '480x480'?: string };
          user?: { name?: string; handle?: string };
        }>;
      };
      const items = json.data ?? [];
      const hostOrigin = new URL(endpoint).origin;
      return items.slice(0, 12).map((item) => ({
        id: `audius_${item.id}`,
        title: item.title || 'Morceau sans titre',
        artist: item.user?.name || item.user?.handle || 'Artiste indépendant',
        album: item.genre || undefined,
        coverUrl: item.artwork?.['150x150'] || item.artwork?.['480x480'],
        durationMs: item.duration ? item.duration * 1000 : undefined,
        source: 'audius' as const,
        streamUrl: `${hostOrigin}/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=Lisiere`,
        externalUrl: item.permalink ? `https://audius.co${item.permalink}` : undefined,
        isPreview: false,
      }));
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchAppleCatalogTracks(query: string): Promise<NormalizedTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=12`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!resp.ok) {
    throw new Error('Catalogue Apple Music momentanément indisponible.');
  }
  const json = (await resp.json()) as {
    results?: Array<{
      trackId?: number;
      trackName?: string;
      artistName?: string;
      collectionName?: string;
      artworkUrl100?: string;
      trackTimeMillis?: number;
      previewUrl?: string;
      trackViewUrl?: string;
    }>;
  };
  return (json.results ?? [])
    .filter((item) => Boolean(item.trackName && (item.previewUrl || item.trackViewUrl)))
    .map((item) => ({
      id: `apple_${item.trackId ?? Math.random()}`,
      title: item.trackName || 'Titre Apple Music',
      artist: item.artistName || 'Artiste',
      album: item.collectionName,
      coverUrl: item.artworkUrl100,
      durationMs: item.trackTimeMillis,
      source: 'apple' as const,
      streamUrl: item.previewUrl,
      externalUrl: item.trackViewUrl,
      isPreview: true,
    }));
}

async function fetchDeezerTracks(query: string): Promise<NormalizedTrack[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!resp.ok) {
    throw new Error('Catalogue Deezer momentanément indisponible.');
  }
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
    streamUrl: item.preview,
    externalUrl: item.link,
    isPreview: true,
  }));
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  app.get('/api/music/providers', async (req: Request, res: Response) => {
    const creds = getSpotifyCredentials();
    const session = creds ? await ensureFreshSpotifySession(req, res) : null;
    const appleToken = (process.env.APPLE_MUSIC_DEVELOPER_TOKEN || '').trim();

    res.json({
      spotify: {
        configured: Boolean(creds),
        connected: Boolean(session),
        user: session?.user ?? null,
        callbackUrl: getSpotifyCallbackUrl(),
      },
      apple: {
        developerTokenConfigured: Boolean(appleToken),
        developerToken: appleToken || null,
        searchReady: true,
      },
    });
  });

  app.get('/api/spotify/auth-url', (req: Request, res: Response) => {
    const creds = getSpotifyCredentials();
    if (!creds) {
      res.status(400).json({
        error: 'SPOTIFY_NOT_CONFIGURED',
        callbackUrl: getSpotifyCallbackUrl(),
      });
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    res.cookie(
      SPOTIFY_STATE_COOKIE,
      sealJson({ state, createdAt: Date.now() }),
      getCookieOptions(req, 10 * 60 * 1000)
    );

    const params = new URLSearchParams({
      client_id: creds.clientId,
      response_type: 'code',
      redirect_uri: getSpotifyCallbackUrl(),
      state,
      scope:
        'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-top-read',
      show_dialog: 'true',
    });

    res.json({
      url: `https://accounts.spotify.com/authorize?${params.toString()}`,
      callbackUrl: getSpotifyCallbackUrl(),
    });
  });

  const handleSpotifyCallback = async (req: Request, res: Response) => {
    const errorParam = typeof req.query.error === 'string' ? req.query.error : '';
    if (errorParam) {
      res.send(`<!doctype html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'spotify', error: ${JSON.stringify(errorParam)} }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script><p>Connexion Spotify annulée.</p></body></html>`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookies = parseCookies(req);
    const storedState = unsealJson<{ state: string; createdAt: number }>(
      cookies[SPOTIFY_STATE_COOKIE]
    );
    res.clearCookie(SPOTIFY_STATE_COOKIE, getCookieOptions(req, 0));

    if (!code || !state || !storedState || storedState.state !== state) {
      res.status(400).send(`<!doctype html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'spotify', error: 'invalid_state' }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script><p>Session OAuth expirée ou invalide.</p></body></html>`);
      return;
    }

    const creds = getSpotifyCredentials();
    if (!creds) {
      res.status(500).send('Spotify non configuré sur le serveur.');
      return;
    }

    try {
      const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getSpotifyCallbackUrl(),
      });

      const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenBody.toString(),
      });

      if (!tokenResp.ok) {
        throw new Error('Échec d’échange du jeton Spotify.');
      }

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

      res.cookie(
        SPOTIFY_SESSION_COOKIE,
        sealJson(sessionPayload),
        getCookieOptions(req, 30 * 24 * 60 * 60 * 1000)
      );

      res.send(`<!doctype html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'spotify' }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script><p>Compte Spotify connecté. Cette fenêtre va se fermer automatiquement.</p></body></html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'oauth_failed';
      res.status(500).send(`<!doctype html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'spotify', error: ${JSON.stringify(msg)} }, '*');
          window.close();
        }
      </script><p>Erreur de connexion Spotify.</p></body></html>`);
    }
  };

  app.get(['/auth/spotify/callback', '/auth/spotify/callback/'], handleSpotifyCallback);

  app.get('/api/spotify/token', async (req: Request, res: Response) => {
    const session = await ensureFreshSpotifySession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Non connecté à Spotify.' });
      return;
    }
    res.json({
      accessToken: session.accessToken,
      product: session.user.product,
      displayName: session.user.displayName,
    });
  });

  app.get('/api/spotify/top-tracks', async (req: Request, res: Response) => {
    const session = await ensureFreshSpotifySession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Non connecté à Spotify.' });
      return;
    }

    try {
      const resp = await fetch(
        'https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=8',
        {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }
      );

      if (!resp.ok) {
        res.status(resp.status).json({ error: 'Impossible de récupérer vos titres Spotify.' });
        return;
      }

      const data = (await resp.json()) as {
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

      const tracks: NormalizedTrack[] = (data.items ?? []).map((item) => ({
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

      res.json({ tracks });
    } catch {
      res.status(502).json({ error: 'Impossible de joindre Spotify pour le moment.' });
    }
  });

  app.get('/api/spotify/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json({ tracks: [] });
      return;
    }

    const session = await ensureFreshSpotifySession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Connectez votre compte Spotify pour rechercher dans Spotify.' });
      return;
    }

    try {
      const resp = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=12`,
        {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        }
      );

      if (!resp.ok) {
        res.status(resp.status).json({ error: 'Erreur lors de la recherche Spotify.' });
        return;
      }

      const data = (await resp.json()) as {
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

      const tracks: NormalizedTrack[] = (data.tracks?.items ?? []).map((item) => ({
        id: `spotify_${item.id}`,
        title: item.name,
        artist: (item.artists ?? []).map((a) => a.name).join(', ') || 'Artiste Spotify',
        album: item.album?.name,
        coverUrl: item.album?.images?.[item.album.images.length - 1]?.url || item.album?.images?.[0]?.url,
        durationMs: item.duration_ms,
        source: 'spotify',
        spotifyUri: item.uri,
        streamUrl: item.preview_url || undefined,
        externalUrl: item.external_urls?.spotify,
        isPreview: false,
      }));

      res.json({ tracks });
    } catch {
      res.status(502).json({ error: 'Impossible de joindre Spotify pour le moment.' });
    }
  });

  app.put('/api/spotify/play', async (req: Request, res: Response) => {
    const session = await ensureFreshSpotifySession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Non connecté à Spotify.' });
      return;
    }

    const { uri, deviceId } = req.body as { uri?: string; deviceId?: string };
    if (!uri) {
      res.status(400).json({ error: 'URI Spotify manquante.' });
      return;
    }

    const endpoint = deviceId
      ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
      : 'https://api.spotify.com/v1/me/player/play';

    const resp = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [uri] }),
    });

    if (resp.status === 204 || resp.ok) {
      res.json({ ok: true });
      return;
    }

    const errText = await resp.text().catch(() => '');
    res.status(resp.status).json({
      error:
        resp.status === 403
          ? 'La lecture complète en direct nécessite un compte Spotify Premium.'
          : errText || 'Impossible de démarrer la lecture sur Spotify.',
    });
  });

  app.put('/api/spotify/pause', async (req: Request, res: Response) => {
    const session = await ensureFreshSpotifySession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Non connecté à Spotify.' });
      return;
    }

    const { deviceId } = (req.body || {}) as { deviceId?: string };
    const endpoint = deviceId
      ? `https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
      : 'https://api.spotify.com/v1/me/player/pause';

    await fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).catch(() => {});

    res.json({ ok: true });
  });

  app.post('/api/spotify/logout', (req: Request, res: Response) => {
    res.clearCookie(SPOTIFY_SESSION_COOKIE, getCookieOptions(req, 0));
    res.json({ ok: true });
  });

  app.get('/api/music/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const source = typeof req.query.source === 'string' ? req.query.source : 'audius';
    if (!q) {
      res.json({ tracks: [] });
      return;
    }

    try {
      if (source === 'apple') {
        const tracks = await fetchAppleCatalogTracks(q);
        res.json({ tracks });
        return;
      }
      if (source === 'deezer') {
        const tracks = await fetchDeezerTracks(q);
        res.json({ tracks });
        return;
      }
      const tracks = await fetchAudiusTracks(q);
      res.json({ tracks });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Erreur lors de la recherche musicale.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lisière server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
