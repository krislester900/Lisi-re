import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  Copy,
  Disc3,
  Edit3,
  Eye,
  EyeOff,
  Feather,
  Flag,
  Heart,
  Highlighter,
  Lock,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music2,
  Pause,
  Play,
  Plus,
  Quote,
  Repeat2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  User as UserIcon,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkLocalContentHygiene,
  evaluateNovelChapterLength,
  evaluateStoryFormatCompliance,
  getStoryAgeAccessBlockReason,
  shouldShowMatureWarning,
} from '../lib/contentRegulation';
import { checkNovelPlagiarism } from '../lib/plagiarismCheck';
import { MatureContentBadge } from './MatureContentBadge';
import { ReadingMusicPanel, useReadingAudioEngine } from './ReadingMusicPanel';
import type { ReportDraft } from './ReportModal';
import { NovelCoverArt } from './NovelCoverArt';
import { StoryFormatKicker } from './StoryFormatKicker';
import {
  addStoryChapter,
  addStoryEcho,
  buildExchangeId,
  claimAnonymousStory,
  createExchangeWithFirstMessage,
  createStoryQuote,
  deleteStoryQuote,
  fetchPublicProfile,
  formatFriendlyFirestoreError,
  formatLocalDateKey,
  recordStoryView,
  runAutomatedContentBotGuard,
  submitPlagiarismReport,
  subscribeToStoryChapters,
  subscribeToStoryEchoes,
  subscribeToUserResonance,
  toggleFavoriteAuthor,
  toggleStoryResonance,
  updateNovelSeriesStatus,
  updateStoryVisibility,
} from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  ECHO_TYPE_LABELS,
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Chapter,
  CustomSalon,
  Echo,
  EchoReplyType,
  Exchange,
  FIELD_LIMITS,
  PlagiarismReportReason,
  PublicProfile,
  SeriesStatus,
  Story,
  StoryQuote,
  StoryThemeId,
} from '../types/story';

interface StoryReaderModalProps {
  story: Story | null;
  onClose: () => void;
  existingExchanges: Exchange[];
  existingStories?: Story[];
  customSalons?: CustomSalon[];
  userQuotes?: StoryQuote[];
  hiddenUserIds?: Set<string>;
  isBookmarked?: boolean;
  isReposted?: boolean;
  onToggleBookmark?: (story: Story) => void;
  onOpenRepost?: (story: Story) => void;
  onOpenExchange: (exchangeId: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onEnterSalon?: (salonId: StoryThemeId) => void;
  onEnterCustomSalon?: (customSalonId: string) => void;
  onOpenPeleMele?: () => void;
  onOpenReport?: (draft: ReportDraft) => void;
  onOpenAgeSettings?: () => void;
  onEditStory?: (story: Story) => void;
  onStoryClaimed?: (authorName: string) => void;
}

export function StoryReaderModal({
  story,
  onClose,
  existingExchanges,
  existingStories = [],
  customSalons = [],
  userQuotes = [],
  hiddenUserIds,
  isBookmarked = false,
  isReposted = false,
  onToggleBookmark,
  onOpenRepost,
  onOpenExchange,
  onOpenMemberWall,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenPeleMele,
  onOpenReport,
  onOpenAgeSettings,
  onEditStory,
  onStoryClaimed,
}: StoryReaderModalProps) {
  const { user, profile, viewerAge, favoriteAuthors, signInWithGoogle } = useAuth();
  const [matureAcknowledged, setMatureAcknowledged] = useState(false);
  const [favAuthorBusy, setFavAuthorBusy] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [confirmClaimAnon, setConfirmClaimAnon] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [privatizeBusy, setPrivatizeBusy] = useState(false);
  const [privatizeError, setPrivatizeError] = useState<string | null>(null);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0); // 0 = Chapitre 1 (story.content), >=1 = chapters[idx - 1]
  const [hasResonated, setHasResonated] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<PublicProfile | null>(null);
  const [resonateBusy, setResonateBusy] = useState(false);
  const [resonateError, setResonateError] = useState<string | null>(null);

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
  const [chapterPlagiarismAttested, setChapterPlagiarismAttested] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [statusToggleBusy, setStatusToggleBusy] = useState(false);
  const [statusToggleError, setStatusToggleError] = useState<string | null>(null);

