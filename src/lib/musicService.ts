export type MusicProviderTab = 'audius' | 'youtube' | 'spotify' | 'deezer' | 'local' | 'link';

export interface ReadingTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  durationMs?: number;
  source: 'spotify' | 'audius' | 'deezer' | 'youtube' | 'local' | 'link';
  streamUrl?: string;
  spotifyUri?: string;
  externalUrl?: string;
  isPreview?: boolean;
}

export interface SpotifyProviderState {
  configured: boolean;
  connected: boolean;
  callbackUrl: string;
  user: {
    id: string;
    displayName: string;
    product: string;
    avatarUrl?: string;
  } | null;
}

export interface MusicProvidersStatus {
  spotify: SpotifyProviderState;
}

export const READING_MOOD_PRESETS: Array<{ label: string; query: string }> = [
  { label: 'Piano doux', query: 'piano ambient reading' },
  { label: 'Pluie & nuit', query: 'rain ambient sleep' },
  { label: 'Jazz feutré', query: 'calm jazz instrumental' },
  { label: 'Classique', query: 'debussy chopin nocturne' },
];

class MissingServerApiError extends Error {
  constructor() {
    super(
      'Le service serveur (/api) n’est pas actif sur cet hébergement statique. Activez le Worker Cloudflare (wrangler.jsonc) ou utilisez « Musique gratuite » / « Mon téléphone ».'
    );
    this.name = 'MissingServerApiError';
  }
}

async function parseJsonSafe<T>(resp: Response, fallbackError: string): Promise<T> {
  const contentType = resp.headers.get('content-type') || '';
  const rawText = await resp.text();
  if (
    (!contentType.includes('application/json') && rawText.trimStart().startsWith('<')) ||
    resp.status === 404 ||
    resp.status === 405
  ) {
    throw new MissingServerApiError();
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

async function searchAudiusDirectly(query: string): Promise<ReadingTrack[]> {
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
    // Fallback to primary discovery endpoint
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
          stream?: { url?: string | null } | null;
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
        streamUrl:
          item.stream?.url ||
          `https://api.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=Lisiere`,
        externalUrl: item.permalink ? `https://audius.co${item.permalink}` : undefined,
        isPreview: false,
      }));
    } catch {
      continue;
    }
  }

  throw new Error('Catalogue Audius momentanément indisponible.');
}

export async function fetchMusicProvidersStatus(): Promise<MusicProvidersStatus> {
  try {
    const resp = await fetch('/api/music/providers', { credentials: 'include' });
    if (!resp.ok) {
      return { spotify: { configured: false, connected: false, callbackUrl: '', user: null } };
    }
    return await parseJsonSafe<MusicProvidersStatus>(
      resp,
      'Impossible de vérifier les services musicaux.'
    );
  } catch {
    return { spotify: { configured: false, connected: false, callbackUrl: '', user: null } };
  }
}

export async function fetchSpotifyAuthUrl(): Promise<{ url: string; callbackUrl: string }> {
  const originParam =
    typeof window !== 'undefined' && window.location?.origin
      ? `?origin=${encodeURIComponent(window.location.origin)}`
      : '';
  const resp = await fetch(`/api/spotify/auth-url${originParam}`, { credentials: 'include' });
  const data = await parseJsonSafe<{
    url?: string;
    error?: string;
    callbackUrl?: string;
  }>(resp, 'Connexion Spotify impossible.');
  if (!resp.ok || !data.url) {
    const err = new Error(
      data.error === 'SPOTIFY_NOT_CONFIGURED'
        ? 'SPOTIFY_NOT_CONFIGURED'
        : data.error || 'Connexion Spotify impossible.'
    ) as Error & { callbackUrl?: string };
    err.callbackUrl = data.callbackUrl;
    throw err;
  }
  return { url: data.url, callbackUrl: data.callbackUrl || '' };
}

export async function disconnectSpotifyAccount(): Promise<void> {
  await fetch('/api/spotify/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export async function fetchSpotifyToken(): Promise<{
  accessToken: string;
  product: string;
  displayName: string;
}> {
  const resp = await fetch('/api/spotify/token', { credentials: 'include' });
  if (!resp.ok) {
    throw new Error('Session Spotify expirée.');
  }
  return parseJsonSafe<{
    accessToken: string;
    product: string;
    displayName: string;
  }>(resp, 'Session Spotify expirée.');
}

export async function searchMusicCatalog(
  query: string,
  provider: 'spotify' | 'audius' | 'deezer' | 'youtube'
): Promise<ReadingTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const endpoint =
    provider === 'spotify'
      ? `/api/spotify/search?q=${encodeURIComponent(trimmed)}`
      : `/api/music/search?source=${encodeURIComponent(provider)}&q=${encodeURIComponent(trimmed)}`;

  try {
    const resp = await fetch(endpoint, { credentials: 'include' });
    const data = await parseJsonSafe<{ tracks?: ReadingTrack[]; error?: string }>(
      resp,
      'Recherche musicale indisponible.'
    );
    if (!resp.ok) {
      throw new Error(data.error || 'Recherche musicale indisponible.');
    }
    return data.tracks ?? [];
  } catch (err) {
    if (err instanceof MissingServerApiError && provider === 'audius') {
      return searchAudiusDirectly(trimmed);
    }
    throw err;
  }
}

export async function fetchSpotifyTopTracks(): Promise<ReadingTrack[]> {
  const resp = await fetch('/api/spotify/top-tracks', { credentials: 'include' });
  const data = await parseJsonSafe<{ tracks?: ReadingTrack[]; error?: string }>(
    resp,
    'Impossible de charger vos titres Spotify.'
  );
  if (!resp.ok) {
    throw new Error(data.error || 'Impossible de charger vos titres Spotify.');
  }
  return data.tracks ?? [];
}

export async function startSpotifyPlayback(uri: string, deviceId?: string): Promise<void> {
  const resp = await fetch('/api/spotify/play', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ uri, deviceId }),
  });
  if (!resp.ok) {
    const data = await parseJsonSafe<{ error?: string }>(
      resp,
      'Impossible de lancer ce titre sur Spotify.'
    ).catch(() => ({} as { error?: string }));
    throw new Error(data.error || 'Impossible de lancer ce titre sur Spotify.');
  }
}

export async function pauseSpotifyPlayback(deviceId?: string): Promise<void> {
  await fetch('/api/spotify/pause', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ deviceId }),
  });
}

let spotifySdkPromise: Promise<void> | null = null;

export function loadSpotifyWebPlaybackSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const win = window as unknown as { Spotify?: { Player?: unknown }; onSpotifyWebPlaybackSDKReady?: () => void };
  if (win.Spotify?.Player) {
    return Promise.resolve();
  }
  if (spotifySdkPromise) return spotifySdkPromise;

  spotifySdkPromise = new Promise<void>((resolve, reject) => {
    win.onSpotifyWebPlaybackSDKReady = () => resolve();
    const existing = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.onerror = () => reject(new Error('Impossible de charger le lecteur Spotify Web SDK.'));
      document.body.appendChild(script);
    }
  });

  return spotifySdkPromise;
}
