import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  BookOpen,
  Camera,
  Eye,
  EyeOff,
  Feather,
  Flag,
  Globe,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Music2,
  Plus,
  Repeat2,
  Send,
  Star,
  Trash2,
  User as UserIcon,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { compressAvatarForProfile, compressPhotoForWall } from '../lib/storageService';
import {
  claimAnonymousStory,
  createDirectExchangeWithFirstMessage,
  createWallItem,
  deleteStoryRepost,
  deleteWallItem,
  ensureUserProfiles,
  formatFriendlyFirestoreError,
  removeUserRelationship,
  subscribeToProfileReposts,
  subscribeToPublicProfile,
  subscribeToWallItems,
  toggleFavoriteAuthor,
  updatePublicProfile,
  updateRepostVisibility,
  upsertUserRelationship,
} from '../lib/storyService';
import {
  formatFrenchDate,
  NOVEL_GENRE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Exchange,
  FIELD_LIMITS,
  PublicProfile,
  Story,
  StoryRepost,
  UserRelationship,
  WallAccentTone,
  WallItem,
  WallItemKind,
} from '../types/story';
import { ImmersiveMusicPlayer } from './ImmersiveMusicPlayer';
import { MusicCatalogPicker } from './MusicCatalogPicker';
import { NovelCoverArt } from './NovelCoverArt';
import type { ReportDraft } from './ReportModal';

import { Settings } from 'lucide-react';

interface ProfileWallViewProps {
  memberId: string;
  memberStories: Story[];
  existingExchanges: Exchange[];
  relationships?: UserRelationship[];
  onBack?: () => void;
  onEditProfile?: () => void;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onOpenExchange: (exchangeId: string) => void;
  onOpenReport?: (draft: ReportDraft) => void;
  embedded?: boolean;
}

const TONE_STYLES: Record<
  WallAccentTone,
  { label: string; bg: string; border: string; accent: string }
> = {
  sand: {
    label: 'Lin',
    bg: '#FAF8F4',
    border: '#E7E5E4',
    accent: '#574A3D',
  },
  ink: {
    label: 'Encre',
    bg: '#F3F6FA',
    border: '#CBD6E6',
    accent: '#1B365D',
  },
  ochre: {
    label: 'Ocre',
    bg: '#FDF8F0',
    border: '#EAD6B8',
    accent: '#8C4D0E',
  },
  terracotta: {
    label: 'Terracotta',
    bg: '#FDF4F2',
    border: '#ECC9C1',
    accent: '#9A3B29',
  },
  sage: {
    label: 'Sauge',
    bg: '#F4F7EF',
    border: '#CED8BA',
    accent: '#46542B',
  },
};

const HERO_WAVE_BARS = [30, 48, 72, 44, 88, 62, 100, 76, 52, 84, 42, 60, 28];

function formatReadableWallError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed?.error) {
      if (parsed.error.toLowerCase().includes('permission')) {
        return 'Permission refusée par Firestore. Vérifiez que vous êtes bien connecté avec votre compte Google.';
      }
      return parsed.error;
    }
  } catch {
    // Plain Error message
  }
  return err.message || fallback;
}

