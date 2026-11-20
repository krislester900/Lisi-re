import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Disc3,
  Heart,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ReadingMusicPanel, useReadingAudioEngine } from './ReadingMusicPanel';
import {
  addStoryChapter,
  addStoryEcho,
  buildExchangeId,
  createExchangeWithFirstMessage,
  fetchPublicProfile,
  formatLocalDateKey,
  recordStoryView,
  subscribeToStoryChapters,
  subscribeToStoryEchoes,
  subscribeToUserResonance,
  toggleStoryResonance,
} from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  ECHO_TYPE_LABELS,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Chapter,
  CustomSalon,
  Echo,
  EchoReplyType,
  Exchange,
  FIELD_LIMITS,
  PublicProfile,
  SeriesStatus,
  Story,
  StoryThemeId,
} from '../types/story';

interface StoryReaderModalProps {
  story: Story | null;
  onClose: () => void;
  existingExchanges: Exchange[];
  customSalons?: CustomSalon[];
  isBookmarked?: boolean;
  isReposted?: boolean;
  onToggleBookmark?: (story: Story) => void;
  onOpenRepost?: (story: Story) => void;
  onOpenExchange: (exchangeId: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onEnterSalon?: (salonId: StoryThemeId) => void;
  onEnterCustomSalon?: (customSalonId: string) => void;
  onOpenPeleMele?: () => void;
}

export function StoryReaderModal({
  story,
  onClose,
  existingExchanges,
  customSalons = [],
  isBookmarked = false,
  isReposted = false,
  onToggleBookmark,
  onOpenRepost,
  onOpenExchange,
  onOpenMemberWall,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenPeleMele,
}: StoryReaderModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0); // 0 = Chapitre 1 (story.content), >=1 = chapters[idx - 1]
  const [hasResonated, setHasResonated] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<PublicProfile | null>(null);
  const [resonateBusy, setResonateBusy] = useState(false);

  const [replyType, setReplyType] = useState<EchoReplyType>('comment');
  const [echoText, setEchoText] = useState('');
  const [echoBusy, setEchoBusy] = useState(false);
  const [echoError, setEchoError] = useState<string | null>(null);

