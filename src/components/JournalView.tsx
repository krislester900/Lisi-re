import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Camera,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  LayoutGrid,
  Lock,
  LogOut,
  Music2,
  Plus,
  Repeat2,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { compressAvatarForProfile } from '../lib/storageService';
import {
  deleteStory,
  deleteStoryRepost,
  removeStoryBookmark,
  syncUserRepostsVisibility,
  updatePublicProfile,
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
  FIELD_LIMITS,
  Story,
  StoryBookmark,
  StoryRepost,
} from '../types/story';
import { MusicCatalogPicker } from './MusicCatalogPicker';
import { ProfileWallView } from './ProfileWallView';
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
}

type JournalSubTab = 'wall' | 'stories' | 'bookmarks' | 'reposts' | 'profile';

export function JournalView({
  myStories,
  existingExchanges,
  bookmarks = [],
  reposts = [],
  onReadStory,
  onOpenStoryById,
  onEditStory,
  onNewStory,
  onOpenExchange,
}: JournalViewProps) {
  const { user, profile, signInWithGoogle, logOut } = useAuth();
  const [subTab, setSubTab] = useState<JournalSubTab>('wall');

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [bio, setBio] = useState('');
  const [listeningNote, setListeningNote] = useState('');
  const [favoriteTrackTitle, setFavoriteTrackTitle] = useState('');
  const [favoriteTrackArtist, setFavoriteTrackArtist] = useState('');
  const [favoriteTrackUrl, setFavoriteTrackUrl] = useState('');
  const [showMusicSearch, setShowMusicSearch] = useState(false);
  const [favoriteNovel, setFavoriteNovel] = useState('');
  const [interests, setInterests] = useState('');
  const [discoverable, setDiscoverable] = useState(true);
  const [syncRepostsOnSave, setSyncRepostsOnSave] = useState(true);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null);
  const [busyBookmarkId, setBusyBookmarkId] = useState<string | null>(null);
  const [busyRepostId, setBusyRepostId] = useState<string | null>(null);
  const [repostActionError, setRepostActionError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarPreviewFailed(false);
    if (profile) {
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl ?? '');
      setBio(profile.bio);
      setListeningNote(profile.listeningNote);
      setFavoriteTrackTitle(profile.favoriteTrackTitle ?? '');
      setFavoriteTrackArtist(profile.favoriteTrackArtist ?? '');
      setFavoriteTrackUrl(profile.favoriteTrackUrl ?? '');
      setFavoriteNovel(profile.favoriteNovel ?? '');
      setInterests(profile.interests ?? '');
      setDiscoverable(profile.discoverable !== false);
    } else if (user) {
      setDisplayName(user.displayName || 'Auteur');
      setAvatarUrl(user.photoURL ?? '');
      setBio('');
      setListeningNote('');
      setFavoriteTrackTitle('');
      setFavoriteTrackArtist('');
      setFavoriteTrackUrl('');
      setFavoriteNovel('');
      setInterests('');
      setDiscoverable(true);
    }
  }, [profile, user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Mon carnet · Mur & écrits
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Votre mur personnel, vos romans et vos brouillons privés
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Connectez-vous avec Google pour composer votre mur façon Yope (photos, musiques préférées, romans), rédiger vos histoires à votre rythme et échanger en privé.
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

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileError(null);
    setProfileMessage(null);
    setAvatarBusy(true);
    try {
      const compressed = await compressAvatarForProfile(file);
      setAvatarUrl(compressed);
      setAvatarPreviewFailed(false);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Impossible de préparer cette photo de profil.'
      );
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      const wasDiscoverable = profile?.discoverable !== false;
      await updatePublicProfile(user.uid, {
        displayName,
        avatarUrl,
        bio,
        listeningNote,
        favoriteTrackTitle,
        favoriteTrackArtist,
        favoriteTrackUrl,
        favoriteNovel,
        interests,
        discoverable,
      });

      let syncNote = '';
      if (syncRepostsOnSave && (wasDiscoverable !== discoverable || reposts.length > 0)) {
        const { updated, keptPrivate } = await syncUserRepostsVisibility(
          user.uid,
          discoverable ? 'public' : 'private'
        );
        if (updated > 0) {
          syncNote = discoverable
            ? ` ${updated} repartage${updated > 1 ? 's' : ''} passé${updated > 1 ? 's' : ''} en public.`
            : ` ${updated} repartage${updated > 1 ? 's' : ''} passé${updated > 1 ? 's' : ''} en privé.`;
        }
        if (keptPrivate > 0) {
          syncNote += ` (${keptPrivate} issu${keptPrivate > 1 ? 's' : ''} de salons privés conservé${keptPrivate > 1 ? 's' : ''} en privé.)`;
        }
      }

      setProfileMessage(
        `Votre carte, votre musique et vos réglages de confidentialité ont bien été enregistrés.${syncNote}`
      );
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre présentation.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemoveBookmark = async (storyId: string) => {
    if (!user || busyBookmarkId) return;
    setBusyBookmarkId(storyId);
    try {
      await removeStoryBookmark(user.uid, storyId);
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
    if (busyStoryId) return;
    setBusyStoryId(story.storyId);
    try {
      const nextVis = story.visibility === 'public' ? 'private' : 'public';
      await updateStory(story.storyId, profile?.displayName || story.authorName, {
        title: story.title,
        excerpt: story.excerpt,
        content: story.content,
        theme: story.theme,
        storyFormat: story.storyFormat,
        releaseCadence: story.releaseCadence,
        seriesStatus: story.seriesStatus,
        promptQuestion: story.promptQuestion,
        visibility: nextVis,
      });
    } finally {
      setBusyStoryId(null);
    }
  };

  const handleDelete = async (storyId: string) => {
    if (busyStoryId) return;
    setBusyStoryId(storyId);
    try {
      await deleteStory(storyId);
      setConfirmDeleteId(null);
    } finally {
      setBusyStoryId(null);
    }
  };

  const publicCount = myStories.filter((s) => s.visibility === 'public').length;
  const draftCount = myStories.filter((s) => s.visibility === 'private').length;
  const totalViewsReceived = myStories.reduce((sum, s) => sum + (s.viewCount ?? 0), 0);
  const totalEchoesReceived = myStories.reduce((sum, s) => sum + (s.echoCount || 0), 0);
  const totalReadingMinutes = myStories.reduce((sum, s) => sum + (s.readingMinutes || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-2">
            Mon carnet · {user.email}
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Mon mur, mes goûts et mes écrits
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNewStory}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau texte</span>
          </button>
          <button
            type="button"
            onClick={logOut}
            className="min-h-[40px] px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Summary Card */}
      <div
        aria-label="Récapitulatif de votre carnet"
        className="bg-white border border-stone-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200"
      >
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
          <p className="text-xs text-stone-500 mt-1">Ouvertures de vos récits publics</p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-stone-500">Commentaires reçus</p>
          <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
            {totalEchoesReceived}
          </p>
          <p className="text-xs text-stone-500 mt-1">Réponses déposées sous vos textes</p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs uppercase tracking-widest text-stone-500">Lecture cumulée</p>
          <p className="font-display text-2xl font-medium text-stone-900 tabular-nums mt-1">
            {formatCumulativeMinutes(totalReadingMinutes)}
          </p>
          <p className="text-xs text-stone-500 mt-1">Temps total de vos récits</p>
        </div>
      </div>

      {/* Recharts Reading Statistics */}
      <StoryAnalyticsChart authorId={user.uid} myStories={myStories} />

      {/* Sub-Navigation inside Journal */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-md w-fit">
        {(
          [
            { id: 'wall', label: 'Mon mur', icon: LayoutGrid },
            { id: 'stories', label: `Mes récits (${myStories.length})`, icon: BookOpen },
            { id: 'bookmarks', label: `À lire plus tard (${bookmarks.length})`, icon: Bookmark },
            { id: 'reposts', label: `Repartages (${reposts.length})`, icon: Repeat2 },
            { id: 'profile', label: 'Identité & bio', icon: UserIcon },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Yope-style Wall */}
      {subTab === 'wall' && (
        <ProfileWallView
          memberId={user.uid}
          memberStories={myStories}
          existingExchanges={existingExchanges}
          onReadStory={onReadStory}
          onOpenStoryById={onOpenStoryById}
          onOpenExchange={onOpenExchange}
          embedded
        />
      )}

      {/* Tab 2: My Stories & Serialized Novels */}
      {subTab === 'stories' && (
        <section className="space-y-5">
          {myStories.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center">
              <p className="text-sm text-stone-600 mb-4">
                Votre carnet est encore vierge. Écrivez une confession ou lancez le premier chapitre d’un roman.
              </p>
              <button
                type="button"
                onClick={onNewStory}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-[#1E3A8A] border border-[#1E3A8A] rounded-md hover:bg-[#1E3A8A] hover:text-white transition-colors whitespace-nowrap"
              >
                Commencer un texte
              </button>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
              {myStories.map((story) => {
                const isConfirming = confirmDeleteId === story.storyId;
                const isBusy = busyStoryId === story.storyId;
                const formatLabel =
                  STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label ?? 'Confession';
                return (
                  <div key={story.storyId} className="p-5 sm:p-6 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
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
                      <span
                        className={story.visibility === 'public' ? 'text-[#1E3A8A]' : 'text-stone-600'}
                      >
                        {story.customSalonVisibility === 'private'
                          ? 'Publié (Salon privé)'
                          : story.visibility === 'public'
                            ? story.storyScope === 'pelemele' && !story.customSalonId
                              ? 'Publié dans Pêle-mêle'
                              : 'Publié dans le salon'
                            : 'Brouillon privé'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {story.viewCount ?? 0} vue{(story.viewCount ?? 0) > 1 ? 's' : ''} ·{' '}
                        {story.resonanceCount} résonance{story.resonanceCount > 1 ? 's' : ''} ·{' '}
                        {story.echoCount} commentaire{story.echoCount > 1 ? 's' : ''}
                      </span>
                    </div>

                    <h3 className="font-display text-xl font-medium text-stone-900">
                      {story.title}
                    </h3>
                    <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>

                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onReadStory(story)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 transition-[border-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>
                          {story.storyFormat === 'roman' ? 'Lire / Ajouter un chapitre' : 'Lire'}
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

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleVisibility(story)}
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

                      {isConfirming ? (
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(story.storyId)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 rounded-md hover:bg-red-800 whitespace-nowrap"
                          >
                            Confirmer la suppression
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
                          className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 ml-auto whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Bookmarks ("À lire plus tard") */}
      {subTab === 'bookmarks' && (
        <section aria-label="Histoires enregistrées à lire plus tard" className="space-y-5">
          {bookmarks.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-2">
              <Bookmark className="w-6 h-6 text-stone-400 mx-auto" />
              <p className="font-display text-xl text-stone-900">
                Aucune histoire enregistrée pour le moment
              </p>
              <p className="text-sm text-stone-600 max-w-md mx-auto">
                Cliquez sur l’icône « Enregistrer » sur n’importe quelle histoire pour la retrouver ici et la lire à tête reposée.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
              {bookmarks.map((bm) => {
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
                    <p className="text-sm text-stone-600 leading-relaxed">{bm.storyExcerpt}</p>

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

          {reposts.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-2">
              <Repeat2 className="w-6 h-6 text-stone-400 mx-auto" />
              <p className="font-display text-xl text-stone-900">
                Aucun repartage pour le moment
              </p>
              <p className="text-sm text-stone-600 max-w-md mx-auto">
                Lorsque vous repartagez un récit, il s’affiche ici et sur votre mur en public ou en privé selon le réglage de votre profil.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
              {reposts.map((repost) => {
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
                        <span>{formatFrenchDate((repost.updatedAt || repost.createdAt)?.toDate() ?? null)}</span>
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
                    <p className="text-sm text-stone-600 leading-relaxed">{repost.storyExcerpt}</p>

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

      {/* Tab 3: Profile, Favorite Song & Reading Preferences */}
      {subTab === 'profile' && (
        <section className="max-w-3xl bg-white border border-stone-200 rounded-lg p-6 sm:p-8">
          <h2 className="font-display text-2xl font-medium text-stone-900 mb-1">
            Votre carte publique & musique préférée
          </h2>
          <p className="text-xs text-stone-600 mb-6 leading-relaxed">
            Ces informations apparaissent en tête de votre mur pour aider les autres membres à mieux vous connaître. Votre e-mail reste strictement privé.
          </p>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Profile Photo Uploader */}
            <div className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-md flex flex-col sm:flex-row sm:items-center gap-4">
              {avatarUrl && !avatarPreviewFailed ? (
                <img
                  src={avatarUrl}
                  alt={displayName || 'Votre photo de profil'}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarPreviewFailed(true)}
                  className="w-16 h-16 rounded-full object-cover border border-stone-300 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#F3F6FA] border border-[#CBD6E6] flex items-center justify-center text-[#1B365D] font-display text-2xl shrink-0">
                  {(displayName || 'A').slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <p className="text-xs font-medium text-stone-800">Photo de profil</p>
                  <p className="text-xs text-stone-500">
                    Affichée sur votre mur, votre portrait et dans l’annuaire des membres.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{avatarBusy ? 'Préparation…' : 'Choisir une photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="sr-only"
                    />
                  </label>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('');
                        setAvatarPreviewFailed(false);
                      }}
                      className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-red-300 hover:text-red-700 whitespace-nowrap"
                    >
                      Retirer
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  aria-label="Lien d’image pour la photo de profil"
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarPreviewFailed(false);
                  }}
                  placeholder="Ou coller un lien d’image (https://…)"
                  className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Prénom ou nom de plume
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.displayName.max}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-novel"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Roman ou livre préféré du moment
                </label>
                <input
                  id="profile-novel"
                  type="text"
                  maxLength={FIELD_LIMITS.favoriteNovel.max}
                  value={favoriteNovel}
                  onChange={(e) => setFavoriteNovel(e.target.value)}
                  placeholder="Ex. Le Petit Prince, Kafka sur le rivage…"
                  className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-bio" className="block text-xs font-medium text-stone-700 mb-1">
                Quelques mots sur vous
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={FIELD_LIMITS.bio.max}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ex. Étudiant qui aime écrire le soir, écouter du piano et discuter calmement…"
                className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-stone-500">
                    Musique préférée épinglée sur votre mur
                  </p>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Cherchez sur Audius (gratuit), Spotify, Apple Music, Deezer ou collez un lien audio.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMusicSearch((prev) => !prev)}
                  className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] bg-white border border-[#1B365D]/40 rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span>{showMusicSearch ? 'Masquer le catalogue' : 'Chercher / Connecter un service'}</span>
                </button>
              </div>

              {showMusicSearch && (
                <div className="pt-2 border-t border-stone-200">
                  <MusicCatalogPicker
                    selectedUrl={favoriteTrackUrl}
                    selectedTitle={favoriteTrackTitle}
                    maxUrlLength={FIELD_LIMITS.favoriteTrackUrl.max}
                    onSelectTrack={(picked) => {
                      setFavoriteTrackTitle(picked.title);
                      setFavoriteTrackArtist(picked.artist);
                      setFavoriteTrackUrl(picked.mediaUrl);
                      setProfileMessage(null);
                    }}
                    onManualUrlChange={(url) => setFavoriteTrackUrl(url)}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-track-title"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Titre de la musique préférée
                  </label>
                  <input
                    id="profile-track-title"
                    type="text"
                    maxLength={FIELD_LIMITS.favoriteTrackTitle.max}
                    value={favoriteTrackTitle}
                    onChange={(e) => setFavoriteTrackTitle(e.target.value)}
                    placeholder="Ex. Experience"
                    className="w-full px-3.5 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-track-artist"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Artiste
                  </label>
                  <input
                    id="profile-track-artist"
                    type="text"
                    maxLength={FIELD_LIMITS.favoriteTrackArtist.max}
                    value={favoriteTrackArtist}
                    onChange={(e) => setFavoriteTrackArtist(e.target.value)}
                    placeholder="Ex. Ludovico Einaudi"
                    className="w-full px-3.5 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="profile-track-url"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Lien audio enregistré (Audius, Spotify, Apple Music, Deezer ou MP3)
                </label>
                <input
                  id="profile-track-url"
                  type="url"
                  maxLength={FIELD_LIMITS.favoriteTrackUrl.max}
                  value={favoriteTrackUrl}
                  onChange={(e) => setFavoriteTrackUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full px-3.5 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-interests"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Passions et goûts personnels
                </label>
                <input
                  id="profile-interests"
                  type="text"
                  maxLength={FIELD_LIMITS.interests.max}
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="Ex. Cinéma japonais, photographie argentique, romans…"
                  className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-note"
                  className="block text-xs font-medium text-stone-700 mb-1"
                >
                  Ce dont vous aimez échanger
                </label>
                <input
                  id="profile-note"
                  type="text"
                  maxLength={FIELD_LIMITS.listeningNote.max}
                  value={listeningNote}
                  onChange={(e) => setListeningNote(e.target.value)}
                  placeholder="Ex. Musique, projets créatifs, conseils de lecture…"
                  className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>

            <div className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-md space-y-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  Confidentialité du profil & des repartages
                </p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Choisissez si votre compte et vos histoires repartagées apparaissent en public ou restent privés.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDiscoverable(true)}
                  className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                    discoverable
                      ? 'border-[#1B365D] bg-[#F3F6FA]'
                      : 'border-stone-200 bg-white hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
                    <Globe className="w-4 h-4 text-[#1B365D]" />
                    <span>Profil public</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Apparaît dans l’annuaire des membres. Vos repartages sont publics sur votre mur par défaut.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscoverable(false)}
                  className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                    !discoverable
                      ? 'border-[#1B365D] bg-[#F3F6FA]'
                      : 'border-stone-200 bg-white hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
                    <Lock className="w-4 h-4 text-[#1B365D]" />
                    <span>Profil privé</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Masqué de l’annuaire. Vos repartages restent privés sur votre compte par défaut.
                  </p>
                </button>
              </div>

              {reposts.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-stone-700 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncRepostsOnSave}
                    onChange={(e) => setSyncRepostsOnSave(e.target.checked)}
                    className="rounded border-stone-300 text-[#1B365D] focus:ring-[#1B365D]"
                  />
                  <span>
                    Mettre mes {reposts.length} histoire{reposts.length > 1 ? 's' : ''} déjà repartagée{reposts.length > 1 ? 's' : ''} en mode {discoverable ? 'public' : 'privé'} lors de l’enregistrement
                  </span>
                </label>
              )}
            </div>

            {profileError && (
              <p role="alert" className="text-xs text-red-700">
                {profileError}
              </p>
            )}
            {profileMessage && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                {profileMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-stone-900 rounded-md hover:bg-stone-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {savingProfile ? 'Enregistrement…' : 'Enregistrer ma carte et ma musique'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
