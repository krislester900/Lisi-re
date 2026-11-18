import React, { useEffect, useRef, useState } from 'react';
import {
  Disc3,
  ExternalLink,
  Music2,
  Pause,
  Play,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { parseMusicSource } from '../lib/storageService';

interface ImmersiveMusicPlayerProps {
  title: string;
  artist?: string;
  mediaUrl?: string;
  isActive: boolean;
  onTogglePlay: () => void;
  compact?: boolean;
  darkSurface?: boolean;
  variant?: 'default' | 'wall-widget';
  kicker?: string;
  onDelete?: () => void;
}

const MINI_WAVE_HEIGHTS = [38, 68, 92, 54, 84, 100, 62, 78, 44];

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ImmersiveMusicPlayer({
  title,
  artist,
  mediaUrl = '',
  isActive,
  onTogglePlay,
  compact = false,
  darkSurface = false,
  variant = 'default',
  kicker,
  onDelete,
}: ImmersiveMusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const parsed = parseMusicSource(mediaUrl);
  const canPlayInline =
    parsed.type === 'audio' ||
    parsed.type === 'youtube' ||
    parsed.type === 'soundcloud' ||
    parsed.type === 'spotify' ||
    parsed.type === 'deezer';

  useEffect(() => {
    if (parsed.type !== 'audio' || !audioRef.current) return;
    if (isActive) {
      void audioRef.current.play().catch(() => {
        setAudioFailed(true);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isActive, parsed.type]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    setAudioFailed(false);
    setCurrentTime(0);
    setDuration(0);
  }, [mediaUrl]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const renderCustomAudioBar = () => {
    if (!isActive) return null;

    if (parsed.type === 'audio') {
      const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
      return (
        <div
          className={`mt-2.5 rounded-xl px-3.5 py-2.5 border flex items-center gap-3 ${
            variant === 'wall-widget'
              ? 'bg-[#FAF9F6] border-stone-200 text-stone-900 shadow-sm'
              : darkSurface
                ? 'bg-white/15 border-white/25 text-white'
                : 'bg-white border-stone-200 text-stone-900'
          }`}
        >
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={`Mettre en pause ${title}`}
            className="w-8 h-8 rounded-full bg-[#1B365D] text-white hover:bg-[#132744] flex items-center justify-center shrink-0 transition-transform duration-150 active:scale-[0.95]"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>

          <div className="flex-1 min-w-0 space-y-1">
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeek}
              aria-label={`Progression audio de ${title}`}
              style={{
                background: `linear-gradient(to right, #1B365D ${progressPct}%, #E7E5E4 ${progressPct}%)`,
              }}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#1B365D]"
            />
            <div className="flex items-center justify-between text-[11px] text-stone-500 tabular-nums">
              <span>{formatAudioTime(currentTime)}</span>
              <span>{duration > 0 ? formatAudioTime(duration) : '--:--'}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            aria-label={isMuted ? 'Réactiver le son' : 'Couper le son'}
            className="w-8 h-8 rounded-full border border-stone-200 text-stone-700 hover:bg-stone-100 flex items-center justify-center shrink-0"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      );
    }

    if (parsed.type === 'youtube' || parsed.type === 'soundcloud') {
      return (
        <div
          className={`mt-2.5 rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-3 ${
            variant === 'wall-widget'
              ? 'bg-[#1F1E1C] border-white/15 text-white'
              : darkSurface
                ? 'bg-white/15 border-white/25 text-white'
                : 'bg-[#1F1E1C] border-stone-800 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Disc3 className="w-4 h-4 text-white/90 lisiere-disc-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">
                Lecteur audio immersif · {title}
              </p>
              <p className="text-[11px] text-stone-300 truncate">
                Son diffusé sans interface vidéo externe
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onTogglePlay}
            className="min-h-[30px] px-3 py-1 rounded-full bg-white text-stone-900 hover:bg-stone-100 text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
          >
            <Pause className="w-3 h-3" />
            <span>Arrêter</span>
          </button>
        </div>
      );
    }

    return null;
  };

  const renderAudioStreams = () => (
    <>
      {/* Direct audio stream (controlled by Lisière's custom audio bar above) */}
      {parsed.type === 'audio' && parsed.originalUrl && (
        <>
          <audio
            ref={audioRef}
            src={parsed.originalUrl}
            preload="metadata"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onEnded={onTogglePlay}
            onError={() => setAudioFailed(true)}
            className="hidden"
          />
          {audioFailed && (
            <p
              className={`text-xs mt-1.5 ${
                variant === 'wall-widget' ? 'text-stone-300' : 'text-stone-600'
              }`}
            >
              Lecture directe indisponible sur ce lien audio.
            </p>
          )}
        </>
      )}

      {renderCustomAudioBar()}

      {/* Hidden immersive stream for YouTube and SoundCloud: zero platform branding shown */}
      {isActive && (parsed.type === 'youtube' || parsed.type === 'soundcloud') && parsed.embedUrl && (
        <div className="sr-only" aria-hidden="true">
          <iframe
            title={`Lecture audio de ${title}`}
            src={parsed.embedUrl}
            allow="autoplay; encrypted-media"
            width="1"
            height="1"
          />
        </div>
      )}

      {/* Spotify / Deezer compact minimal audio strip only while actively listening */}
      {isActive && (parsed.type === 'spotify' || parsed.type === 'deezer') && parsed.embedUrl && (
        <div className="rounded-xl overflow-hidden border border-stone-200/80 bg-white mt-2">
          <iframe
            title={`Lecteur audio pour ${title}`}
            src={parsed.embedUrl}
            width="100%"
            height={parsed.type === 'spotify' ? 80 : 90}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block w-full border-0"
          />
        </div>
      )}
    </>
  );

  if (variant === 'wall-widget') {
    return (
      <div className="relative pt-4">
        {/* Floating circular music badge on top edge */}
        <div
          aria-hidden="true"
          className={`absolute top-0 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#FAF9F6] shadow-sm transition-colors duration-300 ${
            isActive
              ? 'bg-[#1B365D] text-white lisiere-music-pulse'
              : 'bg-[#5B4B8A] text-white'
          }`}
        >
          {isActive ? (
            <Disc3 className="w-4 h-4 lisiere-disc-spin" />
          ) : (
            <Music2 className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="bg-[#FAF9F6] text-stone-900 rounded-2xl p-3.5 pt-5 shadow-[6px_6px_0px_rgba(11,10,9,0.85)] border border-white/80">
          <div className="flex items-center gap-3.5">
            {/* Left dark square soundwave artwork */}
            <button
              type="button"
              onClick={canPlayInline ? onTogglePlay : undefined}
              disabled={!canPlayInline}
              aria-label={
                canPlayInline
                  ? isActive
                    ? `Mettre en pause ${title}`
                    : `Écouter ${title}`
                  : title
              }
              className={`w-16 h-16 rounded-xl bg-[#1F1E1C] text-white flex flex-col items-center justify-center shrink-0 relative overflow-hidden transition-transform duration-150 ${
                canPlayInline
                  ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.97]'
                  : 'cursor-default'
              }`}
            >
              <div className="flex items-center justify-center gap-[2.5px] h-7">
                {MINI_WAVE_HEIGHTS.map((height, idx) => (
                  <span
                    key={idx}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${idx * 90}ms`,
                    }}
                    className={`w-[2.5px] rounded-full bg-white ${
                      isActive ? 'lisiere-wave-bar' : 'opacity-85'
                    }`}
                  />
                ))}
              </div>
              {canPlayInline && (
                <span className="mt-1 text-[9px] uppercase tracking-wider text-white/75">
                  {isActive ? 'Pause' : 'Écouter'}
                </span>
              )}
            </button>

            {/* Right track details */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-widest text-stone-500 truncate">
                  {isActive ? 'En écoute' : kicker || 'Musique'}
                </p>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    aria-label={`Supprimer ${title}`}
                    className="text-stone-400 hover:text-red-700 p-0.5 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="font-display text-base font-semibold text-stone-900 leading-snug line-clamp-2">
                {title}
              </p>

              {artist && <p className="text-xs text-stone-600 truncate">{artist}</p>}

              <div className="pt-1 flex items-center justify-between gap-2">
                {canPlayInline ? (
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="min-h-[32px] px-3 py-1 rounded-full text-xs font-medium bg-[#1B365D] text-white hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.96]"
                  >
                    {isActive ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Écouter</span>
                      </>
                    )}
                  </button>
                ) : parsed.type === 'link' && parsed.originalUrl ? (
                  <a
                    href={parsed.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[32px] px-3 py-1 rounded-full text-xs font-medium bg-stone-900 text-white hover:bg-stone-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Écouter</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-stone-400">Sans lien audio</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {renderAudioStreams()}
      </div>
    );
  }

  const primaryText = darkSurface ? 'text-white' : 'text-stone-900';
  const secondaryText = darkSurface ? 'text-white/75' : 'text-stone-600';
  const badgeSurface = darkSurface
    ? 'bg-white/15 border-white/25 text-white'
    : 'bg-[#FBF9F5] border-stone-200 text-stone-800';
  const btnSurface = darkSurface
    ? 'bg-white text-stone-900 hover:bg-stone-100'
    : 'bg-[#1B365D] text-white hover:bg-[#132744]';

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center justify-between gap-3 ${
          compact ? 'py-1' : 'p-3.5 rounded-md border'
        } ${compact ? '' : badgeSurface}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Subtle rotating disc + gentle pulse medallion when audio is active */}
          <div
            aria-hidden="true"
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-colors duration-300 ${
              isActive
                ? darkSurface
                  ? 'bg-white/20 border-white/45 text-white lisiere-music-pulse-light'
                  : 'bg-[#1B365D]/10 border-[#1B365D]/35 text-[#1B365D] lisiere-music-pulse'
                : darkSurface
                  ? 'bg-white/10 border-white/20 text-white/80'
                  : 'bg-white border-stone-200 text-stone-600'
            }`}
          >
            {isActive ? (
              <Disc3 className="w-5 h-5 lisiere-disc-spin" />
            ) : (
              <Music2 className="w-4 h-4 transition-transform duration-200" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-medium truncate ${primaryText}`}>{title}</p>
              {isActive && (
                <span
                  aria-label="Lecture en cours"
                  className="inline-flex items-end gap-[2px] h-3 shrink-0"
                >
                  <span
                    className={`w-[2px] h-2.5 rounded-full lisiere-eq-bar ${
                      darkSurface ? 'bg-white' : 'bg-[#1B365D]'
                    }`}
                  />
                  <span
                    className={`w-[2px] h-3 rounded-full lisiere-eq-bar ${
                      darkSurface ? 'bg-white' : 'bg-[#1B365D]'
                    }`}
                    style={{ animationDelay: '220ms' }}
                  />
                  <span
                    className={`w-[2px] h-2 rounded-full lisiere-eq-bar ${
                      darkSurface ? 'bg-white' : 'bg-[#1B365D]'
                    }`}
                    style={{ animationDelay: '440ms' }}
                  />
                </span>
              )}
            </div>
            {artist && <p className={`text-xs truncate ${secondaryText}`}>{artist}</p>}
            {isActive && (
              <p className={`text-[11px] mt-0.5 inline-flex items-center gap-1 ${secondaryText}`}>
                <Volume2 className="w-3 h-3" />
                <span>En écoute sur le mur</span>
              </p>
            )}
          </div>
        </div>

        {canPlayInline ? (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isActive ? `Mettre en pause ${title}` : `Écouter ${title}`}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-[transform,background-color] duration-150 ease-out active:scale-[0.96] ${btnSurface}`}
          >
            {isActive ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Écouter</span>
              </>
            )}
          </button>
        ) : parsed.type === 'link' && parsed.originalUrl ? (
          <a
            href={parsed.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors ${btnSurface}`}
          >
            <span>Écouter</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>

      {renderAudioStreams()}
    </div>
  );
}
