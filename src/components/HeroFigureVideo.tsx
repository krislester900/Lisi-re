import React, { useCallback, useEffect, useRef } from 'react';

interface HeroFigureVideoProps {
  src: string;
  introActive?: boolean;
  onError?: () => void;
}

/**
 * Hero Figure continuous looping video with automatic audio.
 * - No controls, no pause/play UI, no volume overlay, no user options.
 * - Plays continuously in a loop as soon as loaded/visible.
 * - Unmutes automatically when visible (or on first gesture if browser blocks unmuted autoplay).
 * - Immediately mutes audio once the user scrolls past the video or hides the tab.
 */
export function HeroFigureVideo({
  src,
  introActive = false,
  onError,
}: HeroFigureVideoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isInViewRef = useRef(true);
  const introActiveRef = useRef(introActive);
  introActiveRef.current = introActive;

  const computeIsInViewport = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return false;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return false;

    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(window.innerHeight, rect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleRatio = visibleHeight / rect.height;

    return visibleRatio >= 0.25 && rect.bottom > 40;
  }, []);

  const syncPlaybackAndAudio = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const inView = isInViewRef.current;
    const canHearAudio =
      inView &&
      !introActiveRef.current &&
      typeof document !== 'undefined' &&
      !document.hidden;

    const ensurePlay = () => {
      if (!video.paused) return;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          video.muted = true;
          void video.play().catch(() => {});
        });
      }
    };

    if (!canHearAudio) {
      video.muted = true;
      ensurePlay();
      return;
    }

    video.volume = 0.85;
    video.muted = false;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        video.muted = true;
        void video.play().catch(() => {});
      });
    } else {
      queueMicrotask(() => {
        if (video.paused && !video.muted) {
          video.muted = true;
          void video.play().catch(() => {});
        }
      });
    }
  }, []);

  useEffect(() => {
    isInViewRef.current = computeIsInViewport();
    syncPlaybackAndAudio();
  }, [introActive, computeIsInViewport, syncPlaybackAndAudio]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateVisibility = () => {
      isInViewRef.current = computeIsInViewport();
      syncPlaybackAndAudio();
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          isInViewRef.current =
            entry.isIntersecting && entry.intersectionRatio >= 0.25;
          syncPlaybackAndAudio();
        },
        {
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        }
      );
      observer.observe(container);
    }

    const handleGestureUnlock = () => {
      if (isInViewRef.current && !introActiveRef.current && !document.hidden) {
        syncPlaybackAndAudio();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (videoRef.current) {
          videoRef.current.muted = true;
        }
      } else {
        updateVisibility();
      }
    };

    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility, { passive: true });
    window.addEventListener('pointerdown', handleGestureUnlock, { passive: true });
    window.addEventListener('touchstart', handleGestureUnlock, { passive: true });
    window.addEventListener('keydown', handleGestureUnlock, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const video = videoRef.current;
    const handleCanPlay = () => syncPlaybackAndAudio();
    const handleBrowserForcedPause = () => {
      if (video && !video.muted && !document.hidden) {
        video.muted = true;
        void video.play().catch(() => {});
      }
    };
    const handleEnded = () => {
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => {});
      }
    };

    if (video) {
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('pause', handleBrowserForcedPause);
      video.addEventListener('ended', handleEnded);
    }

    updateVisibility();

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      window.removeEventListener('pointerdown', handleGestureUnlock);
      window.removeEventListener('touchstart', handleGestureUnlock);
      window.removeEventListener('keydown', handleGestureUnlock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (video) {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('pause', handleBrowserForcedPause);
        video.removeEventListener('ended', handleEnded);
        video.muted = true;
        video.pause();
      }
    };
  }, [computeIsInViewport, syncPlaybackAndAudio]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full aspect-[702/360] rounded-md border border-stone-200/80 dark:border-stone-700/70 bg-[#F2EFF3] overflow-hidden select-none shadow-[0_18px_42px_-12px_rgba(28,25,23,0.20),0_6px_16px_-6px_rgba(28,25,23,0.10)] dark:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.65)]"
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        playsInline
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate nofullscreen"
        aria-label="Illustration animée — Prendre le temps d’écrire pour aller à la rencontre des autres"
        className="w-full h-full object-cover pointer-events-none select-none block"
        onError={() => onError?.()}
      />
    </div>
  );
}
