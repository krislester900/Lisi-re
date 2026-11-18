import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, MessageCircle, Music2, Search, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Exchange, PublicProfile, Story } from '../types/story';
import { ProfileWallView } from './ProfileWallView';

interface MembersDirectoryViewProps {
  profiles: PublicProfile[];
  profilesLoaded: boolean;
  selectedMemberId: string | null;
  publicStories: Story[];
  existingExchanges: Exchange[];
  onSelectMember: (userId: string | null) => void;
  onReadStory: (story: Story) => void;
  onOpenExchange: (exchangeId: string) => void;
  onStartDirectChat: (member: PublicProfile) => void;
}

export function MembersDirectoryView({
  profiles,
  profilesLoaded,
  selectedMemberId,
  publicStories,
  existingExchanges,
  onSelectMember,
  onReadStory,
  onOpenExchange,
  onStartDirectChat,
}: MembersDirectoryViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

  const storyCountByAuthor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of publicStories) {
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
    const memberStories = publicStories.filter((s) => s.authorId === selectedMemberId);
    return (
      <ProfileWallView
        memberId={selectedMemberId}
        memberStories={memberStories}
        existingExchanges={existingExchanges}
        onBack={() => onSelectMember(null)}
        onReadStory={onReadStory}
        onOpenExchange={onOpenExchange}
      />
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Membres · Murs & affinités
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Découvrir les membres par leurs musiques, photos et lectures
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Chaque membre dispose d’un mur personnel où il partage ses photos, ses titres préférés et ses romans. Connectez-vous pour visiter les murs et démarrer une conversation privée avec qui vous souhaitez.
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
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs uppercase tracking-widest text-stone-500">
            Communauté Lisière · Murs personnels
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium text-stone-900">
            Rencontrer les membres
          </h1>
          <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
            Visitez le mur d’un membre pour découvrir ses photos, sa musique préférée et ses romans, puis ouvrez un chat privé si vous avez envie d’échanger.
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Chercher un prénom, une musique, un livre…"
            aria-label="Rechercher un membre"
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
            Aucun membre ne correspond à cette recherche
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
            >
              Afficher tous les membres
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
                          {isMe ? 'Votre mur' : 'Membre'} · {storiesCount} récit
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
                            {member.favoriteTrackArtist ? ` — ${member.favoriteTrackArtist}` : ''}
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
                    onClick={() => onSelectMember(member.userId)}
                    className="min-h-[38px] text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Voir le mur</span>
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
  );
}
