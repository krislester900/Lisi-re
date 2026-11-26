import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Repeat,
  Search,
  Smartphone,
  Trash2,
  Unplug,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  fetchMusicProvidersStatus,
  fetchSpotifyAuthUrl,
  fetchSpotifyToken,
  fetchSpotifyTopTracks,
  disconnectSpotifyAccount,
  loadSpotifyWebPlaybackSdk,
  MusicProvidersStatus,
  MusicProviderTab,
  pauseSpotifyPlayback,
  READING_MOOD_PRESETS,
  ReadingTrack,
  searchMusicCatalog,
  startSpotifyPlayback,
} from '../lib/musicService';
import {
  addLocalAudioFiles,
  loadLocalAudioTracks,
  removeLocalAudioTrack,
  revokeLocalTrackUrls,
} from '../lib/localAudioStore';
import { parseMusicSource } from '../lib/storageService';

export interface AuthorMusicInfo {
  title: string;
  artist?: string;
  mediaUrl?: string;
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  addListener: (event: string, cb: (payload: unknown) => void) => void;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface ReadingAudioController {
  activeTrack: ReadingTrack | null;
  isPlaying: boolean;
  isMuted: boolean;
  isLooping: boolean;
  currentTimeMs: number;
  durationMs: number;
  providers: MusicProvidersStatus | null;
  spotifyDeviceId: string | null;
  playbackError: string | null;
  clearPlaybackError: () => void;
  localTracks: ReadingTrack[];
  localBusy: boolean;
  localError: string | null;
  clearLocalError: () => void;
  addLocalFiles: (files: FileList | File[]) => Promise<void>;
  removeLocalTrack: (track: ReadingTrack) => Promise<void>;
  refreshProviders: () => Promise<void>;
  playTrack: (track: ReadingTrack) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  stopTrack: () => Promise<void>;
  seekToMs: (ms: number) => Promise<void>;
  toggleMute: () => void;
  toggleLoop: () => void;
  connectSpotify: () => Promise<void>;
  disconnectSpotify: () => Promise<void>;
  playAuthorMusic: (fav: AuthorMusicInfo, authorName: string) => Promise<void>;
  audioElementRef: React.RefObject<HTMLAudioElement | null>;
  embedBackground: boolean;
  isExternalEmbedActive: boolean;
  toggleEmbedBackground: () => void;
  renderHiddenStreams: () => React.ReactNode;
}

export function useReadingAudioEngine(storyOpen: boolean): ReadingAudioController {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const spotifyPlayerRef = useRef<SpotifyPlayerInstance | null>(null);

  const [providers, setProviders] = useState<MusicProvidersStatus | null>(null);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);

  const [activeTrack, setActiveTrack] = useState<ReadingTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [embedCompact, setEmbedCompact] = useState(false);
  const [embedBackground, setEmbedBackground] = useState(true);

