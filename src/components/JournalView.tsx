import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Globe,
  Highlighter,
  Lock,
  LogOut,
  Plus,
  Quote,
  Repeat2,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateStoryFormatCompliance } from '../lib/contentRegulation';
import {
  MODERATION_CATEGORY_LABELS,
  MODERATION_REVIEW_STEPS,
  MODERATION_STATUS_LABELS,
  MODERATION_TARGET_LABELS,
  WARNING_SEVERITY_LABELS,
} from '../lib/moderationLabels';
import { sortStories, StorySortMode } from '../lib/storyFilter';
import {
  acknowledgeUserWarning,
  claimAnonymousStory,
  deleteStory,
  deleteStoryQuote,
  deleteStoryRepost,
  formatFriendlyFirestoreError,
  privatizeStoriesBatch,
  removeStoryBookmark,
  removeUserRelationship,
  updateNovelSeriesStatus,
  updateRepostVisibility,
  updateStoryVisibility,
} from '../lib/storyService';
import {
  formatCumulativeMinutes,
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  RELEASE_CADENCE_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Exchange,
  MemberWarning,
  ModerationCase,
  Story,
  StoryBookmark,
  StoryQuote,
  StoryRepost,
  UserRelationship,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';
import { StoryAnalyticsChart } from './StoryAnalyticsChart';
import { StoryFormatKicker } from './StoryFormatKicker';

export type JournalSubTab =
  | 'stories'
  | 'bookmarks'
  | 'quotes'
  | 'reposts'
  | 'stats'
  | 'moderation';

interface JournalViewProps {
  myStories: Story[];
  existingExchanges: Exchange[];
  bookmarks?: StoryBookmark[];
  quotes?: StoryQuote[];
  reposts?: StoryRepost[];
  userWarnings?: MemberWarning[];
  myModerationCases?: ModerationCase[];
  relationships?: UserRelationship[];
  requestedSubTab?: { tab: JournalSubTab; nonce: number } | null;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onEditStory: (story: Story) => void;
  onAddChapterToNovel?: (story: Story) => void;
  onNewStory: () => void;
  onOpenExchange: (exchangeId: string) => void;
  onOpenMyProfile?: () => void;
}
type StoryFilter =
  | 'all'
  | 'confession'
  | 'roman'
  | 'roman-en-cours'
  | 'roman-termine'
  | 'public'
  | 'private'
  | 'non-compliant'
  | 'anonymous';
type RepostFilter = 'all' | 'public' | 'private';

export function JournalView({
  myStories,
  bookmarks = [],
  quotes = [],
  reposts = [],
  userWarnings = [],
  myModerationCases = [],
  relationships = [],
  requestedSubTab = null,
  onReadStory,
  onOpenStoryById,
  onEditStory,
  onAddChapterToNovel,
  onNewStory,
  onOpenMyProfile,
}: JournalViewProps) {
  const { user, profile, signInWithGoogle, logOut } = useAuth();
  const [subTab, setSubTab] = useState<JournalSubTab>('stories');
  const [storyFilter, setStoryFilter] = useState<StoryFilter>('all');
  const [storySort, setStorySort] = useState<StorySortMode>('recent');
  const [storySearch, setStorySearch] = useState('');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [quoteSearch, setQuoteSearch] = useState('');
  const [repostFilter, setRepostFilter] = useState<RepostFilter>('all');
  const [repostSearch, setRepostSearch] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClaimId, setConfirmClaimId] = useState<string | null>(null);
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null);
  const [batchPrivatizeBusy, setBatchPrivatizeBusy] = useState(false);
  const [storyActionError, setStoryActionError] = useState<string | null>(null);
  const [busyBookmarkId, setBusyBookmarkId] = useState<string | null>(null);
  const [bookmarkActionError, setBookmarkActionError] = useState<string | null>(null);
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);
  const [quoteActionError, setQuoteActionError] = useState<string | null>(null);
  const [copiedQuoteId, setCopiedQuoteId] = useState<string | null>(null);
  const [busyRepostId, setBusyRepostId] = useState<string | null>(null);
  const [repostActionError, setRepostActionError] = useState<string | null>(null);
  const [busyWarningId, setBusyWarningId] = useState<string | null>(null);
  const [busyRelId, setBusyRelId] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);

  useEffect(() => {
    if (requestedSubTab) {
      setSubTab(requestedSubTab.tab);
    }
  }, [requestedSubTab?.nonce, requestedSubTab?.tab]);

  const publicCount = useMemo(
    () => myStories.filter((s) => s.visibility === 'public').length,
    [myStories]
  );
  const draftCount = useMemo(
    () => myStories.filter((s) => s.visibility === 'private').length,
    [myStories]
  );
  const nonCompliantStories = useMemo(
    () => myStories.filter((s) => !evaluateStoryFormatCompliance(s).compliant),
    [myStories]
  );
  const nonCompliantPublicStories = useMemo(
    () => nonCompliantStories.filter((s) => s.visibility === 'public'),
    [nonCompliantStories]
  );
  const nonCompliantCount = nonCompliantStories.length;
  const anonymousCount = useMemo(
    () => myStories.filter((s) => Boolean(s.isAnonymous)).length,
    [myStories]
  );
  const confessionCount = useMemo(
    () => myStories.filter((s) => s.storyFormat !== 'roman').length,
    [myStories]
  );
  const romanCount = useMemo(
    () => myStories.filter((s) => s.storyFormat === 'roman').length,
    [myStories]
  );
  const ongoingRomanCount = useMemo(
    () =>
      myStories.filter(
        (s) => s.storyFormat === 'roman' && (s.seriesStatus ?? 'en-cours') === 'en-cours'
      ).length,
    [myStories]
  );
  const finishedRomanCount = useMemo(
    () =>
      myStories.filter((s) => s.storyFormat === 'roman' && s.seriesStatus === 'termine').length,
    [myStories]
  );
  const totalViewsReceived = useMemo(
    () => myStories.reduce((sum, s) => sum + (s.viewCount ?? 0), 0),
    [myStories]
  );
  const totalEchoesReceived = useMemo(
    () => myStories.reduce((sum, s) => sum + (s.echoCount || 0), 0),
    [myStories]
  );
  const totalReadingMinutes = useMemo(
    () => myStories.reduce((sum, s) => sum + (s.readingMinutes || 0), 0),
    [myStories]
  );

  const filteredStories = useMemo(() => {
    const q = storySearch.trim().toLowerCase();
    const list = myStories.filter((story) => {
      if (storyFilter === 'public' && story.visibility !== 'public') return false;
      if (storyFilter === 'private' && story.visibility !== 'private') return false;
      if (storyFilter === 'non-compliant' && evaluateStoryFormatCompliance(story).compliant) {
        return false;
      }
      if (storyFilter === 'anonymous' && !story.isAnonymous) return false;
      if (storyFilter === 'confession' && story.storyFormat === 'roman') return false;
      if (storyFilter === 'roman' && story.storyFormat !== 'roman') return false;
      if (
        storyFilter === 'roman-en-cours' &&
        (story.storyFormat !== 'roman' || (story.seriesStatus ?? 'en-cours') !== 'en-cours')
      ) {
        return false;
      }
      if (
        storyFilter === 'roman-termine' &&
        (story.storyFormat !== 'roman' || story.seriesStatus !== 'termine')
      ) {
        return false;
      }
      if (!q) return true;
      const salonLabel = (
        story.customSalonName ||
        (story.storyScope === 'pelemele'
          ? 'Hors salon Pêle-mêle'
          : THEME_MAP[story.theme]?.salonName || '')
      ).toLowerCase();
      const genreLabel = story.novelGenre ? NOVEL_GENRE_LABELS[story.novelGenre].toLowerCase() : '';
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        salonLabel.includes(q) ||
        genreLabel.includes(q)
      );
    });
    return sortStories(list, storySort);
  }, [myStories, storyFilter, storySearch, storySort]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarkSearch.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (bm) =>
        bm.storyTitle.toLowerCase().includes(q) ||
        bm.storyExcerpt.toLowerCase().includes(q) ||
        bm.storyAuthorName.toLowerCase().includes(q)
    );
  }, [bookmarks, bookmarkSearch]);

  const filteredQuotes = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter(
      (item) =>
        item.quoteText.toLowerCase().includes(q) ||
        item.storyTitle.toLowerCase().includes(q) ||
        item.storyAuthorName.toLowerCase().includes(q) ||
        (item.chapterTitle || '').toLowerCase().includes(q)
    );
  }, [quotes, quoteSearch]);

  const filteredReposts = useMemo(() => {
    const q = repostSearch.trim().toLowerCase();
    return reposts.filter((repost) => {
      if (repostFilter === 'public' && repost.visibility === 'private') return false;
      if (repostFilter === 'private' && repost.visibility !== 'private') return false;
      if (!q) return true;
      return (
        repost.storyTitle.toLowerCase().includes(q) ||
        repost.storyExcerpt.toLowerCase().includes(q) ||
        repost.storyAuthorName.toLowerCase().includes(q) ||
        (repost.note || '').toLowerCase().includes(q)
      );
    });
  }, [reposts, repostFilter, repostSearch]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Mon carnet · Écrits & bibliothèque
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Vos histoires, vos brouillons privés et vos lectures enregistrées
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Connectez-vous avec Google pour rédiger vos textes à votre rythme, retrouver vos favoris « À lire plus tard », gérer vos repartages et suivre vos statistiques de lecture.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap"
          >
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  const handleRemoveBookmark = async (storyId: string) => {
    if (!user || busyBookmarkId) return;
    setBookmarkActionError(null);
    setBusyBookmarkId(storyId);
    try {
      await removeStoryBookmark(user.uid, storyId);
    } catch (err) {
      setBookmarkActionError(
        err instanceof Error ? err.message : 'Impossible de retirer ce favori.'
      );
    } finally {
      setBusyBookmarkId(null);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!user || busyQuoteId) return;
    setQuoteActionError(null);
    setBusyQuoteId(quoteId);
    try {
      await deleteStoryQuote(user.uid, quoteId);
    } catch (err) {
      setQuoteActionError(
        err instanceof Error ? err.message : 'Impossible de retirer cette citation.'
      );
    } finally {
      setBusyQuoteId(null);
    }
  };

  const handleCopyQuote = async (quote: StoryQuote) => {
    setQuoteActionError(null);
    try {
      await navigator.clipboard.writeText(
        `« ${quote.quoteText} » — ${quote.storyTitle} (${quote.storyAuthorName})`
      );
      setCopiedQuoteId(quote.quoteId);
      window.setTimeout(() => {
        setCopiedQuoteId((prev) => (prev === quote.quoteId ? null : prev));
      }, 2200);
    } catch {
      setQuoteActionError('Impossible de copier cette citation dans le presse-papiers.');
    }
  };

  const handleToggleRepostVisibility = async (repost: StoryRepost) => {
    if (!user || busyRepostId) return;
    setRepostActionError(null);
    setBusyRepostId(repost.storyId);
    try {
      await updateRepostVisibility(
        user.uid,
        repost.storyId,
        repost.visibility === 'public' ? 'private' : 'public'
      );
    } catch (err) {
      setRepostActionError(
        err instanceof Error ? err.message : 'Impossible de modifier la visibilité de ce repartage.'
      );
    } finally {
      setBusyRepostId(null);
    }
  };

  const handleDeleteRepost = async (storyId: string) => {
    if (!user || busyRepostId) return;
    setRepostActionError(null);
    setBusyRepostId(storyId);
    try {
      await deleteStoryRepost(user.uid, storyId);
    } catch (err) {
      setRepostActionError(
        err instanceof Error ? err.message : 'Impossible de retirer ce repartage.'
      );
    } finally {
      setBusyRepostId(null);
    }
  };

  const handleToggleVisibility = async (story: Story) => {
    if (busyStoryId || story.customSalonVisibility === 'private') return;
    setStoryActionError(null);
    setBusyStoryId(story.storyId);
    try {
      const nextVis = story.visibility === 'public' ? 'private' : 'public';
      await updateStoryVisibility(story.storyId, nextVis);
    } catch (err) {
      setStoryActionError(
        err instanceof Error ? err.message : 'Impossible de modifier la visibilité de ce récit.'
      );
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleToggleSeriesStatus = async (story: Story) => {
    if (busyStoryId || story.storyFormat !== 'roman') return;
    setStoryActionError(null);
    setBusyStoryId(story.storyId);
    try {
      const nextStatus = story.seriesStatus === 'termine' ? 'en-cours' : 'termine';
      await updateNovelSeriesStatus(story.storyId, nextStatus);
    } catch (err) {
      setStoryActionError(
        err instanceof Error ? err.message : 'Impossible de mettre à jour le statut du roman.'
      );
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleClaimAnonymous = async (storyId: string) => {
    if (!user || busyStoryId) return;
    setStoryActionError(null);
    setBusyStoryId(storyId);
    try {
      const displayName = profile?.displayName || user.displayName || 'Auteur';
      await claimAnonymousStory(storyId, displayName);
      setConfirmClaimId(null);
    } catch (err) {
      setStoryActionError(
        err instanceof Error ? err.message : 'Impossible de revendiquer cet écrit.'
      );
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleDelete = async (storyId: string) => {
    if (busyStoryId) return;
    setStoryActionError(null);
    setBusyStoryId(storyId);
    try {
      await deleteStory(storyId);
      setConfirmDeleteId(null);
    } catch (err) {
      setStoryActionError(
        err instanceof Error ? err.message : 'Impossible de supprimer ce récit.'
      );
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleAckWarning = async (warningId: string) => {
    if (busyWarningId) return;
    setModerationError(null);
    setBusyWarningId(warningId);
    try {
      await acknowledgeUserWarning(warningId);
    } catch (err) {
      setModerationError(
        formatFriendlyFirestoreError(err, 'Impossible de confirmer la réception de cet avertissement.')
      );
    } finally {
      setBusyWarningId(null);
    }
  };

  const handleRestoreRelationship = async (targetUserId: string) => {
    if (!user || busyRelId) return;
    setModerationError(null);
    setBusyRelId(targetUserId);
    try {
      await removeUserRelationship(user.uid, targetUserId);
    } catch (err) {
      setModerationError(
        formatFriendlyFirestoreError(err, 'Impossible de rétablir ce membre.')
      );
    } finally {
      setBusyRelId(null);
    }
  };

  const unacknowledgedWarningsCount = userWarnings.filter((w) => !w.acknowledged).length;

  const navItems: Array<{
    id: JournalSubTab;
    label: string;
    shortLabel: string;
    count?: number;
    icon: typeof BookOpen;
  }> = [
    {
      id: 'stories',
      label: 'Mes écrits',
      shortLabel: 'Écrits',
      count: myStories.length,
      icon: FileText,
    },
    {
      id: 'bookmarks',
      label: 'À lire plus tard',
      shortLabel: 'Favoris',
      count: bookmarks.length,
      icon: Bookmark,
    },
    {
      id: 'quotes',
      label: 'Citations favorites',
      shortLabel: 'Citations',
      count: quotes.length,
      icon: Quote,
    },
    {
      id: 'reposts',
      label: 'Repartages',
      shortLabel: 'Repartages',
      count: reposts.length,
      icon: Repeat2,
    },
    {
      id: 'moderation',
      label: 'Avertissements & signalements',
      shortLabel: 'Sécurité',
      count: unacknowledgedWarningsCount + myModerationCases.length,
      icon: ShieldAlert,
    },
    {
      id: 'stats',
      label: 'Statistiques',
      shortLabel: 'Stats',
      icon: BarChart3,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 sm:py-10 space-y-6">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
            Mon carnet · {user.email}
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Mes écrits & bibliothèque
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenMyProfile && (
            <button
              type="button"
              onClick={onOpenMyProfile}
              className="min-h-[38px] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-[#1B365D] bg-white border border-[#CBD6E6] rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <UserIcon className="w-4 h-4" />
              <span>Mon profil</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNewStory}
            className="min-h-[38px] px-4 py-1.5 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau texte</span>
          </button>
          <button
            type="button"
            onClick={logOut}
            className="min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Horizontal Navigation */}
      <nav
        aria-label="Sections de mon carnet"
        className="lg:hidden flex items-center gap-1.5 p-1 bg-stone-100 rounded-lg overflow-x-auto"
      >
        {navItems.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.shortLabel}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
                    active ? 'bg-stone-100 text-stone-800' : 'bg-white/70 text-stone-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Desktop Left Navigation Rail */}
        <aside className="hidden lg:block lg:col-span-3 space-y-5 sticky top-6">
          <nav
            aria-label="Menu du carnet"
            className="bg-white border border-stone-200 rounded-lg p-2 space-y-1"
          >
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`w-full min-h-[42px] px-3.5 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-[#1B365D] text-white'
                      : 'text-stone-700 hover:bg-[#FBF9F5] hover:text-stone-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Compact Interactive Overview in Rail */}
          <div className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-stone-500">
              Aperçu rapide
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSubTab('stories');
                  setStoryFilter('public');
                }}
                className="p-2.5 rounded-md bg-[#FBF9F5] border border-stone-200/80 hover:border-[#1B365D]/40 text-left transition-colors"
              >
                <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                  {publicCount}
                </p>
                <p className="text-[11px] text-stone-600">Publiés</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubTab('stories');
                  setStoryFilter('private');
                }}
                className="p-2.5 rounded-md bg-[#FBF9F5] border border-stone-200/80 hover:border-[#1B365D]/40 text-left transition-colors"
              >
                <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                  {draftCount}
                </p>
                <p className="text-[11px] text-stone-600">Brouillons</p>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('stats')}
                className="p-2.5 rounded-md bg-[#FBF9F5] border border-stone-200/80 hover:border-[#1B365D]/40 text-left transition-colors"
              >
                <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                  {totalViewsReceived}
                </p>
                <p className="text-[11px] text-stone-600">Vues</p>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('stats')}
                className="p-2.5 rounded-md bg-[#FBF9F5] border border-stone-200/80 hover:border-[#1B365D]/40 text-left transition-colors"
              >
                <p className="font-display text-xl font-medium text-stone-900 tabular-nums">
                  {totalEchoesReceived}
                </p>
                <p className="text-[11px] text-stone-600">Échos</p>
              </button>
            </div>
          </div>
        </aside>

        {/* Right Main Content Area */}
        <div className="lg:col-span-9 space-y-5 min-w-0">
          {/* Tab 1: My Stories & Serialized Novels */}
          {subTab === 'stories' && (
            <section aria-label="Mes écrits" className="space-y-4">
              {myStories.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-lg p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Tous (${myStories.length})` },
                        ...(confessionCount > 0
                          ? [{ id: 'confession' as const, label: `Confessions (${confessionCount})` }]
                          : []),
                        ...(romanCount > 0
                          ? [
                              { id: 'roman' as const, label: `Romans (${romanCount})` },
                              ...(ongoingRomanCount > 0
                                ? [
                                    {
                                      id: 'roman-en-cours' as const,
                                      label: `En cours (${ongoingRomanCount})`,
                                    },
                                  ]
                                : []),
                              ...(finishedRomanCount > 0
                                ? [
                                    {
                                      id: 'roman-termine' as const,
                                      label: `Terminés (${finishedRomanCount})`,
                                    },
                                  ]
                                : []),
                            ]
                          : []),
                        { id: 'public', label: `Publiés (${publicCount})` },
                        { id: 'private', label: `Brouillons (${draftCount})` },
                        ...(nonCompliantCount > 0
                          ? [
                              {
                                id: 'non-compliant' as const,
                                label: `À régulariser (${nonCompliantCount})`,
                              },
                            ]
                          : []),
                        ...(anonymousCount > 0
                          ? [{ id: 'anonymous' as const, label: `Anonymes (${anonymousCount})` }]
                          : []),
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStoryFilter(opt.id)}
                        className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          storyFilter === opt.id
                            ? opt.id === 'confession'
                              ? 'bg-[#9A3B29] text-white border-[#9A3B29]'
                              : 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {myStories.length > 1 && (
                      <select
                        value={storySort}
                        onChange={(e) => setStorySort(e.target.value as StorySortMode)}
                        aria-label="Trier mes écrits"
                        className="min-h-[34px] px-2.5 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                      >
                        <option value="recent">Plus récents</option>
                        <option value="views">Plus vus</option>
                        <option value="resonances">Plus aimés</option>
                        <option value="echoes">Plus commentés</option>
                        <option value="shortest">Plus courts</option>
                        <option value="longest">Plus longs</option>
                      </select>
                    )}

                    {myStories.length > 1 && (
                      <div className="relative w-full sm:w-52 shrink-0">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={storySearch}
                          onChange={(e) => setStorySearch(e.target.value)}
                          placeholder="Filtrer mes textes…"
                          aria-label="Rechercher dans mes écrits"
                          className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {nonCompliantPublicStories.length > 0 && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        Régulation rétroactive : {nonCompliantPublicStories.length} récit
                        {nonCompliantPublicStories.length > 1 ? 's' : ''} public
                        {nonCompliantPublicStories.length > 1 ? 's' : ''} sous le seuil minimal
                      </span>
                    </p>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      Les confessions de 3 lignes ou moins et les romans de moins de 2 pages publiés avant la mise à jour sont automatiquement masqués des salons. Complétez-les pour qu’ils redeviennent visibles, ou passez-les en brouillons privés.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {storyFilter !== 'non-compliant' && (
                      <button
                        type="button"
                        onClick={() => setStoryFilter('non-compliant')}
                        className="min-h-[34px] px-3 py-1 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-950 hover:border-amber-500 whitespace-nowrap"
                      >
                        Afficher ({nonCompliantCount})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={batchPrivatizeBusy}
                      onClick={async () => {
                        setStoryActionError(null);
                        setBatchPrivatizeBusy(true);
                        try {
                          await privatizeStoriesBatch(
                            nonCompliantPublicStories.map((s) => s.storyId)
                          );
                        } catch (err) {
                          setStoryActionError(
                            formatFriendlyFirestoreError(
                              err,
                              'Impossible de passer ces textes en brouillon privé.'
                            )
                          );
                        } finally {
                          setBatchPrivatizeBusy(false);
                        }
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-md bg-amber-900 text-white text-xs font-medium hover:bg-amber-950 disabled:opacity-60 whitespace-nowrap"
                    >
                      {batchPrivatizeBusy
                        ? 'En cours…'
                        : `Passer en brouillons (${nonCompliantPublicStories.length})`}
                    </button>
                  </div>
                </div>
              )}

              {storyActionError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3.5 py-2"
                >
                  {storyActionError}
                </p>
              )}

              {myStories.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-4">
                  <FileText className="w-7 h-7 text-stone-400 mx-auto" />
                  <div className="space-y-1.5">
                    <p className="font-display text-xl text-stone-900">
                      Votre carnet est encore vierge
                    </p>
                    <p className="text-sm text-stone-600 max-w-md mx-auto">
                      Écrivez une confession, un récit libre ou lancez le premier chapitre d’un roman.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onNewStory}
                    className="min-h-[40px] px-4 py-2 text-sm font-medium text-[#1E3A8A] border border-[#1E3A8A] rounded-md hover:bg-[#1E3A8A] hover:text-white transition-colors whitespace-nowrap"
                  >
                    Commencer un texte
                  </button>
                </div>
              ) : filteredStories.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
                  <p className="font-display text-lg text-stone-900">
                    Aucun texte ne correspond à ce filtre
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStoryFilter('all');
                      setStorySearch('');
                    }}
                    className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Afficher tous mes écrits
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
                  {filteredStories.map((story) => {
                    const isConfirming = confirmDeleteId === story.storyId;
                    const isConfirmingClaim = confirmClaimId === story.storyId;
                    const isBusy = busyStoryId === story.storyId;
                    const isDraft = story.visibility === 'private';
                    const compliance = evaluateStoryFormatCompliance(story);

                    return (
                      <article key={story.storyId} className="p-5 sm:p-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                          <div className="flex flex-wrap items-center gap-2">
                            <StoryFormatKicker story={story} showDetails={true} />
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-stone-800">
                              {story.customSalonName
                                ? story.customSalonName
                                : story.storyScope === 'pelemele'
                                  ? 'Hors salon · Pêle-mêle'
                                  : THEME_MAP[story.theme]?.salonName}
                            </span>
                            {story.storyFormat === 'roman' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {RELEASE_CADENCE_LABELS[story.releaseCadence ?? 'hebdomadaire']}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-medium ${
                                isDraft
                                  ? 'border-stone-300 bg-stone-100 text-stone-700'
                                  : 'border-[#CBD6E6] bg-[#F3F6FA] text-[#1B365D]'
                              }`}
                            >
                              {isDraft ? (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Brouillon privé</span>
                                </>
                              ) : story.customSalonVisibility === 'private' ? (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Salon privé</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="w-3 h-3" />
                                  <span>
                                    {story.storyScope === 'pelemele' && !story.customSalonId
                                      ? 'Publié · Pêle-mêle'
                                      : 'Publié'}
                                  </span>
                                </>
                              )}
                            </span>
                            {story.isAnonymous && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-stone-300 bg-stone-50 text-[11px] font-medium text-stone-700">
                                <EyeOff className="w-3 h-3" />
                                <span>Anonyme</span>
                              </span>
                            )}
                            <MatureContentBadge
                              minAge={story.minAge}
                              isMature={story.isMature}
                              compact
                            />
                            {!compliance.compliant && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-[11px] font-medium text-amber-950">
                                <AlertTriangle className="w-3 h-3 text-amber-700" />
                                <span>À régulariser</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {!compliance.compliant && (
                          <div className="rounded-md border border-amber-200 bg-amber-50/75 px-3 py-2 text-xs text-amber-950">
                            <span className="font-medium">
                              {story.visibility === 'public'
                                ? 'Suspendu des salons publics : '
                                : 'Longueur insuffisante pour publication : '}
                            </span>
                            <span>{compliance.detailReason}</span>
                          </div>
                        )}

                        <div className="flex items-start gap-4">
                          {story.storyFormat === 'roman' && (
                            <NovelCoverArt
                              coverUrl={story.coverUrl}
                              title={story.title}
                              genre={story.novelGenre}
                              size="sm"
                              showFallbackWhenMissing={true}
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <h3 className="font-display text-xl font-medium text-stone-900">
                              <button
                                type="button"
                                onClick={() => onReadStory(story)}
                                className="text-left hover:underline"
                              >
                                {story.title}
                              </button>
                            </h3>
                            <p className="text-sm text-stone-600 leading-relaxed line-clamp-2">
                              {story.excerpt}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onReadStory(story)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>
                                {story.storyFormat === 'roman' ? 'Lire / Chapitres' : 'Lire'}
                              </span>
                            </button>

                            {story.storyFormat === 'roman' && onAddChapterToNovel && (
                              <button
                                type="button"
                                onClick={() => onAddChapterToNovel(story)}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Chapitre {(story.chapterCount ?? 1) + 1}</span>
                              </button>
                            )}

                            {story.storyFormat === 'roman' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleSeriesStatus(story)}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>
                                  {story.seriesStatus === 'termine'
                                    ? 'Rouvrir en cours'
                                    : 'Marquer terminé'}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onEditStory(story)}
                              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 whitespace-nowrap ${
                                !compliance.compliant
                                  ? 'text-amber-950 bg-amber-100 border border-amber-300 hover:bg-amber-200'
                                  : 'text-stone-800 bg-[#FBF9F5] border border-stone-200 hover:border-stone-400'
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>
                                {!compliance.compliant ? 'Compléter pour publier' : 'Modifier'}
                              </span>
                            </button>

                            {story.customSalonVisibility !== 'private' &&
                              (story.visibility === 'public' || compliance.compliant) && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleVisibility(story)}
                                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  {story.visibility === 'public' ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span>Passer en privé</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>Publier</span>
                                    </>
                                  )}
                                </button>
                              )}

                            {story.isAnonymous &&
                              (isConfirmingClaim ? (
                                <div className="flex flex-wrap items-center gap-1.5 bg-[#F3F6FA] border border-[#CBD6E6] rounded-md px-2.5 py-1">
                                  <span className="text-[11px] text-[#1B365D] font-medium">
                                    Signer « {profile?.displayName || user.displayName || 'Auteur'} » ?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleClaimAnonymous(story.storyId)}
                                    className="min-h-[28px] px-2.5 py-0.5 text-[11px] font-medium text-white bg-[#1B365D] rounded hover:bg-[#132744] disabled:opacity-60 whitespace-nowrap"
                                  >
                                    {isBusy ? 'En cours…' : 'Confirmer'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmClaimId(null)}
                                    className="min-h-[28px] px-2 py-0.5 text-[11px] font-medium text-stone-600 hover:text-stone-900"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setConfirmClaimId(story.storyId);
                                  }}
                                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Revendiquer cet écrit</span>
                                </button>
                              ))}
                          </div>

                          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 ml-auto">
                            <span className="text-xs text-stone-500 tabular-nums">
                              {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''} ·{' '}
                              {story.resonanceCount} rés. · {story.echoCount} comm.
                            </span>

                            {isConfirming ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleDelete(story.storyId)}
                                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 whitespace-nowrap"
                                >
                                  Confirmer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(story.storyId)}
                                className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Supprimer</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Tab 2: Bookmarks ("À lire plus tard") */}
          {subTab === 'bookmarks' && (
            <section aria-label="Histoires enregistrées à lire plus tard" className="space-y-4">
              {bookmarks.length > 1 && (
                <div className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-lg p-3.5">
                  <p className="text-xs text-stone-600 tabular-nums">
                    {filteredBookmarks.length} histoire{filteredBookmarks.length > 1 ? 's' : ''} enregistrée
                    {filteredBookmarks.length > 1 ? 's' : ''}
                  </p>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={bookmarkSearch}
                      onChange={(e) => setBookmarkSearch(e.target.value)}
                      placeholder="Rechercher dans mes favoris…"
                      aria-label="Rechercher dans mes favoris"
                      className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </div>
              )}

              {bookmarkActionError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3.5 py-2"
                >
                  {bookmarkActionError}
                </p>
              )}

              {bookmarks.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-2">
                  <Bookmark className="w-6 h-6 text-stone-400 mx-auto" />
                  <p className="font-display text-xl text-stone-900">
                    Aucune histoire enregistrée pour le moment
                  </p>
                  <p className="text-sm text-stone-600 max-w-md mx-auto">
                    Cliquez sur l’icône « Enregistrer » sur n’importe quelle histoire pour la retrouver ici et la lire à tête reposée.
                  </p>
                </div>
              ) : filteredBookmarks.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
                  <p className="font-display text-lg text-stone-900">
                    Aucun favori ne correspond à cette recherche
                  </p>
                  <button
                    type="button"
                    onClick={() => setBookmarkSearch('')}
                    className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Tout afficher
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
                  {filteredBookmarks.map((bm) => {
                    const salonInfo = THEME_MAP[bm.storyTheme];
                    const isBusy = busyBookmarkId === bm.storyId;
                    return (
                      <div key={bm.storyId} className="p-5 sm:p-6 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <StoryFormatKicker story={{ storyFormat: bm.storyFormat }} showDetails={false} />
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-stone-800">
                            {bm.customSalonName ||
                              (bm.storyScope === 'pelemele' && !bm.customSalonId
                                ? 'Hors salon · Pêle-mêle'
                                : salonInfo?.salonName)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Par {bm.storyAuthorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{bm.readingMinutes} min de lecture</span>
                          <span aria-hidden="true">·</span>
                          <span>Enregistré le {formatFrenchDate(bm.createdAt?.toDate() ?? null)}</span>
                        </div>

                        <h3 className="font-display text-xl font-medium text-stone-900">
                          {bm.storyTitle}
                        </h3>
                        <p className="text-sm text-stone-600 leading-relaxed line-clamp-2">
                          {bm.storyExcerpt}
                        </p>

                        <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenStoryById?.(bm.storyId)}
                            className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Lire maintenant</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRemoveBookmark(bm.storyId)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Retirer des favoris</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Tab 3: Favorite Highlighted Quotes ("Citations favorites") */}
          {subTab === 'quotes' && (
            <section aria-label="Collection de citations favorites" className="space-y-4">
              {quotes.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-lg p-3.5">
                  <p className="text-xs text-stone-600 tabular-nums">
                    {filteredQuotes.length} citation{filteredQuotes.length > 1 ? 's' : ''} favorite
                    {filteredQuotes.length > 1 ? 's' : ''}
                  </p>
                  {quotes.length > 1 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={quoteSearch}
                        onChange={(e) => setQuoteSearch(e.target.value)}
                        placeholder="Rechercher une citation, un titre…"
                        aria-label="Rechercher dans mes citations favorites"
                        className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>
                  )}
                </div>
              )}

              {quoteActionError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3.5 py-2"
                >
                  {quoteActionError}
                </p>
              )}

              {quotes.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-2">
                  <Highlighter className="w-6 h-6 text-amber-700/80 mx-auto" />
                  <p className="font-display text-xl text-stone-900">
                    Aucune citation favorite pour le moment
                  </p>
                  <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
                    Lors de la lecture d’un récit ou d’un roman, sélectionnez n’importe quel passage et cliquez sur « Surligner » pour le retrouver ici.
                  </p>
                </div>
              ) : filteredQuotes.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
                  <p className="font-display text-lg text-stone-900">
                    Aucune citation ne correspond à cette recherche
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuoteSearch('')}
                    className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Tout afficher
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
                  {filteredQuotes.map((quote) => {
                    const salonInfo = THEME_MAP[quote.storyTheme];
                    const isBusy = busyQuoteId === quote.quoteId;
                    const isCopied = copiedQuoteId === quote.quoteId;
                    const originLabel =
                      quote.customSalonName ||
                      (quote.storyScope === 'pelemele' && !quote.customSalonId
                        ? 'Hors salon · Pêle-mêle'
                        : salonInfo?.salonName || 'Salon');

                    return (
                      <article key={quote.quoteId} className="p-5 sm:p-6 space-y-3.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span className="font-medium text-stone-800">{originLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>Par {quote.storyAuthorName}</span>
                          {quote.storyFormat === 'roman' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                Chapitre {quote.chapterNumber}
                                {quote.chapterTitle ? ` · ${quote.chapterTitle}` : ''}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>
                            Enregistré le {formatFrenchDate(quote.createdAt?.toDate() ?? null)}
                          </span>
                        </div>

                        <blockquote className="bg-[#FBF9F5] border border-stone-200/90 rounded-md px-4 py-3.5">
                          <p className="font-display italic text-lg sm:text-xl leading-relaxed text-stone-900">
                            « {quote.quoteText} »
                          </p>
                        </blockquote>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <p className="text-xs text-stone-600">
                            Extrait de{' '}
                            <button
                              type="button"
                              onClick={() => onOpenStoryById?.(quote.storyId)}
                              className="font-medium text-stone-900 hover:text-[#1B365D] hover:underline text-left"
                            >
                              {quote.storyTitle}
                            </button>
                          </p>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenStoryById?.(quote.storyId)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>Lire le récit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleCopyQuote(quote)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              {isCopied ? (
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
                              disabled={isBusy}
                              onClick={() => void handleDeleteQuote(quote.quoteId)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Retirer</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Tab 4: Reposts ("Histoires repartagées") */}
          {subTab === 'reposts' && (
            <section aria-label="Vos histoires repartagées" className="space-y-4">
              {repostActionError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-md px-4 py-2.5 text-xs text-red-800"
                >
                  {repostActionError}
                </div>
              )}

              {reposts.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-lg p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Tous (${reposts.length})` },
                        {
                          id: 'public',
                          label: `Publics (${reposts.filter((r) => r.visibility !== 'private').length})`,
                        },
                        {
                          id: 'private',
                          label: `Privés (${reposts.filter((r) => r.visibility === 'private').length})`,
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRepostFilter(opt.id)}
                        className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          repostFilter === opt.id
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {reposts.length > 1 && (
                    <div className="relative w-full sm:w-60 shrink-0">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={repostSearch}
                        onChange={(e) => setRepostSearch(e.target.value)}
                        placeholder="Filtrer mes repartages…"
                        aria-label="Rechercher dans mes repartages"
                        className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>
                  )}
                </div>
              )}

              {reposts.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-2">
                  <Repeat2 className="w-6 h-6 text-stone-400 mx-auto" />
                  <p className="font-display text-xl text-stone-900">
                    Aucun repartage pour le moment
                  </p>
                  <p className="text-sm text-stone-600 max-w-md mx-auto">
                    Lorsque vous repartagez un récit, il s’affiche ici et sur votre mur en public ou en privé selon le réglage de votre profil.
                  </p>
                </div>
              ) : filteredReposts.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
                  <p className="font-display text-lg text-stone-900">
                    Aucun repartage ne correspond à ce filtre
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRepostFilter('all');
                      setRepostSearch('');
                    }}
                    className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                  >
                    Tout afficher
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
                  {filteredReposts.map((repost) => {
                    const salonInfo = THEME_MAP[repost.storyTheme];
                    const isPrivate = repost.visibility === 'private';
                    const isBusy = busyRepostId === repost.storyId;

                    return (
                      <div key={repost.repostId} className="p-5 sm:p-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-stone-800">
                              {repost.customSalonName ||
                                (repost.storyScope === 'pelemele' && !repost.customSalonId
                                  ? 'Hors salon · Pêle-mêle'
                                  : salonInfo?.salonName)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Par {repost.storyAuthorName}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {formatFrenchDate((repost.updatedAt || repost.createdAt)?.toDate() ?? null)}
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-medium ${
                              isPrivate
                                ? 'border-stone-300 bg-stone-100 text-stone-700'
                                : 'border-[#CBD6E6] bg-[#F3F6FA] text-[#1B365D]'
                            }`}
                          >
                            {isPrivate ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Privé · Compte seul</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3 h-3" />
                                <span>Public · Sur votre mur</span>
                              </>
                            )}
                          </span>
                        </div>

                        {repost.note && (
                          <p className="text-xs text-stone-700 italic bg-[#FBF9F5] border-l-2 border-[#1B365D] pl-3 py-1.5 rounded-r">
                            « {repost.note} »
                          </p>
                        )}

                        <h3 className="font-display text-xl font-medium text-stone-900">
                          {repost.storyTitle}
                        </h3>
                        <p className="text-sm text-stone-600 leading-relaxed line-clamp-2">
                          {repost.storyExcerpt}
                        </p>

                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenStoryById?.(repost.storyId)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Lire</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleToggleRepostVisibility(repost)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {isPrivate ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>Passer en public</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>Passer en privé</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteRepost(repost.storyId)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 ml-auto whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Retirer</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Tab 4: Reading Analytics & Summary KPIs */}
          {subTab === 'stats' && (
            <section aria-label="Statistiques de lecture" className="space-y-6">
              <div className="bg-white border border-stone-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-stone-200">
                <div className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">Récits écrits</p>
                  <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
                    {myStories.length}
                  </p>
                  <p className="text-xs text-stone-500 mt-1 tabular-nums">
                    {publicCount} publié{publicCount > 1 ? 's' : ''} · {draftCount} brouillon
                    {draftCount > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">Vues totales</p>
                  <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
                    {totalViewsReceived}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">Ouvertures de vos récits</p>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">Commentaires</p>
                  <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
                    {totalEchoesReceived}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">Échos reçus sous vos textes</p>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">Lecture cumulée</p>
                  <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
                    {formatCumulativeMinutes(totalReadingMinutes)}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">Temps de lecture total</p>
                </div>
              </div>

              <StoryAnalyticsChart
                authorId={user.uid}
                myStories={myStories}
                onReadStory={onReadStory}
              />
            </section>
          )}

          {/* Tab 5: Official Warnings, My Reports & Blocked / Not Interested Members */}
          {subTab === 'moderation' && (
            <section
              aria-label="Avertissements, signalements et membres masqués"
              className="space-y-6"
            >
              {moderationError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 rounded-md px-4 py-2.5 text-xs text-red-800"
                >
                  {moderationError}
                </div>
              )}

              {/* 1. Official Warnings Received */}
              <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-700" />
                    <h2 className="font-display text-xl font-medium text-stone-900">
                      Avertissements officiels reçus ({userWarnings.length})
                    </h2>
                  </div>
                  {unacknowledgedWarningsCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-900 text-[11px] font-medium tabular-nums">
                      {unacknowledgedWarningsCount} à confirmer
                    </span>
                  )}
                </div>

                {userWarnings.length === 0 ? (
                  <p className="text-sm text-stone-600">
                    Aucun avertissement officiel n’a été émis sur votre compte.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {userWarnings.map((warning) => {
                      const sev = WARNING_SEVERITY_LABELS[warning.severity];
                      const cat = MODERATION_CATEGORY_LABELS[warning.category];
                      const isBusy = busyWarningId === warning.warningId;
                      return (
                        <article
                          key={warning.warningId}
                          className={`p-4 sm:p-5 rounded-md border space-y-3 ${
                            warning.acknowledged
                              ? 'border-stone-200 bg-[#FBF9F5]'
                              : 'border-red-300 bg-red-50/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${sev.toneClass}`}
                              >
                                {sev.label}
                              </span>
                              <span className="font-medium text-stone-800">{cat.label}</span>
                            </div>
                            <span className="text-stone-500">
                              Émis le {formatFrenchDate(warning.createdAt?.toDate() ?? null)}
                            </span>
                          </div>

                          <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-line">
                            {warning.justification}
                          </p>

                          {warning.excerptSnapshot && (
                            <blockquote className="text-xs text-stone-600 italic bg-white border border-stone-200 rounded p-3 whitespace-pre-line">
                              Extrait retenu lors de l’étude de cas : « {warning.excerptSnapshot} »
                            </blockquote>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <span className="text-[11px] text-stone-500">
                              Étude de cas clôturée par {warning.issuedByName}
                            </span>

                            {warning.acknowledged ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Accusé de réception confirmé</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleAckWarning(warning.warningId)}
                                className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-red-800 rounded-md hover:bg-red-900 disabled:opacity-60 inline-flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isBusy ? 'Confirmation…' : 'Accuser réception'}</span>
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. My Submitted Moderation Reports */}
              <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-[#1B365D]" />
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Mes signalements transmis ({myModerationCases.length})
                  </h2>
                </div>

                {myModerationCases.length === 0 ? (
                  <p className="text-sm text-stone-600">
                    Vous n’avez soumis aucun signalement pour le moment.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 border border-stone-200 rounded-md">
                    {myModerationCases.map((c) => {
                      const statusMeta = MODERATION_STATUS_LABELS[c.status];
                      const catMeta = MODERATION_CATEGORY_LABELS[c.category];
                      const stepMeta =
                        MODERATION_REVIEW_STEPS.find((s) => s.id === c.reviewStep) ??
                        MODERATION_REVIEW_STEPS[0];
                      return (
                        <article key={c.caseId} className="p-4 sm:p-5 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-medium ${statusMeta.toneClass}`}
                              >
                                {statusMeta.label}
                              </span>
                              <span className="text-stone-700 font-medium">
                                {MODERATION_TARGET_LABELS[c.targetType]} · {c.targetUserName}
                              </span>
                            </div>
                            <span className="text-stone-500">
                              {formatFrenchDate(c.createdAt?.toDate() ?? null)}
                            </span>
                          </div>

                          <p className="text-xs text-stone-600">
                            <span className="font-medium text-stone-800">{catMeta.label}</span> · Étape actuelle :{' '}
                            <span className="text-[#1B365D] font-medium">{stepMeta.label}</span>
                          </p>

                          {c.targetExcerpt && (
                            <blockquote className="text-xs text-stone-600 italic bg-[#FBF9F5] border-l-2 border-stone-300 pl-3 py-1.5 line-clamp-3">
                              « {c.targetExcerpt} »
                            </blockquote>
                          )}

                          {c.decisionReason && (
                            <p className="text-xs text-stone-700 bg-[#F3F6FA] border border-[#CBD6E6] rounded px-3 py-2">
                              <span className="font-semibold text-[#1B365D]">Conclusion de l’étude de cas : </span>
                              {c.decisionReason}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Blocked & Not Interested Members */}
              <div className="bg-white border border-stone-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-stone-700" />
                  <h2 className="font-display text-xl font-medium text-stone-900">
                    Membres bloqués &amp; « Pas intéressé » ({relationships.length})
                  </h2>
                </div>

                {relationships.length === 0 ? (
                  <p className="text-sm text-stone-600">
                    Vous n’avez bloqué ni marqué « Pas intéressé » aucun membre.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 border border-stone-200 rounded-md">
                    {relationships.map((rel) => {
                      const isBlocked = rel.relation === 'blocked';
                      const isBusy = busyRelId === rel.targetUserId;
                      return (
                        <div
                          key={rel.targetUserId}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-stone-900">
                                {rel.targetName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                                  isBlocked
                                    ? 'border-red-200 bg-red-50 text-red-900'
                                    : 'border-stone-200 bg-stone-100 text-stone-700'
                                }`}
                              >
                                {isBlocked ? 'Bloqué' : 'Pas intéressé'}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500">
                              {isBlocked
                                ? 'Échanges privés verrouillés dans les deux sens et contenus masqués.'
                                : 'Ses récits et échanges sont mis à l’écart de vos fils principaux.'}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRestoreRelationship(rel.targetUserId)}
                            className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isBlocked ? 'Débloquer' : 'Rétablir'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
