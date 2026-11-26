import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  Music2,
  Search,
  Settings,
  Star,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getProfileBadges,
  MEMBER_BADGE_DEFINITIONS,
  profileMatchesBadgeQuery,
} from '../lib/memberBadges';
import { isModerationAdminEmail } from '../lib/moderationLabels';
import { toggleFavoriteAuthor } from '../lib/storyService';
import { STORY_THEMES, THEME_MAP } from '../lib/themes';
import {
  Exchange,
  MemberBadgeId,
  PredefinedSalonModerator,
  PublicProfile,
  Story,
  StoryRepost,
  StoryThemeId,
  UserRelationship,
} from '../types/story';
import { ProfileSettingsPanel } from './ProfileSettingsPanel';
import { ProfileWallView } from './ProfileWallView';
import type { ReportDraft } from './ReportModal';
import { ProfileBadgeChip, RoleBadgesRow } from './RoleBadge';

export type ProfilesPageTab = 'directory' | 'my-profile' | 'edit-profile';

interface MembersDirectoryViewProps {
  profiles: PublicProfile[];
  profilesLoaded: boolean;
  selectedMemberId: string | null;
  initialSubTab?: ProfilesPageTab;
  publicStories: Story[];
  myStories?: Story[];
  myReposts?: StoryRepost[];
  existingExchanges: Exchange[];
  relationships?: UserRelationship[];
  adminUserIds?: Set<string>;
  predefinedSalonModerators?: Record<StoryThemeId, PredefinedSalonModerator[]>;
  onSelectMember: (userId: string | null) => void;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onShareStory?: (story: Story) => void;
  onOpenExchange: (exchangeId: string) => void;
  onStartDirectChat: (member: PublicProfile) => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

export function MembersDirectoryView({
  profiles,
  profilesLoaded,
  selectedMemberId,
  initialSubTab = 'directory',
  publicStories,
  myStories = [],
  myReposts = [],
  existingExchanges,
  relationships = [],
  adminUserIds,
  predefinedSalonModerators,
  onSelectMember,
  onReadStory,
  onOpenStoryById,
  onShareStory,
  onOpenExchange,
  onStartDirectChat,
  onOpenReport,
}: MembersDirectoryViewProps) {
  const { user, favoriteAuthors, signInWithGoogle } = useAuth();
  const [subTab, setSubTab] = useState<ProfilesPageTab>(initialSubTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [badgeFilter, setBadgeFilter] = useState<'all' | MemberBadgeId>('all');
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});
  const [favBusyId, setFavBusyId] = useState<string | null>(null);

  const favoriteAuthorIdSet = useMemo(
    () => new Set(favoriteAuthors.map((a) => a.authorId)),
    [favoriteAuthors]
  );