  const isLoopingRef = useRef(isLooping);
  isLoopingRef.current = isLooping;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const [localTracks, setLocalTracks] = useState<ReadingTrack[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const localTracksRef = useRef<ReadingTrack[]>([]);
  localTracksRef.current = localTracks;

  const refreshProviders = useCallback(async () => {
    try {
      const status = await fetchMusicProvidersStatus();
      setProviders(status);
    } catch {
      // Ignore transient network errors on initial mount
    }
  }, []);

  useEffect(() => {
    if (!storyOpen) return;
    void refreshProviders();
  }, [storyOpen, refreshProviders]);

  useEffect(() => {
    if (!storyOpen) return;
    let cancelled = false;
    void loadLocalAudioTracks().then((tracks) => {
      if (cancelled) {
        revokeLocalTrackUrls(tracks);
        return;
      }
      setLocalTracks((prev) => {
        revokeLocalTrackUrls(prev);
        return tracks;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [storyOpen]);

  useEffect(() => {
    return () => {
      revokeLocalTrackUrls(localTracksRef.current);
    };
  }, []);

  // Listen for OAuth popup completion
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'spotify') {
        setPlaybackError(null);
        void refreshProviders();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setPlaybackError('La connexion au compte musical a été annulée ou refusée.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshProviders]);

  // Initialize Spotify Web Playback SDK when connected
  useEffect(() => {
    if (!storyOpen || !providers?.spotify.connected) {
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
        spotifyPlayerRef.current = null;
        setSpotifyDeviceId(null);
      }
      return;
    }

    let cancelled = false;
    const initSdk = async () => {
      try {
        await loadSpotifyWebPlaybackSdk();
        if (cancelled) return;
        const win = window as unknown as {
          Spotify?: {
            Player: new (opts: {
              name: string;
              getOAuthToken: (cb: (token: string) => void) => void;
              volume?: number;
            }) => SpotifyPlayerInstance;
          };
        };
        if (!win.Spotify?.Player) return;

        const player = new win.Spotify.Player({
          name: 'Lisière — Lecteur de salon',
          getOAuthToken: (cb) => {
            void fetchSpotifyToken()
              .then((t) => cb(t.accessToken))
              .catch(() => cb(''));
          },
          volume: 0.7,
        });

        player.addListener('ready', (payload) => {
          const data = payload as { device_id?: string };
          if (!cancelled && data?.device_id) {
            setSpotifyDeviceId(data.device_id);
          }
        });

        player.addListener('not_ready', () => {
          if (!cancelled) setSpotifyDeviceId(null);
        });

        player.addListener('account_error', () => {
          if (!cancelled) {
            setPlaybackError(
              'Le streaming Spotify complet dans le navigateur requiert Spotify Premium (lecture d’aperçu ou lecteur Spotify utilisé en repli).'
            );
          }
        });

        player.addListener('player_state_changed', (state) => {
          const s = state as {
            paused?: boolean;
            position?: number;
            duration?: number;
          } | null;
          if (!s || cancelled) return;
          setIsPlaying(!s.paused);
          if (typeof s.position === 'number') setCurrentTimeMs(s.position);
          if (typeof s.duration === 'number') setDurationMs(s.duration);
        });

        await player.connect();
        if (!cancelled) {
          spotifyPlayerRef.current = player;
        } else {
          player.disconnect();
        }
      } catch {
        // Fallback to preview/embed seamlessly
      }
    };

    void initSdk();
    return () => {
      cancelled = true;
    };
  }, [storyOpen, providers?.spotify.connected]);

  const activeExternalEmbed =
    activeTrack &&
    (((activeTrack.source === 'youtube' || activeTrack.source === 'link') &&
      activeTrack.externalUrl) ||
      (activeTrack.source === 'spotify' &&
        !spotifyDeviceId &&
        !activeTrack.streamUrl &&
        activeTrack.externalUrl))
      ? parseMusicSource(activeTrack.externalUrl!)
      : null;

  const isExternalEmbedActive = Boolean(
    activeExternalEmbed &&
      (activeExternalEmbed.type === 'youtube' || activeExternalEmbed.type === 'soundcloud') &&
      activeExternalEmbed.embedUrl
  );

  const sendYouTubeCommand = useCallback(
    (func: string, args: unknown[] = []) => {
      const win = embedIframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          'https://www.youtube.com'
        );
      } catch {
        // Ignore cross-origin postMessage failure if iframe not ready
      }
    },
    []
  );

  const sendSoundCloudCommand = useCallback((method: string, value?: unknown) => {
    const win = embedIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify(value !== undefined ? { method, value } : { method }),
        'https://w.soundcloud.com'
      );
    } catch {
      // Ignore cross-origin postMessage failure if iframe not ready
    }
  }, []);

  // Listen for YouTube embed state events (sync play/pause & handle loop without reloading iframe)
  useEffect(() => {
    if (!storyOpen) return;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.youtube.com' &&
        event.origin !== 'https://www.youtube-nocookie.com'
      ) {
        return;
      }
      if (typeof event.data !== 'string') return;
      try {
        const payload = JSON.parse(event.data) as {
          event?: string;
          info?: number | { playerState?: number };
        };
        const playerState =
          typeof payload.info === 'number'
            ? payload.info
            : typeof payload.info === 'object' && payload.info !== null
              ? payload.info.playerState
              : undefined;
        if (typeof playerState !== 'number') return;

        if (playerState === 1) {
          setIsPlaying(true);
        } else if (playerState === 2) {
          setIsPlaying(false);
        } else if (playerState === 0) {
          if (isLoopingRef.current) {
            sendYouTubeCommand('seekTo', [0, true]);
            sendYouTubeCommand('playVideo');
          } else {
            setIsPlaying(false);
          }
        }
      } catch {
        // Ignore non-JSON YouTube messages
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [storyOpen, sendYouTubeCommand]);

  // Reset all playback cleanly when story modal closes
  useEffect(() => {
    if (storyOpen) return;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
    }
    if (spotifyPlayerRef.current) {
      spotifyPlayerRef.current.disconnect();
      spotifyPlayerRef.current = null;
    }
    if (localTracksRef.current.length > 0) {
      revokeLocalTrackUrls(localTracksRef.current);
      setLocalTracks([]);
    }
    setSpotifyDeviceId(null);
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setDurationMs(0);
    setPlaybackError(null);
    setLocalError(null);
  }, [storyOpen]);

  // Sync mute state to audio, Spotify SDK, and active YouTube/SoundCloud embed
  useEffect(() => {
    if (audioElementRef.current) {
      audioElementRef.current.muted = isMuted;
    }
    if (spotifyPlayerRef.current) {
      void spotifyPlayerRef.current.setVolume(isMuted ? 0 : 0.7).catch(() => {});
    }
    if (activeExternalEmbed?.type === 'youtube') {
      sendYouTubeCommand(isMuted ? 'mute' : 'unMute');
    } else if (activeExternalEmbed?.type === 'soundcloud') {
      sendSoundCloudCommand('setVolume', isMuted ? 0 : 80);
    }
  }, [
    isMuted,
    activeExternalEmbed?.type,
    sendYouTubeCommand,
    sendSoundCloudCommand,
  ]);

  const stopAllEnginesSync = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
    if (spotifyPlayerRef.current) {
      void spotifyPlayerRef.current.pause().catch(() => {});
    }
  }, []);

