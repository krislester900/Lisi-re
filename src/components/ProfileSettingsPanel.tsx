import React, { useEffect, useState } from 'react';
import {
  Camera,
  Globe,
  Lock,
  MessageCircle,
  MessageSquareOff,
  Music2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isModerationAdminEmail } from '../lib/moderationLabels';
import { compressAvatarForProfile } from '../lib/storageService';
import {
  syncUserRepostsVisibility,
  updatePublicProfile,
  updateUserAgeProfile,
} from '../lib/storyService';
import { sanitizeMediaUrl } from '../lib/urlSecurity';
import { FIELD_LIMITS, StoryRepost } from '../types/story';
import { MusicCatalogPicker } from './MusicCatalogPicker';
import { RoleBadgesRow } from './RoleBadge';

interface ProfileSettingsPanelProps {
  reposts: StoryRepost[];
  onSavedSuccess?: () => void;
}

export function ProfileSettingsPanel({
  reposts,
  onSavedSuccess,
}: ProfileSettingsPanelProps) {
  const { user, profile, privateInfo } = useAuth();

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
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [syncRepostsOnSave, setSyncRepostsOnSave] = useState(true);
  const [declaredAgeInput, setDeclaredAgeInput] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      setCommentsDisabled(profile.commentsDisabled === true);
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
      setCommentsDisabled(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (typeof privateInfo?.declaredAge === 'number' && Number.isFinite(privateInfo.declaredAge)) {
      setDeclaredAgeInput(String(privateInfo.declaredAge));
    } else {
      setDeclaredAgeInput('');
    }
  }, [privateInfo?.declaredAge]);

  if (!user) return null;

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
    const trimmedAge = declaredAgeInput.trim();
    let parsedAge: number | null = null;
    if (trimmedAge !== '') {
      const n = Number(trimmedAge);
      if (
        !Number.isFinite(n) ||
        !Number.isInteger(n) ||
        n < FIELD_LIMITS.userAge.min ||
        n > FIELD_LIMITS.userAge.max
      ) {
        setProfileError(
          `Indiquez votre âge en nombre entier entre ${FIELD_LIMITS.userAge.min} et ${FIELD_LIMITS.userAge.max} ans.`
        );
        return;
      }
      parsedAge = n;
    }

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
        commentsDisabled,
      });

      if (parsedAge !== null) {
        await updateUserAgeProfile(user.uid, parsedAge);
      }

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
        `Votre profil, votre musique et vos réglages de confidentialité ont bien été enregistrés.${syncNote}`
      );
      onSavedSuccess?.();
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre présentation.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const safeAvatarUrl = sanitizeMediaUrl(avatarUrl);

  return (
    <section className="max-w-3xl bg-white dark:bg-[#1A1815] border border-stone-200 dark:border-stone-800 rounded-lg p-4 sm:p-8">
      <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 mb-1">
        Paramètres du profil & musique préférée
      </h2>
      <p className="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
        Ces informations s’affichent sur votre page de profil pour aider les autres membres à mieux vous connaître. Votre e-mail reste strictement privé.
      </p>

      {(profile?.isAdmin ||
        isModerationAdminEmail(user.email) ||
        (profile?.badges && profile.badges.length > 0)) && (
        <div className="mb-5 p-3.5 rounded-md border border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-stone-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-stone-800 dark:text-stone-200">
              Vos badges distinctifs sur Lisière
            </p>
            <RoleBadgesRow
              isAdmin={Boolean(profile?.isAdmin || isModerationAdminEmail(user.email))}
              profileBadges={profile?.badges}
            />
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Attribués par l’administration du site.
          </p>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-5">
        {/* Profile Photo Uploader */}
        <div className="p-4 bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md flex flex-col sm:flex-row sm:items-center gap-4">
          {safeAvatarUrl && !avatarPreviewFailed ? (
            <img
              src={safeAvatarUrl}
              alt={displayName || 'Votre photo de profil'}
              referrerPolicy="no-referrer"
              onError={() => setAvatarPreviewFailed(true)}
              className="w-16 h-16 rounded-full object-cover border border-stone-300 dark:border-stone-700 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#F3F6FA] dark:bg-stone-800 border border-[#CBD6E6] dark:border-stone-700 flex items-center justify-center text-[#1B365D] dark:text-amber-300 font-display text-2xl shrink-0">
              {(displayName || 'A').slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="text-xs font-medium text-stone-800 dark:text-stone-200">Photo de profil</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Affichée sur votre profil, votre portrait et dans l’annuaire.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744] dark:hover:bg-amber-500 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
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
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md hover:border-red-300 hover:text-red-700 dark:hover:text-red-300 whitespace-nowrap"
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
              className="w-full px-3 py-1.5 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="profile-name"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
              className="w-full px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>

          <div>
            <label
              htmlFor="profile-novel"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
              className="w-full px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>
        </div>

        <div>
          <label htmlFor="profile-bio" className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
            Quelques mots sur vous
          </label>
          <textarea
            id="profile-bio"
            rows={3}
            maxLength={FIELD_LIMITS.bio.max}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Ex. Étudiant qui aime écrire le soir, écouter du piano et discuter calmement…"
            className="w-full px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
          />
        </div>

        <div className="p-4 bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Musique préférée épinglée sur votre profil
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                Cherchez sur Audius (gratuit), Spotify, Deezer ou collez un lien audio.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowMusicSearch((prev) => !prev)}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-800 border border-[#1B365D]/40 dark:border-amber-400/40 rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>{showMusicSearch ? 'Masquer le catalogue' : 'Chercher / Connecter un service'}</span>
            </button>
          </div>

          {showMusicSearch && (
            <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
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
                className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
                className="w-full px-3.5 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
              />
            </div>
            <div>
              <label
                htmlFor="profile-track-artist"
                className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
                className="w-full px-3.5 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-track-url"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
            >
              Lien audio enregistré (Audius, Spotify, Deezer ou MP3)
            </label>
            <input
              id="profile-track-url"
              type="text"
              maxLength={FIELD_LIMITS.favoriteTrackUrl.max}
              value={favoriteTrackUrl}
              onChange={(e) => setFavoriteTrackUrl(e.target.value)}
              placeholder="https://… ou /api/music/audius/stream/…"
              className="w-full px-3.5 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="profile-interests"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
              className="w-full px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>

          <div>
            <label
              htmlFor="profile-note"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
              className="w-full px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
            />
          </div>
        </div>

        <div className="p-4 bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#1B365D] dark:text-amber-300" />
                <span>Votre âge (strictement privé · filtre d’accès)</span>
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                Jamais affiché aux autres membres. Sert à proposer des récits et fils adaptés à votre âge et à activer les alertes « Contenu mature ».
              </p>
            </div>
            <div className="sm:w-36 shrink-0">
              <label htmlFor="profile-declared-age" className="sr-only">
                Votre âge (en années)
              </label>
              <input
                id="profile-declared-age"
                type="number"
                min={FIELD_LIMITS.userAge.min}
                max={FIELD_LIMITS.userAge.max}
                step={1}
                value={declaredAgeInput}
                onChange={(e) => setDeclaredAgeInput(e.target.value)}
                placeholder="Ex. 24"
                className="w-full px-3 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md space-y-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Confidentialité du profil & des repartages
            </p>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              Choisissez si votre compte et vos histoires repartagées apparaissent en public ou restent privés.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDiscoverable(true)}
              className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                discoverable
                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                <Globe className="w-4 h-4 text-[#1B365D] dark:text-amber-300" />
                <span>Profil public</span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Apparaît dans l’annuaire des profils. Vos repartages sont publics sur votre mur par défaut.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDiscoverable(false)}
              className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                !discoverable
                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                <Lock className="w-4 h-4 text-[#1B365D] dark:text-amber-300" />
                <span>Profil privé</span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Masqué de l’annuaire. Vos repartages restent privés sur votre compte par défaut.
              </p>
            </button>
          </div>

          {reposts.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-stone-700 dark:text-stone-300 pt-1 cursor-pointer">
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

        <div className="p-4 bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md space-y-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Commentaires sur vos écrits (profil, confessions &amp; romans)
            </p>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
              Permet à tout auteur ou personne publiant des confessions de bloquer les nouveaux commentaires sur l’ensemble de ses écrits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={!commentsDisabled}
              onClick={() => setCommentsDisabled(false)}
              className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                !commentsDisabled
                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                <MessageCircle className="w-4 h-4 text-[#1B365D] dark:text-amber-300" />
                <span>Commentaires autorisés</span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Les lecteurs peuvent commenter vos histoires, confessions et chapitres.
              </p>
            </button>

            <button
              type="button"
              aria-pressed={commentsDisabled}
              onClick={() => setCommentsDisabled(true)}
              className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                commentsDisabled
                  ? 'border-[#9A3B29] dark:border-amber-400 bg-[#FDF3F1] dark:bg-stone-800'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                <MessageSquareOff className="w-4 h-4 text-[#9A3B29] dark:text-amber-300" />
                <span>Commentaires désactivés</span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Aucun nouveau commentaire ne peut être posté sous vos textes (anonymat inclus).
              </p>
            </button>
          </div>
        </div>

        {profileError && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {profileError}
          </p>
        )}
        {profileMessage && (
          <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded px-3 py-2">
            {profileMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={savingProfile}
          className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {savingProfile ? 'Enregistrement…' : 'Enregistrer mon profil'}
        </button>
      </form>
    </section>
  );
}
