import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Link2,
  Music2,
  Pause,
  Play,
  Search,
  Unplug,
  X,
} from 'lucide-react';
import {
  disconnectSpotifyAccount,
  fetchMusicProvidersStatus,
  fetchSpotifyAuthUrl,
  fetchSpotifyTopTracks,
  MusicProvidersStatus,
  MusicProviderTab,
  READING_MOOD_PRESETS,
  ReadingTrack,
  searchMusicCatalog,
} from '../lib/musicService';

export interface PickedWallMusic {
  title: string;
  artist: string;
  mediaUrl: string;
  sourceLabel: string;
}

interface MusicCatalogPickerProps {
  selectedUrl?: string;
  selectedTitle?: string;
  onSelectTrack: (picked: PickedWallMusic) => void;
  onManualUrlChange?: (url: string) => void;
  maxUrlLength?: number;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function resolvePlayableUrlForSaving(track: ReadingTrack, maxLen: number): string {
  // For Spotify: open.spotify.com URLs play cleanly via embed/OAuth even after preview expiry and stay well under 500 chars
  // For Audius: streamUrl is /api/music/audius/stream/{id} (full track, plays directly in <audio>)
  // For Deezer: streamUrl is the audio preview URL (.mp3) so the wall player plays natively without login
  const preferred =
    track.source === 'spotify'
      ? track.externalUrl || track.streamUrl || ''
      : track.streamUrl || track.externalUrl || '';
  return preferred.slice(0, maxLen);
}

const SOURCE_LABELS: Record<ReadingTrack['source'], string> = {
  audius: 'Audius (gratuit)',
  spotify: 'Spotify',
  deezer: 'Deezer',
  link: 'Lien audio',
};

export function MusicCatalogPicker({
  selectedUrl = '',
  selectedTitle = '',
  onSelectTrack,
  onManualUrlChange,
  maxUrlLength = 500,
}: MusicCatalogPickerProps) {
  const [providerTab, setProviderTab] = useState<MusicProviderTab>('audius');
  const [providers, setProviders] = useState<MusicProvidersStatus | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<ReadingTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = '';
    }
    setPreviewTrackId(null);
    setPreviewPlaying(false);
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      const status = await fetchMusicProvidersStatus();
      setProviders(status);
    } catch {
      // Ignore transient lookup issues
    }
  }, []);

  useEffect(() => {
    void refreshProviders();
    return () => {
      stopPreview();
    };
  }, [refreshProviders, stopPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'spotify') {
        setAuthNotice(null);
        void refreshProviders();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setAuthNotice('Connexion Spotify annulée ou refusée.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshProviders]);

  const runSearch = useCallback(
    async (query: string, targetTab: MusicProviderTab) => {
      const trimmed = query.trim();
      if (!trimmed || targetTab === 'link') return;
      setSearchError(null);
      setSearching(true);
      try {
        const tracks = await searchMusicCatalog(trimmed, targetTab);
        setSearchResults(tracks);
        if (tracks.length === 0) {
          setSearchError('Aucun titre trouvé pour cette recherche.');
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Recherche musicale impossible.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    []
  );

  // Load ambient starter tracks on Audius so the picker is alive immediately
  const loadedInitialRef = useRef(false);
  useEffect(() => {
    if (loadedInitialRef.current) return;
    loadedInitialRef.current = true;
    void runSearch('piano ambient', 'audius');
  }, [runSearch]);

  // Load user's top tracks automatically when switching to Spotify while connected
  useEffect(() => {
    if (providerTab !== 'spotify' || !providers?.spotify.connected || searchInput.trim()) {
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    void fetchSpotifyTopTracks()
      .then((tracks) => {
        if (!cancelled) {
          setSearchResults(tracks);
        }
      })
      .catch(() => {
        // User can still search catalog manually
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerTab, providers?.spotify.connected, searchInput]);

  const handleConnectSpotify = async () => {
    setAuthNotice(null);
    try {
      const { url } = await fetchSpotifyAuthUrl();
      const popup = window.open(url, 'spotify_oauth_popup', 'width=540,height=720');
      if (!popup) {
        setAuthNotice(
          'Votre navigateur a bloqué la fenêtre Spotify. Autorisez les pop-ups pour connecter votre compte.'
        );
      }
    } catch (err) {
      const e = err as Error;
      if (e.message === 'SPOTIFY_NOT_CONFIGURED') {
        setAuthNotice(
          'Les clés Spotify ne sont pas encore configurées sur le serveur. Audius (gratuit, morceaux complets) et Deezer fonctionnent déjà sans compte.'
        );
      } else {
        setAuthNotice(e.message || 'Impossible de lancer la connexion Spotify.');
      }
    }
  };

  const handleDisconnectSpotify = async () => {
    await disconnectSpotifyAccount();
    await refreshProviders();
    if (providerTab === 'spotify') {
      setSearchResults([]);
    }
  };

  const handleTogglePreview = async (track: ReadingTrack) => {
    if (previewTrackId === track.id && previewPlaying) {
      previewAudioRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }

    if (!track.streamUrl || !previewAudioRef.current) {
      setAuthNotice(
        track.source === 'spotify'
          ? 'Aperçu direct non fourni pour ce titre Spotify — sélectionnez-le pour l’intégrer sur votre mur.'
          : 'Aucun aperçu audio direct disponible pour ce morceau.'
      );
      return;
    }

    try {
      previewAudioRef.current.src = track.streamUrl;
      previewAudioRef.current.load();
      await previewAudioRef.current.play();
      setPreviewTrackId(track.id);
      setPreviewPlaying(true);
    } catch {
      setAuthNotice('Impossible de lire cet aperçu audio sur votre navigateur.');
      setPreviewPlaying(false);
    }
  };

  const handlePickTrack = (track: ReadingTrack) => {
    stopPreview();
    const mediaUrl = resolvePlayableUrlForSaving(track, maxUrlLength);
    onSelectTrack({
      title: track.title.slice(0, 120),
      artist: track.artist.slice(0, 100),
      mediaUrl,
      sourceLabel: SOURCE_LABELS[track.source],
    });
  };

  return (
    <div className="space-y-3">
      <audio
        ref={previewAudioRef}
        onEnded={() => {
          setPreviewPlaying(false);
          setPreviewTrackId(null);
        }}
        onError={() => {
          setPreviewPlaying(false);
          setPreviewTrackId(null);
        }}
        className="hidden"
      />

      {/* Provider selector tabs */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Catalogue musical">
        {(
          [
            { id: 'audius', label: 'Audius · Gratuit' },
            { id: 'spotify', label: 'Spotify' },
            { id: 'deezer', label: 'Deezer' },
            { id: 'link', label: 'SoundCloud / Lien' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={providerTab === tab.id}
            onClick={() => {
              setProviderTab(tab.id);
              setSearchError(null);
              setAuthNotice(null);
              if (tab.id !== 'link' && tab.id !== 'spotify') {
                void runSearch(searchInput.trim() || 'piano ambient', tab.id);
              }
            }}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              providerTab === tab.id
                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Spotify OAuth Connection Bar */}
      {providerTab === 'spotify' && (
        <div className="rounded-md border border-stone-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {providers?.spotify.connected && providers.spotify.user ? (
            <>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-900 truncate">
                  Connecté : {providers.spotify.user.displayName}
                </p>
                <p className="text-[11px] text-stone-600">
                  Vos titres les plus écoutés et la recherche Spotify sont prêts ci-dessous.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDisconnectSpotify()}
                className="min-h-[34px] px-3 py-1 rounded-md border border-stone-300 bg-[#FBF9F5] text-xs font-medium text-stone-700 hover:text-red-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>Déconnecter</span>
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-900">
                  Connecter votre compte Spotify
                </p>
                <p className="text-[11px] text-stone-600">
                  Accédez à vos titres préférés et cherchez dans le catalogue Spotify, ou utilisez Audius gratuitement sans compte.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleConnectSpotify()}
                className="min-h-[36px] px-3.5 py-1.5 rounded-md bg-[#1B365D] text-white hover:bg-[#132744] text-xs font-medium whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                Connecter Spotify
              </button>
            </>
          )}
        </div>
      )}

      {/* Audius / Deezer info note */}
      {providerTab === 'audius' && (
        <p className="text-[11px] text-stone-600">
          Audius est ouvert sans clé ni abonnement : chaque morceau se lit en entier directement sur votre mur et en mode zen.
        </p>
      )}
      {providerTab === 'deezer' && (
        <p className="text-[11px] text-stone-600">
          Recherche dans le catalogue Deezer avec extrait audio lisible directement sur votre mur.
        </p>
      )}

      {authNotice && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 flex items-start justify-between gap-2"
        >
          <span>{authNotice}</span>
          <button
            type="button"
            onClick={() => setAuthNotice(null)}
            aria-label="Fermer l’avis"
            className="text-amber-800 hover:text-amber-950 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {providerTab === 'link' ? (
        <div className="space-y-2">
          <div className="relative">
            <Link2 className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              maxLength={maxUrlLength}
              value={selectedUrl}
              onChange={(e) => onManualUrlChange?.(e.target.value)}
              placeholder="Coller un lien SoundCloud, Spotify, Deezer ou MP3…"
              aria-label="Lien musical personnalisé"
              className="w-full min-h-[40px] pl-8 pr-3 py-2 bg-white border border-stone-200 rounded-md text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
            />
          </div>
          <p className="text-[11px] text-stone-500">
            Le lecteur du mur n’affiche que le titre, l’artiste et une onde sonore épurée.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Search Input (div instead of nested form so parent modals work cleanly) */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearch(searchInput, providerTab);
                  }
                }}
                placeholder={
                  providerTab === 'spotify'
                    ? 'Chercher un titre ou artiste sur Spotify…'
                    : providerTab === 'deezer'
                      ? 'Chercher sur Deezer…'
                      : 'Chercher un morceau ou un artiste sur Audius…'
                }
                aria-label="Rechercher une musique pour votre mur"
                className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
              />
            </div>
            <button
              type="button"
              disabled={searching || !searchInput.trim()}
              onClick={() => void runSearch(searchInput, providerTab)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#1B365D] text-white hover:bg-[#132744] disabled:opacity-50 text-xs font-medium whitespace-nowrap shrink-0"
            >
              {searching ? 'Recherche…' : 'Chercher'}
            </button>
          </div>

          {/* Mood presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-500 mr-1">Ambiances :</span>
            {READING_MOOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSearchInput(preset.query);
                  void runSearch(preset.query, providerTab);
                }}
                className="min-h-[28px] px-2.5 py-0.5 rounded border border-stone-200 bg-white text-[11px] text-stone-700 hover:border-stone-400 hover:text-stone-900 whitespace-nowrap shrink-0"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {searchError && (
            <p role="alert" className="text-xs text-red-700">
              {searchError}
            </p>
          )}

          {searchResults.length > 0 && (
            <ul className="divide-y divide-stone-200 border border-stone-200 rounded-md bg-white max-h-56 overflow-y-auto">
              {searchResults.map((track) => {
                const candidateUrl = resolvePlayableUrlForSaving(track, maxUrlLength);
                const isSelected =
                  Boolean(selectedUrl && candidateUrl && selectedUrl === candidateUrl) ||
                  Boolean(
                    selectedTitle &&
                      selectedTitle.trim().toLowerCase() === track.title.trim().toLowerCase() &&
                      candidateUrl
                  );
                const isPreviewing = previewTrackId === track.id && previewPlaying;

                return (
                  <li
                    key={track.id}
                    className={`flex items-center justify-between gap-2.5 px-3 py-2 transition-colors ${
                      isSelected ? 'bg-[#F3F6FA]' : 'hover:bg-[#FBF9F5]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt=""
                          className="w-9 h-9 rounded object-cover border border-stone-200 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-stone-200 flex items-center justify-center shrink-0">
                          <Music2 className="w-4 h-4 text-stone-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-900 truncate">{track.title}</p>
                        <p className="text-[11px] text-stone-500 truncate">
                          {track.artist}
                          {track.durationMs ? ` · ${formatMs(track.durationMs)}` : ''}
                          {track.isPreview ? ' · Aperçu' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {track.streamUrl && (
                        <button
                          type="button"
                          onClick={() => void handleTogglePreview(track)}
                          aria-label={isPreviewing ? `Mettre en pause ${track.title}` : `Écouter un extrait de ${track.title}`}
                          className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border border-stone-200 bg-white text-stone-700 hover:border-[#1B365D] hover:text-[#1B365D]"
                        >
                          {isPreviewing ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePickTrack(track)}
                        className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-emerald-800 text-white'
                            : 'bg-[#1B365D] text-white hover:bg-[#132744]'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Sélectionné</span>
                          </>
                        ) : (
                          <span>Choisir</span>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
