import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  BookOpen,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Lock,
  LogOut,
  Plus,
  Repeat2,
  Search,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteStory,
  deleteStoryRepost,
  removeStoryBookmark,
  updateRepostVisibility,
  updateStory,
} from '../lib/storyService';
import {
  formatCumulativeMinutes,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Exchange,
  Story,
  StoryBookmark,
  StoryRepost,
} from '../types/story';
import { StoryAnalyticsChart } from './StoryAnalyticsChart';

interface JournalViewProps {
  myStories: Story[];
  existingExchanges: Exchange[];
  bookmarks?: StoryBookmark[];
  reposts?: StoryRepost[];
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onEditStory: (story: Story) => void;
  onNewStory: () => void;
  onOpenExchange: (exchangeId: string) => void;
  onOpenMyProfile?: () => void;
}

type JournalSubTab = 'stories' | 'bookmarks' | 'reposts' | 'stats';
type StoryFilter = 'all' | 'public' | 'private' | 'roman';
type RepostFilter = 'all' | 'public' | 'private';

export function JournalView({
  myStories,
  bookmarks = [],
  reposts = [],
  onReadStory,
  onOpenStoryById,
  onEditStory,
  onNewStory,
  onOpenMyProfile,
}: JournalViewProps) {
  const { user, profile, signInWithGoogle, logOut } = useAuth();
  const [subTab, setSubTab] = useState<JournalSubTab>('stories');
  const [storyFilter, setStoryFilter] = useState<StoryFilter>('all');
  const [storySearch, setStorySearch] = useState('');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [repostFilter, setRepostFilter] = useState<RepostFilter>('all');
  const [repostSearch, setRepostSearch] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null);
  const [storyActionError, setStoryActionError] = useState<string | null>(null);
  const [busyBookmarkId, setBusyBookmarkId] = useState<string | null>(null);
  const [bookmarkActionError, setBookmarkActionError] = useState<string | null>(null);
  const [busyRepostId, setBusyRepostId] = useState<string | null>(null);
  const [repostActionError, setRepostActionError] = useState<string | null>(null);

  const publicCount = useMemo(
    () => myStories.filter((s) => s.visibility === 'public').length,
    [myStories]
  );
  const draftCount = useMemo(
    () => myStories.filter((s) => s.visibility === 'private').length,
    [myStories]
  );
  const romanCount = useMemo(
    () => myStories.filter((s) => s.storyFormat === 'roman').length,
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
    return myStories.filter((story) => {
      if (storyFilter === 'public' && story.visibility !== 'public') return false;
      if (storyFilter === 'private' && story.visibility !== 'private') return false;
      if (storyFilter === 'roman' && story.storyFormat !== 'roman') return false;
      if (!q) return true;
      const salonLabel = (
        story.customSalonName ||
        (story.storyScope === 'pelemele'
          ? 'Hors salon Pêle-mêle'
          : THEME_MAP[story.theme]?.salonName || '')
      ).toLowerCase();
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        salonLabel.includes(q)
      );
    });
  }, [myStories, storyFilter, storySearch]);

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
      await updateStory(story.storyId, profile?.displayName || story.authorName, {
        title: story.title,
        excerpt: story.excerpt,
        content: story.content,
        theme: story.theme,
        storyScope: story.storyScope,
        customSalon:
          story.customSalonId && story.customSalonName && story.customSalonVisibility
            ? {
                salonId: story.customSalonId,
                name: story.customSalonName,
                visibility: story.customSalonVisibility,
              }
            : null,
        storyFormat: story.storyFormat,
        releaseCadence: story.releaseCadence,
        seriesStatus: story.seriesStatus,
        promptQuestion: story.promptQuestion,
        visibility: nextVis,
        isAnonymous: Boolean(story.isAnonymous),
      });
    } catch (err) {
      setStoryActionError(
        err instanceof Error ? err.message : 'Impossible de modifier la visibilité de ce récit.'
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
      id: 'reposts',
      label: 'Repartages',
      shortLabel: 'Repartages',
      count: reposts.length,
      icon: Repeat2,
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
                        { id: 'public', label: `Publiés (${publicCount})` },
                        { id: 'private', label: `Brouillons (${draftCount})` },
                        ...(romanCount > 0
                          ? [{ id: 'roman' as const, label: `Romans (${romanCount})` }]
                          : []),
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStoryFilter(opt.id)}
                        className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          storyFilter === opt.id
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {myStories.length > 1 && (
                    <div className="relative w-full sm:w-60 shrink-0">
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
                    const isBusy = busyStoryId === story.storyId;
                    const formatLabel =
                      STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label ?? 'Confession';
                    const isDraft = story.visibility === 'private';

                    return (
                      <article key={story.storyId} className="p-5 sm:p-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-stone-800">
                              {story.customSalonName
                                ? story.customSalonName
                                : story.storyScope === 'pelemele'
                                  ? 'Hors salon · Pêle-mêle'
                                  : THEME_MAP[story.theme]?.salonName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatLabel}</span>
                            {story.storyFormat === 'roman' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {story.chapterCount ?? 1} chap. ·{' '}
                                  {RELEASE_CADENCE_LABELS[story.releaseCadence ?? 'hebdomadaire']}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                          </div>

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
                        </div>

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

                            <button
                              type="button"
                              onClick={() => onEditStory(story)}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Modifier</span>
                            </button>

                            {story.customSalonVisibility !== 'private' && (
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
                          <span className="font-medium text-stone-800">
                            {bm.customSalonName ||
                              (bm.storyScope === 'pelemele' && !bm.customSalonId
                                ? 'Hors salon · Pêle-mêle'
                                : salonInfo?.salonName)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{STORY_FORMAT_LABELS[bm.storyFormat ?? 'confession']?.label}</span>
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

          {/* Tab 3: Reposts ("Histoires repartagées") */}
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
        </div>
      </div>
    </div>
  );
}