  const playTrack = useCallback(
    async (track: ReadingTrack) => {
      setPlaybackError(null);
      stopAllEnginesSync();
      setActiveTrack(track);
      setCurrentTimeMs(0);
      setDurationMs(track.durationMs || 0);

      // 1. Spotify track via OAuth Web Playback SDK (Premium) or preview/embed (Free)
      if (track.source === 'spotify' && track.spotifyUri) {
        const isSpotifyPremium = providers?.spotify.user?.product === 'premium';
        if (providers?.spotify.connected && isSpotifyPremium && spotifyDeviceId) {
          try {
            await startSpotifyPlayback(track.spotifyUri, spotifyDeviceId);
            setIsPlaying(true);
            return;
          } catch (err) {
            if (track.streamUrl && audioElementRef.current) {
              audioElementRef.current.src = track.streamUrl;
              await audioElementRef.current.play().catch(() => {});
              setIsPlaying(true);
              return;
            }
            setPlaybackError(
              err instanceof Error
                ? err.message
                : 'Lecteur Spotify indisponible pour ce morceau.'
            );
            setIsPlaying(true);
            return;
          }
        }

        if (track.streamUrl && audioElementRef.current) {
          audioElementRef.current.src = track.streamUrl;
          await audioElementRef.current.play().catch(() => {});
          setIsPlaying(true);
          return;
        }

        setIsPlaying(true);
        return;
      }

      // 2. YouTube search tracks or link-based tracks (YouTube / SoundCloud / Spotify / Deezer / MP3)
      if ((track.source === 'youtube' || track.source === 'link') && track.externalUrl) {
        const parsed = parseMusicSource(track.externalUrl);
        if (parsed.type === 'audio' && parsed.originalUrl && audioElementRef.current) {
          audioElementRef.current.src = parsed.originalUrl;
          await audioElementRef.current.play().catch(() => {
            setPlaybackError('Lecture audio directe bloquée par la source.');
          });
          setIsPlaying(true);
          return;
        }
        setIsPlaying(true);
        return;
      }

      // 3. Direct audio streams (Audius full tracks, Deezer preview, local phone files)
      if (track.streamUrl && audioElementRef.current) {
        audioElementRef.current.src = track.streamUrl;
        try {
          await audioElementRef.current.play();
          setIsPlaying(true);
        } catch {
          setPlaybackError('Impossible de lancer la lecture audio sur ce navigateur.');
          setIsPlaying(false);
        }
        return;
      }

      setPlaybackError('Aucun flux audio lisible directement pour ce morceau.');
      setIsPlaying(false);
    },
    [providers?.spotify.connected, providers?.spotify.user?.product, spotifyDeviceId, stopAllEnginesSync]
  );

