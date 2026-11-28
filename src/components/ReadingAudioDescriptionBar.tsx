import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility,
  AudioLines,
  Eye,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  X,
} from 'lucide-react';

export interface AudioDescriptionContext {
  storyId: string;
  title: string;
  authorName: string;
  isAnonymous: boolean;
  isRoman: boolean;
  genreLabel?: string;
  salonLabel: string;
  salonAtmosphere?: string;
  hasCustomCover: boolean;
  isMature?: boolean;
  matureReason?: string;
  currentChapterNumber: number;
  totalChapters: number;
  chapterTitle?: string;
  authorNote?: string;
  readingMinutes: number;
  paragraphs: string[];
}

interface SpeechChunk {
  id: string;
  kind: 'description' | 'body' | 'outro';
  paragraphIndex: number | null;
  statusLabel: string;
  text: string;
}

const SPEECH_RATES = [
  { value: 0.85, label: '0,85×' },
  { value: 1, label: '1×' },
  { value: 1.15, label: '1,15×' },
  { value: 1.35, label: '1,35×' },
] as const;

function splitIntoSpeechChunks(text: string, maxLen = 220): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const sentences = cleaned.match(/[^.!?…]+[.!?…]*\s*/g) ?? [cleaned];
  const chunks: string[] = [];
  let buffer = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if ((buffer ? `${buffer} ${sentence}` : sentence).length <= maxLen) {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    } else {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      if (sentence.length <= maxLen) {
        buffer = sentence;
      } else {
        const words = sentence.split(' ');
        for (const word of words) {
          if ((buffer ? `${buffer} ${word}` : word).length <= maxLen) {
            buffer = buffer ? `${buffer} ${word}` : word;
          } else {
            if (buffer) chunks.push(buffer);
            buffer = word;
          }
        }
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function buildNarrationQueue(
  ctx: AudioDescriptionContext,
  includeAudioDescription: boolean
): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  const totalParas = ctx.paragraphs.length;

  if (includeAudioDescription) {
    const introParts: string[] = [
      `Audiodescription de Lisière.`,
      `${ctx.isRoman ? 'Roman à chapitres' : 'Confession'}${
        ctx.genreLabel ? `, genre ${ctx.genreLabel}` : ''
      }, intitulé : ${ctx.title}.`,
      ctx.isAnonymous
        ? 'Texte publié de manière anonyme.'
        : `Écrit par ${ctx.authorName}.`,
      `Salon d’origine : ${ctx.salonLabel}${
        ctx.salonAtmosphere ? `, ambiance ${ctx.salonAtmosphere}` : ''
      }.`,
    ];

    if (ctx.isRoman) {
      introParts.push(
        ctx.hasCustomCover
          ? 'Description visuelle : une couverture illustrée personnelle accompagne ce roman.'
          : 'Description visuelle : couverture éditoriale couleur parchemin avec liseré d’encre et titre en lettres serif.'
      );
    }

    if (ctx.isMature) {
      introParts.push(
        `Avertissement : contenu mature${
          ctx.matureReason ? `, ${ctx.matureReason}` : ''
        }.`
      );
    }

    if (ctx.isRoman) {
      introParts.push(
        `Chapitre ${ctx.currentChapterNumber} sur ${ctx.totalChapters}${
          ctx.chapterTitle ? ` : ${ctx.chapterTitle}` : ''
        }.`
      );
    }

    introParts.push(
      `Temps de lecture estimé : ${ctx.readingMinutes} minute${
        ctx.readingMinutes > 1 ? 's' : ''
      }, ${totalParas} paragraphe${totalParas > 1 ? 's' : ''}.`
    );

    const introText = introParts.join(' ');
    splitIntoSpeechChunks(introText).forEach((part, partIdx) => {
      chunks.push({
        id: `intro-${partIdx}`,
        kind: 'description',
        paragraphIndex: null,
        statusLabel: 'Audiodescription · Présentation visuelle de l’œuvre',
        text: part,
      });
    });
  }

  ctx.paragraphs.forEach((para, idx) => {
    const statusLabel = `Paragraphe ${idx + 1} sur ${totalParas}`;
    splitIntoSpeechChunks(para).forEach((part, partIdx) => {
      chunks.push({
        id: `p-${idx}-${partIdx}`,
        kind: 'body',
        paragraphIndex: idx,
        statusLabel,
        text: part,
      });
    });
  });

  if (includeAudioDescription) {
    if (ctx.authorNote?.trim()) {
      splitIntoSpeechChunks(
        `Note de fin de l’auteur : ${ctx.authorNote.trim()}`
      ).forEach((part, partIdx) => {
        chunks.push({
          id: `note-${partIdx}`,
          kind: 'outro',
          paragraphIndex: null,
          statusLabel: 'Audiodescription · Note de fin de l’auteur',
          text: part,
        });
      });
    }

    const endingText =
      ctx.isRoman && ctx.currentChapterNumber < ctx.totalChapters
        ? `Fin du chapitre ${ctx.currentChapterNumber} sur ${ctx.totalChapters}. Utilisez le bouton Chapitre suivant pour poursuivre la lecture.`
        : 'Fin de la lecture audio.';

    chunks.push({
      id: 'outro-end',
      kind: 'outro',
      paragraphIndex: null,
      statusLabel: 'Audiodescription · Fin du passage',
      text: endingText,
    });
  }

  return chunks;
}

export interface StoryAudioDescriptionController {
  isSupported: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isActive: boolean;
  includeAudioDescription: boolean;
  setIncludeAudioDescription: (next: boolean) => void;
  speechRate: number;
  setSpeechRate: (next: number) => void;
  frenchVoices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  setSelectedVoiceURI: (uri: string) => void;
  activeChunkIndex: number;
  activeParagraphIndex: number | null;
  activeKind: 'description' | 'body' | 'outro' | null;
  statusText: string;
  totalParagraphs: number;
  startOrTogglePlay: () => void;
  restartWithDescription: () => void;
  stop: () => void;
  playFromParagraph: (paragraphIdx: number) => void;
  stepParagraph: (delta: -1 | 1) => void;
}

export function useStoryAudioDescription(
  context: AudioDescriptionContext | null,
  options?: { onBeforeStart?: () => void }
): StoryAudioDescriptionController {
  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [includeAudioDescription, setIncludeAudioDescription] = useState(true);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeChunkIndex, setActiveChunkIndex] = useState<number>(-1);

  const sessionTokenRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const rateRef = useRef(speechRate);
  rateRef.current = speechRate;
  const voiceUriRef = useRef(selectedVoiceURI);
  voiceUriRef.current = selectedVoiceURI;
  const onBeforeStartRef = useRef(options?.onBeforeStart);
  onBeforeStartRef.current = options?.onBeforeStart;

  useEffect(() => {
    if (!isSupported) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      if (all.length > 0) setVoices(all);
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  const frenchVoices = useMemo(() => {
    const fr = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));
    return fr.length > 0 ? fr : voices;
  }, [voices]);

  useEffect(() => {
    if (frenchVoices.length === 0) return;
    if (selectedVoiceURI && frenchVoices.some((v) => v.voiceURI === selectedVoiceURI)) {
      return;
    }
    const preferred =
      frenchVoices.find(
        (v) => v.lang.toLowerCase() === 'fr-fr' && !v.localService
      ) ??
      frenchVoices.find((v) => v.lang.toLowerCase() === 'fr-fr') ??
      frenchVoices[0];
    if (preferred) {
      setSelectedVoiceURI(preferred.voiceURI);
    }
  }, [frenchVoices, selectedVoiceURI]);

  const queue = useMemo(() => {
    if (!context) return [];
    return buildNarrationQueue(context, includeAudioDescription);
  }, [context, includeAudioDescription]);

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const stop = useCallback(() => {
    sessionTokenRef.current += 1;
    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setActiveChunkIndex(-1);
    if (isSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser speech cancel errors
      }
    }
  }, [isSupported]);

  // Reset cleanly whenever story or chapter changes or component unmounts
  useEffect(() => {
    stop();
  }, [context?.storyId, context?.currentChapterNumber, stop]);

  useEffect(() => {
    return () => {
      sessionTokenRef.current += 1;
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [isSupported]);

  const speakChunkAt = useCallback(
    (index: number, token: number) => {
      if (!isSupported) return;
      const currentQueue = queueRef.current;
      if (token !== sessionTokenRef.current) return;

      if (index < 0 || index >= currentQueue.length) {
        isPlayingRef.current = false;
        isPausedRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        setActiveChunkIndex(-1);
        return;
      }

      const chunk = currentQueue[index];
      setActiveChunkIndex(index);

      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = 'fr-FR';
      utterance.rate = rateRef.current;

      const matchedVoice = frenchVoices.find(
        (v) => v.voiceURI === voiceUriRef.current
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang || 'fr-FR';
      }

      utterance.onend = () => {
        if (token !== sessionTokenRef.current) return;
        if (isPausedRef.current) return;
        speakChunkAt(index + 1, token);
      };

      utterance.onerror = (ev) => {
        if (token !== sessionTokenRef.current) return;
        if (ev.error === 'interrupted' || ev.error === 'canceled') return;
        speakChunkAt(index + 1, token);
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        stop();
      }
    },
    [isSupported, frenchVoices, stop]
  );

  const startAtChunk = useCallback(
    (index: number) => {
      if (!isSupported || queueRef.current.length === 0) return;
      onBeforeStartRef.current?.();
      sessionTokenRef.current += 1;
      const token = sessionTokenRef.current;
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
      isPlayingRef.current = true;
      isPausedRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);
      speakChunkAt(index, token);
    },
    [isSupported, speakChunkAt]
  );

  const startOrTogglePlay = useCallback(() => {
    if (!isSupported || queueRef.current.length === 0) return;
    if (isPlayingRef.current && !isPausedRef.current) {
      try {
        window.speechSynthesis.pause();
      } catch {
        // Fallback: stop if pause not supported
      }
      isPausedRef.current = true;
      setIsPaused(true);
      return;
    }

    if (isPlayingRef.current && isPausedRef.current) {
      onBeforeStartRef.current?.();
      isPausedRef.current = false;
      setIsPaused(false);
      try {
        window.speechSynthesis.resume();
      } catch {
        startAtChunk(Math.max(0, activeChunkIndex));
      }
      return;
    }

    startAtChunk(0);
  }, [isSupported, activeChunkIndex, startAtChunk]);

  const restartWithDescription = useCallback(() => {
    startAtChunk(0);
  }, [startAtChunk]);

  const playFromParagraph = useCallback(
    (paragraphIdx: number) => {
      const idx = queueRef.current.findIndex(
        (c) => c.paragraphIndex === paragraphIdx
      );
      if (idx !== -1) {
        startAtChunk(idx);
      }
    },
    [startAtChunk]
  );

  const stepParagraph = useCallback(
    (delta: -1 | 1) => {
      const total = context?.paragraphs.length ?? 0;
      if (total === 0) return;
      const activeChunk =
        activeChunkIndex >= 0 ? queueRef.current[activeChunkIndex] : undefined;
      const currentPara = activeChunk?.paragraphIndex;
      let targetPara = 0;
      if (currentPara === null || currentPara === undefined) {
        targetPara = delta > 0 ? 0 : total - 1;
      } else {
        targetPara = Math.max(0, Math.min(total - 1, currentPara + delta));
      }
      playFromParagraph(targetPara);
    },
    [activeChunkIndex, context?.paragraphs.length, playFromParagraph]
  );

  const handleChangeSpeechRate = useCallback(
    (nextRate: number) => {
      setSpeechRate(nextRate);
      rateRef.current = nextRate;
      if (isPlayingRef.current && !isPausedRef.current && activeChunkIndex >= 0) {
        startAtChunk(activeChunkIndex);
      }
    },
    [activeChunkIndex, startAtChunk]
  );

  const activeChunk =
    activeChunkIndex >= 0 && activeChunkIndex < queue.length
      ? queue[activeChunkIndex]
      : null;

  const statusText = useMemo(() => {
    if (!isSupported) {
      return 'La synthèse vocale n’est pas disponible sur ce navigateur.';
    }
    if (!isPlaying) {
      return includeAudioDescription
        ? 'Audiodescription prête (couverture, salon, format et texte).'
        : 'Lecture vocale prête.';
    }
    if (isPaused && activeChunk) {
      return `En pause · ${activeChunk.statusLabel}`;
    }
    return activeChunk?.statusLabel ?? 'Lecture audio en cours…';
  }, [isSupported, isPlaying, isPaused, activeChunk, includeAudioDescription]);

  return {
    isSupported,
    isPlaying,
    isPaused,
    isActive: isPlaying || activeChunkIndex >= 0,
    includeAudioDescription,
    setIncludeAudioDescription,
    speechRate,
    setSpeechRate: handleChangeSpeechRate,
    frenchVoices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    activeChunkIndex,
    activeParagraphIndex: activeChunk?.paragraphIndex ?? null,
    activeKind: activeChunk?.kind ?? null,
    statusText,
    totalParagraphs: context?.paragraphs.length ?? 0,
    startOrTogglePlay,
    restartWithDescription,
    stop,
    playFromParagraph,
    stepParagraph,
  };
}