  // Reader anti-plagiarism reporting state (for public novels)
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState<PlagiarismReportReason>('oeuvre-publiee');
  const [reportDetails, setReportDetails] = useState('');
  const [reportRefUrl, setReportRefUrl] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
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
  const [zenFontFamily, setZenFontFamily] = useState<'serif' | 'sans'>(() => {
    try {
      const saved = window.localStorage.getItem('lisiere_zen_font');
      if (saved === 'serif' || saved === 'sans') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'serif';
  });
  const [showZenAppearance, setShowZenAppearance] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const storyParagraphsRef = React.useRef<HTMLDivElement | null>(null);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const audioController = useReadingAudioEngine(Boolean(story));

  const [pendingSelection, setPendingSelection] = useState<{
    paragraphIndex: number;
    text: string;
    truncated: boolean;
  } | null>(null);
  const [activeQuotePopover, setActiveQuotePopover] = useState<StoryQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteFeedback, setQuoteFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [quoteCopiedId, setQuoteCopiedId] = useState<string | null>(null);
  const [showStoryQuotesDrawer, setShowStoryQuotesDrawer] = useState(false);

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
    try {
      window.localStorage.setItem('lisiere_zen_font', zenFontFamily);
    } catch {
      // Ignore
    }
  }, [zenFontFamily]);

  const currentStoryId = story?.storyId ?? null;

  const recalculateScrollProgress = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) {
      setScrollProgress(100);
    } else {
      setScrollProgress(Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100)));
    }
  }, []);

  useEffect(() => {
    if (!currentStoryId) return;
    setMatureAcknowledged(false);
    setZenMode(false);
    setShowMusicPanel(false);
    setShowZenAppearance(false);
    setScrollProgress(0);
    setEchoText('');
    setEchoError(null);
    setResonateError(null);
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
    setChapterPlagiarismAttested(false);
    setChapterError(null);
    setStatusToggleError(null);
    setShowReportForm(false);
    setReportReason('oeuvre-publiee');
    setReportDetails('');
    setReportRefUrl('');
    setReportError(null);
    setReportSubmitted(false);
    setPendingSelection(null);
    setActiveQuotePopover(null);
    setQuoteFeedback(null);
    setShowStoryQuotesDrawer(false);
    setShowSharePanel(false);
    setShareLinkCopied(false);
    setConfirmClaimAnon(false);
    setClaimBusy(false);
    setClaimError(null);
  }, [currentStoryId]);

  useEffect(() => {
    if (!currentStoryId) return;
    setPendingSelection(null);
    setActiveQuotePopover(null);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    const rafId = window.requestAnimationFrame(() => {
      recalculateScrollProgress();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [currentStoryId, activeChapterIdx, recalculateScrollProgress]);

  const inspectSelection = React.useCallback(() => {
    const container = storyParagraphsRef.current;
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPendingSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const getParaElement = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el) return null;
      const para = el.closest('[data-paragraph-index]') as HTMLElement | null;
      return para && container.contains(para) ? para : null;
    };

    const startPara = getParaElement(range.startContainer);
    const endPara = getParaElement(range.endContainer);
    if (!startPara) {
      setPendingSelection(null);
      return;
    }

    const idxRaw = startPara.getAttribute('data-paragraph-index');
    const paragraphIndex = idxRaw !== null ? Number(idxRaw) : NaN;
    if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
      setPendingSelection(null);
      return;
    }

    let rawText = '';
    if (endPara === startPara) {
      rawText = range.toString();
    } else {
      try {
        const clamped = document.createRange();
        clamped.setStart(range.startContainer, range.startOffset);
        clamped.selectNodeContents(startPara);
        clamped.setStart(range.startContainer, range.startOffset);
        rawText = clamped.toString();
      } catch {
        rawText = range.toString();
      }
    }

    const normalized = rawText.replace(/\s+/g, ' ').trim();
    if (normalized.length < FIELD_LIMITS.quoteText.min) {
      setPendingSelection(null);
      return;
    }

    const truncated = normalized.length > FIELD_LIMITS.quoteText.max;
    const clippedText = truncated
      ? normalized.slice(0, FIELD_LIMITS.quoteText.max).trim()
      : normalized;

    setActiveQuotePopover(null);
    setPendingSelection({
      paragraphIndex,
      text: clippedText,
      truncated,
    });
  }, []);

  useEffect(() => {
    if (!currentStoryId) return;
    let timerId: number | null = null;
    const handleSelectionChange = () => {
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        inspectSelection();
      }, 90);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [currentStoryId, inspectSelection]);

  useEffect(() => {
    if (!currentStoryId) return;
    const rafId = window.requestAnimationFrame(() => {
      recalculateScrollProgress();
    });
    const handleResize = () => recalculateScrollProgress();
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [currentStoryId, zenMode, chapters.length, recalculateScrollProgress]);

  useEffect(() => {
    if (!story) return;

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

    if (story.isAnonymous) {
      setAuthorProfile(null);
    } else {
      void fetchPublicProfile(story.authorId)
        .then((p) => setAuthorProfile(p))
        .catch(() => setAuthorProfile(null));
    }

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
  }, [
    story?.storyId,
    story?.visibility,
    story?.storyFormat,
    story?.authorId,
    story?.isAnonymous,
    story?.customSalonVisibility,
    user?.uid,
    user?.emailVerified,
  ]);

  useEffect(() => {
    if (!story) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSharePanel) {
          setShowSharePanel(false);
        } else if (pendingSelection) {
          window.getSelection()?.removeAllRanges();
          setPendingSelection(null);
        } else if (activeQuotePopover) {
          setActiveQuotePopover(null);
        } else if (showZenAppearance) {
          setShowZenAppearance(false);
        } else if (showMusicPanel) {
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
  }, [
    story,
    showSharePanel,
    zenMode,
    showMusicPanel,
    showZenAppearance,
    pendingSelection,
    activeQuotePopover,
    onClose,
  ]);

  const chapterPlagiarismCheck = useMemo(() => {
    if (!story || story.storyFormat !== 'roman' || chapterContent.trim().length < 20) {
      return null;
    }
    return checkNovelPlagiarism({
      candidateText: chapterContent,
      candidateTitle: chapterTitle,
      currentAuthorId: user?.uid ?? story.authorId,
      existingStories,
      excludeStoryId: story.storyId,
    });
  }, [story, chapterContent, chapterTitle, user?.uid, existingStories]);

  const visibleEchoes = useMemo(() => {
    if (!hiddenUserIds || hiddenUserIds.size === 0) return echoes;
    return echoes.filter((echo) => !hiddenUserIds.has(echo.authorId));
  }, [echoes, hiddenUserIds]);

  if (!story) return null;

  const isAuthor = Boolean(user && user.uid === story.authorId);
  const formatCompliance = evaluateStoryFormatCompliance(story);
  const isBlockedByRetroactiveRule = Boolean(
    story.visibility === 'public' && !formatCompliance.compliant && !isAuthor
  );
  const ageBlockReason = getStoryAgeAccessBlockReason(
    story,
    viewerAge,
    Boolean(user),
    isAuthor
  );
  const storyIsMature = shouldShowMatureWarning(story);
  const needsMatureGate = Boolean(
    !isBlockedByRetroactiveRule &&
      ageBlockReason === null &&
      !isAuthor &&
      storyIsMature &&
      !matureAcknowledged
  );
  const isReadingBlocked =
    isBlockedByRetroactiveRule || ageBlockReason !== null || needsMatureGate;
  const isAnonymousStory = Boolean(story.isAnonymous);
  const publicAuthorLabel = isAnonymousStory ? 'Auteur anonyme' : story.authorName;
  const canSharePublicLink =
    story.visibility === 'public' &&
    story.customSalonVisibility !== 'private' &&
    formatCompliance.compliant;
  const directStoryUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/histoires/${encodeURIComponent(story.storyId)}`
      : '';
  const formatShareNoun = story.storyFormat === 'roman' ? 'un roman' : 'une confession';
  const shareSummaryText = isAnonymousStory
    ? `« ${story.title} » — ${formatShareNoun} anonyme sur Lisière`
    : `« ${story.title} » — ${formatShareNoun} de ${story.authorName} sur Lisière`;
  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyDirectLink = async () => {
    if (!directStoryUrl) return;
    try {
      await navigator.clipboard.writeText(directStoryUrl);
      setShareLinkCopied(true);
      window.setTimeout(() => {
        setShareLinkCopied(false);
      }, 2400);
    } catch {
      // Fallback kept via readOnly input selection
    }
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare || !directStoryUrl) return;
    try {
      await navigator.share({
        title: `${story.title} — Lisière`,
        text: shareSummaryText,
        url: directStoryUrl,
      });
    } catch {
      // User cancelled or native share unavailable
    }
  };

  const handleClaimAnonymousInReader = async () => {
    if (!user || !isAuthor || !isAnonymousStory || claimBusy) return;
    setClaimError(null);
    setClaimBusy(true);
    try {
      const nextAuthorName = profile?.displayName || user.displayName || 'Auteur';
      const claimedName = await claimAnonymousStory(story.storyId, nextAuthorName);
      setConfirmClaimAnon(false);
      onStoryClaimed?.(claimedName);
    } catch (err) {
      setClaimError(
        formatFriendlyFirestoreError(err, 'Impossible de revendiquer cet écrit pour le moment.')
      );
    } finally {
      setClaimBusy(false);
    }
  };

  const isRoman = story.storyFormat === 'roman';
  const inlineChapterLengthEval = evaluateNovelChapterLength(chapterContent);
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
  const activeFollowupChapterEval = activeFollowupChapter
    ? evaluateNovelChapterLength(activeFollowupChapter.content)
    : null;

  const authorPinnedMusic =
    !isAnonymousStory && authorProfile?.favoriteTrackTitle
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

  const currentChapterNumber = activeChapterIdx + 1;
  const currentStoryQuotes = userQuotes.filter((q) => q.storyId === story.storyId);
  const activeChapterQuotes = currentStoryQuotes.filter(
    (q) => q.chapterNumber === currentChapterNumber
  );

  const matchingPendingQuote = pendingSelection
    ? activeChapterQuotes.find(
        (q) =>
          q.paragraphIndex === pendingSelection.paragraphIndex &&
          q.quoteText === pendingSelection.text
      ) ?? null
    : null;

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
    setResonateError(null);
    setResonateBusy(true);
    try {
      await toggleStoryResonance(story.storyId, user.uid, story.authorId);
    } catch (err) {
      setResonateError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer cette résonance.'
      );
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
    const echoHygiene = checkLocalContentHygiene(echoText, {
      label: 'Votre commentaire',
      minWords: 1,
      strictSentenceQuality: false,
    });
    if (!echoHygiene.ok) {
      setEchoError(echoHygiene.reason ?? 'Veuillez vérifier votre commentaire.');
      return;
    }

    setEchoBusy(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'echo',
        title: story.title,
        text: echoText,
      });
      if (!verdict.allowed) {
        setEchoError(
          verdict.blockedReason ||
            verdict.botNotice ||
            'Commentaire refusé par le bot de régulation Lisière.'
        );
        return;
      }

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
    if (!inlineChapterLengthEval.ok) {
      setChapterError(inlineChapterLengthEval.message);
      return;
    }
    const chapHygiene = checkLocalContentHygiene(chapterContent, {
      label: 'Ce chapitre',
      minWords: 200,
      strictSentenceQuality: true,
    });
    if (!chapHygiene.ok) {
      setChapterError(chapHygiene.reason ?? 'Veuillez vérifier la qualité de ce chapitre.');
      return;
    }
    if (!chapterPlagiarismAttested) {
      setChapterError(
        'Veuillez confirmer la charte anti-plagiat en certifiant que ce chapitre est original.'
      );
      return;
    }
    if (
      chapterPlagiarismCheck?.isSuspicious &&
      !chapterPlagiarismCheck.matchedIsOwnStory
    ) {
      setChapterError(
        `Publication bloquée : une similitude élevée (${chapterPlagiarismCheck.similarityPercent} %) a été détectée avec « ${chapterPlagiarismCheck.matchedStoryTitle} ».`
      );
      return;
    }

    setChapterBusy(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'chapter',
        title: chapterTitle,
        text: chapterContent,
        declaredMinAge: story.minAge ?? 0,
        isMature: story.isMature,
      });
      if (!verdict.allowed) {
        setChapterError(
          verdict.blockedReason ||
            verdict.botNotice ||
            'Ce chapitre ne respecte pas la charte de Lisière.'
        );
        return;
      }

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
      setChapterPlagiarismAttested(false);
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

  const handleToggleSeriesStatus = async () => {
    if (!user || !isAuthor || !isRoman || statusToggleBusy) return;
    setStatusToggleError(null);
    setStatusToggleBusy(true);
    try {
      const nextStatus: SeriesStatus = story.seriesStatus === 'termine' ? 'en-cours' : 'termine';
      await updateNovelSeriesStatus(story.storyId, nextStatus);
    } catch (err) {
      setStatusToggleError(
        err instanceof Error ? err.message : 'Impossible de modifier le statut du roman.'
      );
    } finally {
      setStatusToggleBusy(false);
    }
  };

  const handleSubmitPlagiarismReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setReportError(null);
    if (reportDetails.trim().length < FIELD_LIMITS.plagiarismDetails.min) {
      setReportError('Précisez votre signalement en au moins 10 caractères.');
      return;
    }
    setReportBusy(true);
    try {
      await submitPlagiarismReport({
        storyId: story.storyId,
        reporterId: user.uid,
        reporterName: profile?.displayName || user.displayName || 'Lecteur',
        reason: reportReason,
        details: reportDetails,
        referenceUrl: reportRefUrl,
      });
      setReportSubmitted(true);
      setShowReportForm(false);
      setReportDetails('');
      setReportRefUrl('');
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : 'Impossible d’envoyer ce signalement.'
      );
    } finally {
      setReportBusy(false);
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
        formatFriendlyFirestoreError(err, 'Impossible d’ouvrir cette passerelle.')
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
      ? 'text-[16px] sm:text-[17px] leading-[1.85]'
      : zenFontSize === 'lg'
        ? 'text-[20px] sm:text-[22px] leading-[1.98]'
        : 'text-[18px] sm:text-[19px] leading-[1.92]';

  const zenTypefaceClass =
    zenFontFamily === 'serif' ? 'font-display tracking-[0.005em]' : 'font-sans';

  const zenControlBarClass =
    zenTheme === 'night'
      ? 'border-[#2D2A26] bg-[#1D1B19]/95 text-[#EAE4D9]'
      : zenTheme === 'sepia'
        ? 'border-[#DFD2B7] bg-[#EFE4CC]/95 text-[#2F261D]'
        : 'border-stone-200 bg-[#FBF9F5]/95 text-stone-800';

  const zenPopoverClass =
    zenTheme === 'night'
      ? 'bg-[#23201D] border-[#3A3530] text-[#EAE4D9]'
      : zenTheme === 'sepia'
        ? 'bg-[#F8F1E1] border-[#DFD2B7] text-[#2F261D]'
        : 'bg-white border-stone-200 text-stone-900';

  const handleArticleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) {
      setScrollProgress(100);
    } else {
      setScrollProgress(Math.min(100, Math.max(0, (el.scrollTop / maxScroll) * 100)));
    }
  };

  const roundedScrollProgress = Math.round(scrollProgress);

  const markHighlightClass =
    zenMode && zenTheme === 'night'
      ? 'bg-amber-300/25 text-[#FFF7E6] border-b border-amber-300/60 rounded-[2px] px-0.5 cursor-pointer hover:bg-amber-300/40 transition-colors'
      : zenMode && zenTheme === 'sepia'
        ? 'bg-[#D9B66A]/45 text-[#2F261D] rounded-[2px] px-0.5 cursor-pointer hover:bg-[#D9B66A]/65 transition-colors'
        : 'bg-amber-200/75 text-stone-900 rounded-[2px] px-0.5 cursor-pointer hover:bg-amber-300/75 transition-colors';

  const findQuoteSpanInParagraph = (
    paragraphText: string,
    quoteText: string
  ): { start: number; end: number } | null => {
    const directIdx = paragraphText.indexOf(quoteText);
    if (directIdx !== -1) {
      return { start: directIdx, end: directIdx + quoteText.length };
    }
    const normChars: string[] = [];
    const origStarts: number[] = [];
    let prevWasSpace = false;
    for (let i = 0; i < paragraphText.length; i++) {
      const ch = paragraphText[i];
      if (/\s/.test(ch)) {
        if (!prevWasSpace && normChars.length > 0) {
          normChars.push(' ');
          origStarts.push(i);
          prevWasSpace = true;
        }
      } else {
        normChars.push(ch);
        origStarts.push(i);
        prevWasSpace = false;
      }
    }
    const normalizedParagraph = normChars.join('');
    const normMatchIdx = normalizedParagraph.indexOf(quoteText);
    if (normMatchIdx === -1) return null;
    const start = origStarts[normMatchIdx];
    const lastNormIdx = normMatchIdx + quoteText.length - 1;
    const end =
      lastNormIdx + 1 < origStarts.length
        ? origStarts[lastNormIdx] + 1
        : paragraphText.length;
    return { start, end };
  };

  const renderHighlightedParagraph = (paragraphText: string, paragraphIdx: number) => {
    const quotesInPara = activeChapterQuotes.filter((q) => q.paragraphIndex === paragraphIdx);
    if (quotesInPara.length === 0) return paragraphText;

    const spans: Array<{ start: number; end: number; quote: StoryQuote }> = [];
    for (const q of quotesInPara) {
      const found = findQuoteSpanInParagraph(paragraphText, q.quoteText);
      if (found && found.end > found.start) {
        spans.push({ start: found.start, end: found.end, quote: q });
      }
    }
    if (spans.length === 0) return paragraphText;

    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const nonOverlapping: Array<{ start: number; end: number; quote: StoryQuote }> = [];
    let cursor = 0;
    for (const s of spans) {
      if (s.start >= cursor) {
        nonOverlapping.push(s);
        cursor = s.end;
      }
    }

    const nodes: React.ReactNode[] = [];
    let pos = 0;
    for (const item of nonOverlapping) {
      if (item.start > pos) {
        nodes.push(
          <React.Fragment key={`t-${paragraphIdx}-${pos}`}>
            {paragraphText.slice(pos, item.start)}
          </React.Fragment>
        );
      }
      const slice = paragraphText.slice(item.start, item.end);
      nodes.push(
        <mark
          key={item.quote.quoteId}
          role="button"
          tabIndex={0}
          title="Passage enregistré dans vos citations favorites — Cliquer pour gérer"
          onClick={(e) => {
            const currentSel = window.getSelection();
            if (currentSel && !currentSel.isCollapsed) return;
            e.stopPropagation();
            setPendingSelection(null);
            setActiveQuotePopover(item.quote);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPendingSelection(null);
              setActiveQuotePopover(item.quote);
            }
          }}
          className={markHighlightClass}
        >
          {slice}
        </mark>
      );
      pos = item.end;
    }
    if (pos < paragraphText.length) {
      nodes.push(
        <React.Fragment key={`t-${paragraphIdx}-${pos}`}>
          {paragraphText.slice(pos)}
        </React.Fragment>
      );
    }
    return nodes;
  };

  const showQuoteFeedback = (kind: 'success' | 'error', message: string) => {
    setQuoteFeedback({ kind, message });
    window.setTimeout(() => {
      setQuoteFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleSaveHighlight = async () => {
    if (!pendingSelection || quoteBusy) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setQuoteBusy(true);
    try {
      await createStoryQuote({
        userId: user.uid,
        story,
        chapterNumber: currentChapterNumber,
        chapterTitle: activeFollowupChapter?.title,
        paragraphIndex: pendingSelection.paragraphIndex,
        quoteText: pendingSelection.text,
      });
      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
      showQuoteFeedback(
        'success',
        'Ajouté à vos citations favorites dans Mon carnet.'
      );
    } catch (err) {
      showQuoteFeedback(
        'error',
        err instanceof Error ? err.message : 'Impossible d’enregistrer cette citation.'
      );
    } finally {
      setQuoteBusy(false);
    }
  };

  const handleDeleteHighlight = async (quoteId: string) => {
    if (!user || quoteBusy) return;
    setQuoteBusy(true);
    try {
      await deleteStoryQuote(user.uid, quoteId);
      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
      setActiveQuotePopover((prev) => (prev?.quoteId === quoteId ? null : prev));
      showQuoteFeedback('success', 'Surlignage retiré de vos citations.');
    } catch (err) {
      showQuoteFeedback(
        'error',
        err instanceof Error ? err.message : 'Impossible de retirer ce surlignage.'
      );
    } finally {
      setQuoteBusy(false);
    }
  };

  const handleCopyQuoteText = async (quote: StoryQuote) => {
    try {
      await navigator.clipboard.writeText(
        `« ${quote.quoteText} » — ${quote.storyTitle} (${quote.storyAuthorName})`
      );
      setQuoteCopiedId(quote.quoteId);
      window.setTimeout(() => {
        setQuoteCopiedId((prev) => (prev === quote.quoteId ? null : prev));
      }, 2200);
    } catch {
      showQuoteFeedback('error', 'Copie dans le presse-papiers impossible.');
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        zenMode
          ? `items-stretch p-0 overflow-hidden ${zenSurfaceClass}`
          : 'items-center bg-stone-900/45 p-0 sm:p-6 overflow-y-auto'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-story-title"
    >
      <div
        className={`overflow-hidden flex flex-col transition-all duration-200 motion-reduce:transition-none ${
          zenMode
            ? `relative w-full h-full max-w-none border-0 rounded-none ${zenSurfaceClass}`
            : 'relative bg-[#FBF9F5] w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[92vh] border-0 sm:border sm:border-stone-300 sm:rounded-lg my-auto'
        }`}
      >
        {audioController.renderHiddenStreams()}

        <div
          className={`relative z-10 flex-1 min-h-0 flex flex-col ${
            zenMode ? zenSurfaceClass : 'bg-[#FBF9F5]'
          }`}
        >
          {/* Fine reading progress bar pinned at the top edge of the modal */}
          <div
            role="progressbar"
            aria-label="Progression de lecture"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={roundedScrollProgress}
            className={`h-[3px] w-full shrink-0 ${
              zenMode ? 'bg-black/15' : 'bg-stone-200/80'
            }`}
          >
          <div
            style={{ width: `${scrollProgress}%` }}
            className={`h-full transition-[width] duration-150 ease-out motion-reduce:transition-none ${
              zenMode && zenTheme === 'night' ? 'bg-amber-300/90' : 'bg-[#1B365D]'
            }`}
          />
        </div>

        {zenMode ? (
          <>
            {/* Minimal Zen Control Strip: hides distracting chrome, exposes only Aa, Music & Exit */}
            <header
              className={`border-b px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 backdrop-blur-sm shrink-0 ${zenControlBarClass}`}
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-widest opacity-65 whitespace-nowrap">
                  Mode lecture zen
                </span>
                <span className="opacity-35" aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    zenTheme === 'night'
                      ? 'text-amber-200/90'
                      : isRoman
                        ? 'text-[#1B365D]'
                        : 'text-[#9A3B29]'
                  }`}
                >
                  {isRoman ? (
                    <BookOpen className="w-3 h-3 shrink-0" />
                  ) : (
                    <Feather className="w-3 h-3 shrink-0" />
                  )}
                  <span>{isRoman ? 'Roman à chapitres' : 'Confession'}</span>
                </span>
                {isRoman && totalChapters > 1 && (
                  <>
                    <span className="opacity-35" aria-hidden="true">·</span>
                    <span className="text-[11px] opacity-75 tabular-nums whitespace-nowrap">
                      Ch. {activeChapterIdx + 1}/{totalChapters}
                    </span>
                  </>
                )}
                {currentStoryQuotes.length > 0 && (
                  <>
                    <span className="opacity-35 hidden sm:inline" aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setShowStoryQuotesDrawer((prev) => !prev)}
                      className="hidden sm:inline-flex items-center gap-1 text-[11px] opacity-85 hover:opacity-100 underline underline-offset-2 whitespace-nowrap tabular-nums"
                    >
                      <Highlighter className="w-3 h-3" />
                      <span>
                        {currentStoryQuotes.length} citation{currentStoryQuotes.length > 1 ? 's' : ''}
                      </span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowZenAppearance((prev) => !prev);
                    setShowMusicPanel(false);
                  }}
                  aria-label="Régler la typographie et l’ambiance"
                  aria-expanded={showZenAppearance}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                    showZenAppearance
                      ? zenTheme === 'night'
                        ? 'border-amber-200 bg-amber-200 text-stone-950'
                        : 'border-[#1B365D] bg-[#1B365D] text-white'
                      : 'border-current/25 hover:border-current/50'
                  }`}
                >
                  Aa
                </button>

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
                    <span className="max-w-[90px] truncate hidden sm:inline">
                      {audioController.activeTrack.title}
                    </span>
                  </button>
                )}

                {audioController.isExternalEmbedActive && (
                  <button
                    type="button"
                    onClick={audioController.toggleEmbedBackground}
                    aria-label={
                      audioController.embedBackground
                        ? 'Afficher le lecteur vidéo'
                        : 'Mettre la vidéo en arrière-plan'
                    }
                    title={
                      audioController.embedBackground
                        ? 'Afficher la vidéo'
                        : 'Mettre en arrière-plan'
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-md border border-current/25 hover:border-current/50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    {audioController.embedBackground ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Vidéo</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Arrière-plan</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMusicPanel((prev) => !prev);
                    setShowZenAppearance(false);
                  }}
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
                  onClick={() => {
                    setShowZenAppearance(false);
                    setZenMode(false);
                  }}
                  aria-label="Quitter le mode lecture zen"
                  aria-pressed={true}
                  className="min-h-[34px] px-3 py-1 rounded-md border border-current/25 hover:border-current/50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Quitter</span>
                </button>
              </div>
            </header>

            {showZenAppearance && (
              <div
                role="region"
                aria-label="Réglages typographiques et ambiance"
                className={`fixed top-14 right-4 sm:top-16 sm:right-6 z-20 w-[min(92vw,300px)] rounded-lg border shadow-xl p-4 space-y-4 ${zenPopoverClass}`}
              >
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest opacity-65">
                    Typographie
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setZenFontFamily('serif')}
                      className={`min-h-[34px] px-3 py-1 rounded border text-xs font-display transition-colors ${
                        zenFontFamily === 'serif'
                          ? zenTheme === 'night'
                            ? 'bg-amber-200 text-stone-950 border-amber-200'
                            : 'bg-[#1B365D] text-white border-[#1B365D]'
                          : 'border-current/20 opacity-80 hover:opacity-100'
                      }`}
                    >
                      Littéraire (Serif)
                    </button>
                    <button
                      type="button"
                      onClick={() => setZenFontFamily('sans')}
                      className={`min-h-[34px] px-3 py-1 rounded border text-xs font-sans transition-colors ${
                        zenFontFamily === 'sans'
                          ? zenTheme === 'night'
                            ? 'bg-amber-200 text-stone-950 border-amber-200'
                            : 'bg-[#1B365D] text-white border-[#1B365D]'
                          : 'border-current/20 opacity-80 hover:opacity-100'
                      }`}
                    >
                      Épurée (Sans)
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest opacity-65">
                    Taille du texte
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'sm', label: 'A-' },
                        { id: 'md', label: 'Normal' },
                        { id: 'lg', label: 'A+' },
                      ] as const
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setZenFontSize(sz.id)}
                        className={`min-h-[34px] px-2 py-1 rounded border text-xs font-medium transition-colors ${
                          zenFontSize === sz.id
                            ? zenTheme === 'night'
                              ? 'bg-amber-200 text-stone-950 border-amber-200'
                              : 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'border-current/20 opacity-80 hover:opacity-100'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest opacity-65">
                    Ambiance papier
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
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
                        className={`min-h-[34px] px-2 py-1 rounded border text-xs font-medium transition-colors ${
                          zenTheme === opt.id
                            ? zenTheme === 'night'
                              ? 'bg-amber-200 text-stone-950 border-amber-200'
                              : 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'border-current/20 opacity-80 hover:opacity-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showMusicPanel && (
              <div className="fixed top-14 right-4 sm:top-16 sm:right-6 z-20 w-[min(92vw,420px)] max-h-[75vh] overflow-y-auto">
                <ReadingMusicPanel
                  controller={audioController}
                  authorName={publicAuthorLabel}
                  authorFavoriteMusic={authorPinnedMusic}
                  compactPopover={true}
                  onClose={() => setShowMusicPanel(false)}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="px-4 sm:px-6 py-3 sm:py-3.5 border-b border-stone-200 bg-white space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
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
                      className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium hover:brightness-95 transition max-w-full cursor-pointer"
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
                      className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded border border-stone-200 bg-stone-50 text-[#1B365D] text-[11px] font-medium hover:border-stone-400 transition max-w-full cursor-pointer"
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
                    <span className="inline-flex items-center px-2.5 py-1 rounded border border-stone-200 bg-stone-50 text-[#1B365D] text-[11px] font-medium truncate max-w-full">
                      {originSalonLabel}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {audioController.isExternalEmbedActive && (
                    <button
                      type="button"
                      onClick={audioController.toggleEmbedBackground}
                      aria-label={
                        audioController.embedBackground
                          ? 'Afficher le lecteur vidéo'
                          : 'Mettre la vidéo en arrière-plan'
                      }
                      title={
                        audioController.embedBackground
                          ? 'Afficher la vidéo'
                          : 'Mettre en arrière-plan'
                      }
                      className="min-h-[38px] px-2.5 py-1.5 rounded-md border border-stone-200 bg-[#FBF9F5] text-xs font-medium text-stone-700 hover:text-stone-900 hover:border-stone-400 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      {audioController.embedBackground ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Vidéo</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Arrière-plan</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMusicPanel((prev) => !prev)}
                    aria-label="Musique de lecture"
                    aria-expanded={showMusicPanel}
                    className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
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
                  {canSharePublicLink && (
                    <button
                      type="button"
                      onClick={() => setShowSharePanel((prev) => !prev)}
                      aria-label="Partager ce récit"
                      aria-expanded={showSharePanel}
                      className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        showSharePanel
                          ? 'border-[#1B365D] bg-[#1B365D] text-white'
                          : 'border-stone-200 bg-[#FBF9F5] text-stone-700 hover:text-stone-900 hover:border-stone-400'
                      }`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Partager</span>
                    </button>
                  )}
                  {!isReadingBlocked && (
                    <button
                      type="button"
                      onClick={() => setZenMode(true)}
                      aria-label="Activer le Mode lecture zen"
                      aria-pressed={false}
                      className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-md border border-[#1B365D]/35 bg-[#F3F6FA] text-xs font-medium text-[#1B365D] hover:bg-[#1B365D] hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="sm:hidden">Zen</span>
                      <span className="hidden sm:inline">Mode lecture zen</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer la lecture"
                    className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                <StoryFormatKicker story={story} showDetails={true} />
                {isRoman && totalChapters > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums text-stone-700 font-medium">
                      Chap. {activeChapterIdx + 1}/{totalChapters}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap tabular-nums">{displayedMinutes} min de lecture</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap tabular-nums text-[#1B365D] font-medium">
                  {roundedScrollProgress} % lu
                </span>
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
                <MatureContentBadge minAge={story.minAge} isMature={story.isMature} />
              </div>
            </div>

            {showMusicPanel && (
              <div className="max-h-[42vh] overflow-y-auto shrink-0">
                <ReadingMusicPanel
                  controller={audioController}
                  authorName={publicAuthorLabel}
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
              ? 'flex-1 min-h-0 overflow-y-auto px-5 sm:px-12 pt-10 pb-28 sm:pt-16 sm:pb-32'
              : 'flex-1 min-h-0 overflow-y-auto px-4 sm:px-12 py-6 sm:py-10'
          }
        >
          <article className={zenMode ? 'max-w-[62ch] mx-auto' : 'max-w-prose mx-auto'}>
            {(() => {
              const readingOriginLabel =
                story.customSalonName ||
                (story.storyScope === 'pelemele' && !story.customSalonId
                  ? 'Hors salon · Pêle-mêle'
                  : THEME_MAP[story.theme]?.salonName);

              const categoryBanner = (
                <div
                  className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-widest font-semibold ${
                    zenMode && zenTheme === 'night'
                      ? 'text-amber-300/90'
                      : isRoman
                        ? 'text-[#1B365D]'
                        : 'text-[#9A3B29]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {isRoman ? (
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Feather className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      Catégorie · {isRoman ? 'Roman à chapitres' : 'Confession'}
                    </span>
                  </span>
                  {isRoman && story.novelGenre && (
                    <>
                      <span aria-hidden="true" className="opacity-45">
                        ·
                      </span>
                      <span className={zenMode && zenTheme === 'night' ? 'text-stone-300' : 'text-stone-700'}>
                        {NOVEL_GENRE_LABELS[story.novelGenre]}
                      </span>
                    </>
                  )}
                  {isRoman ? (
                    <>
                      <span aria-hidden="true" className="opacity-45">
                        ·
                      </span>
                      <span className={`tabular-nums ${zenMode && zenTheme === 'night' ? 'text-stone-300' : 'text-stone-600'}`}>
                        Chapitre {activeChapterIdx + 1} sur {totalChapters}
                      </span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true" className="opacity-45">
                        ·
                      </span>
                      <span className={zenMode && zenTheme === 'night' ? 'text-stone-300' : 'text-stone-600'}>
                        Texte unique
                        {readingOriginLabel ? ` · ${readingOriginLabel}` : ''}
                      </span>
                    </>
                  )}
                </div>
              );

              if (!zenMode && isRoman) {
                return (
                  <div className="flex flex-col sm:flex-row items-start gap-5 mb-5">
                    <NovelCoverArt
                      coverUrl={story.coverUrl}
                      title={story.title}
                      genre={story.novelGenre}
                      size="lg"
                      showFallbackWhenMissing={true}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      {categoryBanner}
                      {story.promptQuestion && (
                        <p className="text-xs text-stone-500 italic">
                          En réponse au fil : « {story.promptQuestion} »
                        </p>
                      )}
                      <h1
                        id="reader-story-title"
                        className="font-display text-3xl sm:text-4xl font-medium leading-tight text-stone-900"
                        style={{ textWrap: 'balance' }}
                      >
                        {story.title}
                      </h1>
                      <p className="text-xs text-stone-500 tabular-nums">
                        {SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']} ·{' '}
                        {RELEASE_CADENCE_LABELS[story.releaseCadence ?? 'hebdomadaire']}
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className={zenMode ? 'mb-8 sm:mb-10 space-y-3' : 'mb-4 space-y-2.5'}>
                  {categoryBanner}
                  {!zenMode && story.promptQuestion && (
                    <p className="text-xs text-stone-500 italic">
                      En réponse au fil : « {story.promptQuestion} »
                    </p>
                  )}

                  <h1
                    id="reader-story-title"
                    className={`font-display text-3xl sm:text-4xl font-medium leading-tight ${
                      zenMode
                        ? zenTheme === 'night'
                          ? 'text-[#F5F0E6]'
                          : 'text-stone-900'
                        : 'text-stone-900'
                    }`}
                    style={{ textWrap: 'balance' }}
                  >
                    {story.title}
                  </h1>
                </div>
              );
            })()}

            {!zenMode && (
              <div className="pb-5 border-b border-stone-200 mb-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
                  <div className="flex flex-wrap items-center gap-2">
                    {isAnonymousStory ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-700 inline-flex items-center gap-1.5">
                          <EyeOff className="w-3.5 h-3.5 text-stone-500" />
                          <span>
                            Auteur anonyme{isAuthor ? ' (votre texte)' : ''}
                          </span>
                        </span>
                        {isAuthor && !confirmClaimAnon && (
                          <button
                            type="button"
                            onClick={() => {
                              setClaimError(null);
                              setConfirmClaimAnon(true);
                            }}
                            className="px-2.5 py-0.5 rounded border border-[#CBD6E6] bg-[#F3F6FA] text-[#1B365D] text-xs font-medium hover:bg-[#E7EEF7] inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Revendiquer cet écrit</span>
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
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
                        {!isAuthor && (
                          <button
                            type="button"
                            disabled={favAuthorBusy}
                            onClick={async () => {
                              if (!user) {
                                await signInWithGoogle();
                                return;
                              }
                              setFavAuthorBusy(true);
                              try {
                                await toggleFavoriteAuthor(
                                  user.uid,
                                  story.authorId,
                                  story.authorName
                                );
                              } catch (err) {
                                console.error('Erreur auteur favori:', err);
                              } finally {
                                setFavAuthorBusy(false);
                              }
                            }}
                            aria-pressed={favoriteAuthors.some((a) => a.authorId === story.authorId)}
                            title={
                              favoriteAuthors.some((a) => a.authorId === story.authorId)
                                ? 'Retirer des auteurs favoris'
                                : 'Suivre cet auteur dans Pour vous'
                            }
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                              favoriteAuthors.some((a) => a.authorId === story.authorId)
                                ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                : 'border-stone-200 bg-white text-stone-600 hover:border-[#1B365D] hover:text-[#1B365D]'
                            } disabled:opacity-50`}
                          >
                            <Star
                              className={`w-3 h-3 ${
                                favoriteAuthors.some((a) => a.authorId === story.authorId)
                                  ? 'fill-current'
                                  : ''
                              }`}
                            />
                            <span>
                              {favoriteAuthors.some((a) => a.authorId === story.authorId)
                                ? 'Suivi'
                                : 'Suivre'}
                            </span>
                          </button>
                        )}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                    {story.visibility === 'public' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums text-stone-500">
                          <Eye className="w-3.5 h-3.5" />
                          {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={statusToggleBusy}
                        onClick={() => void handleToggleSeriesStatus()}
                        className="min-h-[34px] px-3 py-1 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {story.seriesStatus === 'termine'
                            ? 'Rouvrir en cours'
                            : 'Marquer terminé'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowChapterForm((prev) => !prev)}
                        className="min-h-[34px] px-3 py-1 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Publier le chapitre {totalChapters + 1}</span>
                      </button>
                    </div>
                  )}
                </div>
                {statusToggleError && (
                  <p role="alert" className="text-xs text-red-700">
                    {statusToggleError}
                  </p>
                )}

                {isAuthor && isAnonymousStory && confirmClaimAnon && (
                  <div className="rounded-md border border-[#CBD6E6] bg-[#F3F6FA] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 text-stone-800">
                      <p className="font-medium text-stone-900">
                        Revendiquer la paternité de cet écrit ?
                      </p>
                      <p className="text-stone-600">
                        Votre nom ({profile?.displayName || user?.displayName || 'Auteur'}) remplace « Auteur anonyme » sur ce récit et le relie à votre profil.
                      </p>
                      {claimError && (
                        <p role="alert" className="text-red-700 pt-1">
                          {claimError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={claimBusy}
                        onClick={() => void handleClaimAnonymousInReader()}
                        className="min-h-[34px] px-3 py-1 rounded bg-[#1B365D] text-white font-medium hover:bg-[#132744] disabled:opacity-50 whitespace-nowrap"
                      >
                        {claimBusy ? 'Publication…' : 'Confirmer'}
                      </button>
                      <button
                        type="button"
                        disabled={claimBusy}
                        onClick={() => {
                          setConfirmClaimAnon(false);
                          setClaimError(null);
                        }}
                        className="min-h-[34px] px-3 py-1 rounded border border-stone-300 bg-white text-stone-700 hover:border-stone-500 whitespace-nowrap"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Zen Reading & Ambient Music Invitation Bar */}
                {!isReadingBlocked && (
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
                              publicAuthorLabel
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
                        <span>Mode lecture zen</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Highlighting Guide & Saved Quotes Summary for this Story */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600 px-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Highlighter className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      Sélectionnez un passage dans le récit pour le surligner et l’ajouter à vos citations favorites.
                    </span>
                  </span>
                  {currentStoryQuotes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowStoryQuotesDrawer((prev) => !prev)}
                      className="font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums"
                    >
                      <Quote className="w-3.5 h-3.5" />
                      <span>
                        {currentStoryQuotes.length} passage{currentStoryQuotes.length > 1 ? 's' : ''}{' '}
                        surligné{currentStoryQuotes.length > 1 ? 's' : ''}
                      </span>
                    </button>
                  )}
                </div>

                {showStoryQuotesDrawer && currentStoryQuotes.length > 0 && (
                  <div className="bg-white border border-stone-200 rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-widest text-stone-500">
                        Vos citations de ce récit ({currentStoryQuotes.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowStoryQuotesDrawer(false)}
                        className="text-xs text-stone-500 hover:text-stone-900"
                      >
                        Masquer
                      </button>
                    </div>
                    <ul className="divide-y divide-stone-100">
                      {currentStoryQuotes.map((q) => (
                        <li
                          key={q.quoteId}
                          className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="font-display text-sm text-stone-900 leading-relaxed">
                              « {q.quoteText} »
                            </p>
                            {isRoman && (
                              <p className="text-[11px] text-stone-500">
                                Chapitre {q.chapterNumber}
                                {q.chapterTitle ? ` · ${q.chapterTitle}` : ''}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={quoteBusy}
                            onClick={() => void handleDeleteHighlight(q.quoteId)}
                            aria-label="Retirer cette citation"
                            className="p-1.5 text-stone-400 hover:text-red-700 rounded transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!zenMode && isAuthor && !formatCompliance.compliant && (
              <div className="mb-6 bg-amber-50/90 border border-amber-300 rounded-lg p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Régulation rétroactive : {formatCompliance.shortReason}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-950 leading-relaxed">
                  {story.visibility === 'public'
                    ? `Ce récit publié avant l’entrée en vigueur des nouveaux seuils est actuellement masqué des salons publics. ${formatCompliance.detailReason}`
                    : formatCompliance.detailReason}
                </p>
                {privatizeError && (
                  <p role="alert" className="text-xs text-red-700">
                    {privatizeError}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {onEditStory && (
                    <button
                      type="button"
                      onClick={() => onEditStory(story)}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Compléter pour republier</span>
                    </button>
                  )}
                  {story.visibility === 'public' && (
                    <button
                      type="button"
                      disabled={privatizeBusy}
                      onClick={async () => {
                        setPrivatizeError(null);
                        setPrivatizeBusy(true);
                        try {
                          await updateStoryVisibility(story.storyId, 'private');
                          onClose();
                        } catch (err) {
                          setPrivatizeError(
                            formatFriendlyFirestoreError(
                              err,
                              'Impossible de passer ce récit en brouillon privé.'
                            )
                          );
                        } finally {
                          setPrivatizeBusy(false);
                        }
                      }}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-md border border-amber-300 bg-white text-amber-950 text-xs font-medium hover:border-amber-500 inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {privatizeBusy ? 'En cours…' : 'Passer en brouillon privé'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {isBlockedByRetroactiveRule ? (
              <div className="my-4 bg-white border border-amber-300 rounded-lg p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Publication suspendue par régulation rétroactive
                  </h2>
                </div>
                <p className="text-sm text-stone-700 leading-relaxed">
                  Lisière exige désormais plus de 3 lignes pour les confessions et au moins 2 pages par chapitre de roman, y compris sur les récits publiés avant la mise à jour. Ce texte ne remplit pas encore ce seuil ({formatCompliance.shortReason}) et reste retiré des salons tant que son auteur ne l’a pas complété.
                </p>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-[#FBF9F5] border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Revenir aux récits
                  </button>
                </div>
              </div>
            ) : ageBlockReason !== null ? (
              <div className="my-4 bg-white border border-amber-300 rounded-lg p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Contenu protégé par limite d’âge
                  </h2>
                  <MatureContentBadge minAge={story.minAge} isMature={story.isMature} />
                </div>
                <p className="text-sm text-stone-700 leading-relaxed">{ageBlockReason}</p>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744]"
                    >
                      Se connecter avec Google
                    </button>
                  ) : (
                    onOpenAgeSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAgeSettings();
                        }}
                        className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744]"
                      >
                        Renseigner ou modifier mon âge
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-[#FBF9F5] border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : needsMatureGate ? (
              <div className="my-4 bg-white border border-amber-300 rounded-lg p-6 sm:p-8 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Avertissement · Contenu mature
                  </h2>
                  <MatureContentBadge minAge={story.minAge} isMature={story.isMature} />
                </div>
                <p className="text-sm text-stone-700 leading-relaxed">
                  Même si ce récit est adapté à votre tranche d’âge, il aborde des thèmes sensibles ou matures. Prenez connaissance de cet avertissement avant de poursuivre la lecture.
                </p>
                {story.matureReason && (
                  <p className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-3.5 py-2.5">
                    Précision : {story.matureReason}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setMatureAcknowledged(true)}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744]"
                  >
                    J’ai compris — Afficher le récit
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-[#FBF9F5] border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Revenir aux récits
                  </button>
                </div>
              </div>
            ) : (
              <>
                {!zenMode && storyIsMature && (
                  <div className="mb-6 px-3.5 py-2.5 rounded-md border border-amber-200 bg-amber-50/75 text-xs text-amber-950 flex flex-wrap items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span className="font-semibold">Contenu mature</span>
                    {story.matureReason && (
                      <span>· {story.matureReason}</span>
                    )}
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
                    placeholder="Poursuivez votre histoire (minimum 2 pages / 3 000 caractères)…"
                    className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm leading-relaxed text-stone-800 focus:outline-none focus:border-[#1B365D]"
                  />
                  <div
                    className={`mt-1.5 px-3 py-1.5 rounded border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                      inlineChapterLengthEval.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}
                  >
                    <span>
                      {inlineChapterLengthEval.ok
                        ? 'Longueur conforme (2 pages min.)'
                        : 'Minimum 2 pages (3 000 car.) par chapitre'}
                    </span>
                    <span className="tabular-nums">
                      {inlineChapterLengthEval.estimatedPages.toFixed(1).replace('.', ',')} / 2,0 p. ·{' '}
                      {inlineChapterLengthEval.chars.toLocaleString('fr-FR')} /{' '}
                      {inlineChapterLengthEval.minChars.toLocaleString('fr-FR')} car.
                    </span>
                  </div>
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

                {chapterPlagiarismCheck &&
                  (chapterPlagiarismCheck.isSuspicious ||
                    chapterPlagiarismCheck.isModerateOverlap) &&
                  !chapterPlagiarismCheck.matchedIsOwnStory && (
                    <div
                      role="status"
                      className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
                        chapterPlagiarismCheck.isSuspicious
                          ? 'bg-red-50 border-red-200 text-red-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {chapterPlagiarismCheck.isSuspicious
                          ? `Similitude très élevée (${chapterPlagiarismCheck.similarityPercent} %) détectée avec « ${chapterPlagiarismCheck.matchedStoryTitle} ». Publiez un chapitre original.`
                          : `Attention : ${chapterPlagiarismCheck.similarityPercent} % de passages proches de « ${chapterPlagiarismCheck.matchedStoryTitle} ».`}
                      </span>
                    </div>
                  )}

                <label className="flex items-start gap-2 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chapterPlagiarismAttested}
                    onChange={(e) => setChapterPlagiarismAttested(e.target.checked)}
                    className="mt-0.5 rounded border-stone-300 text-[#1B365D]"
                  />
                  <span>
                    Je certifie que ce chapitre est une création originale conforme à la politique anti-plagiat des romans de Lisière.
                  </span>
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

            {activeFollowupChapter &&
            activeFollowupChapterEval &&
            !activeFollowupChapterEval.ok &&
            !isAuthor ? (
              <div className="my-4 bg-white border border-amber-300 rounded-lg p-6 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Chapitre {activeFollowupChapter.chapterNumber} suspendu par régulation rétroactive
                  </span>
                </div>
                <p className="text-sm text-stone-700 leading-relaxed">
                  Ce chapitre antérieur à la mise à jour contient moins de 2 pages ({activeFollowupChapterEval.estimatedPages.toFixed(1).replace('.', ',')} p. / 2 p. minimum) et n’est plus affiché aux lecteurs.
                </p>
              </div>
            ) : (
              <>
                {activeFollowupChapter &&
                  activeFollowupChapterEval &&
                  !activeFollowupChapterEval.ok &&
                  isAuthor && (
                    <div className="mb-5 px-3.5 py-2.5 rounded-md border border-amber-300 bg-amber-50 text-xs text-amber-950">
                      Attention (auteur) : ce chapitre {activeFollowupChapter.chapterNumber} fait moins de 2 pages ({activeFollowupChapterEval.estimatedPages.toFixed(1).replace('.', ',')} p.) et est masqué aux visiteurs sous l’effet de la régulation rétroactive.
                    </div>
                  )}
                <div
                  ref={storyParagraphsRef}
                  onMouseUp={inspectSelection}
                  onTouchEnd={() => window.setTimeout(inspectSelection, 120)}
                  className={
                    zenMode
                      ? `space-y-6 select-text ${zenTypefaceClass} ${zenFontClass} ${zenBodyTextClass}`
                      : 'space-y-5 select-text text-base sm:text-[17px] leading-[1.8] text-stone-800'
                  }
                >
                  {paragraphs.map((para, idx) => (
                    <p
                      key={idx}
                      data-paragraph-index={idx}
                      className={idx === 0 ? 'editorial-drop-cap' : ''}
                    >
                      {renderHighlightedParagraph(para, idx)}
                    </p>
                  ))}
                </div>
              </>
            )}

            {!zenMode && activeFollowupChapter?.authorNote && (
              <div className="mt-8 p-4 bg-white border border-stone-200 rounded-md text-sm text-stone-700 italic">
                {isAnonymousStory ? 'Note de l’auteur' : `Note de ${story.authorName}`} : «{' '}
                {activeFollowupChapter.authorNote} »
              </div>
            )}

            {!isRoman && !isReadingBlocked && (
              <div
                className={`mt-8 pt-4 border-t flex items-center justify-between gap-3 text-xs ${
                  zenMode && zenTheme === 'night'
                    ? 'border-stone-800 text-stone-400'
                    : 'border-stone-200 text-stone-500'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Feather
                    className={`w-3.5 h-3.5 shrink-0 ${
                      zenMode && zenTheme === 'night' ? 'text-amber-300/90' : 'text-[#9A3B29]'
                    }`}
                  />
                  <span>Confession · Texte complet en un seul souffle</span>
                </span>
                <span className="tabular-nums opacity-75">Sans chapitres</span>
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

            {!zenMode &&
              !isAnonymousStory &&
              authorProfile &&
              (authorProfile.bio || authorProfile.listeningNote) && (
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

                  {canSharePublicLink && (
                    <button
                      type="button"
                      onClick={() => setShowSharePanel(true)}
                      className="min-h-[40px] px-3.5 py-2 text-sm font-medium rounded-md border border-stone-300 bg-white text-stone-800 hover:border-[#1B365D] hover:text-[#1B365D] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Partager</span>
                    </button>
                  )}

                  {!isAuthor && !isAnonymousStory && story.visibility === 'public' && (
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

                  {!isAuthor && story.visibility === 'public' && onOpenReport && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenReport({
                          targetUserId: story.authorId,
                          targetUserName: publicAuthorLabel,
                          targetType: 'story',
                          targetId: story.storyId,
                          targetContextId: story.storyId,
                          targetExcerpt: activeFollowupChapter
                            ? activeFollowupChapter.content.slice(0, 600)
                            : story.excerpt || story.content.slice(0, 600),
                          targetSummaryLabel: `Signaler « ${story.title} »`,
                          isAnonymousTarget: isAnonymousStory,
                        });
                      }}
                      className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md border border-stone-200 text-stone-600 bg-white hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Signaler</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-stone-500 tabular-nums">
                  {story.visibility === 'public' && (
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                  <span>
                    {visibleEchoes.length} commentaire{visibleEchoes.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Novel Originality Charter & Reader Plagiarism Reporting */}
            {!zenMode && isRoman && story.visibility === 'public' && (
              <div className="mt-5 p-3.5 bg-white border border-stone-200 rounded-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
                  <span className="inline-flex items-center gap-1.5 text-stone-700">
                    <ShieldCheck className="w-4 h-4 text-[#1B365D] shrink-0" />
                    <span>
                      {story.plagiarismAttested
                        ? 'Œuvre originale certifiée · Charte anti-plagiat des romans'
                        : 'Soumis à la charte anti-plagiat des romans de Lisière'}
                    </span>
                  </span>

                  {!isAuthor && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          void signInWithGoogle();
                          return;
                        }
                        setReportError(null);
                        setShowReportForm((prev) => !prev);
                      }}
                      className="text-xs font-medium text-stone-600 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>
                        {reportSubmitted
                          ? 'Signalement transmis'
                          : showReportForm
                            ? 'Fermer'
                            : 'Signaler un plagiat'}
                      </span>
                    </button>
                  )}
                </div>

                {reportSubmitted && !showReportForm && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                    Merci. Votre signalement pour plagiat a bien été enregistré pour vérification.
                  </p>
                )}

                {showReportForm && !isAuthor && (
                  <form
                    onSubmit={handleSubmitPlagiarismReport}
                    className="pt-3 border-t border-stone-200 space-y-3"
                  >
                    <p className="text-xs text-stone-700 font-medium">
                      Signaler une atteinte aux droits d’auteur sur ce roman
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="plagiarism-reason"
                          className="block text-[11px] uppercase tracking-widest text-stone-500 mb-1"
                        >
                          Motif
                        </label>
                        <select
                          id="plagiarism-reason"
                          value={reportReason}
                          onChange={(e) =>
                            setReportReason(e.target.value as PlagiarismReportReason)
                          }
                          className="w-full min-h-[36px] px-2.5 py-1 bg-[#FBF9F5] border border-stone-200 rounded text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
                        >
                          <option value="oeuvre-publiee">
                            Copie d’une œuvre publiée ailleurs
                          </option>
                          <option value="copie-interne">
                            Copie d’un autre texte sur Lisière
                          </option>
                          <option value="autre">Autre infraction aux droits d’auteur</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="plagiarism-ref"
                          className="block text-[11px] uppercase tracking-widest text-stone-500 mb-1"
                        >
                          Lien ou source originale (facultatif)
                        </label>
                        <input
                          id="plagiarism-ref"
                          type="text"
                          maxLength={FIELD_LIMITS.plagiarismRefUrl.max}
                          value={reportRefUrl}
                          onChange={(e) => setReportRefUrl(e.target.value)}
                          placeholder="Titre du livre, auteur ou URL…"
                          className="w-full min-h-[36px] px-2.5 py-1 bg-[#FBF9F5] border border-stone-200 rounded text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="plagiarism-details"
                        className="block text-[11px] uppercase tracking-widest text-stone-500 mb-1"
                      >
                        Précisions (passages concernés, contexte)
                      </label>
                      <textarea
                        id="plagiarism-details"
                        rows={3}
                        required
                        maxLength={FIELD_LIMITS.plagiarismDetails.max}
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="Indiquez quel passage ou ouvrage semble copié…"
                        className="w-full px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>

                    {reportError && (
                      <p role="alert" className="text-xs text-red-700">
                        {reportError}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReportForm(false)}
                        className="min-h-[34px] px-3 py-1 text-xs text-stone-600 hover:text-stone-900"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={reportBusy}
                        className="min-h-[34px] px-3.5 py-1 text-xs font-medium text-white bg-red-800 rounded hover:bg-red-900 disabled:opacity-60"
                      >
                        {reportBusy ? 'Envoi…' : 'Envoyer le signalement'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {!zenMode && resonateError && (
              <p role="alert" className="mt-3 text-xs text-red-700">
                {resonateError}
              </p>
            )}

            {!zenMode && showBridgeBox && !isAuthor && !isAnonymousStory && (
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

                {visibleEchoes.length === 0 ? (
                  <p className="text-sm text-stone-500 italic py-4">
                    Aucun commentaire pour l’instant. Soyez la première personne à réagir à cette histoire.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 mb-8">
                    {visibleEchoes.map((echo) => (
                      <div key={echo.echoId} className="py-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 mb-2">
                          <div className="flex flex-wrap items-center gap-2">
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
                          {onOpenReport && echo.authorId !== user?.uid && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenReport({
                                  targetUserId: echo.authorId,
                                  targetUserName: echo.authorName,
                                  targetType: 'echo',
                                  targetId: echo.echoId,
                                  targetContextId: story.storyId,
                                  targetExcerpt: echo.content,
                                  targetSummaryLabel: `Signaler le commentaire de ${echo.authorName}`,
                                })
                              }
                              title="Signaler ce commentaire"
                              aria-label="Signaler ce commentaire"
                              className="text-stone-400 hover:text-red-700 p-1 rounded"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                          Visible par les lecteurs · Modéré par le bot anti-haine Lisière.
                        </span>
                        <button
                          type="submit"
                          disabled={echoBusy}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {echoBusy ? 'Vérification…' : 'Publier le commentaire'}
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
              </>
            )}
          </article>
        </div>

        {/* Floating Selection Highlight Bar & Existing Highlight Action Bar */}
        {(pendingSelection || activeQuotePopover || quoteFeedback) && (
          <div className="pointer-events-none fixed bottom-4 inset-x-0 z-[60] flex justify-center px-4">
            <div className="pointer-events-auto max-w-xl w-full sm:w-auto flex flex-col gap-2">
              {quoteFeedback && (
                <div
                  role="status"
                  className={`mx-auto px-3.5 py-2 rounded-md border text-xs font-medium shadow-md flex items-center gap-2 ${
                    quoteFeedback.kind === 'error'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-stone-900 border-stone-800 text-[#FBF9F5]'
                  }`}
                >
                  {quoteFeedback.kind === 'success' && <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                  <span>{quoteFeedback.message}</span>
                </div>
              )}

              {pendingSelection && (
                <div
                  onMouseDown={(e) => e.preventDefault()}
                  className={`rounded-lg border shadow-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
                    zenMode && zenTheme === 'night'
                      ? 'bg-[#26231F] border-amber-300/35 text-[#F5F0E6]'
                      : 'bg-white border-stone-300 text-stone-900'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display italic text-xs sm:text-sm truncate">
                      « {pendingSelection.text} »
                    </p>
                    {pendingSelection.truncated && (
                      <p className="text-[11px] opacity-70">
                        Extrait ajusté à 800 caractères maximum.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {matchingPendingQuote ? (
                      <button
                        type="button"
                        disabled={quoteBusy}
                        onClick={() => void handleDeleteHighlight(matchingPendingQuote.quoteId)}
                        className="min-h-[36px] px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Retirer le surlignage</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={quoteBusy}
                        onClick={() => void handleSaveHighlight()}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-medium bg-[#1B365D] text-white hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Highlighter className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          {quoteBusy ? 'Enregistrement…' : 'Surligner · Citations favorites'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        window.getSelection()?.removeAllRanges();
                        setPendingSelection(null);
                      }}
                      aria-label="Annuler la sélection"
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {!pendingSelection && activeQuotePopover && (
                <div
                  className={`rounded-lg border shadow-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
                    zenMode && zenTheme === 'night'
                      ? 'bg-[#26231F] border-amber-300/35 text-[#F5F0E6]'
                      : 'bg-white border-stone-300 text-stone-900'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-widest opacity-65">
                      Citation favorite
                    </p>
                    <p className="font-display italic text-xs sm:text-sm truncate">
                      « {activeQuotePopover.quoteText} »
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopyQuoteText(activeQuotePopover)}
                      className="min-h-[34px] px-2.5 py-1 rounded-md border border-current/20 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap hover:border-current/45"
                    >
                      {quoteCopiedId === activeQuotePopover.quoteId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={quoteBusy}
                      onClick={() => void handleDeleteHighlight(activeQuotePopover.quoteId)}
                      className="min-h-[34px] px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Retirer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveQuotePopover(null)}
                      aria-label="Fermer"
                      className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
        {showSharePanel && canSharePublicLink && (
          <div
            className="absolute inset-0 z-40 bg-stone-900/45 flex items-center justify-center p-4"
            onClick={() => setShowSharePanel(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-story-dialog-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-lg border border-stone-300 bg-[#FBF9F5] p-5 sm:p-6 shadow-xl space-y-5 text-stone-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-widest text-stone-500">
                    Lien direct & réseaux
                  </p>
                  <h2
                    id="share-story-dialog-title"
                    className="font-display text-xl font-medium text-stone-900 leading-snug"
                  >
                    Partager « {story.title} »
                  </h2>
                  <p className="text-xs text-stone-500">
                    {isAnonymousStory
                      ? 'Auteur anonyme — le lien préserve strictement l’anonymat.'
                      : `Par ${story.authorName}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSharePanel(false)}
                  aria-label="Fermer la fenêtre de partage"
                  className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="direct-story-share-url"
                  className="block text-xs font-medium text-stone-700"
                >
                  Lien direct vers le récit
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    id="direct-story-share-url"
                    type="text"
                    readOnly
                    value={directStoryUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-stone-300 rounded-md text-stone-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyDirectLink()}
                    className="min-h-[38px] px-3.5 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {shareLinkCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {canUseNativeShare && (
                <button
                  type="button"
                  onClick={() => void handleNativeShare()}
                  className="w-full min-h-[40px] px-4 py-2 rounded-md border border-[#1B365D] bg-[#F3F6FA] text-[#1B365D] text-xs font-medium hover:bg-[#E7EEF7] inline-flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Partager via les applications de l’appareil…</span>
                </button>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-stone-700">Partager sur un réseau</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${shareSummaryText} ${directStoryUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-2 rounded-md border border-stone-200 bg-white text-xs font-medium text-stone-800 hover:border-stone-400 inline-flex items-center justify-between gap-1.5"
                  >
                    <span>WhatsApp</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareSummaryText)}&url=${encodeURIComponent(directStoryUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-2 rounded-md border border-stone-200 bg-white text-xs font-medium text-stone-800 hover:border-stone-400 inline-flex items-center justify-between gap-1.5"
                  >
                    <span>X / Twitter</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </a>
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(directStoryUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-2 rounded-md border border-stone-200 bg-white text-xs font-medium text-stone-800 hover:border-stone-400 inline-flex items-center justify-between gap-1.5"
                  >
                    <span>Facebook</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </a>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(directStoryUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-2 rounded-md border border-stone-200 bg-white text-xs font-medium text-stone-800 hover:border-stone-400 inline-flex items-center justify-between gap-1.5"
                  >
                    <span>LinkedIn</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(shareSummaryText)}&body=${encodeURIComponent(`${shareSummaryText}\n\nLire ce récit sur Lisière :\n${directStoryUrl}`)}`}
                    className="min-h-[38px] px-3 py-2 rounded-md border border-stone-200 bg-white text-xs font-medium text-stone-800 hover:border-stone-400 inline-flex items-center justify-between gap-1.5 col-span-2 sm:col-span-1"
                  >
                    <span>E-mail</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
