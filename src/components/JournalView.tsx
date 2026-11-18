import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Edit3,
  Eye,
  EyeOff,
  LayoutGrid,
  LogOut,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { deleteStory, updatePublicProfile, updateStory } from '../lib/storyService';
import {
  formatCumulativeMinutes,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import { Exchange, FIELD_LIMITS, Story } from '../types/story';
import { ProfileWallView } from './ProfileWallView';

interface JournalViewProps {
  myStories: Story[];
  existingExchanges: Exchange[];
  onReadStory: (story: Story) => void;
  onEditStory: (story: Story) => void;
  onNewStory: () => void;
  onOpenExchange: (exchangeId: string) => void;
}

type JournalSubTab = 'wall' | 'stories' | 'profile';

export function JournalView({
  myStories,
  existingExchanges,
  onReadStory,
  onEditStory,
  onNewStory,
  onOpenExchange,
}: JournalViewProps) {
  const { user, profile, signInWithGoogle, logOut } = useAuth();
  const [subTab, setSubTab] = useState<JournalSubTab>('wall');

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [listeningNote, setListeningNote] = useState('');
  const [favoriteTrackTitle, setFavoriteTrackTitle] = useState('');
  const [favoriteTrackArtist, setFavoriteTrackArtist] = useState('');
  const [favoriteTrackUrl, setFavoriteTrackUrl] = useState('');
  const [favoriteNovel, setFavoriteNovel] = useState('');
  const [interests, setInterests] = useState('');
  const [discoverable, setDiscoverable] = useState(true);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      await updatePublicProfile(user.uid, {
        displayName,
        bio,
        listeningNote,
        favoriteTrackTitle,
        favoriteTrackArtist,
        favoriteTrackUrl,
        favoriteNovel,
        interests,
        discoverable,
      });
      setProfileMessage('Votre carte et vos préférences ont bien été enregistrées.');
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre présentation.'
      );
    } finally {
      setSavingProfile(false);
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
        className="bg-white border border-stone-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200"
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

      {/* Sub-Navigation inside Journal */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-md w-fit">
        {(
          [
            { id: 'wall', label: 'Mon mur', icon: LayoutGrid },
            { id: 'stories', label: `Mes récits & romans (${myStories.length})`, icon: BookOpen },
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
              className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
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
                        {THEME_MAP[story.theme]?.salonName}
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
                        {story.visibility === 'public' ? 'Publié dans le salon' : 'Brouillon privé'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
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
              <div>
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  Musique préférée épinglée sur votre mur
                </p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Collez un lien Spotify, YouTube, SoundCloud ou audio : votre mur affichera uniquement le titre et une icône de lecture musicale discrète.
                </p>
              </div>
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
                  Lien d’écoute (Spotify, YouTube, SoundCloud, Deezer ou MP3)
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

            <label className="flex items-center gap-2.5 text-xs text-stone-700 pt-1">
              <input
                type="checkbox"
                checked={discoverable}
                onChange={(e) => setDiscoverable(e.target.checked)}
                className="rounded border-stone-300"
              />
              <span>
                Apparaître dans l’annuaire des membres pour que d’autres puissent visiter mon mur et m’écrire en privé
              </span>
            </label>

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