interface ReadingAudioDescriptionBarProps {
  controller: StoryAudioDescriptionController;
  paragraphFocusMode: boolean;
  onToggleParagraphFocusMode: () => void;
  zenNight?: boolean;
  zenSepia?: boolean;
  onClose?: () => void;
}

export function ReadingAudioDescriptionBar({
  controller,
  paragraphFocusMode,
  onToggleParagraphFocusMode,
  zenNight = false,
  zenSepia = false,
  onClose,
}: ReadingAudioDescriptionBarProps) {
  const surfaceClass = zenNight
    ? 'bg-[#211E1B] border-[#38332E] text-[#EAE4D9]'
    : zenSepia
      ? 'bg-[#EFE4CC] border-[#D8C9AA] text-[#2F261D]'
      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100';

  const secondaryBtnClass = zenNight
    ? 'border-[#3D3832] bg-[#2B2723] text-[#EAE4D9] hover:border-amber-300/60'
    : zenSepia
      ? 'border-[#D4C3A1] bg-[#F7EEDB] text-[#2F261D] hover:border-[#8C4D0E]'
      : 'border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 text-stone-800 dark:text-stone-200 hover:border-[#1B365D] dark:hover:border-amber-400';

  const primaryBtnClass = zenNight
    ? 'bg-amber-200 text-stone-950 hover:bg-amber-100 border-amber-200'
    : 'bg-[#1B365D] dark:bg-amber-600 text-white hover:bg-[#132744] dark:hover:bg-amber-500 border-[#1B365D] dark:border-amber-600';

  return (
    <section
      aria-label="Lecteur d’audiodescription et accessibilité visuelle"
      className={`rounded-lg border p-3.5 sm:p-4 space-y-3 transition-colors ${surfaceClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
              zenNight
                ? 'bg-amber-200/15 text-amber-200'
                : 'bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
            }`}
          >
            {controller.isPlaying && !controller.isPaused ? (
              <AudioLines className="w-4 h-4" />
            ) : (
              <Accessibility className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Audiodescription &amp; lecture vocale
            </p>
            <p
              aria-live="polite"
              className="text-xs opacity-80 leading-snug"
            >
              {controller.statusText}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Masquer le panneau d’audiodescription"
            className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded opacity-70 hover:opacity-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!controller.isSupported ? (
        <p className="text-xs opacity-75">
          Votre navigateur actuel ne prend pas en charge la synthèse vocale intégrée. Activez le lecteur d’écran de votre appareil pour parcourir le texte structuré.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={controller.startOrTogglePlay}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${primaryBtnClass}`}
            >
              {controller.isPlaying && !controller.isPaused ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : controller.isPlaying && controller.isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Reprendre</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Écouter l’audiodescription</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={controller.restartWithDescription}
              title="Relancer depuis la présentation visuelle"
              aria-label="Relancer l’audiodescription depuis le début"
              className={`min-h-[38px] px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${secondaryBtnClass}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Depuis le début</span>
            </button>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={controller.totalParagraphs === 0}
                onClick={() => controller.stepParagraph(-1)}
                aria-label="Paragraphe précédent"
                title="Paragraphe précédent"
                className={`min-h-[38px] min-w-[38px] px-2 rounded-md border inline-flex items-center justify-center disabled:opacity-45 transition-colors ${secondaryBtnClass}`}
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={controller.totalParagraphs === 0}
                onClick={() => controller.stepParagraph(1)}
                aria-label="Paragraphe suivant"
                title="Paragraphe suivant"
                className={`min-h-[38px] min-w-[38px] px-2 rounded-md border inline-flex items-center justify-center disabled:opacity-45 transition-colors ${secondaryBtnClass}`}
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {controller.isPlaying && (
              <button
                type="button"
                onClick={controller.stop}
                aria-label="Arrêter la lecture vocale"
                className={`min-h-[38px] px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${secondaryBtnClass}`}
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Arrêter</span>
              </button>
            )}

            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[11px] opacity-70 mr-1 hidden sm:inline">
                Vitesse :
              </span>
              {SPEECH_RATES.map((rateOpt) => {
                const active = controller.speechRate === rateOpt.value;
                return (
                  <button
                    key={rateOpt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => controller.setSpeechRate(rateOpt.value)}
                    className={`min-h-[34px] px-2 py-1 rounded border text-[11px] font-medium tabular-nums transition-colors ${
                      active ? primaryBtnClass : secondaryBtnClass
                    }`}
                  >
                    {rateOpt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-current/10 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={controller.includeAudioDescription}
                  onChange={(e) =>
                    controller.setIncludeAudioDescription(e.target.checked)
                  }
                  className="rounded border-stone-300 dark:border-stone-600 text-[#1B365D]"
                />
                <span>Décrire couverture, salon &amp; structure</span>
              </label>

              <button
                type="button"
                aria-pressed={paragraphFocusMode}
                onClick={onToggleParagraphFocusMode}
                className={`min-h-[30px] px-2.5 py-1 rounded border text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                  paragraphFocusMode ? primaryBtnClass : secondaryBtnClass
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Focus paragraphe animé</span>
              </button>
            </div>

            {controller.frenchVoices.length > 1 && (
              <div className="flex items-center gap-1.5 max-w-full">
                <label
                  htmlFor="lisiere-speech-voice"
                  className="text-[11px] opacity-70 shrink-0"
                >
                  Voix :
                </label>
                <select
                  id="lisiere-speech-voice"
                  value={controller.selectedVoiceURI}
                  onChange={(e) => controller.setSelectedVoiceURI(e.target.value)}
                  className={`min-h-[30px] max-w-[200px] px-2 py-1 rounded border text-[11px] truncate ${secondaryBtnClass}`}
                >
                  {controller.frenchVoices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
