import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  Music2,
  Search,
  Settings,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Exchange, PublicProfile, Story, StoryRepost } from '../types/story';
import { ProfileSettingsPanel } from './ProfileSettingsPanel';
import { ProfileWallView } from './ProfileWallView';

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
  onSelectMember: (userId: string | null) => void;
  onReadStory: (story: Story) => void;
  onOpenStoryById?: (storyId: string) => void;
  onOpenExchange: (exchangeId: string) => void;
  onStartDirectChat: (member: PublicProfile) => void;
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
  onSelectMember,
  onReadStory,
  onOpenStoryById,
  onOpenExchange,
  onStartDirectChat,
}: MembersDirectoryViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [subTab, setSubTab] = useState<ProfilesPageTab>(initialSubTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

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

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        (p.bio || '').toLowerCase().includes(q) ||
        (p.favoriteTrackTitle || '').toLowerCase().includes(q) ||
        (p.favoriteNovel || '').toLowerCase().includes(q) ||
        (p.interests || '').toLowerCase().includes(q)
    );
  }, [profiles, searchQuery]);

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
        onOpenExchange={onOpenExchange}
      />
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Profils · Murs & affinités
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Découvrir les profils par leurs musiques, photos et lectures
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Chaque membre dispose d’une page de profil dédiée où partager ses photos, sa musique préférée, ses romans et ses histoires repartagées. Connectez-vous pour visiter les profils ou composer le vôtre.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors whitespace-nowrap"
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
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-stone-200">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-stone-500">
            Espace Profils · Communauté & mur personnel
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium text-stone-900">
            {subTab === 'my-profile'
              ? 'Mon profil'
              : subTab === 'edit-profile'
                ? 'Paramètres du profil'
                : 'Profils de la communauté'}
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
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
          className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-lg w-fit shrink-0"
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
      </div>

      {/* Tab 1: Community Profiles Directory */}
      {subTab === 'directory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-stone-500 tabular-nums">
              {filteredProfiles.length} profil{filteredProfiles.length > 1 ? 's' : ''} public
              {filteredProfiles.length > 1 ? 's' : ''}
            </p>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Chercher un prénom, une musique, un livre…"
                aria-label="Rechercher un profil"
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
              />
            </div>
          </div>

          {!profilesLoaded ? (
            <div className="py-12 text-center text-sm text-stone-500">
              Chargement des profils de la communauté…
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-3">
              <Users className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="font-display text-xl text-stone-900">
                Aucun profil ne correspond à cette recherche
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
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
                    className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
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
                          <div className="min-w-0">
                            <h2 className="font-display text-xl font-medium text-stone-900 truncate">
                              {member.displayName}
                            </h2>
                            <p className="text-xs text-stone-500 tabular-nums">
                              {isMe ? 'Votre profil' : 'Profil public'} · {storiesCount} récit
                              {storiesCount > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {member.bio ? (
                        <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                          {member.bio}
                        </p>
                      ) : (
                        <p className="text-sm text-stone-400 italic">
                          Présentation en cours d’écriture.
                        </p>
                      )}

                      {(member.favoriteTrackTitle || member.favoriteNovel) && (
                        <div className="space-y-1.5 pt-2 border-t border-stone-100 text-xs text-stone-700">
                          {member.favoriteTrackTitle && (
                            <p className="flex items-center gap-1.5 truncate">
                              <Music2 className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
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
                              <BookOpen className="w-3.5 h-3.5 text-[#8C4D0E] shrink-0" />
                              <span className="truncate">{member.favoriteNovel}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          isMe ? setSubTab('my-profile') : onSelectMember(member.userId)
                        }
                        className="min-h-[38px] text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span>{isMe ? 'Ouvrir mon profil' : 'Voir le profil'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => onStartDirectChat(member)}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-[#1B365D] hover:text-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Écrire</span>
                        </button>
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
          onEditProfile={() => setSubTab('edit-profile')}
          onReadStory={onReadStory}
          onOpenStoryById={onOpenStoryById}
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

