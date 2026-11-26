import React, { useEffect, useRef, useState } from 'react';

interface LaunchIntroProps {
  onComplete: () => void;
}

interface StrokeSpec {
  id: string;
  kind: 'path' | 'dot';
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  strokeWidth?: number;
  durationMs: number;
  pauseAfterMs?: number;
}

const LOGO_STROKES: StrokeSpec[] = [
  {
    id: 'L',
    kind: 'path',
    d: 'M10 10.5V47.4C10 48.9 10.7 49.4 12.2 49.4H24.5',
    strokeWidth: 5.1,
    durationMs: 280,
    pauseAfterMs: 40,
  },
  {
    id: 'is',
    kind: 'path',
    d: 'M32.5 24V43.5C32.5 50.6 39.2 51.4 43.2 44.5L50.8 27.6C51.3 26.5 52.3 26.4 53.1 27.3C57.8 32.8 62.2 38.4 61.6 44.2C61.1 49.6 54.6 51.2 49.4 48.5',
    strokeWidth: 5.1,
    durationMs: 440,
    pauseAfterMs: 30,
  },
  {
    id: 'dot1',
    kind: 'dot',
    cx: 32.5,
    cy: 14,
    r: 3.1,
    durationMs: 110,
    pauseAfterMs: 30,
  },
  {
    id: 'i2',
    kind: 'path',
    d: 'M72.5 24V52',
    strokeWidth: 5.1,
    durationMs: 170,
    pauseAfterMs: 25,
  },
  {
    id: 'dot2',
    kind: 'dot',
    cx: 72.5,
    cy: 14,
    r: 3.1,
    durationMs: 110,
    pauseAfterMs: 35,
  },
  {
    id: 'e1',
    kind: 'path',
    d: 'M83 38.5H103.5C103.5 30 99 26.5 93.5 26.5C86.8 26.5 82.5 31.5 82.5 38.5C82.5 45.8 87.2 49.6 94 49.6C98.2 49.6 101.2 48.2 103 46.2',
    strokeWidth: 5.1,
    durationMs: 340,
    pauseAfterMs: 30,
  },
  {
    id: 'grave',
    kind: 'path',
    d: 'M88 12.2L96 18.2',
    strokeWidth: 4.4,
    durationMs: 120,
    pauseAfterMs: 35,
  },
  {
    id: 'r',
    kind: 'path',
    d: 'M112.5 26.5H126C127.2 26.5 127.4 27.4 126.4 29.2L119.5 43.5C117.8 47.2 119.4 50 123.5 49.8C127.6 49.6 131.2 46 134 41.2',
    strokeWidth: 5.1,
    durationMs: 290,
    pauseAfterMs: 25,
  },
  {
    id: 'e2',
    kind: 'path',
    d: 'M138.5 38.5H158.5C158.5 30 154 26.5 148.5 26.5C141.8 26.5 137.5 31.5 137.5 38.5C137.5 45.8 142.2 49.6 149 49.6C153.2 49.6 156.2 48.2 158 46.2',
    strokeWidth: 5.1,
    durationMs: 330,
    pauseAfterMs: 0,
  },
];

