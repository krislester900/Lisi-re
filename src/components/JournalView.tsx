import React, { useEffect, useState } from 'react';
import { BookOpen, Edit3, Eye, EyeOff, LogOut, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { deleteStory, updatePublicProfile, updateStory } from '../lib/storyService';
import { formatFrenchDate, THEME_MAP } from '../lib/themes';
import { FIELD_LIMITS, Story } from '../types/story';

interface JournalViewProps {
  myStories: Story[];
  onReadStory: (story: Story) => void;
  onEditStory: (story: Story) => void;
  onNewStory: () => void;
}

export function JournalView({
  myStories,
  onReadStory,
  onEditStory,
  onNewStory,
}: JournalViewProps) {
  const { user, profile, signInWithGoogle, logOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [listeningNote, setListeningNote] = useState('');
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
    } else if (user) {
      setDisplayName(user.displayName || 'Auteur');
      setBio('');
      setListeningNote('');
    }
  }, [profile, user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Mon carnet · Espace personnel
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Votre table d’écriture et vos brouillons privés
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Connectez-vous avec votre compte Google pour rédiger des récits à votre rythme, garder des textes en brouillon privé, choisir votre nom d’auteur et recevoir des passerelles.
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
      await updatePublicProfile(user.uid, { displayName, bio, listeningNote });
      setProfileMessage('Votre présentation a bien été enregistrée.');
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-2">
            Mon carnet · {user.email}
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Présentation et récits personnels
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNewStory}
            className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau récit</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Profile Form */}
        <section className="lg:col-span-5 bg-white border border-stone-200 rounded-lg p-6">
          <h2 className="font-display text-xl font-medium text-stone-900 mb-1">
            Carte d’auteur publique
          </h2>
          <p className="text-xs text-stone-600 mb-5 leading-relaxed">
            Ces informations aident les lecteurs à mieux vous connaître. Votre adresse e-mail reste strictement privée.
          </p>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-stone-700 mb-1">
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
              <label htmlFor="profile-bio" className="block text-xs font-medium text-stone-700 mb-1">
                Quelques mots sur vous
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={FIELD_LIMITS.bio.max}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ex. Étudiant en informatique qui aime créer des espaces calmes pour se découvrir…"
                className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
              />
            </div>

            <div>
              <label htmlFor="profile-note" className="block text-xs font-medium text-stone-700 mb-1">
                Ce dont vous aimez échanger
              </label>
              <input
                id="profile-note"
                type="text"
                maxLength={FIELD_LIMITS.listeningNote.max}
                value={listeningNote}
                onChange={(e) => setListeningNote(e.target.value)}
                placeholder="Ex. Projets créatifs, livres, parcours atypiques…"
                className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1E3A8A]"
              />
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
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-md hover:bg-stone-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {savingProfile ? 'Enregistrement…' : 'Mettre à jour ma carte'}
            </button>
          </form>
        </section>

        {/* Authored Stories */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-medium text-stone-900">
              Mes textes
            </h2>
            <span className="text-xs text-stone-500 tabular-nums">
              {publicCount} publié{publicCount > 1 ? 's' : ''} · {draftCount} brouillon
              {draftCount > 1 ? 's' : ''}
            </span>
          </div>

          {myStories.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center">
              <p className="text-sm text-stone-600 mb-4">
                Votre carnet est encore vierge. Écrivez un premier brouillon privé ou partagez un récit dans le salon.
              </p>
              <button
                type="button"
                onClick={onNewStory}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-[#1E3A8A] border border-[#1E3A8A] rounded-md hover:bg-[#1E3A8A] hover:text-white transition-colors whitespace-nowrap"
              >
                Commencer un récit
              </button>
            </div>
          ) : (
            <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
              {myStories.map((story) => {
                const isConfirming = confirmDeleteId === story.storyId;
                const isBusy = busyStoryId === story.storyId;
                return (
                  <div key={story.storyId} className="p-5 sm:p-6 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span className="font-medium text-stone-800">
                        {THEME_MAP[story.theme]?.salonName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={story.visibility === 'public' ? 'text-[#1E3A8A]' : 'text-stone-600'}>
                        {story.visibility === 'public' ? 'Publié dans le salon' : 'Brouillon privé'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {story.resonanceCount} résonance{story.resonanceCount > 1 ? 's' : ''} ·{' '}
                        {story.echoCount} écho{story.echoCount > 1 ? 's' : ''}
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
                        className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Lire</span>
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
      </div>
    </div>
  );
}
