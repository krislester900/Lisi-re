export type MusicProviderTab = 'spotify' | 'apple' | 'audius' | 'deezer' | 'link';

export interface ReadingTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  durationMs?: number;
  source: 'spotify' | 'apple' | 'audius' | 'deezer' | 'link';
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

export interface AppleProviderState {
  developerTokenConfigured: boolean;
  developerToken: string | null;
  searchReady: boolean;
}

export interface MusicProvidersStatus {
  spotify: SpotifyProviderState;
  apple: AppleProviderState;
}

export const READING_MOOD_PRESETS: Array<{ label: string; query: string }> = [
  { label: 'Piano doux', query: 'piano ambient reading' },
  { label: 'Pluie & nuit', query: 'rain ambient sleep' },
  { label: 'Jazz feutré', query: 'calm jazz instrumental' },
  { label: 'Classique', query: 'debussy chopin nocturne' },
];

export async function fetchMusicProvidersStatus(): Promise<MusicProvidersStatus> {
  const resp = await fetch('/api/music/providers', { credentials: 'include' });
  if (!resp.ok) {
    throw new Error('Impossible de vérifier les services musicaux.');
  }
  return (await resp.json()) as MusicProvidersStatus;
}

export async function fetchSpotifyAuthUrl(): Promise<{ url: string; callbackUrl: string }> {
  const resp = await fetch('/api/spotify/auth-url', { credentials: 'include' });
  const data = (await resp.json()) as {
    url?: string;
    error?: string;
    callbackUrl?: string;
  };
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
  return (await resp.json()) as {
    accessToken: string;
    product: string;
    displayName: string;
  };
}

export async function searchMusicCatalog(
  query: string,
  provider: 'spotify' | 'apple' | 'audius' | 'deezer'
): Promise<ReadingTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const endpoint =
    provider === 'spotify'
      ? `/api/spotify/search?q=${encodeURIComponent(trimmed)}`
      : `/api/music/search?source=${encodeURIComponent(provider)}&q=${encodeURIComponent(trimmed)}`;

  const resp = await fetch(endpoint, { credentials: 'include' });
  const data = (await resp.json()) as { tracks?: ReadingTrack[]; error?: string };
  if (!resp.ok) {
    throw new Error(data.error || 'Recherche musicale indisponible.');
  }
  return data.tracks ?? [];
}

export async function fetchSpotifyTopTracks(): Promise<ReadingTrack[]> {
  const resp = await fetch('/api/spotify/top-tracks', { credentials: 'include' });
  const data = (await resp.json()) as { tracks?: ReadingTrack[]; error?: string };
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
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
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

let appleMusicKitPromise: Promise<void> | null = null;

export function loadAppleMusicKitSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const win = window as unknown as { MusicKit?: unknown };
  if (win.MusicKit) return Promise.resolve();
  if (appleMusicKitPromise) return appleMusicKitPromise;

  appleMusicKitPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"]'
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger Apple MusicKit.'));
      document.body.appendChild(script);
    } else {
      resolve();
    }
  });

  return appleMusicKitPromise;
}