export function LaunchIntro({ onComplete }: LaunchIntroProps) {
  const [fadingOut, setFadingOut] = useState(false);
  const [penState, setPenState] = useState<{
    x: number;
    y: number;
    angle: number;
    opacity: number;
    lift: number;
  }>({ x: 10, y: 10.5, angle: 0, opacity: 0, lift: 0 });

  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const dotRefs = useRef<Record<string, SVGCircleElement | null>>({});
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      onCompleteRef.current();
      return;
    }

    let rafId = 0;
    let fadeTimer = 0;
    let doneTimer = 0;

    // Initialize all strokes hidden
    const lengths: Record<string, number> = {};
    for (const spec of LOGO_STROKES) {
      if (spec.kind === 'path') {
        const el = pathRefs.current[spec.id];
        if (el) {
          const len = el.getTotalLength();
          lengths[spec.id] = len;
          el.style.strokeDasharray = `${len}`;
          el.style.strokeDashoffset = `${len}`;
          el.style.opacity = '1';
        }
      } else {
        const dotEl = dotRefs.current[spec.id];
        if (dotEl) {
          dotEl.style.transform = 'scale(0)';
          dotEl.style.opacity = '0';
        }
      }
    }

    // Build timeline segments with precomputed start/end points
    const timeline: Array<{
      spec: StrokeSpec;
      startMs: number;
      endMs: number;
      startPt: { x: number; y: number };
      endPt: { x: number; y: number };
    }> = [];
    let cursorMs = 180;
    for (const spec of LOGO_STROKES) {
      const startMs = cursorMs;
      const endMs = startMs + spec.durationMs;
      let startPt = { x: spec.cx ?? 10, y: spec.cy ?? 10.5 };
      let endPt = { x: spec.cx ?? 10, y: spec.cy ?? 10.5 };
      if (spec.kind === 'path') {
        const el = pathRefs.current[spec.id];
        const len = lengths[spec.id] || 0;
        if (el && len > 0) {
          const p0 = el.getPointAtLength(0);
          const p1 = el.getPointAtLength(len);
          startPt = { x: p0.x, y: p0.y };
          endPt = { x: p1.x, y: p1.y };
        }
      }
      timeline.push({ spec, startMs, endMs, startPt, endPt });
      cursorMs = endMs + (spec.pauseAfterMs ?? 0);
    }
    const totalWriteMs = cursorMs;

    let startTimestamp: number | null = null;
    let prevX = 10;

    const tick = (now: number) => {
      if (startTimestamp === null) startTimestamp = now;
      const elapsed = now - startTimestamp;

      let activeX = 10;
      let activeY = 10.5;
      let lift = 0;
      let penOpacity = 1;

      if (elapsed < 180) {
        const t = elapsed / 180;
        penOpacity = t;
        activeX = 10;
        activeY = 10.5 - (1 - t) * 10;
        lift = (1 - t) * 4;
      } else if (elapsed <= totalWriteMs) {
        for (let i = 0; i < timeline.length; i++) {
          const seg = timeline[i];
          const { spec, startMs, endMs } = seg;
          if (elapsed >= endMs) {
            if (spec.kind === 'path') {
              const el = pathRefs.current[spec.id];
              if (el) el.style.strokeDashoffset = '0';
            } else {
              const dotEl = dotRefs.current[spec.id];
              if (dotEl) {
                dotEl.style.transform = 'scale(1)';
                dotEl.style.opacity = '1';
              }
            }
            activeX = seg.endPt.x;
            activeY = seg.endPt.y;
          } else if (elapsed >= startMs) {
            const rawT = (elapsed - startMs) / spec.durationMs;
            const eased =
              rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

            if (spec.kind === 'path') {
              const el = pathRefs.current[spec.id];
              const len = lengths[spec.id] || 0;
              if (el && len > 0) {
                el.style.strokeDashoffset = `${len * (1 - eased)}`;
                const pt = el.getPointAtLength(len * eased);
                activeX = pt.x;
                activeY = pt.y;
              }
            } else if (spec.cx !== undefined && spec.cy !== undefined) {
              const dotEl = dotRefs.current[spec.id];
              const pop = Math.min(1, rawT * 1.6);
              if (dotEl) {
                dotEl.style.transform = `scale(${pop})`;
                dotEl.style.opacity = `${pop}`;
              }
              activeX = spec.cx;
              activeY = spec.cy;
              lift = Math.sin(rawT * Math.PI) * -2;
            }
            break;
          } else {
            // Smooth arc between previous stroke end and current stroke start
            const prevSeg = timeline[i - 1];
            if (prevSeg) {
              const gap = Math.max(1, startMs - prevSeg.endMs);
              const t = Math.min(1, Math.max(0, (elapsed - prevSeg.endMs) / gap));
              activeX = prevSeg.endPt.x + (seg.startPt.x - prevSeg.endPt.x) * t;
              activeY = prevSeg.endPt.y + (seg.startPt.y - prevSeg.endPt.y) * t;
              lift = -4.5 * Math.sin(t * Math.PI);
            }
            break;
          }
        }
      } else {
        // Finished writing: ensure all strokes are visible and gently lift plume
        for (const spec of LOGO_STROKES) {
          if (spec.kind === 'path') {
            const el = pathRefs.current[spec.id];
            if (el) el.style.strokeDashoffset = '0';
          } else {
            const dotEl = dotRefs.current[spec.id];
            if (dotEl) {
              dotEl.style.transform = 'scale(1)';
              dotEl.style.opacity = '1';
            }
          }
        }
        const postT = Math.min(1, (elapsed - totalWriteMs) / 340);
        activeX = 158 + postT * 12;
        activeY = 46.2 - postT * 14;
        penOpacity = 1 - postT;
        lift = -postT * 6;
      }

      const dx = activeX - prevX;
      prevX = activeX;
      const tilt = Math.max(-8, Math.min(8, dx * 1.4));

      setPenState({
        x: activeX,
        y: activeY + lift,
        angle: tilt,
        opacity: penOpacity,
        lift,
      });

      if (elapsed < totalWriteMs + 360) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        fadeTimer = window.setTimeout(() => {
          setFadingOut(true);
          doneTimer = window.setTimeout(() => onCompleteRef.current(), 480);
        }, 140);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  const handleSkip = () => {
    setFadingOut(true);
    window.setTimeout(() => onCompleteRef.current(), 250);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-white dark:bg-stone-950 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Animation d’ouverture Lisière"
    >
      <div className="w-full max-w-md flex flex-col items-center">
        <svg
          viewBox="-8 -38 205 112"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto overflow-visible text-stone-900 dark:text-stone-100"
          role="img"
          aria-label="Lisière"
        >
          {/* Written strokes */}
          <g>
            {LOGO_STROKES.map((spec) =>
              spec.kind === 'path' ? (
                <path
                  key={spec.id}
                  ref={(el) => {
                    pathRefs.current[spec.id] = el;
                  }}
                  d={spec.d}
                  stroke="currentColor"
                  strokeWidth={spec.strokeWidth}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                  style={{ opacity: 0 }}
                />
              ) : (
                <circle
                  key={spec.id}
                  ref={(el) => {
                    dotRefs.current[spec.id] = el;
                  }}
                  cx={spec.cx}
                  cy={spec.cy}
                  r={spec.r}
                  fill="currentColor"
                  style={{
                    transformOrigin: `${spec.cx}px ${spec.cy}px`,
                    opacity: 0,
                  }}
                />
              )
            )}
          </g>

          {/* Plume / Quill nib positioned directly at (x, y) */}
          <g
            transform={`translate(${penState.x}, ${penState.y}) rotate(${penState.angle})`}
            style={{ opacity: penState.opacity }}
          >
            {/* Subtle ink contact shadow */}
            <circle cx="0" cy="0" r="2.2" fill="#1E3A8A" opacity="0.22" />

            {/* Nib tip & collar (exact tip at 0,0) */}
            <path
              d="M0 0 L4.8 -9.5 L8.8 -7.2 Z"
              className="fill-[#1C1917] dark:fill-stone-100"
            />
            <path
              d="M2.4 -4.8 L6.2 -7.8"
              className="stroke-white dark:stroke-stone-950"
              strokeWidth="0.7"
              strokeLinecap="round"
              opacity="0.7"
            />
            <circle cx="4.5" cy="-5.2" r="0.7" className="fill-white dark:fill-stone-950" opacity="0.85" />

            {/* Feather shaft (rachis) curving upward-right */}
            <path
              d="M6.8 -8.4 C12 -18, 22 -30, 38 -40"
              className="stroke-[#1C1917] dark:stroke-stone-100"
              strokeWidth="1.5"
              strokeLinecap="round"
            />

            {/* Feather plume vane */}
            <path
              d="M7.5 -9.5
                 C9.5 -20, 17 -31, 31 -39
                 C35 -41, 39 -41.5, 42 -41
                 C39 -35, 34 -27, 25 -20
                 C22.5 -18, 20.5 -17.5, 19 -17
                 L21.5 -19.5
                 C17 -16, 13 -12, 8 -8.5 Z"
              className="fill-[#1C1917] dark:fill-stone-100"
              opacity="0.92"
            />

            {/* Subtle feather barb slits */}
            <path
              d="M17 -24 L21 -21.5 M23 -30 L27 -27 M29 -35 L33 -32"
              className="stroke-white dark:stroke-stone-950"
              strokeWidth="0.9"
              strokeLinecap="round"
              opacity="0.85"
            />
          </g>
        </svg>
      </div>

      <p className="mt-6 text-xs text-stone-500 dark:text-stone-400 tracking-wide">
        Créé par Kris Ivan N’dri
      </p>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-4 text-xs text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors tracking-wide"
      >
        Passer
      </button>
    </div>
  );
}