export function ProfileWallView({
  memberId,
  memberStories,
  existingExchanges,
  relationships = [],
  onBack,
  onEditProfile,
  onReadStory,
  onOpenStoryById,
  onOpenExchange,
  onOpenReport,
  embedded = false,
}: ProfileWallViewProps) {
  const { user, profile: myProfile, favoriteAuthors, signInWithGoogle } = useAuth();
  const [memberProfile, setMemberProfile] = useState<PublicProfile | null>(null);
  const [wallItems, setWallItems] = useState<WallItem[]>([]);
  const [reposts, setReposts] = useState<StoryRepost[]>([]);
  const [repostBusyId, setRepostBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [profileSection, setProfileSection] = useState<'wall' | 'stories' | 'reposts'>('wall');

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [lightboxItem, setLightboxItem] = useState<{
    itemId?: string;
    src: string;
    title: string;
    body?: string;
  } | null>(null);

  const [wallActionError, setWallActionError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Direct private message box & safety actions
  const [showDmBox, setShowDmBox] = useState(false);
  const [dmText, setDmText] = useState('');
  const [dmBusy, setDmBusy] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [relBusy, setRelBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const isFavoriteAuthor = favoriteAuthors.some((a) => a.authorId === memberId);
  const memberRelationship = relationships.find((r) => r.targetUserId === memberId);
  const isBlockedMember = memberRelationship?.relation === 'blocked';
  const isNotInterestedMember = memberRelationship?.relation === 'not_interested';

  // Unified Wall Composer Modal
  const [composerOpen, setComposerOpen] = useState(false);
  const [kind, setKind] = useState<WallItemKind>('photo');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [accentTone, setAccentTone] = useState<WallAccentTone>('sand');
  const [setAsFavoriteMusic, setSetAsFavoriteMusic] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  // Owner Profile Photo (Avatar) Modal
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarDraftFailed, setAvatarDraftFailed] = useState(false);

  const [confirmClaimStoryId, setConfirmClaimStoryId] = useState<string | null>(null);
  const [claimingStoryId, setClaimingStoryId] = useState<string | null>(null);
  const [claimStoryError, setClaimStoryError] = useState<string | null>(null);

  const isOwner = Boolean(user && user.uid === memberId);

  useEffect(() => {
    setLoaded(false);
    setActiveTrackId(null);
    setProfileSection('wall');
    setShowDmBox(false);
    setDmText('');
    setDmError(null);
    setLightboxItem(null);
    setWallActionError(null);
    setConfirmClaimStoryId(null);
    setClaimingStoryId(null);
    setClaimStoryError(null);

    const unsubProfile = subscribeToPublicProfile(memberId, (p) => {
      setMemberProfile(p);
      setLoaded(true);
    });
    const unsubWall = subscribeToWallItems(memberId, setWallItems);
    const unsubReposts = subscribeToProfileReposts(memberId, user?.uid ?? null, setReposts);

    return () => {
      unsubProfile();
      unsubWall();
      unsubReposts();
    };
  }, [memberId, user?.uid]);

  useEffect(() => {
    if (loaded && isOwner && !memberProfile && user) {
      void ensureUserProfiles(user).catch((err) => {
        console.error('Impossible de préparer le profil du mur:', err);
      });
    }
  }, [loaded, isOwner, memberProfile, user]);

  useEffect(() => {
    if (!lightboxItem && !composerOpen && !avatarModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxItem) setLightboxItem(null);
        else if (avatarModalOpen && !savingAvatar) setAvatarModalOpen(false);
        else if (composerOpen && !savingItem) setComposerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxItem, composerOpen, savingItem, avatarModalOpen, savingAvatar]);

  const existingDirectExchange =
    user && !isOwner
      ? existingExchanges.find(
          (ex) =>
            ex.participantIds.includes(user.uid) &&
            ex.participantIds.includes(memberId) &&
            (ex.kind === 'direct' || ex.storyId === 'direct')
        )
      : undefined;

  const openComposerWithKind = (targetKind: WallItemKind) => {
    setKind(targetKind);
    setItemError(null);
    setWallActionError(null);
    setMediaUrl('');
    setTitle('');
    setSubtitle('');
    setBody('');
    setSetAsFavoriteMusic(true);
    setComposerOpen(true);
  };

  const openAvatarModal = () => {
    setAvatarDraftUrl(memberProfile?.avatarUrl ?? '');
    setAvatarDraftFailed(false);
    setAvatarError(null);
    setAvatarModalOpen(true);
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const compressed = await compressAvatarForProfile(file);
      setAvatarDraftUrl(compressed);
      setAvatarDraftFailed(false);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : 'Impossible de préparer cette photo de profil.'
      );
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

  const handleSaveAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOwner) return;
    setAvatarError(null);
    setSavingAvatar(true);
    try {
      if (!memberProfile) {
        await ensureUserProfiles(user);
      }
      const ownerName =
        memberProfile?.displayName || myProfile?.displayName || user.displayName || 'Auteur';
      await updatePublicProfile(user.uid, {
        displayName: ownerName,
        bio: memberProfile?.bio || '',
        listeningNote: memberProfile?.listeningNote || '',
        avatarUrl: avatarDraftUrl.trim(),
      });
      setFailedImages((prev) => ({
        ...prev,
        'header-avatar': false,
        'circle-portrait': false,
      }));
      setAvatarModalOpen(false);
    } catch (err) {
      setAvatarError(
        formatReadableWallError(err, 'Impossible d’enregistrer votre photo de profil.')
      );
    } finally {
      setSavingAvatar(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setItemError(null);
    setPhotoBusy(true);
    try {
      const compressed = await compressPhotoForWall(file);
      setMediaUrl(compressed);
      if (!title.trim()) {
        const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (cleanName) setTitle(cleanName.slice(0, 80));
      }
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Impossible de préparer cette photo.');
    } finally {
      setPhotoBusy(false);
      e.target.value = '';
    }
  };

  const handleCreateWallItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOwner) return;
    setItemError(null);
    setWallActionError(null);

    if (!title.trim()) {
      setItemError('Ajoutez un titre à votre carte.');
      return;
    }
    if (kind === 'photo' && !mediaUrl.trim()) {
      setItemError('Choisissez une photo depuis votre appareil ou collez un lien d’image.');
      return;
    }

    setSavingItem(true);
    try {
      if (!memberProfile) {
        await ensureUserProfiles(user);
      }

      const ownerName =
        memberProfile?.displayName || myProfile?.displayName || user.displayName || 'Auteur';

      if (kind === 'music' && setAsFavoriteMusic) {
        await updatePublicProfile(user.uid, {
          displayName: ownerName,
          bio: memberProfile?.bio || '',
          listeningNote: memberProfile?.listeningNote || '',
          favoriteTrackTitle: title,
          favoriteTrackArtist: subtitle,
          favoriteTrackUrl: mediaUrl,
        });
      }

      await createWallItem(user.uid, ownerName, {
        kind,
        title,
        subtitle,
        body,
        mediaUrl,
        accentTone,
      });

      setTitle('');
      setSubtitle('');
      setBody('');
      setMediaUrl('');
      setComposerOpen(false);
    } catch (err) {
      setItemError(formatReadableWallError(err, 'Impossible d’ajouter cette carte sur le mur.'));
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteWallItem = async (itemId: string) => {
    if (!isOwner || deletingItemId) return;
    setWallActionError(null);
    setDeletingItemId(itemId);
    try {
      await deleteWallItem(memberId, itemId);
      if (activeTrackId === itemId) setActiveTrackId(null);
      if (lightboxItem?.itemId === itemId) setLightboxItem(null);
    } catch (err) {
      setWallActionError(formatReadableWallError(err, 'Impossible de supprimer cet élément.'));
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleRemoveFeaturedMusic = async () => {
    if (!isOwner || !user || !featuredTrack || deletingItemId) return;
    if (featuredTrack.wallItemId) {
      await handleDeleteWallItem(featuredTrack.wallItemId);
      return;
    }

    setWallActionError(null);
    setDeletingItemId(featuredTrack.id);
    try {
      const ownerName =
        memberProfile?.displayName || myProfile?.displayName || user.displayName || 'Auteur';
      await updatePublicProfile(user.uid, {
        displayName: ownerName,
        bio: memberProfile?.bio || '',
        listeningNote: memberProfile?.listeningNote || '',
        favoriteTrackTitle: '',
        favoriteTrackArtist: '',
        favoriteTrackUrl: '',
      });

      const matchingWallMusics = wallItems.filter(
        (m) =>
          m.kind === 'music' &&
          m.title.trim().toLowerCase() === featuredTrack.title.trim().toLowerCase()
      );
      await Promise.all(matchingWallMusics.map((m) => deleteWallItem(memberId, m.itemId)));

      if (activeTrackId === featuredTrack.id) setActiveTrackId(null);
    } catch (err) {
      setWallActionError(
        formatReadableWallError(err, 'Impossible de retirer la musique du mur.')
      );
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleStartDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!memberProfile) return;
    setDmError(null);
    if (!dmText.trim()) {
      setDmError('Écrivez quelques mots pour commencer la discussion.');
      return;
    }
    setDmBusy(true);
    try {
      const initiatorName = myProfile?.displayName || user.displayName || 'Auteur';
      const exchangeId = await createDirectExchangeWithFirstMessage({
        initiatorId: user.uid,
        initiatorName,
        recipientId: memberProfile.userId,
        recipientName: memberProfile.displayName,
        firstMessage: dmText,
      });
      setDmText('');
      setShowDmBox(false);
      onOpenExchange(exchangeId);
    } catch (err) {
      setDmError(
        formatFriendlyFirestoreError(
          err,
          'Impossible d’ouvrir la conversation.',
          'Impossible d’ouvrir la conversation : les échanges privés avec ce membre sont restreints ou bloqués.'
        )
      );
    } finally {
      setDmBusy(false);
    }
  };

  const handleSetMemberRelation = async (next: 'blocked' | 'not_interested' | null) => {
    if (!user || isOwner || !memberProfile || relBusy) return;
    setWallActionError(null);
    setRelBusy(true);
    try {
      if (next === null) {
        await removeUserRelationship(user.uid, memberProfile.userId);
      } else {
        await upsertUserRelationship({
          ownerId: user.uid,
          targetUserId: memberProfile.userId,
          targetName: memberProfile.displayName,
          relation: next,
        });
        if (next === 'blocked') {
          setShowDmBox(false);
        }
      }
      setConfirmBlock(false);
    } catch (err) {
      setWallActionError(
        formatFriendlyFirestoreError(err, 'Impossible de mettre à jour cette préférence.')
      );
    } finally {
      setRelBusy(false);
    }
  };

  const handleToggleFavoriteMember = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (isOwner || !memberProfile || favBusy) return;
    setWallActionError(null);
    setFavBusy(true);
    try {
      await toggleFavoriteAuthor(user.uid, memberProfile.userId, memberProfile.displayName);
    } catch (err) {
      setWallActionError(
        formatFriendlyFirestoreError(err, 'Impossible de modifier cet auteur favori.')
      );
    } finally {
      setFavBusy(false);
    }
  };

  const handleToggleRepostVisibility = async (repost: StoryRepost) => {
    if (!isOwner || !user || repostBusyId) return;
    setWallActionError(null);
    setRepostBusyId(repost.storyId);
    try {
      const nextVis = repost.visibility === 'public' ? 'private' : 'public';
      await updateRepostVisibility(user.uid, repost.storyId, nextVis);
    } catch (err) {
      setWallActionError(
        formatReadableWallError(err, 'Impossible de modifier la visibilité de ce repartage.')
      );
    } finally {
      setRepostBusyId(null);
    }
  };

  const handleDeleteRepost = async (storyId: string) => {
    if (!isOwner || !user || repostBusyId) return;
    setWallActionError(null);
    setRepostBusyId(storyId);
    try {
      await deleteStoryRepost(user.uid, storyId);
    } catch (err) {
      setWallActionError(
        formatReadableWallError(err, 'Impossible de retirer ce repartage.')
      );
    } finally {
      setRepostBusyId(null);
    }
  };

  const { leadPhoto, circularPhoto, featuredTrack, remainingCollageItems } = useMemo(() => {
    const photos = wallItems.filter((item) => item.kind === 'photo' && item.mediaUrl);
    const musics = wallItems.filter((item) => item.kind === 'music');

    const primaryPhoto = photos[0] ?? null;

    let circleSrc: string | null = null;
    let circleAlt = memberProfile?.displayName || 'Portrait';
    let circleItemId: string | undefined;
    let circleBody: string | undefined;
    let consumedPhotoCount = primaryPhoto ? 1 : 0;

    if (photos.length >= 2) {
      circleSrc = photos[1].mediaUrl || null;
      circleAlt = photos[1].title || circleAlt;
      circleItemId = photos[1].itemId;
      circleBody = photos[1].body;
      consumedPhotoCount = 2;
    } else if (memberProfile?.avatarUrl) {
      circleSrc = memberProfile.avatarUrl;
    } else if (primaryPhoto?.mediaUrl) {
      circleSrc = primaryPhoto.mediaUrl;
      circleAlt = primaryPhoto.title || circleAlt;
      circleItemId = primaryPhoto.itemId;
      circleBody = primaryPhoto.body;
    }

    let featured: {
      id: string;
      title: string;
      artist?: string;
      url?: string;
      kicker: string;
      wallItemId?: string;
    } | null = null;

    let remainingMusics = musics;
    if (memberProfile?.favoriteTrackTitle) {
      featured = {
        id: 'pinned-fav',
        title: memberProfile.favoriteTrackTitle,
        artist: memberProfile.favoriteTrackArtist,
        url: memberProfile.favoriteTrackUrl,
        kicker: 'Musique préférée',
      };
      remainingMusics = musics.filter(
        (m) =>
          m.title.trim().toLowerCase() !== memberProfile.favoriteTrackTitle?.trim().toLowerCase()
      );
    } else if (musics.length > 0) {
      featured = {
        id: musics[0].itemId,
        title: musics[0].title,
        artist: musics[0].subtitle,
        url: musics[0].mediaUrl,
        kicker: 'En rotation sur le mur',
        wallItemId: musics[0].itemId,
      };
      remainingMusics = musics.slice(1);
    }

    const extraPhotos = photos.slice(consumedPhotoCount);

    const usedIds = new Set<string>();
    if (primaryPhoto) usedIds.add(primaryPhoto.itemId);
    if (consumedPhotoCount === 2 && photos[1]) usedIds.add(photos[1].itemId);
    if (featured?.wallItemId) usedIds.add(featured.wallItemId);

    const remaining = wallItems.filter((item) => {
      if (usedIds.has(item.itemId)) return false;
      if (item.kind === 'music' && !remainingMusics.some((m) => m.itemId === item.itemId)) {
        return false;
      }
      if (item.kind === 'photo' && !extraPhotos.some((p) => p.itemId === item.itemId)) {
        return false;
      }
      return true;
    });

    return {
      leadPhoto: primaryPhoto,
      circularPhoto: {
        src: circleSrc,
        alt: circleAlt,
        itemId: circleItemId,
        body: circleBody,
      },
      featuredTrack: featured,
      remainingCollageItems: remaining,
    };
  }, [wallItems, memberProfile]);

  const activeTrackTitle = useMemo(() => {
    if (!activeTrackId) return null;
    if (featuredTrack && activeTrackId === featuredTrack.id) {
      return featuredTrack.title;
    }
    const found = wallItems.find((w) => w.itemId === activeTrackId);
    return found?.title ?? null;
  }, [activeTrackId, featuredTrack, wallItems]);

  if (!loaded || (isOwner && !memberProfile && user)) {
    return (
      <div
        className={
          embedded
            ? 'py-10 text-center text-sm text-stone-500'
            : 'max-w-6xl mx-auto px-6 py-14 text-center text-sm text-stone-500'
        }
      >
        {isOwner ? 'Préparation de votre mur personnel…' : 'Ouverture du mur du membre…'}
      </div>
    );
  }

  if (!memberProfile) {
    return (
      <div
        className={
          embedded
            ? 'py-10 text-center space-y-4'
            : 'max-w-3xl mx-auto px-6 py-16 text-center space-y-4'
        }
      >
        <p className="font-display text-2xl text-stone-900">Profil introuvable</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-md hover:border-stone-400"
          >
            Retour aux membres
          </button>
        )}
      </div>
    );
  }

  const publicStories = memberStories.filter(
    (s) => s.visibility === 'public' && (isOwner || !s.isAnonymous)
  );
  const isAnyMusicPlaying = Boolean(activeTrackId);

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-6 py-8 space-y-6'}>
      {onBack && (
        <div>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tous les profils</span>
          </button>
        </div>
      )}

      {/* Unified Member Identity + Grouped Wall Toolbar */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            {isOwner ? (
              <button
                type="button"
                onClick={openAvatarModal}
                aria-label="Modifier votre photo de profil"
                className="relative group shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D]"
              >
                {memberProfile.avatarUrl && !failedImages['header-avatar'] ? (
                  <img
                    src={memberProfile.avatarUrl}
                    alt={memberProfile.displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((prev) => ({ ...prev, 'header-avatar': true }))}
                    className="w-16 h-16 rounded-full object-cover border border-stone-200 group-hover:brightness-95 transition"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#F3F6FA] border border-[#CBD6E6] flex items-center justify-center text-[#1B365D] font-display text-2xl group-hover:border-[#1B365D] transition-colors">
                    {memberProfile.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#1B365D] text-white border-2 border-white flex items-center justify-center shadow-sm group-hover:bg-[#132744] transition-colors">
                  <Camera className="w-3 h-3" />
                </span>
              </button>
            ) : memberProfile.avatarUrl && !failedImages['header-avatar'] ? (
              <img
                src={memberProfile.avatarUrl}
                alt={memberProfile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((prev) => ({ ...prev, 'header-avatar': true }))}
                className="w-16 h-16 rounded-full object-cover border border-stone-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#F3F6FA] border border-[#CBD6E6] flex items-center justify-center text-[#1B365D] font-display text-2xl shrink-0">
                {memberProfile.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  Mur personnel · Photos, musique, romans & notes
                </p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={openAvatarModal}
                    className="text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap"
                  >
                    {memberProfile.avatarUrl ? 'Changer la photo de profil' : 'Ajouter une photo de profil'}
                  </button>
                )}
              </div>
              <h1 className="font-display text-3xl font-medium text-stone-900">
                {memberProfile.displayName}
              </h1>
              {memberProfile.bio ? (
                <p className="text-sm text-stone-700 leading-relaxed max-w-2xl">
                  {memberProfile.bio}
                </p>
              ) : (
                <p className="text-sm text-stone-500 italic">
                  Ce membre n’a pas encore rédigé sa présentation.
                </p>
              )}
              {(memberProfile.interests || memberProfile.listeningNote) && (
                <p className="text-xs text-stone-600 pt-1">
                  {memberProfile.interests && <span>{memberProfile.interests}</span>}
                  {memberProfile.interests && memberProfile.listeningNote && (
                    <span aria-hidden="true"> · </span>
                  )}
                  {memberProfile.listeningNote && (
                    <span className="italic">{memberProfile.listeningNote}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isOwner ? (
              <>
                {(
                  [
                    { id: 'photo', label: 'Photo', icon: Camera },
                    { id: 'music', label: 'Musique', icon: Music2 },
                    { id: 'note', label: 'Note', icon: Feather },
                    { id: 'novel', label: 'Roman', icon: BookOpen },
                  ] as const
                ).map((action) => {
                  const Icon = action.icon;
                  const isActiveAction = composerOpen && kind === action.id;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => openComposerWithKind(action.id)}
                      className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${
                        isActiveAction
                          ? 'bg-[#1B365D] text-white border-[#1B365D]'
                          : 'bg-[#FBF9F5] text-stone-800 border-stone-200 hover:border-[#1B365D] hover:text-[#1B365D]'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <Icon className="w-3.5 h-3.5" />
                      <span>{action.label}</span>
                    </button>
                  );
                })}
                {onEditProfile && (
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-md border border-stone-300 bg-white text-stone-800 hover:border-[#1B365D] hover:text-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Paramètres</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {!isBlockedMember && (
                  existingDirectExchange ? (
                    <button
                      type="button"
                      onClick={() => onOpenExchange(existingDirectExchange.exchangeId)}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Ouvrir le chat privé</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) {
                          await signInWithGoogle();
                          return;
                        }
                        setShowDmBox((prev) => !prev);
                      }}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Message privé</span>
                    </button>
                  )
                )}

                {user && (
                  <>
                    <button
                      type="button"
                      disabled={favBusy}
                      aria-pressed={isFavoriteAuthor}
                      onClick={() => void handleToggleFavoriteMember()}
                      className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                        isFavoriteAuthor
                          ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                          : 'border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-[#1B365D] hover:text-[#1B365D]'
                      } disabled:opacity-50`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFavoriteAuthor ? 'fill-current' : ''}`} />
                      <span>{isFavoriteAuthor ? 'Auteur favori' : 'Suivre l’auteur'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={relBusy}
                      onClick={() =>
                        void handleSetMemberRelation(
                          isNotInterestedMember ? null : 'not_interested'
                        )
                      }
                      className={`min-h-[42px] px-3 py-2 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isNotInterestedMember
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-stone-400'
                      }`}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>
                        {isNotInterestedMember ? 'Retirer « Pas intéressé »' : 'Pas intéressé'}
                      </span>
                    </button>

                    {isBlockedMember ? (
                      <button
                        type="button"
                        disabled={relBusy}
                        onClick={() => void handleSetMemberRelation(null)}
                        className="min-h-[42px] px-3 py-2 text-xs font-medium rounded-md border border-red-300 bg-red-50 text-red-900 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Débloquer</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmBlock((prev) => !prev)}
                        className="min-h-[42px] px-3 py-2 text-xs font-medium rounded-md border border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Bloquer</span>
                      </button>
                    )}

                    {onOpenReport && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenReport({
                            targetUserId: memberProfile.userId,
                            targetUserName: memberProfile.displayName,
                            targetType: 'profile',
                            targetId: memberProfile.userId,
                            targetContextId: memberProfile.userId,
                            targetExcerpt:
                              memberProfile.bio || `Mur de ${memberProfile.displayName}`,
                            targetSummaryLabel: `Signaler ${memberProfile.displayName}`,
                          })
                        }
                        className="min-h-[42px] px-3 py-2 text-xs font-medium rounded-md border border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>Signaler</span>
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {!isOwner && confirmBlock && !isBlockedMember && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs text-red-950">
            <span>
              Bloquer <strong>{memberProfile.displayName}</strong> empêchera tout message privé entre vous et masquera ses récits et commentaires.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={relBusy}
                onClick={() => void handleSetMemberRelation('blocked')}
                className="px-3 py-1.5 rounded bg-red-800 text-white font-medium hover:bg-red-900"
              >
                Confirmer le blocage
              </button>
              <button
                type="button"
                onClick={() => setConfirmBlock(false)}
                className="px-2.5 py-1.5 text-stone-700 hover:text-stone-900"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {!isOwner && (isBlockedMember || isNotInterestedMember) && (
          <div
            className={`px-4 py-2.5 rounded-md border flex flex-wrap items-center justify-between gap-2 text-xs ${
              isBlockedMember
                ? 'bg-red-50 border-red-200 text-red-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <span>
              {isBlockedMember
                ? `Vous avez bloqué ${memberProfile.displayName}.`
                : `${memberProfile.displayName} est marqué(e) comme « Pas intéressé ».`}
            </span>
            <button
              type="button"
              disabled={relBusy}
              onClick={() => void handleSetMemberRelation(null)}
              className="font-medium underline whitespace-nowrap"
            >
              {isBlockedMember ? 'Débloquer ce membre' : 'Rétablir dans mon fil'}
            </button>
          </div>
        )}

        {/* Direct 1-on-1 Message Box */}
        {showDmBox && !isOwner && !isBlockedMember && (
          <form onSubmit={handleStartDm} className="pt-5 border-t border-stone-200 space-y-3">
            <p className="text-sm font-medium text-stone-900">
              Démarrer un chat privé avec {memberProfile.displayName}
            </p>
            <textarea
              rows={2}
              maxLength={FIELD_LIMITS.messageContent.max}
              value={dmText}
              onChange={(e) => setDmText(e.target.value)}
              placeholder={`Bonjour ${memberProfile.displayName}, j’ai vu ton mur et…`}
              className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1B365D]"
            />
            {dmError && (
              <p role="alert" className="text-xs text-red-700">
                {dmError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDmBox(false)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={dmBusy}
                className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{dmBusy ? 'Envoi…' : 'Envoyer en privé'}</span>
              </button>
            </div>
          </form>
        )}

        {wallActionError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-900 px-4 py-2.5 rounded-md text-xs"
          >
            <span>{wallActionError}</span>
            <button
              type="button"
              onClick={() => setWallActionError(null)}
              aria-label="Fermer l’erreur"
              className="text-red-700 hover:text-red-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Clean Sub-Navigation inside Profile Page so it is uncluttered & easy to browse */}
      <div
        role="tablist"
        aria-label="Sections du profil"
        className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-lg w-fit"
      >
        {(
          [
            { id: 'wall', label: 'Mur & musique', icon: Music2 },
            { id: 'stories', label: `Récits (${publicStories.length})`, icon: BookOpen },
            { id: 'reposts', label: `Repartages (${reposts.length})`, icon: Repeat2 },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = profileSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setProfileSection(tab.id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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

      {/* UNIFIED YOPE-STYLE COLLAGE WALL BOARD (Photos + Music + Soundwave + Notes + Novels together) */}
      {profileSection === 'wall' && (
      <section
        aria-label={`Mur collage de ${memberProfile.displayName}`}
        className="lisiere-wall-board rounded-2xl p-6 sm:p-8 lg:p-10 text-white space-y-8 shadow-sm"
      >
        {/* Top Collage Composition matching Yope wall layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Left Collage Column: Featured Photo + Floating Music Widget */}
          <div className="md:col-span-6 space-y-7">
            {/* Primary Photo Tile */}
            {leadPhoto && leadPhoto.mediaUrl ? (
              <article className="relative group max-w-md mx-auto md:mx-0">
                <div className="bg-[#FAF9F6] p-1.5 rounded-sm shadow-[7px_7px_0px_rgba(8,7,6,0.9)]">
                  {!failedImages[leadPhoto.itemId] ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxItem({
                          itemId: leadPhoto.itemId,
                          src: leadPhoto.mediaUrl!,
                          title: leadPhoto.title,
                          body: leadPhoto.body,
                        })
                      }
                      aria-label={`Agrandir ${leadPhoto.title}`}
                      className="block w-full aspect-[4/4.4] overflow-hidden bg-stone-200 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      <img
                        src={leadPhoto.mediaUrl}
                        alt={leadPhoto.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [leadPhoto.itemId]: true }))
                        }
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </button>
                  ) : (
                    <div className="w-full aspect-[4/4.4] bg-stone-800 flex flex-col items-center justify-center p-6 text-center text-stone-300">
                      <ImageIcon className="w-7 h-7 mb-2" />
                      <span className="text-xs">{leadPhoto.title}</span>
                    </div>
                  )}

                  <div className="pt-2 px-1.5 pb-1 flex items-center justify-between gap-3 text-stone-800">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{leadPhoto.title}</p>
                      {leadPhoto.body && (
                        <p className="text-[11px] text-stone-500 truncate">{leadPhoto.body}</p>
                      )}
                    </div>
                    {isOwner && (
                      <button
                        type="button"
                        disabled={deletingItemId === leadPhoto.itemId}
                        onClick={() => void handleDeleteWallItem(leadPhoto.itemId)}
                        aria-label={`Supprimer ${leadPhoto.title}`}
                        className="text-stone-400 hover:text-red-700 disabled:opacity-50 p-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ) : isOwner ? (
              <button
                type="button"
                onClick={() => openComposerWithKind('photo')}
                className="w-full max-w-md aspect-[4/3] rounded-xl border border-dashed border-white/30 bg-white/5 hover:bg-white/10 transition-[background-color,transform] duration-150 active:scale-[0.98] flex flex-col items-center justify-center p-6 text-center space-y-2.5"
              >
                <Camera className="w-7 h-7 text-white/80" />
                <span className="font-display text-lg text-white">
                  Ajouter une photo depuis votre téléphone
                </span>
                <span className="text-xs text-stone-300">
                  Elle s’affichera ici sur votre mur collage
                </span>
              </button>
            ) : (
              <div className="w-full max-w-md rounded-xl border border-white/15 bg-white/5 p-6 space-y-2">
                <p className="text-xs uppercase tracking-widest text-stone-300">Carnet visuel</p>
                <p className="font-display text-xl text-white">
                  {memberProfile.bio || `${memberProfile.displayName} prépare ses premières photos.`}
                </p>
              </div>
            )}

            {/* Floating White Music Card Widget */}
            <div className="max-w-md mx-auto md:mx-0">
              {featuredTrack ? (
                <ImmersiveMusicPlayer
                  variant="wall-widget"
                  title={featuredTrack.title}
                  artist={featuredTrack.artist}
                  mediaUrl={featuredTrack.url}
                  kicker={featuredTrack.kicker}
                  isActive={activeTrackId === featuredTrack.id}
                  onTogglePlay={() =>
                    setActiveTrackId((prev) =>
                      prev === featuredTrack.id ? null : featuredTrack.id
                    )
                  }
                  onDelete={isOwner ? () => void handleRemoveFeaturedMusic() : undefined}
                  onChangeTrack={isOwner ? () => openComposerWithKind('music') : undefined}
                />
              ) : isOwner ? (
                <button
                  type="button"
                  onClick={() => openComposerWithKind('music')}
                  className="w-full bg-[#FAF9F6] text-stone-900 rounded-2xl p-4 shadow-[6px_6px_0px_rgba(8,7,6,0.85)] flex items-center gap-3.5 text-left hover:bg-white transition-[background-color,transform] duration-150 active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#1F1E1C] text-white flex items-center justify-center shrink-0">
                    <Music2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900">
                      Choisir ou connecter votre musique préférée
                    </p>
                    <p className="text-xs text-stone-600">
                      Recherchez sur Audius (gratuit), Spotify, Deezer ou SoundCloud
                    </p>
                  </div>
                </button>
              ) : null}
            </div>
          </div>

          {/* Right Collage Column: Minimalist Soundwave Graphic + Circular White-Ringed Portrait */}
          <div className="md:col-span-6 flex flex-col items-center justify-center space-y-10">
            {/* Minimalist Acoustic Soundwave Bars */}
            <button
              type="button"
              onClick={() => {
                if (!featuredTrack) {
                  if (isOwner) openComposerWithKind('music');
                  return;
                }
                setActiveTrackId((prev) =>
                  prev === featuredTrack.id ? null : featuredTrack.id
                );
              }}
              aria-label={
                featuredTrack
                  ? isAnyMusicPlaying
                    ? `Mettre en pause ${activeTrackTitle || featuredTrack.title}`
                    : `Lancer la lecture de ${featuredTrack.title}`
                  : isOwner
                    ? 'Ajouter une musique au mur'
                    : 'Onde sonore du mur'
              }
              className="group flex flex-col items-center space-y-3 py-2 focus-visible:outline-2 focus-visible:outline-white rounded-xl px-4 transition-transform duration-150 active:scale-[0.97]"
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 h-24">
                {HERO_WAVE_BARS.map((height, idx) => (
                  <span
                    key={idx}
                    style={{
                      height: `${height}%`,
                      animationDelay: `${idx * 85}ms`,
                    }}
                    className={`w-1.5 sm:w-2 rounded-full bg-white transition-opacity ${
                      isAnyMusicPlaying
                        ? 'lisiere-wave-bar opacity-100'
                        : 'opacity-90 group-hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-stone-300 tracking-wide">
                {isAnyMusicPlaying && activeTrackTitle
                  ? `En écoute · ${activeTrackTitle}`
                  : featuredTrack
                    ? `Touchez l’onde pour écouter · ${featuredTrack.title}`
                    : isOwner
                      ? 'Ajoutez un morceau pour animer votre onde'
                      : 'Onde sonore en attente'}
              </span>
            </button>

            {/* Circular White-Ringed Portrait with Subtle Organic Accents */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative inline-flex items-center justify-center">
                {/* Subtle dual curved white accent strokes on top-left corner */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 60 60"
                  className="w-12 h-12 absolute -top-2 -left-3 text-white pointer-events-none"
                  fill="none"
                >
                  <path
                    d="M12 40 C13 24, 24 13, 40 12"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M21 43 C22 30, 31 21, 44 20"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>

                {circularPhoto.src && !failedImages['circle-portrait'] ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxItem({
                        itemId: circularPhoto.itemId,
                        src: circularPhoto.src!,
                        title: circularPhoto.alt,
                        body: circularPhoto.body,
                      })
                    }
                    aria-label={`Voir le portrait ${circularPhoto.alt}`}
                    className="w-48 h-48 sm:w-56 sm:h-56 rounded-full ring-[5px] ring-white overflow-hidden shadow-[7px_7px_0px_rgba(8,7,6,0.9)] bg-stone-800 focus-visible:outline-2 focus-visible:outline-white group"
                  >
                    <img
                      src={circularPhoto.src}
                      alt={circularPhoto.alt}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, 'circle-portrait': true }))
                      }
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </button>
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full ring-[5px] ring-white shadow-[7px_7px_0px_rgba(8,7,6,0.9)] bg-[#353330] flex flex-col items-center justify-center text-center p-6">
                    <span className="font-display text-5xl text-white">
                      {memberProfile.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => openComposerWithKind('photo')}
                        className="mt-2 text-xs text-stone-200 underline hover:text-white"
                      >
                        Ajouter un portrait
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isOwner && circularPhoto.src && (
                <button
                  type="button"
                  onClick={() => openComposerWithKind('photo')}
                  className="text-xs text-stone-300 hover:text-white underline inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Ajouter une autre photo</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lower Unified Wall Items: Additional Photos, Music Cards, Notes & Novels */}
        {(remainingCollageItems.length > 0 || memberProfile.favoriteNovel) && (
          <div className="pt-8 border-t border-white/15 space-y-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-xs uppercase tracking-widest text-stone-300">
                Sur ce même mur · Notes, romans & souvenirs épinglés
              </p>
              <span className="text-xs text-stone-400 tabular-nums">
                {wallItems.length} élément{wallItems.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {/* Profile's Favorite Novel pinned right on the wall */}
              {memberProfile.favoriteNovel && (
                <article
                  style={{
                    backgroundColor: TONE_STYLES.ochre.bg,
                    borderColor: TONE_STYLES.ochre.border,
                  }}
                  className="border rounded-xl p-5 space-y-2.5 text-stone-900 shadow-[6px_6px_0px_rgba(8,7,6,0.85)]"
                >
                  <p
                    style={{ color: TONE_STYLES.ochre.accent }}
                    className="text-xs uppercase tracking-widest font-medium"
                  >
                    Roman coup de cœur
                  </p>
                  <h3 className="font-display text-xl font-medium text-stone-900 leading-snug">
                    {memberProfile.favoriteNovel}
                  </h3>
                </article>
              )}

              {remainingCollageItems.map((item) => {
                const tone = TONE_STYLES[item.accentTone] ?? TONE_STYLES.sand;
                const isPlaying = activeTrackId === item.itemId;
                const imgFailed = Boolean(failedImages[item.itemId]);

                if (item.kind === 'music') {
                  return (
                    <div key={item.itemId} className="space-y-2">
                      <ImmersiveMusicPlayer
                        variant="wall-widget"
                        title={item.title}
                        artist={item.subtitle}
                        mediaUrl={item.mediaUrl}
                        kicker={formatFrenchDate(item.createdAt?.toDate() ?? null)}
                        isActive={isPlaying}
                        onTogglePlay={() =>
                          setActiveTrackId((prev) => (prev === item.itemId ? null : item.itemId))
                        }
                        onDelete={
                          isOwner ? () => void handleDeleteWallItem(item.itemId) : undefined
                        }
                        onChangeTrack={
                          isOwner ? () => openComposerWithKind('music') : undefined
                        }
                      />
                      {item.body && (
                        <p className="text-xs text-stone-300 leading-relaxed px-1">{item.body}</p>
                      )}
                    </div>
                  );
                }

                if (item.kind === 'photo' && item.mediaUrl) {
                  return (
                    <article
                      key={item.itemId}
                      className="bg-[#FAF9F6] p-1.5 rounded-sm shadow-[6px_6px_0px_rgba(8,7,6,0.85)] text-stone-900"
                    >
                      {!imgFailed ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxItem({
                              itemId: item.itemId,
                              src: item.mediaUrl!,
                              title: item.title,
                              body: item.body,
                            })
                          }
                          aria-label={`Agrandir ${item.title}`}
                          className="block w-full aspect-[4/3] bg-stone-200 overflow-hidden"
                        >
                          <img
                            src={item.mediaUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImages((prev) => ({ ...prev, [item.itemId]: true }))
                            }
                            className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                          />
                        </button>
                      ) : (
                        <div className="aspect-[4/3] bg-stone-800 text-stone-300 flex flex-col items-center justify-center p-4 text-center">
                          <ImageIcon className="w-6 h-6 mb-1.5" />
                          <span className="text-xs">{item.title}</span>
                        </div>
                      )}

                      <div className="pt-2 px-1.5 pb-1 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-stone-900 truncate">
                            {item.title}
                          </p>
                          {item.body && (
                            <p className="text-[11px] text-stone-600 line-clamp-2 mt-0.5">
                              {item.body}
                            </p>
                          )}
                        </div>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={deletingItemId === item.itemId}
                            onClick={() => void handleDeleteWallItem(item.itemId)}
                            aria-label={`Supprimer ${item.title}`}
                            className="text-stone-400 hover:text-red-700 disabled:opacity-50 p-0.5 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                }

                // Note or Novel card directly pinned on the dark collage board
                return (
                  <article
                    key={item.itemId}
                    style={{
                      backgroundColor: tone.bg,
                      borderColor: tone.border,
                    }}
                    className="border rounded-xl p-5 space-y-3 text-stone-900 shadow-[6px_6px_0px_rgba(8,7,6,0.85)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                      <span
                        style={{ color: tone.accent }}
                        className="uppercase tracking-widest font-medium"
                      >
                        {item.kind === 'novel' ? 'Roman' : 'Note'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{formatFrenchDate(item.createdAt?.toDate() ?? null)}</span>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={deletingItemId === item.itemId}
                            onClick={() => void handleDeleteWallItem(item.itemId)}
                            aria-label={`Supprimer ${item.title}`}
                            className="text-stone-400 hover:text-red-700 disabled:opacity-50 p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-display text-xl font-medium text-stone-900 leading-snug">
                        {item.title}
                      </h3>
                      {item.subtitle && (
                        <p className="text-xs text-stone-600 mt-1">{item.subtitle}</p>
                      )}
                    </div>

                    {item.body && (
                      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                        {item.body}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {wallItems.length === 0 && !memberProfile.favoriteNovel && !featuredTrack && (
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-300">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-stone-400 shrink-0" />
              <span>
                {isOwner
                  ? 'Composez votre mur directement avec une photo, une musique, une note ou un roman.'
                  : 'Ce mur attend encore ses premières photos, notes et musiques.'}
              </span>
            </div>

            {isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openComposerWithKind('note')}
                  className="min-h-[34px] px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-1.5"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>Écrire une note</span>
                </button>
                <button
                  type="button"
                  onClick={() => openComposerWithKind('novel')}
                  className="min-h-[34px] px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white inline-flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Partager un roman</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {/* Author's Published Stories & Novels */}
      {profileSection === 'stories' && (
        <section
          aria-label="Textes publiés par ce membre"
          className="space-y-5"
        >
          <h2 className="font-display text-2xl font-medium text-stone-900">
            Récits et romans de {memberProfile.displayName}
          </h2>
          {publicStories.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-sm text-stone-600">
              {isOwner
                ? 'Vous n’avez pas encore publié de récit public.'
                : `${memberProfile.displayName} n’a pas encore publié de récit public.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {publicStories.map((story) => {
                const salonInfo = THEME_MAP[story.theme];
                const formatLabel =
                  STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label ?? 'Confession';
                return (
                  <article
                    key={story.storyId}
                    className="bg-white border border-stone-200 rounded-lg p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span
                          style={{
                            color:
                              story.storyScope === 'pelemele' && !story.customSalonId
                                ? '#1B365D'
                                : salonInfo?.palette.textAccent,
                          }}
                          className="font-medium"
                        >
                          {story.customSalonName ||
                            (story.storyScope === 'pelemele' && !story.customSalonId
                              ? 'Hors salon · Pêle-mêle'
                              : salonInfo?.salonName)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatLabel}</span>
                        {story.storyFormat === 'roman' && story.novelGenre && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{NOVEL_GENRE_LABELS[story.novelGenre]}</span>
                          </>
                        )}
                        {story.storyFormat === 'roman' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {story.chapterCount ?? 1} chap. ·{' '}
                              {SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']}
                            </span>
                          </>
                        )}
                        {isOwner && story.isAnonymous && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-stone-700 font-medium">
                              <EyeOff className="w-3 h-3" />
                              <span>Anonyme (masqué aux visiteurs)</span>
                            </span>
                          </>
                        )}
                      </div>
                      {story.storyFormat === 'roman' && story.coverUrl ? (
                        <div className="flex items-start gap-4">
                          <NovelCoverArt
                            coverUrl={story.coverUrl}
                            title={story.title}
                            genre={story.novelGenre}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <h3 className="font-display text-xl font-medium text-stone-900">
                              {story.title}
                            </h3>
                            <p className="text-sm text-stone-600 leading-relaxed">
                              {story.excerpt}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-display text-xl font-medium text-stone-900">
                            {story.title}
                          </h3>
                          <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>
                        </>
                      )}
                    </div>

                    <div className="pt-3 border-t border-stone-100 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-stone-500 tabular-nums">
                          {story.echoCount} commentaire{story.echoCount > 1 ? 's' : ''}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {isOwner && story.isAnonymous && confirmClaimStoryId !== story.storyId && (
                            <button
                              type="button"
                              onClick={() => {
                                setClaimStoryError(null);
                                setConfirmClaimStoryId(story.storyId);
                              }}
                              className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded hover:bg-[#E7EEF7] inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Revendiquer</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onReadStory(story)}
                            className="min-h-[36px] px-3 py-1 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap"
                          >
                            Lire et commenter
                          </button>
                        </div>
                      </div>

                      {isOwner && story.isAnonymous && confirmClaimStoryId === story.storyId && (
                        <div className="rounded border border-[#CBD6E6] bg-[#F3F6FA] p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-stone-800">
                            Publier ce récit sous votre nom ({memberProfile.displayName}) ?
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={claimingStoryId === story.storyId}
                              onClick={async () => {
                                if (!user) return;
                                setClaimStoryError(null);
                                setClaimingStoryId(story.storyId);
                                try {
                                  await claimAnonymousStory(
                                    story.storyId,
                                    memberProfile?.displayName ||
                                      myProfile?.displayName ||
                                      user.displayName ||
                                      'Auteur'
                                  );
                                  setConfirmClaimStoryId(null);
                                } catch (err) {
                                  setClaimStoryError(
                                    formatFriendlyFirestoreError(
                                      err,
                                      'Impossible de revendiquer cet écrit.'
                                    )
                                  );
                                } finally {
                                  setClaimingStoryId(null);
                                }
                              }}
                              className="min-h-[32px] px-2.5 py-1 rounded bg-[#1B365D] text-white font-medium hover:bg-[#132744] disabled:opacity-50 whitespace-nowrap"
                            >
                              {claimingStoryId === story.storyId ? 'En cours…' : 'Confirmer'}
                            </button>
                            <button
                              type="button"
                              disabled={claimingStoryId === story.storyId}
                              onClick={() => {
                                setConfirmClaimStoryId(null);
                                setClaimStoryError(null);
                              }}
                              className="min-h-[32px] px-2.5 py-1 rounded border border-stone-300 bg-white text-stone-700 hover:border-stone-500 whitespace-nowrap"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}

                      {claimStoryError && confirmClaimStoryId === story.storyId && (
                        <p role="alert" className="text-xs text-red-700">
                          {claimStoryError}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Member's Reposted Stories (respects public / private profile visibility) */}
      {profileSection === 'reposts' && (
        <section
          aria-label="Histoires repartagées"
          className="space-y-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-medium text-stone-900 inline-flex items-center gap-2">
                <Repeat2 className="w-5 h-5 text-[#1B365D]" />
                <span>Histoires repartagées</span>
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                {isOwner
                  ? 'Vos repartages publics apparaissent sur votre mur ; vos repartages privés restent visibles uniquement pour vous.'
                  : `Récits partagés publiquement par ${memberProfile.displayName} sur son mur.`}
              </p>
            </div>
            <span className="text-xs text-stone-500 tabular-nums">
              {reposts.length} histoire{reposts.length > 1 ? 's' : ''}
            </span>
          </div>

          {reposts.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-sm text-stone-600">
              {isOwner
                ? 'Vous n’avez pas encore repartagé d’histoire.'
                : `${memberProfile.displayName} n’a pas encore repartagé d’histoire publiquement.`}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {reposts.map((repost) => {
              const salonInfo = THEME_MAP[repost.storyTheme];
              const formatLabel =
                STORY_FORMAT_LABELS[repost.storyFormat ?? 'confession']?.label ?? 'Confession';
              const isPrivate = repost.visibility === 'private';
              const isBusy = repostBusyId === repost.storyId;

              return (
                <article
                  key={repost.repostId}
                  className="bg-white border border-stone-200 rounded-lg p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          style={{
                            color:
                              repost.storyScope === 'pelemele' && !repost.customSalonId
                                ? '#1B365D'
                                : salonInfo?.palette.textAccent,
                          }}
                          className="font-medium"
                        >
                          {repost.customSalonName ||
                            (repost.storyScope === 'pelemele' && !repost.customSalonId
                              ? 'Hors salon · Pêle-mêle'
                              : salonInfo?.salonName)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>Par {repost.storyAuthorName}</span>
                      </div>

                      {isOwner && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${
                            isPrivate
                              ? 'border-stone-300 bg-stone-100 text-stone-700'
                              : 'border-[#CBD6E6] bg-[#F3F6FA] text-[#1B365D]'
                          }`}
                        >
                          {isPrivate ? (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Privé</span>
                            </>
                          ) : (
                            <>
                              <Globe className="w-3 h-3" />
                              <span>Public</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {repost.note && (
                      <p className="text-xs text-stone-700 italic bg-[#FBF9F5] border-l-2 border-[#1B365D] pl-3 py-1.5 rounded-r">
                        « {repost.note} »
                      </p>
                    )}

                    <h3 className="font-display text-xl font-medium text-stone-900">
                      {repost.storyTitle}
                    </h3>
                    <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                      {repost.storyExcerpt}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleToggleRepostVisibility(repost)}
                            className="min-h-[32px] px-2.5 py-1 text-[11px] font-medium text-stone-700 bg-[#FBF9F5] border border-stone-200 rounded hover:border-stone-400 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            {isPrivate ? (
                              <>
                                <Eye className="w-3 h-3" />
                                <span>Rendre public</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Passer en privé</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteRepost(repost.storyId)}
                            aria-label={`Retirer le repartage de ${repost.storyTitle}`}
                            className="min-h-[32px] px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 rounded inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Retirer</span>
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const match = memberStories.find((s) => s.storyId === repost.storyId);
                        if (match) {
                          onReadStory(match);
                        } else if (onOpenStoryById) {
                          onOpenStoryById(repost.storyId);
                        }
                      }}
                      className="min-h-[34px] px-3 py-1 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap ml-auto"
                    >
                      Lire l’histoire
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          )}
        </section>
      )}

      {/* Owner's Unified Wall Composer Modal (always visible front-and-center) */}
      {isOwner && composerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ajouter une carte à votre mur"
          onClick={() => {
            if (!savingItem) setComposerOpen(false);
          }}
          className="fixed inset-0 z-50 bg-stone-950/65 p-4 sm:p-6 flex items-center justify-center overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white border border-stone-300 rounded-xl p-6 sm:p-7 space-y-5 shadow-xl my-auto"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
              <div>
                <h2 className="font-display text-2xl font-medium text-stone-900">
                  Ajouter sur votre mur
                </h2>
                <p className="text-xs text-stone-600 mt-0.5">
                  Photos depuis le téléphone, musique avec lecteur immersif, romans ou notes.
                </p>
              </div>

              <button
                type="button"
                disabled={savingItem}
                onClick={() => setComposerOpen(false)}
                aria-label="Fermer le formulaire"
                className="self-start sm:self-auto min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-md inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fermer</span>
              </button>
            </div>

            {/* Kind switcher tabs inside modal */}
            <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-md w-fit">
              {(
                [
                  { id: 'photo', label: 'Photo', icon: Camera },
                  { id: 'music', label: 'Musique', icon: Music2 },
                  { id: 'note', label: 'Note', icon: Feather },
                  { id: 'novel', label: 'Roman', icon: BookOpen },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setKind(opt.id);
                      setItemError(null);
                      setMediaUrl('');
                    }}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleCreateWallItem} className="space-y-5">
              {kind === 'photo' && (
                <div className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-stone-800">
                        Photo depuis votre téléphone ou ordinateur
                      </p>
                      <p className="text-xs text-stone-500">
                        Optimisée automatiquement sans aucune configuration externe.
                      </p>
                    </div>
                    <label className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{photoBusy ? 'Préparation…' : 'Choisir une photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {mediaUrl && (
                    <div className="pt-2">
                      <img
                        src={mediaUrl}
                        alt="Aperçu de votre photo"
                        referrerPolicy="no-referrer"
                        className="max-h-56 rounded-md border border-stone-200 object-cover"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="wall-photo-url" className="block text-xs text-stone-600 mb-1">
                      Ou coller un lien d’image directe (facultatif)
                    </label>
                    <input
                      id="wall-photo-url"
                      type="text"
                      value={mediaUrl.startsWith('data:') ? '' : mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder="https://…"
                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </div>
              )}

              {kind === 'music' && (
                <div className="p-4 bg-[#FBF9F5] border border-stone-200 rounded-lg space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-stone-900">
                      Rechercher un titre ou connecter votre service musical
                    </p>
                    <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                      Choisissez un morceau sur <strong>Audius</strong> (gratuit, morceaux complets),{' '}
                      <strong>Spotify</strong>, <strong>Deezer</strong> ou via un lien. Il jouera directement sur votre mur et dans le mode zen.
                    </p>
                  </div>

                  <MusicCatalogPicker
                    selectedUrl={mediaUrl}
                    selectedTitle={title}
                    maxUrlLength={FIELD_LIMITS.favoriteTrackUrl.max}
                    onSelectTrack={(picked) => {
                      setTitle(picked.title);
                      setSubtitle(picked.artist);
                      setMediaUrl(picked.mediaUrl);
                      setItemError(null);
                    }}
                    onManualUrlChange={(url) => setMediaUrl(url)}
                  />

                  <label className="flex items-center gap-2 text-xs text-stone-700 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setAsFavoriteMusic}
                      onChange={(e) => setSetAsFavoriteMusic(e.target.checked)}
                      className="rounded border-stone-300 text-[#1B365D] focus:ring-[#1B365D]"
                    />
                    <span>Afficher ce titre comme musique principale dans le lecteur du mur</span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="wall-title" className="block text-xs font-medium text-stone-700 mb-1">
                    {kind === 'music'
                      ? 'Titre de la musique'
                      : kind === 'novel'
                        ? 'Titre du roman'
                        : kind === 'photo'
                          ? 'Légende ou moment'
                          : 'Titre de la note'}
                  </label>
                  <input
                    id="wall-title"
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.wallTitle.max}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      kind === 'music'
                        ? 'Ex. Can’t Help Falling in Love…'
                        : kind === 'novel'
                          ? 'Ex. L’Étranger, Les Yeux jaunes…'
                          : 'Un titre court…'
                    }
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="wall-subtitle"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    {kind === 'music'
                      ? 'Artiste ou interprète'
                      : kind === 'novel'
                        ? 'Auteur du roman'
                        : 'Lieu, ambiance ou sous-titre (facultatif)'}
                  </label>
                  <input
                    id="wall-subtitle"
                    type="text"
                    maxLength={FIELD_LIMITS.wallSubtitle.max}
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder={
                      kind === 'music'
                        ? 'Ex. Elvis Presley, Pomme…'
                        : kind === 'novel'
                          ? 'Ex. Albert Camus…'
                          : 'Facultatif'
                    }
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="wall-body" className="block text-xs font-medium text-stone-700 mb-1">
                  {kind === 'note'
                    ? 'Votre note ou pensée'
                    : 'Pourquoi cela compte pour vous (facultatif)'}
                </label>
                <textarea
                  id="wall-body"
                  rows={3}
                  maxLength={FIELD_LIMITS.wallBody.max}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Un souvenir lié à cette photo, ce morceau, ce roman ou une pensée du jour…"
                  className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              {(kind === 'note' || kind === 'novel') && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-stone-600">Papier de la note :</span>
                  {(Object.keys(TONE_STYLES) as WallAccentTone[]).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setAccentTone(tone)}
                      style={{
                        backgroundColor: TONE_STYLES[tone].bg,
                        borderColor:
                          accentTone === tone ? TONE_STYLES[tone].accent : TONE_STYLES[tone].border,
                        color: TONE_STYLES[tone].accent,
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded border ${
                        accentTone === tone ? 'ring-1 ring-offset-1 ring-stone-700' : ''
                      }`}
                    >
                      {TONE_STYLES[tone].label}
                    </button>
                  ))}
                </div>
              )}

              {itemError && (
                <p role="alert" className="text-xs text-red-700">
                  {itemError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={savingItem}
                  onClick={() => setComposerOpen(false)}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 hover:text-stone-900"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingItem || photoBusy}
                  className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 whitespace-nowrap"
                >
                  {savingItem ? 'Publication…' : 'Épingler sur mon mur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Owner's Profile Photo (Avatar) Modal */}
      {isOwner && avatarModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Modifier votre photo de profil"
          onClick={() => {
            if (!savingAvatar) setAvatarModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-stone-950/65 p-4 sm:p-6 flex items-center justify-center overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-stone-300 rounded-xl p-6 space-y-5 shadow-xl my-auto"
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-stone-200">
              <div>
                <h2 className="font-display text-2xl font-medium text-stone-900">
                  Photo de profil
                </h2>
                <p className="text-xs text-stone-600 mt-0.5">
                  Visible sur votre mur, votre portrait et dans l’annuaire des membres.
                </p>
              </div>

              <button
                type="button"
                disabled={savingAvatar}
                onClick={() => setAvatarModalOpen(false)}
                aria-label="Fermer"
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-md inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fermer</span>
              </button>
            </div>

            <form onSubmit={handleSaveAvatar} className="space-y-5">
              <div className="flex flex-col items-center gap-4 py-2">
                {avatarDraftUrl && !avatarDraftFailed ? (
                  <img
                    src={avatarDraftUrl}
                    alt="Aperçu de votre photo de profil"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarDraftFailed(true)}
                    className="w-28 h-28 rounded-full object-cover ring-4 ring-stone-100 border border-stone-200"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-[#F3F6FA] border border-[#CBD6E6] flex items-center justify-center text-[#1B365D] font-display text-4xl">
                    {memberProfile.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <label className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{avatarBusy ? 'Préparation…' : 'Choisir depuis l’appareil'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarSelect}
                      className="sr-only"
                    />
                  </label>

                  {avatarDraftUrl && (
                    <button
                      type="button"
                      disabled={savingAvatar}
                      onClick={() => {
                        setAvatarDraftUrl('');
                        setAvatarDraftFailed(false);
                      }}
                      className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 whitespace-nowrap"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="wall-avatar-url" className="block text-xs text-stone-600 mb-1">
                  Ou coller un lien d’image directe (facultatif)
                </label>
                <input
                  id="wall-avatar-url"
                  type="text"
                  value={avatarDraftUrl.startsWith('data:') ? '' : avatarDraftUrl}
                  onChange={(e) => {
                    setAvatarDraftUrl(e.target.value);
                    setAvatarDraftFailed(false);
                  }}
                  placeholder="https://…"
                  className="w-full px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              {avatarError && (
                <p role="alert" className="text-xs text-red-700">
                  {avatarError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={savingAvatar}
                  onClick={() => setAvatarModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 hover:text-stone-900"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingAvatar || avatarBusy}
                  className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 whitespace-nowrap"
                >
                  {savingAvatar ? 'Enregistrement…' : 'Enregistrer la photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      {lightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-50 bg-stone-950/85 p-4 sm:p-8 flex items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-[#FAF9F6] rounded-xl p-3 sm:p-4 space-y-3 shadow-xl"
          >
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              aria-label="Fermer la photo"
              className="absolute top-5 right-5 z-10 w-9 h-9 rounded-full bg-stone-900/80 text-white hover:bg-stone-900 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <img
              src={lightboxItem.src}
              alt={lightboxItem.title}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-lg bg-stone-900"
            />

            <div className="px-1 flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-medium text-stone-900">
                  {lightboxItem.title}
                </p>
                {lightboxItem.body && (
                  <p className="text-sm text-stone-600 mt-1">{lightboxItem.body}</p>
                )}
              </div>

              {isOwner && lightboxItem.itemId && (
                <button
                  type="button"
                  disabled={deletingItemId === lightboxItem.itemId}
                  onClick={() => void handleDeleteWallItem(lightboxItem.itemId!)}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