  const [showBridgeBox, setShowBridgeBox] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState('');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Author chapter composer state
  const [showChapterForm, setShowChapterForm] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterNote, setChapterNote] = useState('');
  const [markCompleted, setMarkCompleted] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [zenTheme, setZenTheme] = useState<'paper' | 'sepia' | 'night'>(() => {
    try {
      const saved = window.localStorage.getItem('lisiere_zen_theme');
      if (saved === 'paper' || saved === 'sepia' || saved === 'night') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'paper';
  });
  const [zenFontSize, setZenFontSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      const saved = window.localStorage.getItem('lisiere_zen_size');
      if (saved === 'sm' || saved === 'md' || saved === 'lg') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'md';
  });
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const audioController = useReadingAudioEngine(Boolean(story));

  useEffect(() => {
    try {
      window.localStorage.setItem('lisiere_zen_theme', zenTheme);
    } catch {
      // Ignore
    }
  }, [zenTheme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('lisiere_zen_size', zenFontSize);
    } catch {
      // Ignore
    }
  }, [zenFontSize]);

  useEffect(() => {
    if (!story) return;
    setZenMode(false);
    setShowMusicPanel(false);
    setScrollProgress(0);
    setEchoText('');
    setEchoError(null);
    setReplyType('comment');
    setShowBridgeBox(false);
    setBridgeMessage('');
    setBridgeError(null);
    setActiveChapterIdx(0);
    setShowChapterForm(false);
    setChapterTitle('');
    setChapterContent('');
    setChapterNote('');
    setMarkCompleted(false);
    setChapterError(null);

    const unsubChapters =
      story.storyFormat === 'roman'
        ? subscribeToStoryChapters(
            story.storyId,
            story.visibility,
            user?.uid ?? null,
            story.authorId,
            setChapters,
            story.customSalonVisibility
          )
        : (() => {
            setChapters([]);
            return () => {};
          })();

    if (story.visibility !== 'public') {
      setEchoes([]);
      setHasResonated(false);
      setAuthorProfile(null);
      return () => {
        unsubChapters();
      };
    }

    const unsubEchoes = subscribeToStoryEchoes(story.storyId, setEchoes);

    let unsubResonance: (() => void) | null = null;
    if (user) {
      unsubResonance = subscribeToUserResonance(story.storyId, user.uid, setHasResonated);
    } else {
      setHasResonated(false);
    }

    void fetchPublicProfile(story.authorId)
      .then((p) => setAuthorProfile(p))
      .catch(() => setAuthorProfile(null));

    if (user && user.emailVerified) {
      const storageKey = `lisiere_view_${story.storyId}_${user.uid}_${formatLocalDateKey()}`;
      let alreadyViewedToday = false;
      try {
        alreadyViewedToday = window.sessionStorage.getItem(storageKey) === '1';
      } catch {
        alreadyViewedToday = false;
      }
      if (!alreadyViewedToday) {
        try {
          window.sessionStorage.setItem(storageKey, '1');
        } catch {
          // Ignore storage unavailability
        }
        void recordStoryView(story.storyId, story.authorId, user.uid).catch((err) => {
          console.warn('Impossible d’enregistrer la vue de lecture:', err);
        });
      }
    }

    return () => {
      unsubChapters();
      unsubEchoes();
      if (unsubResonance) unsubResonance();
    };
  }, [story?.storyId, story?.visibility, story?.storyFormat, story?.authorId, user]);

  useEffect(() => {
    if (!story) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMusicPanel) {
          setShowMusicPanel(false);
        } else if (zenMode) {
          setZenMode(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [story, zenMode, showMusicPanel, onClose]);

  if (!story) return null;

  const isAuthor = Boolean(user && user.uid === story.authorId);
  const isRoman = story.storyFormat === 'roman';
  const theme = THEME_MAP[story.theme];
  const hasOriginSalon = Boolean(story.customSalonId || story.storyScope !== 'pelemele');
  const matchedCustomSalon = story.customSalonId
    ? customSalons.find((cs) => cs.salonId === story.customSalonId)
    : undefined;
  const originPalette = matchedCustomSalon
    ? ACCENT_TONE_PALETTES[matchedCustomSalon.accentTone]
    : hasOriginSalon
      ? theme.palette
      : undefined;
  const originSalonLabel = story.customSalonName
    ? story.customSalonName
    : story.storyScope === 'pelemele'
      ? 'Hors salon · Pêle-mêle'
      : theme.salonName;
  const totalChapters = isRoman ? 1 + chapters.length : 1;
  const activeFollowupChapter =
    isRoman && activeChapterIdx > 0 ? chapters[activeChapterIdx - 1] ?? null : null;

  const authorPinnedMusic = authorProfile?.favoriteTrackTitle
    ? {
        title: authorProfile.favoriteTrackTitle,
        artist: authorProfile.favoriteTrackArtist,
        mediaUrl: authorProfile.favoriteTrackUrl,
      }
    : undefined;

  const displayedContent = activeFollowupChapter ? activeFollowupChapter.content : story.content;
  const displayedMinutes = activeFollowupChapter
    ? activeFollowupChapter.readingMinutes
    : story.readingMinutes;

  const paragraphs = displayedContent
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const existingExchange =
    user && !isAuthor
      ? existingExchanges.find(
          (ex) => ex.exchangeId === buildExchangeId(story.storyId, user.uid, story.authorId)
        )
      : undefined;

  const handleResonate = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (resonateBusy) return;
    setResonateBusy(true);
    try {
      await toggleStoryResonance(story.storyId, user.uid, story.authorId);
    } finally {
      setResonateBusy(false);
    }
  };

  const handleEchoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEchoError(null);
    if (echoText.trim().length < FIELD_LIMITS.echoContent.min) {
      setEchoError('Écrivez au moins 2 caractères pour publier votre commentaire.');
      return;
    }
    setEchoBusy(true);
    try {
      const displayName = profile?.displayName || user.displayName || 'Auteur';
      await addStoryEcho(story.storyId, user.uid, displayName, replyType, echoText);
      setEchoText('');
    } catch (err) {
      setEchoError(
        err instanceof Error ? err.message : 'Impossible de publier ce commentaire.'
      );
    } finally {
      setEchoBusy(false);
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAuthor) return;
    setChapterError(null);
    if (chapterTitle.trim().length < FIELD_LIMITS.chapterTitle.min) {
      setChapterError('Donnez un titre à ce chapitre.');
      return;
    }
    if (chapterContent.trim().length < FIELD_LIMITS.chapterContent.min) {
      setChapterError('Le chapitre doit contenir au moins 20 caractères.');
      return;
    }

    setChapterBusy(true);
    try {
      const nextNum = totalChapters + 1;
      const nextSeriesStatus: SeriesStatus = markCompleted ? 'termine' : 'en-cours';
      await addStoryChapter({
        story,
        authorId: user.uid,
        chapterNumber: nextNum,
        title: chapterTitle,
        content: chapterContent,
        authorNote: chapterNote,
        nextSeriesStatus,
      });
      setChapterTitle('');
      setChapterContent('');
      setChapterNote('');
      setShowChapterForm(false);
      setActiveChapterIdx(nextNum - 1);
    } catch (err) {
      setChapterError(
        err instanceof Error ? err.message : 'Impossible de publier ce chapitre.'
      );
    } finally {
      setChapterBusy(false);
    }
  };

  const handleOpenBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setBridgeError(null);
    if (!bridgeMessage.trim()) {
      setBridgeError('Écrivez quelques mots pour commencer cet échange.');
      return;
    }
    setBridgeBusy(true);
    try {
      const initiatorName = profile?.displayName || user.displayName || 'Auteur';
      const exchangeId = await createExchangeWithFirstMessage({
        storyId: story.storyId,
        storyTitle: story.title,
        initiatorId: user.uid,
        initiatorName,
        recipientId: story.authorId,
        recipientName: story.authorName,
        firstMessage: bridgeMessage,
      });
      onClose();
      onOpenExchange(exchangeId);
    } catch (err) {
      setBridgeError(
        err instanceof Error ? err.message : 'Impossible d’ouvrir cette passerelle.'
      );
    } finally {
      setBridgeBusy(false);
    }
  };

  const zenSurfaceClass =
    zenTheme === 'night'
      ? 'bg-[#171614] text-[#EAE4D9]'
      : zenTheme === 'sepia'
        ? 'bg-[#F4ECD8] text-[#2F261D]'
        : 'bg-[#FBF9F5] text-stone-900';

  const zenBodyTextClass =
    zenTheme === 'night'
      ? 'text-[#E3DDD0]'
      : zenTheme === 'sepia'
        ? 'text-[#3B3024]'
        : 'text-stone-800';

  const zenFontClass =
    zenFontSize === 'sm'
      ? 'text-[16px] sm:text-[17px] leading-[1.82]'
      : zenFontSize === 'lg'
        ? 'text-[20px] sm:text-[21px] leading-[1.95]'
        : 'text-[18px] sm:text-[19px] leading-[1.9]';

  const zenControlBarClass =
    zenTheme === 'night'
      ? 'border-[#2D2A26] bg-[#1D1B19]/95 text-[#EAE4D9]'
      : zenTheme === 'sepia'
        ? 'border-[#DFD2B7] bg-[#EFE4CC]/95 text-[#2F261D]'
        : 'border-stone-200 bg-[#FBF9F5]/95 text-stone-800';

  const handleArticleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setScrollProgress(100);
    } else {
      setScrollProgress(Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100)));
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        zenMode
          ? `items-stretch p-0 overflow-hidden ${zenSurfaceClass}`
          : 'items-center bg-stone-900/45 p-4 sm:p-6 overflow-y-auto'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-story-title"
    >
      <div
        className={`overflow-hidden flex flex-col transition-all duration-200 motion-reduce:transition-none ${
          zenMode
            ? `relative w-full h-full max-w-none border-0 rounded-none ${zenSurfaceClass}`
            : 'bg-[#FBF9F5] w-full max-w-4xl max-h-[92vh] border border-stone-300 rounded-lg my-auto'
        }`}
      >
        {audioController.renderHiddenStreams()}

        {zenMode ? (
          <>
            {/* Reading progress hairline */}
            <div className="h-0.5 w-full bg-black/10 shrink-0" aria-hidden="true">
              <div
                style={{ width: `${scrollProgress}%` }}
                className={`h-full transition-[width] duration-150 ${
                  zenTheme === 'night' ? 'bg-amber-300/80' : 'bg-[#1B365D]'
                }`}
              />
            </div>

            {/* Clean Top Zen Control Strip */}
            <header
              className={`border-b px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 backdrop-blur-sm shrink-0 ${zenControlBarClass}`}
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <span className="text-[11px] uppercase tracking-widest opacity-65 whitespace-nowrap">
                  Lecture zen
                </span>
                <span className="opacity-35 hidden sm:inline" aria-hidden="true">·</span>
                <p className="text-xs font-medium truncate max-w-[160px] sm:max-w-[260px] hidden sm:block">
                  {story.title}
                </p>
                {isRoman && totalChapters > 1 && (
                  <span className="text-[11px] opacity-75 tabular-nums whitespace-nowrap">
                    Ch. {activeChapterIdx + 1}/{totalChapters}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {/* Text size toggle */}
                <div
                  className="inline-flex items-center rounded-md border border-current/20 overflow-hidden"
                  role="group"
                  aria-label="Taille du texte"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setZenFontSize((prev) => (prev === 'lg' ? 'md' : 'sm'))
                    }
                    disabled={zenFontSize === 'sm'}
                    aria-label="Réduire la taille du texte"
                    className="min-h-[34px] px-2 text-xs font-medium hover:bg-current/10 disabled:opacity-35"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setZenFontSize((prev) => (prev === 'sm' ? 'md' : 'lg'))
                    }
                    disabled={zenFontSize === 'lg'}
                    aria-label="Agrandir la taille du texte"
                    className="min-h-[34px] px-2 text-xs font-medium border-l border-current/20 hover:bg-current/10 disabled:opacity-35"
                  >
                    A+
                  </button>
                </div>

                {/* Ambiance theme pills */}
                <div
                  className="inline-flex items-center rounded-md border border-current/20 p-0.5 gap-0.5"
                  role="group"
                  aria-label="Ambiance visuelle"
                >
                  {(
                    [
                      { id: 'paper', label: 'Papier' },
                      { id: 'sepia', label: 'Sépia' },
                      { id: 'night', label: 'Nuit' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setZenTheme(opt.id)}
                      aria-pressed={zenTheme === opt.id}
                      className={`min-h-[30px] px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        zenTheme === opt.id
                          ? zenTheme === 'night'
                            ? 'bg-amber-200 text-stone-950'
                            : 'bg-[#1B365D] text-white'
                          : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Quick play/pause if track active */}
                {audioController.activeTrack && (
                  <button
                    type="button"
                    onClick={() => void audioController.togglePlayPause()}
                    aria-label={
                      audioController.isPlaying
                        ? 'Mettre la musique en pause'
                        : 'Reprendre la musique'
                    }
                    className={`min-h-[34px] px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${
                      zenTheme === 'night'
                        ? 'border-amber-200/40 bg-amber-200/15 text-amber-100'
                        : 'border-[#1B365D]/30 bg-[#1B365D]/10 text-[#1B365D]'
                    }`}
                  >
                    {audioController.isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span className="max-w-[90px] truncate hidden md:inline">
                      {audioController.activeTrack.title}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowMusicPanel((prev) => !prev)}
                  aria-label="Musique de lecture"
                  aria-expanded={showMusicPanel}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    showMusicPanel || audioController.isPlaying
                      ? 'border-[#1B365D] bg-[#1B365D] text-white'
                      : 'border-current/25 hover:border-current/50'
                  }`}
                >
                  {audioController.isPlaying ? (
                    <Disc3 className="w-3.5 h-3.5 lisiere-disc-spin" />
                  ) : (
                    <Music2 className="w-3.5 h-3.5" />
                  )}
                  <span>Musique</span>
                </button>

                <button
                  type="button"
                  onClick={() => setZenMode(false)}
                  aria-label="Quitter le mode lecture zen"
                  aria-pressed={true}
                  className="min-h-[34px] px-3 py-1 rounded-md border border-current/25 hover:border-current/50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Quitter</span>
                </button>
              </div>
            </header>

            {showMusicPanel && (
              <div className="fixed top-14 right-4 sm:top-16 sm:right-6 z-20 w-[min(92vw,420px)] max-h-[75vh] overflow-y-auto">
                <ReadingMusicPanel
                  controller={audioController}
                  authorName={story.authorName}
                  authorFavoriteMusic={authorPinnedMusic}
                  compactPopover={true}
                  onClose={() => setShowMusicPanel(false)}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-stone-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-stone-500 min-w-0">
                {hasOriginSalon ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (story.customSalonId && onEnterCustomSalon) {
                        onEnterCustomSalon(story.customSalonId);
                      } else if (onEnterSalon) {
                        onEnterSalon(story.theme);
                      }
                    }}
                    title={`Salon d’origine : ${originSalonLabel} — Cliquer pour ouvrir ce salon`}
                    aria-label={`Ouvrir le salon d’origine : ${originSalonLabel}`}
                    style={{
                      backgroundColor: originPalette?.softBg ?? '#F4F0E8',
                      borderColor: originPalette?.borderTint ?? '#D6D3D1',
                      color: originPalette?.textAccent ?? '#1B365D',
                    }}
                    className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium normal-case tracking-normal hover:brightness-95 transition max-w-full cursor-pointer"
                  >
                    <span className="truncate">{originSalonLabel}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    <span
                      role="tooltip"
                      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 hidden sm:block absolute left-0 top-full mt-1.5 z-30 whitespace-nowrap rounded bg-stone-900 px-2.5 py-1 text-[11px] font-normal text-[#FBF9F5] shadow-md"
                    >
                      Salon d’origine · Cliquer pour y entrer
                    </span>
                  </button>
                ) : onOpenPeleMele ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPeleMele();
                    }}
                    title="Histoire libre publiée hors salon — Voir tout Pêle-mêle"
                    className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded border border-stone-200 bg-stone-50 text-[#1B365D] text-[11px] font-medium normal-case tracking-normal hover:border-stone-400 transition max-w-full cursor-pointer"
                  >
                    <span className="truncate">{originSalonLabel}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0 opacity-75" />
                    <span
                      role="tooltip"
                      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 hidden sm:block absolute left-0 top-full mt-1.5 z-30 whitespace-nowrap rounded bg-stone-900 px-2.5 py-1 text-[11px] font-normal text-[#FBF9F5] shadow-md"
                    >
                      Hors salon · Voir Histoires pêle-mêle
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded border border-stone-200 bg-stone-50 text-[#1B365D] text-[11px] font-medium normal-case tracking-normal truncate">
                    {originSalonLabel}
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span>{STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label}</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap tabular-nums">{displayedMinutes} min de lecture</span>
                {story.customSalonVisibility === 'private' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#1E3A8A]">Salon privé</span>
                  </>
                ) : (
                  story.visibility === 'private' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#1E3A8A]">Brouillon privé</span>
                    </>
                  )
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMusicPanel((prev) => !prev)}
                  aria-label="Musique de lecture"
                  aria-expanded={showMusicPanel}
                  className={`min-h-[40px] px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    showMusicPanel || audioController.isPlaying
                      ? 'border-[#1B365D] bg-[#1B365D] text-white'
                      : 'border-stone-200 bg-[#FBF9F5] text-stone-700 hover:text-stone-900 hover:border-stone-400'
                  }`}
                >
                  {audioController.isPlaying ? (
                    <Disc3 className="w-3.5 h-3.5 lisiere-disc-spin" />
                  ) : (
                    <Music2 className="w-3.5 h-3.5" />
                  )}
                  <span className="max-w-[130px] truncate hidden sm:inline">
                    {audioController.isPlaying && audioController.activeTrack
                      ? audioController.activeTrack.title
                      : 'Musique'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setZenMode(true)}
                  aria-label="Passer en mode lecture zen"
                  aria-pressed={false}
                  className="min-h-[40px] px-3 py-1.5 rounded-md border border-[#1B365D]/35 bg-[#F3F6FA] text-xs font-medium text-[#1B365D] hover:bg-[#1B365D] hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Lecture zen</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer la lecture"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showMusicPanel && (
              <div className="max-h-[42vh] overflow-y-auto shrink-0">
                <ReadingMusicPanel
                  controller={audioController}
                  authorName={story.authorName}
                  authorFavoriteMusic={authorPinnedMusic}
                  onClose={() => setShowMusicPanel(false)}
                />
              </div>
            )}
          </>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleArticleScroll}
          className={
            zenMode
              ? 'flex-1 min-h-0 overflow-y-auto px-6 sm:px-12 pt-10 pb-24 sm:pt-14 sm:pb-28'
              : 'flex-1 min-h-0 overflow-y-auto px-6 sm:px-12 py-8 sm:py-10'
          }
        >
          <article className={zenMode ? 'max-w-[66ch] mx-auto' : 'max-w-prose mx-auto'}>
            {!zenMode && story.promptQuestion && (
              <p className="text-xs text-stone-500 mb-3 italic">
                En réponse au fil : « {story.promptQuestion} »
              </p>
            )}

            <h1
              id="reader-story-title"
              className={`font-display text-3xl sm:text-4xl font-medium leading-tight ${
                zenMode
                  ? `mb-8 sm:mb-10 ${zenTheme === 'night' ? 'text-[#F5F0E6]' : 'text-stone-900'}`
                  : 'mb-4 text-stone-900'
              }`}
              style={{ textWrap: 'balance' }}
            >
              {story.title}
            </h1>

            {!zenMode && (
              <div className="pb-5 border-b border-stone-200 mb-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMemberWall(story.authorId);
                      }}
                      className="font-medium text-stone-900 hover:text-[#1B365D] hover:underline inline-flex items-center gap-1.5"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-stone-500" />
                      <span>{story.authorName}</span>
                    </button>
                    <span aria-hidden="true">·</span>
                    <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                    {isRoman && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{RELEASE_CADENCE_LABELS[story.releaseCadence ?? 'hebdomadaire']}</span>
                        <span aria-hidden="true">·</span>
                        <span>{SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']}</span>
                      </>
                    )}
                  </div>

                  {isRoman && isAuthor && (
                    <button
                      type="button"
                      onClick={() => setShowChapterForm((prev) => !prev)}
                      className="min-h-[34px] px-3 py-1 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Publier le chapitre {totalChapters + 1}</span>
                    </button>
                  )}
                </div>

                {/* Quick Zen Reading & Ambient Music Invitation Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white border border-stone-200 rounded-md px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-stone-600">
                    <Maximize2 className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
                    <span>Lire au calme en plein écran avec musique</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {authorPinnedMusic && !audioController.isPlaying && (
                      <button
                        type="button"
                        onClick={() =>
                          void audioController.playAuthorMusic(
                            authorPinnedMusic,
                            story.authorName
                          )
                        }
                        className="min-h-[32px] px-2.5 py-1 rounded border border-stone-200 bg-[#FBF9F5] text-xs font-medium text-stone-800 hover:border-[#1B365D] hover:text-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span className="max-w-[160px] truncate">
                          Son : {authorPinnedMusic.title}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setZenMode(true)}
                      className="min-h-[32px] px-3 py-1 rounded bg-[#1B365D] text-white hover:bg-[#132744] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Ouvrir le mode zen</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chapter Navigation Rail for Serialized Novels */}
            {!zenMode && isRoman && (
              <div className="mb-8 bg-white border border-stone-200 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span className="uppercase tracking-widest inline-flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Table des chapitres
                  </span>
                  <span className="tabular-nums">
                    {totalChapters} chapitre{totalChapters > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveChapterIdx(0)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors ${
                      activeChapterIdx === 0
                        ? 'bg-[#1B365D] text-white border-[#1B365D]'
                        : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    Chapitre 1
                  </button>
                  {chapters.map((chap, idx) => {
                    const chapIdx = idx + 1;
                    const active = activeChapterIdx === chapIdx;
                    return (
                      <button
                        key={chap.chapterId}
                        type="button"
                        onClick={() => setActiveChapterIdx(chapIdx)}
                        className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors ${
                          active
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        Ch. {chap.chapterNumber} · {chap.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Author Next-Chapter Form */}
            {!zenMode && isRoman && isAuthor && showChapterForm && (
              <form
                onSubmit={handleAddChapter}
                className="mb-8 bg-white border border-stone-300 rounded-md p-5 space-y-4"
              >
                <h2 className="font-display text-lg font-medium text-stone-900">
                  Publier le chapitre {totalChapters + 1}
                </h2>
                <div>
                  <label htmlFor="chap-title" className="block text-xs font-medium text-stone-700 mb-1">
                    Titre du chapitre
                  </label>
                  <input
                    id="chap-title"
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.chapterTitle.max}
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="Ex. La gare du matin…"
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <div>
                  <label htmlFor="chap-content" className="block text-xs font-medium text-stone-700 mb-1">
                    Texte du chapitre
                  </label>
                  <textarea
                    id="chap-content"
                    rows={8}
                    required
                    maxLength={FIELD_LIMITS.chapterContent.max}
                    value={chapterContent}
                    onChange={(e) => setChapterContent(e.target.value)}
                    placeholder="Poursuivez votre histoire…"
                    className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm leading-relaxed text-stone-800 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <div>
                  <label htmlFor="chap-note" className="block text-xs font-medium text-stone-700 mb-1">
                    Mot de fin pour les lecteurs (facultatif)
                  </label>
                  <input
                    id="chap-note"
                    type="text"
                    maxLength={FIELD_LIMITS.chapterNote.max}
                    value={chapterNote}
                    onChange={(e) => setChapterNote(e.target.value)}
                    placeholder="Ex. Prochain chapitre dimanche prochain !"
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={markCompleted}
                    onChange={(e) => setMarkCompleted(e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>Marquer ce roman comme terminé après ce chapitre</span>
                </label>

                {chapterError && (
                  <p role="alert" className="text-xs text-red-700">
                    {chapterError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChapterForm(false)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={chapterBusy}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60"
                  >
                    {chapterBusy ? 'Publication…' : `Publier le chapitre ${totalChapters + 1}`}
                  </button>
                </div>
              </form>
            )}

            {activeFollowupChapter && (
              <div
                className={`mb-6 pb-4 border-b ${
                  zenMode && zenTheme === 'night' ? 'border-stone-800' : 'border-stone-200'
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-widest ${
                    zenMode && zenTheme === 'night' ? 'text-amber-200/80' : 'text-[#1B365D]'
                  }`}
                >
                  Chapitre {activeFollowupChapter.chapterNumber}
                </p>
                <h2
                  className={`font-display text-2xl font-medium mt-1 ${
                    zenMode && zenTheme === 'night' ? 'text-[#F5F0E6]' : 'text-stone-900'
                  }`}
                >
                  {activeFollowupChapter.title}
                </h2>
              </div>
            )}

            <div
              className={
                zenMode
                  ? `space-y-6 ${zenFontClass} ${zenBodyTextClass}`
                  : 'space-y-5 text-base sm:text-[17px] leading-[1.8] text-stone-800'
              }
            >
              {paragraphs.map((para, idx) => (
                <p key={idx} className={idx === 0 ? 'editorial-drop-cap' : ''}>
                  {para}
                </p>
              ))}
            </div>

            {!zenMode && activeFollowupChapter?.authorNote && (
              <div className="mt-8 p-4 bg-white border border-stone-200 rounded-md text-sm text-stone-700 italic">
                Note de {story.authorName} : « {activeFollowupChapter.authorNote} »
              </div>
            )}

            {isRoman && totalChapters > 1 && (
              <div
                className={`mt-8 pt-5 border-t flex items-center justify-between gap-4 ${
                  zenMode && zenTheme === 'night' ? 'border-stone-800' : 'border-stone-200'
                }`}
              >
                <button
                  type="button"
                  disabled={activeChapterIdx === 0}
                  onClick={() => {
                    setActiveChapterIdx((prev) => Math.max(0, prev - 1));
                    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border disabled:opacity-40 ${
                    zenMode && zenTheme === 'night'
                      ? 'bg-[#23211E] text-[#EAE4D9] border-stone-700 hover:border-stone-500'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  Chapitre précédent
                </button>
                <span className="text-xs opacity-70 tabular-nums">
                  Chapitre {activeChapterIdx + 1} / {totalChapters}
                </span>
                <button
                  type="button"
                  disabled={activeChapterIdx >= totalChapters - 1}
                  onClick={() => {
                    setActiveChapterIdx((prev) => Math.min(totalChapters - 1, prev + 1));
                    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md disabled:opacity-40 ${
                    zenMode && zenTheme === 'night'
                      ? 'bg-amber-200 text-stone-950 hover:bg-amber-100'
                      : 'bg-[#1B365D] text-white hover:bg-[#132744]'
                  }`}
                >
                  Chapitre suivant
                </button>
              </div>
            )}

            {!zenMode && authorProfile && (authorProfile.bio || authorProfile.listeningNote) && (
              <div className="mt-10 p-5 bg-white border border-stone-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
                    À propos de {authorProfile.displayName}
                  </p>
                  {authorProfile.bio && (
                    <p className="text-sm text-stone-700 leading-relaxed">{authorProfile.bio}</p>
                  )}
                  {authorProfile.listeningNote && (
                    <p className="text-sm text-stone-600 mt-2">
                      <span className="font-medium text-stone-800">Disponibilité d’échange :</span>{' '}
                      {authorProfile.listeningNote}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMemberWall(story.authorId);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] border border-[#CBD6E6] bg-[#F3F6FA] rounded-md hover:bg-[#E7EEF7] whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  Voir son mur
                </button>
              </div>
            )}

            {/* Social Action Bar */}
            {!zenMode && (
              <div className="mt-10 pt-6 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleResonate}
                    disabled={resonateBusy || story.visibility !== 'public'}
                    className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      hasResonated
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white text-stone-800 border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${hasResonated ? 'fill-current' : ''}`} />
                    <span>Cela résonne</span>
                    <span className="tabular-nums opacity-80">({story.resonanceCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleBookmark?.(story)}
                    aria-pressed={isBookmarked}
                    className={`min-h-[40px] px-3.5 py-2 text-sm font-medium rounded-md border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      isBookmarked
                        ? 'bg-[#F3F6FA] text-[#1B365D] border-[#1B365D]'
                        : 'bg-white text-stone-800 border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    <span>{isBookmarked ? 'Enregistré' : 'Lire plus tard'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenRepost?.(story)}
                    aria-pressed={isReposted}
                    className={`min-h-[40px] px-3.5 py-2 text-sm font-medium rounded-md border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      isReposted
                        ? 'bg-[#F3F6FA] text-[#1B365D] border-[#1B365D]'
                        : 'bg-white text-stone-800 border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    <Repeat2 className="w-4 h-4" />
                    <span>{isReposted ? 'Repartagé' : 'Repartager'}</span>
                  </button>

                  {!isAuthor && story.visibility === 'public' && (
                    existingExchange ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenExchange(existingExchange.exchangeId);
                        }}
                        className="min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border border-[#1E3A8A] text-[#1E3A8A] bg-white hover:bg-[#1E3A8A]/5 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Poursuivre en privé</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) {
                            await signInWithGoogle();
                            return;
                          }
                          setShowBridgeBox((prev) => !prev);
                        }}
                        className="min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border border-stone-300 text-stone-800 bg-white hover:border-[#1E3A8A] hover:text-[#1E3A8A] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Écrire en privé à l’auteur</span>
                      </button>
                    )
                  )}
                </div>

                <span className="text-xs text-stone-500 tabular-nums">
                  {echoes.length} commentaire{echoes.length > 1 ? 's' : ''}
                </span>
              </div>
            )}

            {!zenMode && showBridgeBox && !isAuthor && (
              <form
                onSubmit={handleOpenBridge}
                className="mt-6 bg-white border border-stone-200 rounded-md p-5 space-y-4"
              >
                <div>
                  <h3 className="font-display text-lg font-medium text-stone-900">
                    Écrire en tête-à-tête à {story.authorName}
                  </h3>
                  <p className="text-xs text-stone-600 mt-1">
                    Votre premier message s’appuiera sur ce récit pour commencer une conversation calme et privée.
                  </p>
                </div>
                <textarea
                  rows={3}
                  maxLength={FIELD_LIMITS.messageContent.max}
                  value={bridgeMessage}
                  onChange={(e) => setBridgeMessage(e.target.value)}
                  placeholder={`Bonjour ${story.authorName}, votre texte m’a particulièrement touché parce que…`}
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                />
                {bridgeError && (
                  <p role="alert" className="text-xs text-red-700">
                    {bridgeError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowBridgeBox(false)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={bridgeBusy}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap"
                  >
                    {bridgeBusy ? 'Ouverture…' : 'Envoyer en privé'}
                  </button>
                </div>
              </form>
            )}

            {/* Comments & Echoes Section */}
            {!zenMode && story.visibility === 'public' && (
              <section
                className="mt-10 pt-8 border-t border-stone-200"
                aria-label="Commentaires et échos des lecteurs"
              >
                <h2 className="font-display text-2xl font-medium text-stone-900 mb-2">
                  Commentaires des lecteurs
                </h2>
                <p className="text-sm text-stone-600 mb-6">
                  Réactions, retours de lecture et échos sincères sous cette histoire.
                </p>

                {echoes.length === 0 ? (
                  <p className="text-sm text-stone-500 italic py-4">
                    Aucun commentaire pour l’instant. Soyez la première personne à réagir à cette histoire.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 mb-8">
                    {echoes.map((echo) => (
                      <div key={echo.echoId} className="py-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenMemberWall(echo.authorId);
                            }}
                            className="font-semibold text-stone-900 hover:text-[#1B365D] hover:underline"
                          >
                            {echo.authorName}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#1E3A8A] font-medium">
                            {ECHO_TYPE_LABELS[echo.replyType]?.label ?? 'Commentaire'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(echo.createdAt?.toDate() ?? null)}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-stone-800 whitespace-pre-line">
                          {echo.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={handleEchoSubmit}
                  className="bg-white border border-stone-200 rounded-md p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest text-stone-500">
                      Laisser un commentaire
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(ECHO_TYPE_LABELS) as EchoReplyType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setReplyType(type)}
                          className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                            replyType === type
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {ECHO_TYPE_LABELS[type].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-stone-500">{ECHO_TYPE_LABELS[replyType].hint}</p>

                  {user ? (
                    <>
                      <textarea
                        rows={3}
                        maxLength={FIELD_LIMITS.echoContent.max}
                        value={echoText}
                        onChange={(e) => setEchoText(e.target.value)}
                        placeholder="Écrivez votre commentaire sous cette histoire…"
                        className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                      />
                      {echoError && (
                        <p role="alert" className="text-xs text-red-700">
                          {echoError}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-stone-500">
                          Visible par tous les lecteurs de ce salon.
                        </span>
                        <button
                          type="submit"
                          disabled={echoBusy}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {echoBusy ? 'Publication…' : 'Publier le commentaire'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-stone-600">
                        Connectez-vous avec Google pour commenter ou écrire en privé à l’auteur.
                      </p>
                      <button
                        type="button"
                        onClick={signInWithGoogle}
                        className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] whitespace-nowrap shrink-0"
                      >
                        Se connecter
                      </button>
                    </div>
                  )}
                </form>
              </section>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
