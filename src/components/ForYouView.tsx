import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Eye,
  Feather,
  Heart,
  MessageCircle,
  Repeat2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { evaluateStorySearch } from '../lib/storyFilter';
import {
  formatFriendlyFirestoreError,
  removeFavoriteAuthor,
  toggleFavoriteAuthor,
  updateUserFavoriteThemes,
} from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import {
  CustomSalon,
  PublicProfile,
  Story,
  StoryFormat,
  StoryThemeId,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import { NovelCoverArt } from './NovelCoverArt';
import { SalonEmblem } from './SalonEmblem';

interface ForYouViewProps {
  stories: Story[];
  storiesLoaded: boolean;
  customSalons: CustomSalon[];
  discoverableProfiles: PublicProfile[];
  hiddenUserIds: Set<string>;
  bookmarkedStoryIds: Set<string>;
  repostedStoryIds: Set<string>;
  onToggleBookmark: (story: Story) => void;
  onOpenRepost: (story: Story) => void;
  onReadStory: (story: Story) => void;
  onEnterSalon: (salonId: StoryThemeId) => void;
  onEnterCustomSalon: (customSalonId: string) => void;
  onOpenPeleMele: () => void;
  onOpenMemberWall: (userId: string) => void;
  onOpenDirectory: () => void;
  onWriteStory: () => void;
  onShowNotice: (message: string) => void;
}

type ForYouFocus = 'all' | 'authors' | 'themes';
type ForYouSort = 'personalized' | 'recent' | 'resonances' | 'views';

interface PersonalizedEntry {
  story: Story;
  matchedAuthor: boolean;
  matchedTheme: boolean;
  score: number;
  searchScore: number;
}

function getStoryTimestampMs(story: Story): number {
  return (story.updatedAt || story.createdAt)?.toMillis() ?? 0;
}

export function ForYouView({
  stories,
  storiesLoaded,
  customSalons,
  discoverableProfiles,
  hiddenUserIds,
  bookmarkedStoryIds,
  repostedStoryIds,
  onToggleBookmark,
  onOpenRepost,
  onReadStory,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenPeleMele,
  onOpenMemberWall,
  onOpenDirectory,
  onWriteStory,
  onShowNotice,
}: ForYouViewProps) {
  const { user, favoriteThemes, favoriteAuthors, privateInfoLoaded, signInWithGoogle } =
    useAuth();

  const hasPreferences = favoriteThemes.length > 0 || favoriteAuthors.length > 0;
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [focus, setFocus] = useState<ForYouFocus>('all');
  const [sortMode, setSortMode] = useState<ForYouSort>('personalized');
  const [formatFilter, setFormatFilter] = useState<'all' | StoryFormat>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorPickerSearch, setAuthorPickerSearch] = useState('');
  const [busyThemeId, setBusyThemeId] = useState<StoryThemeId | null>(null);
  const [busyAuthorId, setBusyAuthorId] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(searchQuery);

  const favoriteThemeSet = useMemo(() => new Set<StoryThemeId>(favoriteThemes), [favoriteThemes]);
  const favoriteAuthorIds = useMemo(
    () => new Set<string>(favoriteAuthors.map((a) => a.authorId)),
    [favoriteAuthors]
  );

  // Automatic open if user is signed in and hasn't configured any favorites yet
  const showPrefsPanel = Boolean(
    user && (prefsOpen || (privateInfoLoaded && !hasPreferences))
  );

  const availableAuthorsToPick = useMemo(() => {
    const q = authorPickerSearch.trim().toLowerCase();
    return discoverableProfiles.filter((p) => {
      if (user && p.userId === user.uid) return false;
      if (hiddenUserIds.has(p.userId)) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        (p.bio || '').toLowerCase().includes(q) ||
        (p.interests || '').toLowerCase().includes(q)
      );
    });
  }, [discoverableProfiles, user, hiddenUserIds, authorPickerSearch]);

  const { allMatches, authorMatchCount, themeMatchCount, displayedEntries } = useMemo(() => {
    if (!user || !hasPreferences) {
      return {
        allMatches: [] as PersonalizedEntry[],
        authorMatchCount: 0,
        themeMatchCount: 0,
        displayedEntries: [] as PersonalizedEntry[],
      };
    }

    const baseMatches: PersonalizedEntry[] = [];
    let authorMatches = 0;
    let themeMatches = 0;

    for (const story of stories) {
      // Never match anonymous stories by authorId so anonymous authorship stays strictly private
      const matchedAuthor =
        !story.isAnonymous && favoriteAuthorIds.has(story.authorId);
      const matchedTheme = favoriteThemeSet.has(story.theme);

      if (!matchedAuthor && !matchedTheme) continue;

      if (matchedAuthor) authorMatches += 1;
      if (matchedTheme) themeMatches += 1;

      const baseScore =
        (matchedAuthor ? 220 : 0) +
        (matchedTheme ? 110 : 0) +
        Math.min(40, (story.resonanceCount ?? 0) * 2) +
        Math.min(20, Math.floor((story.viewCount ?? 0) / 3));

      baseMatches.push({
        story,
        matchedAuthor,
        matchedTheme,
        score: baseScore,
        searchScore: 0,
      });
    }

    const trimmedQuery = deferredSearch.trim();
    const filtered = baseMatches.filter((entry) => {
      if (focus === 'authors' && !entry.matchedAuthor) return false;
      if (focus === 'themes' && !entry.matchedTheme) return false;
      const fmt: StoryFormat = entry.story.storyFormat ?? 'confession';
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;

      if (trimmedQuery.length > 0) {
        const res = evaluateStorySearch(entry.story, trimmedQuery, 'all');
        if (!res.matched) return false;
        entry.searchScore = res.score;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (trimmedQuery.length > 0 && sortMode === 'personalized') {
        const scoreDiff =
          b.score + b.searchScore * 8 - (a.score + a.searchScore * 8);
        if (scoreDiff !== 0) return scoreDiff;
      }
      if (sortMode === 'recent') {
        return getStoryTimestampMs(b.story) - getStoryTimestampMs(a.story);
      }
      if (sortMode === 'resonances') {
        return (
          (b.story.resonanceCount ?? 0) - (a.story.resonanceCount ?? 0) ||
          getStoryTimestampMs(b.story) - getStoryTimestampMs(a.story)
        );
      }
      if (sortMode === 'views') {
        return (
          (b.story.viewCount ?? 0) - (a.story.viewCount ?? 0) ||
          getStoryTimestampMs(b.story) - getStoryTimestampMs(a.story)
        );
      }
      return (
        b.score - a.score ||
        getStoryTimestampMs(b.story) - getStoryTimestampMs(a.story)
      );
    });

    return {
      allMatches: baseMatches,
      authorMatchCount: authorMatches,
      themeMatchCount: themeMatches,
      displayedEntries: sorted,
    };
  }, [
    user,
    hasPreferences,
    stories,
    favoriteAuthorIds,
    favoriteThemeSet,
    focus,
    formatFilter,
    deferredSearch,
    sortMode,
  ]);

  const handleToggleTheme = async (themeId: StoryThemeId) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (busyThemeId) return;
    setPrefError(null);
    setBusyThemeId(themeId);
    try {
      const nextThemes = favoriteThemeSet.has(themeId)
        ? favoriteThemes.filter((id) => id !== themeId)
        : [...favoriteThemes, themeId];
      await updateUserFavoriteThemes(user.uid, nextThemes);
    } catch (err) {
      setPrefError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de mettre à jour vos thèmes favoris pour le moment.'
        )
      );
    } finally {
      setBusyThemeId(null);
    }
  };

  const handleToggleAuthor = async (authorId: string, authorName: string) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (user.uid === authorId || busyAuthorId) return;
    setPrefError(null);
    setBusyAuthorId(authorId);
    try {
      const added = await toggleFavoriteAuthor(user.uid, authorId, authorName);
      onShowNotice(
        added
          ? `${authorName} ajouté à vos auteurs favoris.`
          : `${authorName} retiré de vos auteurs favoris.`
      );
    } catch (err) {
      setPrefError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de modifier cet auteur favori pour le moment.'
        )
      );
    } finally {
      setBusyAuthorId(null);
    }
  };

  const handleRemoveAuthor = async (authorId: string, authorName: string) => {
    if (!user || busyAuthorId) return;
    setPrefError(null);
    setBusyAuthorId(authorId);
    try {
      await removeFavoriteAuthor(user.uid, authorId);
      onShowNotice(`${authorName} retiré de vos auteurs favoris.`);
    } catch (err) {
      setPrefError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de retirer cet auteur favori pour le moment.'
        )
      );
    } finally {
      setBusyAuthorId(null);
    }
  };

  if (!user) {
    return (
      <section className="space-y-8" aria-label="Flux personnalisé Pour vous">
        <div className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <p className="text-xs uppercase tracking-widest text-[#1B365D] inline-flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Espace personnalisé · Pour vous</span>
            </p>
            <h2
              className="font-display text-2xl sm:text-4xl font-medium text-stone-900 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Un cahier composé selon vos thèmes et vos auteurs favoris.
            </h2>
            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
              Connectez-vous pour choisir vos salons favoris et suivre les plumes que vous appréciez. Votre onglet « Pour vous » réunira automatiquement leurs prochains récits et chapitres.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors whitespace-nowrap"
              >
                Se connecter avec Google
              </button>
              <button
                type="button"
                onClick={onOpenPeleMele}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 transition-colors whitespace-nowrap"
              >
                Parcourir Histoires pêle-mêle
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#FBF9F5] border border-stone-200 rounded-lg p-5 space-y-3">
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Six thèmes disponibles
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STORY_THEMES.map((theme) => (
                <div
                  key={theme.id}
                  style={{ borderColor: theme.palette.borderTint }}
                  className="bg-white border rounded-md px-3 py-2 flex items-center gap-2 text-xs text-stone-800"
                >
                  <SalonEmblem
                    type={theme.emblem}
                    color={theme.palette.textAccent}
                    className="w-4 h-4 shrink-0"
                  />
                  <span className="truncate font-medium">{theme.shortSalonName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-8" aria-label="Flux personnalisé Pour vous">
      {/* Header & Preferences Summary Bar */}
      <div className="bg-white border border-stone-200 rounded-lg p-6 sm:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs uppercase tracking-widest text-[#1B365D] inline-flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sélection personnalisée · Pour vous</span>
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-stone-900">
              Vos récits sur mesure
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              {hasPreferences
                ? `Flux composé à partir de ${favoriteThemes.length} thème${
                    favoriteThemes.length > 1 ? 's' : ''
                  } favori${favoriteThemes.length > 1 ? 's' : ''} et ${
                    favoriteAuthors.length
                  } auteur${favoriteAuthors.length > 1 ? 's' : ''} suivi${
                    favoriteAuthors.length > 1 ? 's' : ''
                  }.`
                : 'Sélectionnez ci-dessous vos salons favoris et vos auteurs préférés pour composer votre flux de lecture.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              aria-expanded={showPrefsPanel}
              onClick={() => setPrefsOpen((prev) => !prev)}
              className={`min-h-[40px] px-4 py-2 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                showPrefsPanel
                  ? 'bg-[#1B365D] text-white border-[#1B365D]'
                  : 'bg-[#FBF9F5] text-stone-800 border-stone-300 hover:border-[#1B365D] hover:text-[#1B365D]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                {showPrefsPanel
                  ? 'Masquer mes préférences'
                  : 'Personnaliser thèmes & auteurs'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenDirectory}
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Explorer les profils</span>
            </button>
          </div>
        </div>

        {/* Active preferences summary strip when collapsed */}
        {hasPreferences && !showPrefsPanel && (
          <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600">
            {favoriteThemes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-stone-500 font-medium">Thèmes :</span>
                {favoriteThemes.map((tId) => {
                  const info = THEME_MAP[tId];
                  if (!info) return null;
                  return (
                    <button
                      key={tId}
                      type="button"
                      onClick={() => onEnterSalon(tId)}
                      style={{
                        backgroundColor: info.palette.softBg,
                        borderColor: info.palette.borderTint,
                        color: info.palette.textAccent,
                      }}
                      className="px-2 py-0.5 rounded border text-[11px] font-medium hover:brightness-95 transition"
                    >
                      {info.shortSalonName}
                    </button>
                  );
                })}
              </div>
            )}

            {favoriteAuthors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-stone-500 font-medium">Auteurs :</span>
                {favoriteAuthors.slice(0, 5).map((fav) => (
                  <button
                    key={fav.authorId}
                    type="button"
                    onClick={() => onOpenMemberWall(fav.authorId)}
                    className="px-2 py-0.5 rounded border border-stone-200 bg-[#FBF9F5] text-stone-800 text-[11px] font-medium hover:border-[#1B365D] hover:text-[#1B365D] transition"
                  >
                    {fav.authorName}
                  </button>
                ))}
                {favoriteAuthors.length > 5 && (
                  <span className="text-[11px] text-stone-500 tabular-nums">
                    +{favoriteAuthors.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Preferences Editor (Themes + Authors) */}
        {showPrefsPanel && (
          <div className="pt-5 border-t border-stone-200 space-y-6">
            {prefError && (
              <p
                role="alert"
                className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5"
              >
                {prefError}
              </p>
            )}

            {/* 1. Favorite Themes Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    1. Vos thèmes &amp; salons favoris
                  </h3>
                  <p className="text-xs text-stone-500">
                    Cliquez sur les salons dont vous souhaitez suivre les nouveaux récits.
                  </p>
                </div>
                <span className="text-xs text-stone-500 tabular-nums shrink-0">
                  {favoriteThemes.length}/{STORY_THEMES.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {STORY_THEMES.map((salon) => {
                  const selected = favoriteThemeSet.has(salon.id);
                  const isBusy = busyThemeId === salon.id;
                  return (
                    <button
                      key={salon.id}
                      type="button"
                      disabled={isBusy}
                      aria-pressed={selected}
                      onClick={() => void handleToggleTheme(salon.id)}
                      style={
                        selected
                          ? {
                              backgroundColor: salon.palette.softBg,
                              borderColor: salon.palette.swatch,
                            }
                          : undefined
                      }
                      className={`text-left p-3.5 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                        selected
                          ? 'shadow-xs'
                          : 'bg-[#FBF9F5] border-stone-200 hover:border-stone-400'
                      } disabled:opacity-60`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <SalonEmblem
                          type={salon.emblem}
                          color={salon.palette.textAccent}
                          className="w-5 h-5 shrink-0 mt-0.5"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">
                            {salon.romanIndex} · {salon.shortSalonName}
                          </p>
                          <p className="text-xs text-stone-500 line-clamp-1">
                            {salon.atmosphere}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                          selected
                            ? 'bg-[#1B365D] border-[#1B365D] text-white'
                            : 'bg-white border-stone-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Favorite Authors Manager */}
            <div className="pt-4 border-t border-stone-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    2. Vos auteurs favoris
                  </h3>
                  <p className="text-xs text-stone-500">
                    Suivez des plumes pour retrouver leurs confessions et chapitres publiés sous leur nom (les textes publiés anonymement restent anonymes).
                  </p>
                </div>
                <span className="text-xs text-stone-500 tabular-nums shrink-0">
                  {favoriteAuthors.length} suivi{favoriteAuthors.length > 1 ? 's' : ''}
                </span>
              </div>

              {favoriteAuthors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {favoriteAuthors.map((fav) => (
                    <div
                      key={fav.authorId}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md border border-[#1B365D]/30 bg-[#F3F6FA] text-xs text-[#1B365D]"
                    >
                      <Star className="w-3.5 h-3.5 fill-current shrink-0" />
                      <button
                        type="button"
                        onClick={() => onOpenMemberWall(fav.authorId)}
                        className="font-medium hover:underline"
                      >
                        {fav.authorName}
                      </button>
                      <button
                        type="button"
                        disabled={busyAuthorId === fav.authorId}
                        onClick={() => void handleRemoveAuthor(fav.authorId, fav.authorName)}
                        aria-label={`Retirer ${fav.authorName} des auteurs favoris`}
                        className="p-0.5 rounded hover:bg-[#1B365D]/15 text-[#1B365D] disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick pick among discoverable community authors */}
              <div className="bg-[#FBF9F5] border border-stone-200 rounded-lg p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-stone-700">
                    Ajouter ou gérer un auteur de la communauté :
                  </span>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={authorPickerSearch}
                      onChange={(e) => setAuthorPickerSearch(e.target.value)}
                      placeholder="Chercher un membre…"
                      aria-label="Chercher un auteur à suivre"
                      className="w-full min-h-[34px] pl-8 pr-2.5 py-1 bg-white border border-stone-200 rounded text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </div>

                {availableAuthorsToPick.length === 0 ? (
                  <p className="text-xs text-stone-500">
                    {authorPickerSearch.trim()
                      ? 'Aucun membre public ne correspond à cette recherche.'
                      : 'Aucun autre profil public disponible pour le moment.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                    {availableAuthorsToPick.slice(0, 18).map((member) => {
                      const isFav = favoriteAuthorIds.has(member.userId);
                      const isBusy = busyAuthorId === member.userId;
                      return (
                        <div
                          key={member.userId}
                          className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border text-xs ${
                            isFav
                              ? 'bg-white border-[#1B365D]/40'
                              : 'bg-white border-stone-200'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(member.userId)}
                            className="min-w-0 flex-1 text-left truncate font-medium text-stone-800 hover:text-[#1B365D] hover:underline"
                          >
                            {member.displayName}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleToggleAuthor(member.userId, member.displayName)
                            }
                            aria-pressed={isFav}
                            className={`min-h-[28px] px-2 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1 shrink-0 transition-colors ${
                              isFav
                                ? 'bg-[#1B365D] text-white hover:bg-[#132744]'
                                : 'bg-[#FBF9F5] text-stone-700 border border-stone-200 hover:border-[#1B365D] hover:text-[#1B365D]'
                            } disabled:opacity-50`}
                          >
                            {isFav ? (
                              <>
                                <UserCheck className="w-3 h-3" />
                                <span>Suivi</span>
                              </>
                            ) : (
                              <>
                                <Star className="w-3 h-3" />
                                <span>Suivre</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Personalized Feed Content */}
      {!storiesLoaded ? (
        <div className="py-12 text-center text-sm text-stone-500">
          Composition de votre flux personnalisé…
        </div>
      ) : !hasPreferences ? (
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-4">
          <Sparkles className="w-7 h-7 text-[#1B365D] mx-auto" />
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="font-display text-2xl font-medium text-stone-900">
              Votre flux attend vos premiers choix
            </h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              Cochez au moins un thème ci-dessus ou suivez un auteur de la communauté pour voir apparaître ici les récits qui vous ressemblent.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenPeleMele}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500"
            >
              Découvrir Histoires pêle-mêle
            </button>
            <button
              type="button"
              onClick={onWriteStory}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5"
            >
              <Feather className="w-3.5 h-3.5" />
              <span>Écrire un récit</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Feed Focus + Search + Format + Sort Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-stone-200">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par source favorite">
              {(
                [
                  { id: 'all', label: `Tout (${allMatches.length})` },
                  { id: 'authors', label: `Auteurs favoris (${authorMatchCount})` },
                  { id: 'themes', label: `Thèmes favoris (${themeMatchCount})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFocus(item.id)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                    focus === item.id
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer ce flux…"
                  aria-label="Filtrer le flux Pour vous"
                  className="w-full min-h-[36px] pl-8 pr-3 py-1 bg-white border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              <select
                aria-label="Format des récits"
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value as 'all' | StoryFormat)}
                className="min-h-[36px] px-2.5 py-1 bg-white border border-stone-200 rounded-md text-xs font-medium text-stone-800 focus:outline-none focus:border-[#1B365D]"
              >
                <option value="all">Tous formats</option>
                <option value="confession">Confessions</option>
                <option value="roman">Romans</option>
              </select>

              <select
                aria-label="Trier le flux Pour vous"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as ForYouSort)}
                className="min-h-[36px] px-2.5 py-1 bg-white border border-stone-200 rounded-md text-xs font-medium text-stone-800 focus:outline-none focus:border-[#1B365D]"
              >
                <option value="personalized">Pertinence pour vous</option>
                <option value="recent">Plus récents</option>
                <option value="resonances">Plus de résonances</option>
                <option value="views">Plus vus</option>
              </select>
            </div>
          </div>

          {displayedEntries.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-3">
              <p className="font-display text-xl text-stone-900">
                Aucun récit ne correspond encore à cette sélection
              </p>
              <p className="text-sm text-stone-600 max-w-lg mx-auto">
                {focus === 'authors' && favoriteAuthors.length === 0
                  ? 'Vous n’avez pas encore ajouté d’auteur favori. Ajoutez des auteurs depuis la configuration ci-dessus ou depuis leurs profils.'
                  : focus === 'themes' && favoriteThemes.length === 0
                    ? 'Vous n’avez pas encore coché de thème favori.'
                    : 'Essayez d’élargir vos filtres, d’ajouter d’autres thèmes favoris ou d’explorer Histoires pêle-mêle.'}
              </p>
              {(focus !== 'all' || formatFilter !== 'all' || searchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setFocus('all');
                    setFormatFilter('all');
                    setSearchQuery('');
                  }}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {displayedEntries.map(({ story, matchedAuthor, matchedTheme }) => {
                const salonInfo = THEME_MAP[story.theme];
                const customSalonMatch = story.customSalonId
                  ? customSalons.find((cs) => cs.salonId === story.customSalonId)
                  : undefined;
                const isHorsSalon = story.storyScope === 'pelemele' && !story.customSalonId;
                const originPalette = isHorsSalon
                  ? undefined
                  : customSalonMatch
                    ? ACCENT_TONE_PALETTES[customSalonMatch.accentTone]
                    : salonInfo?.palette;
                const originLabel =
                  story.customSalonName ||
                  (isHorsSalon ? 'Hors salon · Pêle-mêle' : salonInfo?.salonName || 'Salon');
                const format = story.storyFormat ?? 'confession';
                const isAuthorSelf = Boolean(user && story.authorId === user.uid);
                const isFavAuthor = !story.isAnonymous && favoriteAuthorIds.has(story.authorId);

                const reasonText =
                  matchedAuthor && matchedTheme
                    ? `Auteur favori · Thème « ${salonInfo?.shortSalonName || story.theme} »`
                    : matchedAuthor
                      ? `Auteur favori : ${story.authorName}`
                      : `Thème favori : ${salonInfo?.shortSalonName || story.theme}`;

                return (
                  <article
                    key={story.storyId}
                    className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                  >
                    <div className="space-y-3">
                      {/* Reason banner */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100">
                        <span className="text-[11px] font-medium text-[#1B365D] inline-flex items-center gap-1.5 truncate">
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span className="truncate">{reasonText}</span>
                        </span>

                        {!story.isAnonymous && !isAuthorSelf && (
                          <button
                            type="button"
                            disabled={busyAuthorId === story.authorId}
                            onClick={() =>
                              void handleToggleAuthor(story.authorId, story.authorName)
                            }
                            title={
                              isFavAuthor
                                ? 'Retirer des auteurs favoris'
                                : 'Ajouter aux auteurs favoris'
                            }
                            className={`text-[11px] font-medium inline-flex items-center gap-1 shrink-0 transition-colors ${
                              isFavAuthor
                                ? 'text-[#1B365D] hover:text-stone-700'
                                : 'text-stone-500 hover:text-[#1B365D]'
                            }`}
                          >
                            <Star
                              className={`w-3 h-3 ${isFavAuthor ? 'fill-current' : ''}`}
                            />
                            <span>{isFavAuthor ? 'Auteur suivi' : 'Suivre'}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <button
                          type="button"
                          onClick={() =>
                            story.customSalonId
                              ? onEnterCustomSalon(story.customSalonId)
                              : isHorsSalon
                                ? onOpenPeleMele()
                                : onEnterSalon(story.theme)
                          }
                          style={{
                            backgroundColor: originPalette?.softBg ?? '#F5F5F4',
                            borderColor: originPalette?.borderTint ?? '#E7E5E4',
                            color: originPalette?.textAccent ?? '#1B365D',
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium hover:brightness-95 transition cursor-pointer"
                        >
                          <span>{originLabel}</span>
                          <ArrowUpRight className="w-3 h-3 shrink-0 opacity-80" />
                        </button>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-stone-700">
                          {STORY_FORMAT_LABELS[format].label}
                          {format === 'roman' && story.novelGenre
                            ? ` · ${NOVEL_GENRE_LABELS[story.novelGenre]}`
                            : ''}
                          {format === 'roman'
                            ? ` · ${story.chapterCount ?? 1} ch. · ${
                                SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']
                              }`
                            : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        {story.isAnonymous ? (
                          <span className="text-stone-600">Auteur anonyme</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(story.authorId)}
                            className="hover:underline hover:text-stone-900"
                          >
                            {story.authorName}
                          </button>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{story.readingMinutes} min</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                        <MatureContentBadge
                          minAge={story.minAge}
                          isMature={story.isMature}
                          compact
                        />
                      </div>

                      {format === 'roman' && story.coverUrl ? (
                        <div className="flex items-start gap-4">
                          <NovelCoverArt
                            coverUrl={story.coverUrl}
                            title={story.title}
                            genre={story.novelGenre}
                            accentColor={originPalette?.textAccent ?? '#1B365D'}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                              {story.title}
                            </h3>
                            <p className="text-sm text-stone-600 leading-relaxed">
                              {story.excerpt}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                            {story.title}
                          </h3>
                          <p className="text-sm text-stone-600 leading-relaxed">
                            {story.excerpt}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3.5 text-xs text-stone-500 tabular-nums">
                        <span className="inline-flex items-center gap-1" title="Vues">
                          <Eye className="w-3.5 h-3.5" />
                          {story.viewCount ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1" title="Résonances">
                          <Heart className="w-3.5 h-3.5" />
                          {story.resonanceCount}
                        </span>
                        <span className="inline-flex items-center gap-1" title="Commentaires">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {story.echoCount}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleBookmark(story)}
                          title={
                            bookmarkedStoryIds.has(story.storyId)
                              ? 'Retirer des favoris'
                              : 'Enregistrer pour lire plus tard'
                          }
                          aria-label="Enregistrer pour lire plus tard"
                          className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                            bookmarkedStoryIds.has(story.storyId)
                              ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                              : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
                          }`}
                        >
                          <Bookmark
                            className={`w-3.5 h-3.5 ${
                              bookmarkedStoryIds.has(story.storyId) ? 'fill-current' : ''
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenRepost(story)}
                          title={
                            repostedStoryIds.has(story.storyId)
                              ? 'Repartagé — Modifier'
                              : 'Repartager sur mon compte'
                          }
                          aria-label="Repartager"
                          className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                            repostedStoryIds.has(story.storyId)
                              ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                              : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
                          }`}
                        >
                          <Repeat2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onReadStory(story)}
                          className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <span>Lire et commenter</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