  const handleToggleFavorite = async (member: PublicProfile) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (user.uid === member.userId || favBusyId) return;
    setFavBusyId(member.userId);
    try {
      await toggleFavoriteAuthor(user.uid, member.userId, member.displayName);
    } catch (err) {
      console.error('Erreur auteur favori:', err);
    } finally {
      setFavBusyId(null);
    }
  };

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const storyCountByAuthor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of publicStories) {
      if (s.isAnonymous) continue;
      map[s.authorId] = (map[s.authorId] || 0) + 1;
    }
    return map;
  }, [publicStories]);

  const hiddenMemberIds = useMemo(
    () => new Set(relationships.map((r) => r.targetUserId)),
    [relationships]
  );

  const visibleProfiles = useMemo(
    () => profiles.filter((p) => p.userId === user?.uid || !hiddenMemberIds.has(p.userId)),
    [profiles, hiddenMemberIds, user?.uid]
  );

  const moderatedSalonsByUser = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!predefinedSalonModerators) return map;
    for (const theme of STORY_THEMES) {
      const mods = predefinedSalonModerators[theme.id] ?? [];
      for (const mod of mods) {
        if (!map[mod.userId]) map[mod.userId] = [];
        map[mod.userId].push(THEME_MAP[theme.id]?.shortSalonName ?? theme.shortSalonName);
      }
    }
    return map;
  }, [predefinedSalonModerators]);

  const memberHasBadge = (member: PublicProfile, targetBadge: MemberBadgeId): boolean => {
    const badges = getProfileBadges(member);
    if (badges.includes(targetBadge)) return true;
    if (
      targetBadge === 'administrateur' &&
      (member.isAdmin ||
        adminUserIds?.has(member.userId) ||
        (member.userId === user?.uid && isModerationAdminEmail(user?.email)))
    ) {
      return true;
    }
    if (
      targetBadge === 'moderateur' &&
      (moderatedSalonsByUser[member.userId]?.length ?? 0) > 0
    ) {
      return true;
    }
    return false;
  };

  const availableBadgeFilters = useMemo(
    () =>
      MEMBER_BADGE_DEFINITIONS.filter((def) =>
        visibleProfiles.some((member) => memberHasBadge(member, def.id))
      ),
    [visibleProfiles, adminUserIds, moderatedSalonsByUser, user?.uid, user?.email]
  );

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleProfiles.filter((p) => {
      if (badgeFilter !== 'all' && !memberHasBadge(p, badgeFilter)) return false;
      if (!q) return true;
      const extraRoles = [
        ...(adminUserIds?.has(p.userId) ? ['Administrateur'] : []),
        ...((moderatedSalonsByUser[p.userId]?.length ?? 0) > 0 ? ['Modérateur'] : []),
      ];
      return (
        p.displayName.toLowerCase().includes(q) ||
        (p.bio || '').toLowerCase().includes(q) ||
        (p.favoriteTrackTitle || '').toLowerCase().includes(q) ||
        (p.favoriteNovel || '').toLowerCase().includes(q) ||
        (p.interests || '').toLowerCase().includes(q) ||
        profileMatchesBadgeQuery(p, q, extraRoles)
      );
    });
  }, [
    visibleProfiles,
    searchQuery,
    badgeFilter,
    adminUserIds,
    moderatedSalonsByUser,
    user?.uid,
    user?.email,
  ]);

  if (selectedMemberId) {
    const isOwnSelected = Boolean(user && user.uid === selectedMemberId);
    const memberStories = isOwnSelected
      ? myStories
      : publicStories.filter((s) => s.authorId === selectedMemberId && !s.isAnonymous);

    return (
      <ProfileWallView
        memberId={selectedMemberId}
        memberStories={memberStories}
        existingExchanges={existingExchanges}
        relationships={relationships}
        adminUserIds={adminUserIds}
        moderatedSalonNames={moderatedSalonsByUser[selectedMemberId] ?? []}
        onBack={() => {
          setSubTab('directory');
          onSelectMember(null);
        }}
        onEditProfile={
          isOwnSelected
            ? () => {
                onSelectMember(null);
                setSubTab('edit-profile');
              }
            : undefined
        }
        onReadStory={onReadStory}
        onOpenStoryById={onOpenStoryById}
        onShareStory={onShareStory}
        onOpenExchange={onOpenExchange}
        onOpenReport={onOpenReport}
      />
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-3">
            Profils · Murs & affinités
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100 mb-3">
            Découvrir les profils par leurs musiques, photos et lectures
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed mb-6">
            Chaque membre dispose d’une page de profil dédiée où partager ses photos, sa musique préférée, ses romans et ses histoires repartagées. Connectez-vous pour visiter les profils ou composer le vôtre.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744] dark:hover:bg-amber-500 transition-colors whitespace-nowrap"
          >
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 sm:py-10 space-y-8">
      {/* Dedicated Profiles Page Header + Clean Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-stone-200 dark:border-stone-800">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
            Espace Profils · Communauté & mur personnel
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium text-stone-900 dark:text-stone-100">
            {subTab === 'my-profile'
              ? 'Mon profil'
              : subTab === 'edit-profile'
                ? 'Paramètres du profil'
                : 'Profils de la communauté'}
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            {subTab === 'my-profile'
              ? 'Votre page personnelle avec vos photos, votre musique, vos récits et vos repartages.'
              : subTab === 'edit-profile'
                ? 'Modifiez votre présentation, choisissez votre musique sur Audius, Spotify ou Deezer, et réglez la confidentialité.'
                : 'Parcourez les profils publics, écoutez leurs musiques favorites ou ouvrez une discussion privée.'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Navigation de l’espace profils"
          className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 border border-transparent dark:border-stone-800 rounded-lg w-fit shrink-0"
        >
          {(
            [
              { id: 'directory', label: 'Tous les profils', icon: Users },
              { id: 'my-profile', label: 'Mon profil', icon: UserIcon },
              { id: 'edit-profile', label: 'Modifier mon profil', icon: Settings },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(tab.id)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Community Profiles Directory */}
      {subTab === 'directory' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                {filteredProfiles.length} profil{filteredProfiles.length > 1 ? 's' : ''} public
                {filteredProfiles.length > 1 ? 's' : ''}
              </p>
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chercher un nom, badge, musique, livre…"
                  aria-label="Rechercher un profil"
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
                />
              </div>
            </div>

            {availableBadgeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBadgeFilter('all')}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                    badgeFilter === 'all'
                      ? 'bg-[#1B365D] dark:bg-amber-600 text-white border-[#1B365D] dark:border-amber-600'
                      : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                  }`}
                >
                  Tous les membres
                </button>
                {availableBadgeFilters.map((def) => {
                  const active = badgeFilter === def.id;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setBadgeFilter(active ? 'all' : def.id)}
                      aria-pressed={active}
                      className={`min-h-[30px] px-2 py-1 rounded-md border transition-colors inline-flex items-center gap-1 ${
                        active
                          ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 ring-1 ring-[#1B365D]/30 dark:ring-amber-400/30'
                          : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-stone-400'
                      }`}
                    >
                      <ProfileBadgeChip badgeId={def.id} compact />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!profilesLoaded ? (
            <div className="py-12 text-center text-sm text-stone-500 dark:text-stone-400">
              Chargement des profils de la communauté…
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-10 text-center space-y-3">
              <Users className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="font-display text-xl text-stone-900 dark:text-stone-100">
                Aucun profil ne correspond à cette recherche
              </p>
              {(searchQuery || badgeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setBadgeFilter('all');
                  }}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500"
                >
                  Afficher tous les profils
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProfiles.map((member) => {
                const isMe = member.userId === user.uid;
                const storiesCount = storyCountByAuthor[member.userId] || 0;
                return (
                  <article
                    key={member.userId}
                    className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 flex flex-col justify-between space-y-5"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {member.avatarUrl && !failedAvatars[member.userId] ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.displayName}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedAvatars((prev) => ({ ...prev, [member.userId]: true }))
                              }
                              className="w-11 h-11 rounded-full object-cover border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-[#F3F6FA] border border-[#CBD6E6] flex items-center justify-center text-[#1B365D] font-display text-lg shrink-0">
                              {member.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h2 className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 truncate">
                                {member.displayName}
                              </h2>
                              <RoleBadgesRow
                                isAdmin={Boolean(
                                  member.isAdmin ||
                                    adminUserIds?.has(member.userId) ||
                                    (isMe && isModerationAdminEmail(user?.email))
                                )}
                                isModerator={(moderatedSalonsByUser[member.userId]?.length ?? 0) > 0}
                                profileBadges={member.badges}
                                compact
                              />
                            </div>
                            <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                              {isMe ? 'Votre profil' : 'Profil public'} · {storiesCount} récit
                              {storiesCount > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {member.bio ? (
                        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed line-clamp-3">
                          {member.bio}
                        </p>
                      ) : (
                        <p className="text-sm text-stone-400 dark:text-stone-500 italic">
                          Présentation en cours d’écriture.
                        </p>
                      )}

                      {(member.favoriteTrackTitle || member.favoriteNovel) && (
                        <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300">
                          {member.favoriteTrackTitle && (
                            <p className="flex items-center gap-1.5 truncate">
                              <Music2 className="w-3.5 h-3.5 text-[#1B365D] dark:text-amber-300 shrink-0" />
                              <span className="truncate">
                                {member.favoriteTrackTitle}
                                {member.favoriteTrackArtist
                                  ? ` — ${member.favoriteTrackArtist}`
                                  : ''}
                              </span>
                            </p>
                          )}
                          {member.favoriteNovel && (
                            <p className="flex items-center gap-1.5 truncate">
                              <BookOpen className="w-3.5 h-3.5 text-[#8C4D0E] dark:text-amber-400 shrink-0" />
                              <span className="truncate">{member.favoriteNovel}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          isMe ? setSubTab('my-profile') : onSelectMember(member.userId)
                        }
                        className="min-h-[38px] text-xs font-medium text-[#1B365D] dark:text-amber-300 hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span>{isMe ? 'Ouvrir mon profil' : 'Voir le profil'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {!isMe && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={favBusyId === member.userId}
                            onClick={() => void handleToggleFavorite(member)}
                            aria-pressed={favoriteAuthorIdSet.has(member.userId)}
                            title={
                              favoriteAuthorIdSet.has(member.userId)
                                ? 'Retirer des auteurs favoris'
                                : 'Suivre dans Pour vous'
                            }
                            className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                              favoriteAuthorIdSet.has(member.userId)
                                ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                : 'border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 text-stone-700 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D]'
                            } disabled:opacity-50`}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                favoriteAuthorIdSet.has(member.userId) ? 'fill-current' : ''
                              }`}
                            />
                            <span>
                              {favoriteAuthorIdSet.has(member.userId) ? 'Suivi' : 'Suivre'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onStartDirectChat(member)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md hover:border-[#1B365D] dark:hover:border-amber-400 hover:text-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Écrire</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Own Standalone Profile Wall */}
      {subTab === 'my-profile' && (
        <ProfileWallView
          memberId={user.uid}
          memberStories={myStories}
          existingExchanges={existingExchanges}
          adminUserIds={adminUserIds}
          moderatedSalonNames={moderatedSalonsByUser[user.uid] ?? []}
          onEditProfile={() => setSubTab('edit-profile')}
          onReadStory={onReadStory}
          onOpenStoryById={onOpenStoryById}
          onShareStory={onShareStory}
          onOpenExchange={onOpenExchange}
          embedded
        />
      )}

      {/* Tab 3: Edit My Profile & Privacy */}
      {subTab === 'edit-profile' && (
        <ProfileSettingsPanel reposts={myReposts} />
      )}
    </div>
  );
}

