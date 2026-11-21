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

async function parseJsonSafe<T>(resp: Response, fallbackError: string): Promise<T> {
  const contentType = resp.headers.get('content-type') || '';
  const rawText = await resp.text();
  if (!contentType.includes('application/json') && rawText.trimStart().startsWith('<')) {
    throw new Error(
      'Le service musical du serveur est indisponible sur cet hébergement (API introuvable). Redéployez le projet complet avec ses fonctions serveur.'
    );
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

export async function fetchMusicProvidersStatus(): Promise<MusicProvidersStatus> {
  const resp = await fetch('/api/music/providers', { credentials: 'include' });
  if (!resp.ok) {
    throw new Error('Impossible de vérifier les services musicaux.');
  }
  return parseJsonSafe<MusicProvidersStatus>(
    resp,
    'Impossible de vérifier les services musicaux.'
  );
}

export async function fetchSpotifyAuthUrl(): Promise<{ url: string; callbackUrl: string }> {
  const resp = await fetch('/api/spotify/auth-url', { credentials: 'include' });
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

  const resp = await fetch(endpoint, { credentials: 'include' });
  const data = await parseJsonSafe<{ tracks?: ReadingTrack[]; error?: string }>(
    resp,
    'Recherche musicale indisponible.'
  );
  if (!resp.ok) {
    throw new Error(data.error || 'Recherche musicale indisponible.');
  }
  return data.tracks ?? [];
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