  const togglePlayPause = useCallback(async () => {
    if (!activeTrack) return;

    if (activeTrack.source === 'spotify' && spotifyPlayerRef.current && spotifyDeviceId) {
      if (isPlaying) {
        await spotifyPlayerRef.current.pause().catch(() => pauseSpotifyPlayback(spotifyDeviceId));
        setIsPlaying(false);
      } else {
        await spotifyPlayerRef.current.resume().catch(() => {});
        setIsPlaying(true);
      }
      return;
    }

    const parsedLink =
      (activeTrack.source === 'youtube' || activeTrack.source === 'link') && activeTrack.externalUrl
        ? parseMusicSource(activeTrack.externalUrl)
        : null;

    if (
      activeTrack.source === 'youtube' ||
      (parsedLink &&
        (parsedLink.type === 'youtube' ||
          parsedLink.type === 'soundcloud' ||
          parsedLink.type === 'spotify' ||
          parsedLink.type === 'deezer'))
    ) {
      const nextPlaying = !isPlaying;
      if (activeTrack.source === 'youtube' || parsedLink?.type === 'youtube') {
        sendYouTubeCommand(nextPlaying ? 'playVideo' : 'pauseVideo');
      } else if (parsedLink?.type === 'soundcloud') {
        sendSoundCloudCommand(nextPlaying ? 'play' : 'pause');
      }
      setIsPlaying(nextPlaying);
      return;
    }

    if (audioElementRef.current) {
      if (isPlaying) {
        audioElementRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioElementRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [
    activeTrack,
    isPlaying,
    sendSoundCloudCommand,
    sendYouTubeCommand,
    spotifyDeviceId,
  ]);

  const stopTrack = useCallback(async () => {
    stopAllEnginesSync();
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setDurationMs(0);
    setPlaybackError(null);
  }, [stopAllEnginesSync]);

  const seekToMs = useCallback(
    async (ms: number) => {
      setCurrentTimeMs(ms);
      if (activeTrack?.source === 'spotify' && spotifyPlayerRef.current && spotifyDeviceId) {
        await spotifyPlayerRef.current.seek(ms).catch(() => {});
        return;
      }
      if (audioElementRef.current) {
        audioElementRef.current.currentTime = ms / 1000;
      }
    },
    [activeTrack?.source, spotifyDeviceId]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const connectSpotify = useCallback(async () => {
    setPlaybackError(null);
    try {
      const { url } = await fetchSpotifyAuthUrl();
      const authWin = window.open(url, 'spotify_oauth_popup', 'width=540,height=720');
      if (!authWin) {
        setPlaybackError(
          'Votre navigateur a bloqué la fenêtre de connexion Spotify. Autorisez les fenêtres contextuelles pour ce site.'
        );
      }
    } catch (err) {
      const e = err as Error & { callbackUrl?: string };
      if (e.message === 'SPOTIFY_NOT_CONFIGURED') {
        setPlaybackError(
          `Spotify OAuth n’est pas encore configuré sur ce serveur (variables SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET). En attendant, utilisez Musique gratuite, Deezer ou SoundCloud.`
        );
      } else {
        setPlaybackError(e.message || 'Impossible d’ouvrir la connexion Spotify.');
      }
    }
  }, []);

  const disconnectSpotify = useCallback(async () => {
    await disconnectSpotifyAccount();
    if (activeTrack?.source === 'spotify') {
      await stopTrack();
    }
    await refreshProviders();
  }, [activeTrack?.source, refreshProviders, stopTrack]);

  const playAuthorMusic = useCallback(
    async (fav: AuthorMusicInfo, authorName: string) => {
      const track: ReadingTrack = {
        id: `author_${fav.title}`,
        title: fav.title,
        artist: fav.artist || authorName,
        source: 'link',
        externalUrl: fav.mediaUrl,
        streamUrl: fav.mediaUrl,
      };
      await playTrack(track);
    },
    [playTrack]
  );

  const addLocalFiles = useCallback(
    async (files: FileList | File[]) => {
      setLocalError(null);
      setLocalBusy(true);
      try {
        const { added, skippedCount } = await addLocalAudioFiles(files);
        if (added.length > 0) {
          setLocalTracks((prev) => [...added, ...prev]);
          await playTrack(added[0]);
        }
        if (skippedCount > 0) {
          setLocalError(
            `${skippedCount} fichier${skippedCount > 1 ? 's' : ''} ignoré${skippedCount > 1 ? 's' : ''} (formats acceptés : MP3, M4A, WAV, OGG, AAC, FLAC).`
          );
        } else if (added.length === 0) {
          setLocalError('Aucun fichier audio compatible n’a été sélectionné.');
        }
      } catch {
        setLocalError('Impossible de charger ce fichier audio depuis votre appareil.');
      } finally {
        setLocalBusy(false);
      }
    },
    [playTrack]
  );

  const removeLocalTrack = useCallback(
    async (track: ReadingTrack) => {
      if (activeTrack?.id === track.id) {
        await stopTrack();
      }
      await removeLocalAudioTrack(track);
      setLocalTracks((prev) => prev.filter((t) => t.id !== track.id));
    },
    [activeTrack?.id, stopTrack]
  );

  const toggleEmbedBackground = useCallback(() => {
    setEmbedBackground((prev) => !prev);
  }, []);

  const renderHiddenStreams = useCallback(() => {
    const parsed =
      (activeTrack?.source === 'youtube' || activeTrack?.source === 'link') &&
      activeTrack.externalUrl
        ? parseMusicSource(activeTrack.externalUrl)
        : activeTrack?.source === 'spotify' &&
            !spotifyDeviceId &&
            !activeTrack.streamUrl &&
            activeTrack.externalUrl
          ? parseMusicSource(activeTrack.externalUrl)
          : null;

    // Keep external YouTube / SoundCloud iframe mounted while track is active (even paused)
    // so pausing/resuming and switching between background & visible video dock never restarts playback.
    const hasExternalEmbed =
      Boolean(activeTrack) &&
      Boolean(parsed) &&
      (parsed!.type === 'youtube' || parsed!.type === 'soundcloud') &&
      Boolean(parsed!.embedUrl);

    return (
      <>
        <audio
          ref={audioElementRef}
          loop={isLooping}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
          onLoadedMetadata={(e) => setDurationMs((e.currentTarget.duration || 0) * 1000)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            if (activeTrack?.streamUrl) {
              setPlaybackError('Lecture audio indisponible pour ce lien.');
              setIsPlaying(false);
            }
          }}
          className="hidden"
        />

        {hasExternalEmbed && parsed?.embedUrl && (
          <div
            aria-hidden={embedBackground}
            aria-label={embedBackground ? undefined : 'Lecteur vidéo en cours'}
            className={
              embedBackground
                ? 'absolute bottom-3 right-3 z-0 w-[260px] h-[150px] pointer-events-none opacity-[0.01] overflow-hidden'
                : `fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[60] rounded-lg border border-stone-700 bg-[#171614] text-white shadow-2xl overflow-hidden transition-all duration-200 ${
                    embedCompact ? 'w-[220px]' : 'w-[276px] sm:w-[310px]'
                  }`
            }
          >
            {!embedBackground && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-white/10 bg-[#1F1E1C]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Disc3
                    className={`w-3.5 h-3.5 text-amber-300 shrink-0 ${
                      isPlaying ? 'lisiere-disc-spin' : ''
                    }`}
                  />
                  <span className="text-[11px] font-medium truncate">
                    {activeTrack?.title || (parsed.type === 'youtube' ? 'YouTube' : 'SoundCloud')}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEmbedBackground(true)}
                    aria-label="Jouer en arrière-plan derrière la lecture"
                    title="Mettre en arrière-plan"
                    className="px-1.5 py-1 rounded text-[11px] text-amber-200 hover:text-white hover:bg-white/10 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>Arrière-plan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbedCompact((prev) => !prev)}
                    aria-label={embedCompact ? 'Agrandir le lecteur' : 'Réduire le lecteur'}
                    title={embedCompact ? 'Agrandir' : 'Réduire'}
                    className="p-1 rounded text-stone-300 hover:text-white hover:bg-white/10"
                  >
                    {embedCompact ? (
                      <Maximize2 className="w-3 h-3" />
                    ) : (
                      <Minimize2 className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void stopTrack()}
                    aria-label="Fermer et arrêter la musique"
                    title="Arrêter"
                    className="p-1 rounded text-stone-300 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <iframe
              ref={embedIframeRef}
              key={parsed.embedUrl}
              title={`Lecture audio de ${activeTrack?.title || 'musique'}`}
              src={parsed.embedUrl}
              tabIndex={embedBackground ? -1 : 0}
              width="100%"
              height={
                embedBackground
                  ? 150
                  : parsed.type === 'youtube'
                    ? embedCompact
                      ? 124
                      : 164
                    : 80
              }
              onLoad={() => {
                if (parsed.type === 'youtube') {
                  try {
                    embedIframeRef.current?.contentWindow?.postMessage(
                      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                      'https://www.youtube.com'
                    );
                    if (isMutedRef.current) {
                      sendYouTubeCommand('mute');
                    }
                  } catch {
                    // Ignore cross-origin frame init errors
                  }
                }
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="block w-full border-0 bg-black"
            />
          </div>
        )}
      </>
    );
  }, [
    activeTrack,
    embedBackground,
    embedCompact,
    isLooping,
    isPlaying,
    sendYouTubeCommand,
    spotifyDeviceId,
    stopTrack,
  ]);

  return {
    activeTrack,
    isPlaying,
    isMuted,
    isLooping,
    currentTimeMs,
    durationMs,
    providers,
    spotifyDeviceId,
    playbackError,
    clearPlaybackError: () => setPlaybackError(null),
    localTracks,
    localBusy,
    localError,
    clearLocalError: () => setLocalError(null),
    addLocalFiles,
    removeLocalTrack,
    refreshProviders,
    playTrack,
    togglePlayPause,
    stopTrack,
    seekToMs,
    toggleMute,
    toggleLoop: () => setIsLooping((prev) => !prev),
    connectSpotify,
    disconnectSpotify,
    playAuthorMusic,
    audioElementRef,
    embedBackground,
    isExternalEmbedActive,
    toggleEmbedBackground,
    renderHiddenStreams,
  };
}

interface ReadingMusicPanelProps {
  controller: ReadingAudioController;
  authorName: string;
  authorFavoriteMusic?: AuthorMusicInfo;
  compactPopover?: boolean;
  onClose: () => void;
}

export function ReadingMusicPanel({
  controller,
  authorName,
  authorFavoriteMusic,
  compactPopover = false,
  onClose,
}: ReadingMusicPanelProps) {
  const [providerTab, setProviderTab] = useState<MusicProviderTab>('audius');
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<ReadingTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    activeTrack,
    isPlaying,
    isMuted,
    isLooping,
    currentTimeMs,
    durationMs,
    providers,
    spotifyDeviceId,
    playbackError,
    clearPlaybackError,
    localTracks,
    localBusy,
    localError,
    clearLocalError,
    addLocalFiles,
    removeLocalTrack,
    playTrack,
    togglePlayPause,
    stopTrack,
    seekToMs,
    toggleMute,
    toggleLoop,
    connectSpotify,
    disconnectSpotify,
    playAuthorMusic,
    embedBackground,
    isExternalEmbedActive,
    toggleEmbedBackground,
  } = controller;

  const runSearch = useCallback(
    async (query: string, targetTab: MusicProviderTab = providerTab) => {
      const trimmed = query.trim();
      if (!trimmed || targetTab === 'link' || targetTab === 'local') return;
      setSearchError(null);
      setSearching(true);
      try {
        const results = await searchMusicCatalog(trimmed, targetTab);
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('Aucun morceau trouvé pour cette recherche.');
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Recherche impossible.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [providerTab]
  );

  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    void runSearch('piano ambient', 'audius');
  }, [runSearch]);

  useEffect(() => {
    if (providerTab !== 'spotify' || !providers?.spotify.connected || searchInput.trim()) {
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    void fetchSpotifyTopTracks()
      .then((tracks) => {
        if (!cancelled && tracks.length > 0) {
          setSearchResults(tracks);
        }
      })
      .catch(() => {
        // User can still search directly
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerTab, providers?.spotify.connected, searchInput]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(searchInput, providerTab);
  };

  const handlePresetClick = (presetQuery: string) => {
    setSearchInput(presetQuery);
    const searchTarget =
      providerTab === 'link' || providerTab === 'local' ? 'audius' : providerTab;
    if (providerTab === 'link' || providerTab === 'local') setProviderTab('audius');
    void runSearch(presetQuery, searchTarget);
  };

  const handlePlayCustomLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkUrl.trim();
    if (!trimmed) return;
    const parsed = parseMusicSource(trimmed);
    const label =
      linkTitle.trim() ||
      (parsed.type === 'soundcloud'
        ? 'Son SoundCloud'
        : parsed.type === 'spotify'
          ? 'Piste Spotify'
          : parsed.type === 'youtube'
            ? 'Ambiance YouTube'
            : 'Lien musical');

    void playTrack({
      id: `link_${Date.now()}`,
      title: label,
      artist: 'Lien personnel',
      source: 'link',
      externalUrl: trimmed,
    });
  };

  const parsedActiveEmbed =
    activeTrack &&
    (((activeTrack.source === 'youtube' || activeTrack.source === 'link') &&
      activeTrack.externalUrl) ||
      (activeTrack.source === 'spotify' &&
        !spotifyDeviceId &&
        !activeTrack.streamUrl &&
        activeTrack.externalUrl))
      ? parseMusicSource(activeTrack.externalUrl!)
      : null;

  const showSeekableBar =
    Boolean(activeTrack) &&
    ((activeTrack?.source === 'spotify' && Boolean(spotifyDeviceId)) ||
      Boolean(activeTrack?.streamUrl) ||
      parsedActiveEmbed?.type === 'audio');

  const progressPct = durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;

  return (
    <div
      className={
        compactPopover
          ? 'bg-[#FBF9F5] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg shadow-xl p-4 space-y-4 text-stone-900 dark:text-stone-100'
          : 'bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-6 py-4 space-y-4 text-stone-900 dark:text-stone-100'
      }
      aria-label="Musique pour la lecture"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            aria-hidden="true"
            className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 ${
              isPlaying
                ? 'bg-[#1B365D] dark:bg-[#3B629B] border-[#1B365D] dark:border-[#3B629B] text-white lisiere-music-pulse'
                : 'bg-[#FBF9F5] dark:bg-stone-800 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
            }`}
          >
            {isPlaying ? (
              <Disc3 className="w-3.5 h-3.5 lisiere-disc-spin" />
            ) : (
              <Music2 className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-600 dark:text-stone-400 truncate">
              Musique de lecture
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau musical"
          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Currently playing bar */}
      {activeTrack && (
        <div className="rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-800/80 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {activeTrack.coverUrl ? (
                <img
                  src={activeTrack.coverUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover border border-stone-200 dark:border-stone-700 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-stone-200/80 dark:bg-stone-700 flex items-center justify-center shrink-0">
                  <Music2 className="w-4 h-4 text-stone-600 dark:text-stone-300" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{activeTrack.title}</p>
                <p className="text-xs text-stone-600 dark:text-stone-400 truncate">
                  {activeTrack.artist}
                  {activeTrack.isPreview ? ' · Aperçu 30 s' : ''}
                  {isExternalEmbedActive
                    ? embedBackground
                      ? ' · En arrière-plan'
                      : ' · Vidéo affichée'
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void togglePlayPause()}
                aria-label={isPlaying ? 'Mettre en pause' : 'Reprendre la lecture'}
                className="min-h-[36px] min-w-[36px] rounded-md bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183] inline-flex items-center justify-center transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </button>
              {(showSeekableBar || parsedActiveEmbed?.type === 'youtube') && (
                <button
                  type="button"
                  onClick={toggleLoop}
                  aria-label={isLooping ? 'Désactiver la lecture en boucle' : 'Lire en boucle'}
                  aria-pressed={isLooping}
                  title="Lire en boucle"
                  className={`min-h-[36px] min-w-[36px] rounded-md border inline-flex items-center justify-center transition-colors ${
                    isLooping
                      ? 'border-[#1B365D] dark:border-[#6088C2] bg-[#1B365D]/10 dark:bg-[#3B629B]/20 text-[#1B365D] dark:text-[#93B4E2]'
                      : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              )}
              {(showSeekableBar || isExternalEmbedActive) && (
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Réactiver le son' : 'Couper le son'}
                  className="min-h-[36px] min-w-[36px] rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 inline-flex items-center justify-center"
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
              {isExternalEmbedActive && (
                <button
                  type="button"
                  onClick={toggleEmbedBackground}
                  aria-pressed={!embedBackground}
                  title={
                    embedBackground
                      ? 'Afficher le lecteur vidéo'
                      : 'Masquer la vidéo derrière la page de lecture'
                  }
                  className="min-h-[36px] px-2.5 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-400 dark:hover:border-stone-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {embedBackground ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Vidéo</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Arrière-plan</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => void stopTrack()}
                aria-label="Arrêter la musique"
                className="min-h-[36px] px-2.5 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100 whitespace-nowrap shrink-0"
              >
                Arrêter
              </button>
            </div>
          </div>

          {isExternalEmbedActive && embedBackground && (
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              Lecture en arrière-plan activée pour ne pas gêner votre lecture. Si votre téléphone bloque le démarrage automatique, touchez « Vidéo » pour lancer puis repassez en « Arrière-plan ».
            </p>
          )}

          {showSeekableBar && (
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={durationMs > 0 ? durationMs : 100}
                step={500}
                value={currentTimeMs}
                onChange={(e) => void seekToMs(Number(e.target.value))}
                aria-label="Progression de la lecture"
                style={{
                  background: `linear-gradient(to right, #1B365D ${progressPct}%, #E7E5E4 ${progressPct}%)`,
                }}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#1B365D]"
              />
              <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                <span>{formatMs(currentTimeMs)}</span>
                <span>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</span>
              </div>
            </div>
          )}

          {isPlaying &&
            parsedActiveEmbed &&
            (parsedActiveEmbed.type === 'spotify' || parsedActiveEmbed.type === 'deezer') &&
            parsedActiveEmbed.embedUrl && (
              <div className="rounded overflow-hidden border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
                <iframe
                  title={`Lecteur ${activeTrack.title}`}
                  src={parsedActiveEmbed.embedUrl}
                  width="100%"
                  height={80}
                  allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                  loading="lazy"
                  className="block w-full border-0"
                />
              </div>
            )}
        </div>
      )}

      {/* Optional 1-click author's pinned track */}
      {authorFavoriteMusic?.title && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-800/80 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Musique choisie par {authorName}
            </p>
            <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
              {authorFavoriteMusic.title}
              {authorFavoriteMusic.artist ? ` · ${authorFavoriteMusic.artist}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void playAuthorMusic(authorFavoriteMusic, authorName)}
            className="min-h-[34px] px-3 py-1 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-800 dark:text-stone-200 hover:border-[#1B365D] dark:hover:border-[#6088C2] hover:text-[#1B365D] dark:hover:text-[#93B4E2] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Écouter</span>
          </button>
        </div>
      )}

      {/* Provider selector */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Application musicale">
        {(
          [
            { id: 'audius', label: 'Musique gratuite' },
            { id: 'youtube', label: 'YouTube' },
            { id: 'local', label: 'Mon téléphone' },
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
              if (tab.id === 'youtube' || tab.id === 'audius' || tab.id === 'deezer') {
                void runSearch(searchInput.trim() || 'piano ambient', tab.id);
              }
            }}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              providerTab === tab.id
                ? 'bg-[#1B365D] dark:bg-[#3B629B] text-white border-[#1B365D] dark:border-[#3B629B]'
                : 'bg-[#FBF9F5] dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Spotify connection bar */}
      {providerTab === 'spotify' && (
        <div className="rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-800/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {providers?.spotify.connected && providers.spotify.user ? (
            <>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                  Connecté : {providers.spotify.user.displayName}
                </p>
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  {providers.spotify.user.product === 'premium' && spotifyDeviceId
                    ? 'Lecteur Spotify temps réel prêt'
                    : providers.spotify.user.product === 'premium'
                      ? 'Initialisation du lecteur temps réel…'
                      : 'Compte gratuit · Lecture via aperçu / lecteur Spotify (pour des morceaux entiers gratuits, utilisez « Musique gratuite »)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void disconnectSpotify()}
                className="min-h-[34px] px-3 py-1 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-700 dark:text-stone-200 hover:text-red-700 dark:hover:text-red-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>Déconnecter</span>
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-900 dark:text-stone-100">
                  Spotify (optionnel — gratuit ou Premium)
                </p>
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  Pas d’abonnement payant ? L’onglet « Musique gratuite » et « SoundCloud / Lien » jouent des morceaux entiers gratuitement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void connectSpotify()}
                className="min-h-[36px] px-3.5 py-1.5 rounded-md bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183] text-xs font-medium whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                Connecter Spotify
              </button>
            </>
          )}
        </div>
      )}

      {playbackError && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 text-xs text-amber-950 dark:text-amber-200 flex items-start justify-between gap-2"
        >
          <span>{playbackError}</span>
          <button
            type="button"
            onClick={clearPlaybackError}
            aria-label="Fermer l’avertissement"
            className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search bar, Phone audio library, or SoundCloud / Direct Link input */}
      {providerTab === 'local' ? (
        <div className="space-y-3">
          <input
            ref={localFileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.opus,.webm"
            multiple
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                void addLocalFiles(files);
              }
              e.target.value = '';
            }}
            className="hidden"
          />

          <div className="rounded-md border border-dashed border-stone-300 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-800/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0 text-[#1B365D] dark:text-[#93B4E2]">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-900 dark:text-stone-100">
                  Musiques depuis votre téléphone ou ordinateur
                </p>
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  Importez vos fichiers MP3, M4A, WAV ou OGG. Ils restent privés sur cet appareil et se lisent en mode zen.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={localBusy}
              onClick={() => localFileInputRef.current?.click()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183] disabled:opacity-50 text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{localBusy ? 'Chargement…' : 'Ajouter un fichier audio'}</span>
            </button>
          </div>

          {localError && (
            <div
              role="alert"
              className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 text-xs text-amber-950 dark:text-amber-200 flex items-start justify-between gap-2"
            >
              <span>{localError}</span>
              <button
                type="button"
                onClick={clearLocalError}
                aria-label="Fermer le message"
                className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {localTracks.length > 0 ? (
            <ul className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-md bg-[#FBF9F5] dark:bg-stone-800/60 max-h-56 overflow-y-auto">
              {localTracks.map((track) => {
                const isCurrent = activeTrack?.id === track.id;
                return (
                  <li
                    key={track.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-white dark:hover:bg-stone-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded bg-stone-200/80 dark:bg-stone-700 flex items-center justify-center shrink-0 text-[#1B365D] dark:text-[#93B4E2]">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{track.title}</p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate tabular-nums">
                          {track.artist}
                          {track.durationMs ? ` · ${formatMs(track.durationMs)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void removeLocalTrack(track)}
                        aria-label={`Supprimer ${track.title}`}
                        title="Retirer de cet appareil"
                        className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            void togglePlayPause();
                          } else {
                            void playTrack(track);
                          }
                        }}
                        className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                          isCurrent && isPlaying
                            ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                            : 'bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183]'
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Lire</span>
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-400 text-center py-3">
              Aucune musique ajoutée pour le moment. Choisissez un fichier sur votre téléphone pour l’écouter pendant votre lecture.
            </p>
          )}
        </div>
      ) : providerTab === 'link' ? (
        <form onSubmit={handlePlayCustomLink} className="space-y-2.5">
          <div className="space-y-2">
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Coller un lien SoundCloud, Spotify, Deezer, YouTube ou MP3…"
              aria-label="Lien musical SoundCloud, Spotify, Deezer ou audio"
              className="w-full min-h-[40px] px-3 py-2 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Titre (facultatif)"
                aria-label="Titre du morceau"
                className="flex-1 min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
              />
              <button
                type="submit"
                disabled={!linkUrl.trim()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183] disabled:opacity-50 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Les pistes YouTube et SoundCloud jouent en arrière-plan derrière la page de lecture pour préserver l’immersion (vous pouvez afficher ou masquer la vidéo à tout moment).
          </p>
        </form>
      ) : (
        <div className="space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={
                  providerTab === 'spotify'
                    ? 'Chercher un titre ou un artiste sur Spotify…'
                    : providerTab === 'youtube'
                      ? 'Chercher une musique, bande-son ou ambiance sur YouTube…'
                      : providerTab === 'deezer'
                        ? 'Chercher sur Deezer…'
                        : 'Chercher un morceau pour accompagner votre lecture…'
                }
                aria-label="Rechercher une musique pour la lecture"
                className="w-full min-h-[40px] pl-8 pr-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !searchInput.trim()}
              className="min-h-[40px] px-3.5 py-1.5 rounded-md bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183] disabled:opacity-50 text-xs font-medium whitespace-nowrap shrink-0"
            >
              {searching ? 'Recherche…' : 'Chercher'}
            </button>
          </form>

          {/* Quick reading mood searches */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-500 dark:text-stone-400 mr-1">Ambiances :</span>
            {READING_MOOD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePresetClick(preset.query)}
                className="min-h-[28px] px-2.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-800 text-[11px] text-stone-700 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-900 dark:hover:text-stone-100 whitespace-nowrap shrink-0"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {searchError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {searchError}
            </p>
          )}

          {searchResults.length > 0 && (
            <ul className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-md bg-[#FBF9F5] dark:bg-stone-800/60 max-h-56 overflow-y-auto">
              {searchResults.map((track) => {
                const isCurrent = activeTrack?.id === track.id;
                return (
                  <li
                    key={track.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-white dark:hover:bg-stone-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt=""
                          className="w-9 h-9 rounded object-cover border border-stone-200 dark:border-stone-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center shrink-0">
                          <Music2 className="w-4 h-4 text-stone-600 dark:text-stone-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">{track.title}</p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {track.artist}
                          {track.durationMs ? ` · ${formatMs(track.durationMs)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {track.externalUrl && (
                        <a
                          href={track.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ouvrir ${track.title} dans l’application`}
                          className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            void togglePlayPause();
                          } else {
                            void playTrack(track);
                          }
                        }}
                        className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                          isCurrent && isPlaying
                            ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                            : 'bg-[#1B365D] dark:bg-[#3B629B] text-white hover:bg-[#132744] dark:hover:bg-[#2F5183]'
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Lire</span>
                          </>
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
