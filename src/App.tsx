import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Compass,
  Feather,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { CustomSalonModal } from './components/CustomSalonModal';
import { CustomSalonRoomView } from './components/CustomSalonRoomView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExchangesView } from './components/ExchangesView';
import { JournalView } from './components/JournalView';
import { LaunchIntro } from './components/LaunchIntro';
import { LisiereLogo } from './components/LisiereLogo';
import { MembersDirectoryView } from './components/MembersDirectoryView';
import { PeleMeleStoriesView } from './components/PeleMeleStoriesView';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import { SalonEmblem } from './components/SalonEmblem';
import { SalonRoomView } from './components/SalonRoomView';
import { StoryComposerModal } from './components/StoryComposerModal';
import { StoryReaderModal } from './components/StoryReaderModal';
import { ThemesView } from './components/ThemesView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { db } from './lib/firebase';
import {
  buildDirectExchangeId,
  subscribeToCustomSalons,
  subscribeToDiscoverableProfiles,
  subscribeToPublicStories,
  subscribeToUserExchanges,
  subscribeToUserStories,
} from './lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from './lib/themes';
import { CustomSalon, Exchange, PublicProfile, Story, StoryThemeId } from './types/story';

type NavTab =
  | 'recits'
  | 'pelemele'
  | 'membres'
  | 'themes'
  | 'passerelles'
  | 'carnet'
  | 'confidentialite';

const VALID_SALON_IDS = new Set<string>(STORY_THEMES.map((t) => t.id));

function parseLocationPath(pathname: string): {
  tab: NavTab;
  salonId: StoryThemeId | null;
  customSalonId: string | null;
  memberId: string | null;
} {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean.startsWith('/salons/')) {
    const slug = clean.slice('/salons/'.length);
    if (VALID_SALON_IDS.has(slug)) {
      return {
        tab: 'recits',
        salonId: slug as StoryThemeId,
        customSalonId: null,
        memberId: null,
      };
    }
  }
  if (clean.startsWith('/communaute/')) {
    const customSlug = decodeURIComponent(clean.slice('/communaute/'.length));
    if (customSlug) {
      return {
        tab: 'recits',
        salonId: null,
        customSalonId: customSlug,
        memberId: null,
      };
    }
  }
  if (clean === '/histoires') {
    return { tab: 'pelemele', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean === '/membres') {
    return { tab: 'membres', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean.startsWith('/membres/')) {
    const memberSlug = decodeURIComponent(clean.slice('/membres/'.length));
    if (memberSlug) {
      return { tab: 'membres', salonId: null, customSalonId: null, memberId: memberSlug };
    }
  }
  if (clean === '/themes') {
    return { tab: 'themes', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean === '/passerelles') {
    return { tab: 'passerelles', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean === '/carnet') {
    return { tab: 'carnet', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean === '/confidentialite') {
    return { tab: 'confidentialite', salonId: null, customSalonId: null, memberId: null };
  }
  return { tab: 'recits', salonId: null, customSalonId: null, memberId: null };
}

function buildLocationPath(
  tab: NavTab,
  salonId: StoryThemeId | null,
  memberId: string | null = null,
  customSalonId: string | null = null
): string {
  if (tab === 'pelemele') return '/histoires';
  if (tab === 'membres') {
    return memberId ? `/membres/${encodeURIComponent(memberId)}` : '/membres';
  }
  if (tab === 'themes') return '/themes';
  if (tab === 'passerelles') return '/passerelles';
  if (tab === 'carnet') return '/carnet';
  if (tab === 'confidentialite') return '/confidentialite';
  if (customSalonId) return `/communaute/${encodeURIComponent(customSalonId)}`;
  if (salonId) return `/salons/${salonId}`;
  return '/';
}

function SalonApp() {
  const { user, profile, authError, signInWithGoogle, clearAuthError } = useAuth();
  const initialRoute = useMemo(() => parseLocationPath(window.location.pathname), []);
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.tab);
  const [highlightedTab, setHighlightedTab] = useState<NavTab>(initialRoute.tab);
  const [activeSalonId, setActiveSalonId] = useState<StoryThemeId | null>(initialRoute.salonId);
  const [activeCustomSalonId, setActiveCustomSalonId] = useState<string | null>(
    initialRoute.customSalonId
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(initialRoute.memberId);
  const [isViewFading, setIsViewFading] = useState(false);
  const navTimerRef = useRef<number | null>(null);
  const [publicStories, setPublicStories] = useState<Story[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [customSalons, setCustomSalons] = useState<CustomSalon[]>([]);
  const [customSalonsLoaded, setCustomSalonsLoaded] = useState(false);
  const [customSalonFilter, setCustomSalonFilter] = useState<'all' | 'public' | 'private'>('all');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [discoverableProfiles, setDiscoverableProfiles] = useState<PublicProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  const [themeFilter, setThemeFilter] = useState<'all' | StoryThemeId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [salonImgFailedMap, setSalonImgFailedMap] = useState<Record<string, boolean>>({});

  const [readingStory, setReadingStory] = useState<Story | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(null);
  const [pendingDirectRecipientId, setPendingDirectRecipientId] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [composerDefaults, setComposerDefaults] = useState<{
    theme: StoryThemeId;
    scope: 'salon' | 'pelemele';
    prompt?: string;
    starter?: string;
    customSalonId?: string | null;
  }>({ theme: 'creation', scope: 'salon', customSalonId: null });

  const [customSalonModalOpen, setCustomSalonModalOpen] = useState(false);
  const [editingCustomSalon, setEditingCustomSalon] = useState<CustomSalon | null>(null);

  const [toastNotice, setToastNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubStories = subscribeToPublicStories((stories) => {
      setPublicStories(stories);
      setStoriesLoaded(true);
    });
    const unsubSalons = subscribeToCustomSalons((salons) => {
      setCustomSalons(salons);
      setCustomSalonsLoaded(true);
    });
    return () => {
      unsubStories();
      unsubSalons();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setMyStories([]);
      setExchanges([]);
      setDiscoverableProfiles([]);
      setProfilesLoaded(false);
      return;
    }
    const unsubMyStories = subscribeToUserStories(user.uid, setMyStories);
    const unsubExchanges = subscribeToUserExchanges(user.uid, setExchanges);
    const unsubProfiles = subscribeToDiscoverableProfiles((profilesList) => {
      setDiscoverableProfiles(profilesList);
      setProfilesLoaded(true);
    });
    return () => {
      unsubMyStories();
      unsubExchanges();
      unsubProfiles();
    };
  }, [user]);

  useEffect(() => {
    if (!readingStory) return;
    const updated =
      publicStories.find((s) => s.storyId === readingStory.storyId) ??
      myStories.find((s) => s.storyId === readingStory.storyId);
    if (updated) {
      setReadingStory(updated);
    }
  }, [publicStories, myStories, readingStory?.storyId]);

  const showNotice = (msg: string) => {
    setToastNotice(msg);
    window.setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const openComposer = async (options?: {
    theme?: StoryThemeId;
    scope?: 'salon' | 'pelemele';
    prompt?: string;
    starter?: string;
    customSalonId?: string | null;
    edit?: Story | null;
  }) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEditingStory(options?.edit ?? null);
    setComposerDefaults({
      theme: options?.theme ?? 'creation',
      scope: options?.scope ?? 'salon',
      prompt: options?.prompt,
      starter: options?.starter,
      customSalonId: options?.customSalonId ?? null,
    });
    setComposerOpen(true);
  };

  const openCustomSalonModal = async (salonToEdit: CustomSalon | null = null) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEditingCustomSalon(salonToEdit);
    setCustomSalonModalOpen(true);
  };

  const handleOpenStoryById = async (storyId: string) => {
    const localMatch =
      publicStories.find((s) => s.storyId === storyId) ??
      myStories.find((s) => s.storyId === storyId);
    if (localMatch) {
      setReadingStory(localMatch);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'stories', storyId));
      if (snap.exists()) {
        setReadingStory(snap.data() as Story);
      } else {
        showNotice('Ce récit n’est plus accessible dans le salon.');
      }
    } catch {
      showNotice('Ce récit n’est plus accessible.');
    }
  };

  const openFeedStories = useMemo(() => {
    const privateCustomIds = new Set(
      customSalons.filter((cs) => cs.visibility === 'private').map((cs) => cs.salonId)
    );
    return publicStories.filter((story) => {
      if (story.customSalonVisibility === 'private') return false;
      if (story.customSalonId && privateCustomIds.has(story.customSalonId)) return false;
      return true;
    });
  }, [publicStories, customSalons]);

  const filteredPublicStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return openFeedStories.filter((story) => {
      if (themeFilter !== 'all' && story.theme !== themeFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        story.authorName.toLowerCase().includes(q)
      );
    });
  }, [openFeedStories, themeFilter, searchQuery]);

  const storyCountsBySalon = useMemo(() => {
    const counts: Record<StoryThemeId, number> = {
      creation: 0,
      'premiers-elans': 0,
      rencontres: 0,
      solitudes: 0,
      quotidien: 0,
    };
    for (const story of openFeedStories) {
      if (!story.customSalonId && story.storyScope !== 'pelemele' && counts[story.theme] !== undefined) {
        counts[story.theme] += 1;
      }
    }
    return counts;
  }, [openFeedStories]);

  const activeCustomSalon = useMemo(
    () =>
      activeCustomSalonId
        ? customSalons.find((s) => s.salonId === activeCustomSalonId) ?? null
        : null,
    [customSalons, activeCustomSalonId]
  );

  const filteredCustomSalons = useMemo(() => {
    if (customSalonFilter === 'all') return customSalons;
    return customSalons.filter((s) => s.visibility === customSalonFilter);
  }, [customSalons, customSalonFilter]);

  const applyRouteChangeWithFade = (
    tab: NavTab,
    salonId: StoryThemeId | null,
    memberId: string | null,
    customSalonId: string | null = null
  ) => {
    setHighlightedTab(tab);

    if (navTimerRef.current !== null) {
      window.clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setActiveTab(tab);
      setActiveSalonId(salonId);
      setActiveCustomSalonId(customSalonId);
      setSelectedMemberId(memberId);
      setIsViewFading(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    setIsViewFading(true);
    navTimerRef.current = window.setTimeout(() => {
      navTimerRef.current = null;
      setActiveTab(tab);
      setActiveSalonId(salonId);
      setActiveCustomSalonId(customSalonId);
      setSelectedMemberId(memberId);
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.requestAnimationFrame(() => {
        setIsViewFading(false);
      });
    }, 135);
  };

  const navigateTo = (
    tab: NavTab,
    salonId: StoryThemeId | null = null,
    memberId: string | null = null,
    customSalonId: string | null = null
  ) => {
    if (
      tab === activeTab &&
      salonId === activeSalonId &&
      customSalonId === activeCustomSalonId &&
      memberId === selectedMemberId &&
      !isViewFading
    ) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const nextPath = buildLocationPath(tab, salonId, memberId, customSalonId);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ tab, salonId, memberId, customSalonId }, '', nextPath);
    }
    applyRouteChangeWithFade(tab, salonId, memberId, customSalonId);
  };

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocationPath(window.location.pathname);
      applyRouteChangeWithFade(
        parsed.tab,
        parsed.salonId,
        parsed.memberId,
        parsed.customSalonId
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (navTimerRef.current !== null) {
        window.clearTimeout(navTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'recits' && activeCustomSalonId) {
      document.title = activeCustomSalon
        ? `${activeCustomSalon.name} — Lisière`
        : 'Salon communautaire — Lisière';
    } else if (activeTab === 'recits' && activeSalonId) {
      const salon = THEME_MAP[activeSalonId];
      document.title = `${salon.salonName} — Lisière`;
    } else if (activeTab === 'pelemele') {
      document.title = 'Histoires pêle-mêle — Lisière';
    } else if (activeTab === 'membres') {
      document.title = selectedMemberId ? 'Mur du membre — Lisière' : 'Membres et murs — Lisière';
    } else if (activeTab === 'themes') {
      document.title = 'Thèmes et fils d’écriture — Lisière';
    } else if (activeTab === 'passerelles') {
      document.title = 'Passerelles privées — Lisière';
    } else if (activeTab === 'carnet') {
      document.title = 'Mon carnet — Lisière';
    } else if (activeTab === 'confidentialite') {
      document.title = 'Politique de confidentialité — Lisière';
    } else {
      document.title = 'Lisière — Récits personnels et échanges humains';
    }
  }, [activeTab, activeSalonId, activeCustomSalonId, activeCustomSalon, selectedMemberId]);

  const enterSalon = (salonId: StoryThemeId | null) => {
    navigateTo('recits', salonId, null, null);
  };

  const enterCustomSalon = (customSalonId: string) => {
    navigateTo('recits', null, null, customSalonId);
  };

  const openMemberWall = (memberId: string) => {
    setReadingStory(null);
    navigateTo('membres', null, memberId);
  };

  const handleStartDirectChat = (member: PublicProfile) => {
    if (!user) {
      void signInWithGoogle();
      return;
    }
    const directId = buildDirectExchangeId(user.uid, member.userId);
    const existing = exchanges.find(
      (ex) =>
        ex.exchangeId === directId ||
        ((ex.kind === 'direct' || ex.storyId === 'direct') &&
          ((ex.initiatorId === user.uid && ex.recipientId === member.userId) ||
            (ex.recipientId === user.uid && ex.initiatorId === member.userId)))
    );
    if (existing) {
      setSelectedExchangeId(existing.exchangeId);
      setPendingDirectRecipientId(null);
    } else {
      setPendingDirectRecipientId(member.userId);
    }
    navigateTo('passerelles');
  };

  const leadStory = filteredPublicStories[0] ?? null;
  const secondaryStories = filteredPublicStories.slice(1);
  const authorDisplayName = profile?.displayName || user?.displayName || 'Auteur';

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-stone-900">
      {/* Top Bar Contract: 1-row, 3-zone */}
      <header className="border-b border-stone-200 bg-[#FBF9F5]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => enterSalon(null)}
            aria-label="Lisière — Retour aux salons"
            className="text-stone-900 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E3A8A] flex items-center"
          >
            <LisiereLogo className="h-8 w-auto" />
          </button>

          {/* Zone 2: Concise single-line text nav links */}
          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => enterSalon(null)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'recits'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Salons
            </button>
            <button
              type="button"
              onClick={() => navigateTo('pelemele')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'pelemele'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Pêle-mêle
            </button>
            <button
              type="button"
              onClick={() => navigateTo('membres', null, null)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'membres'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Membres
            </button>
            <button
              type="button"
              onClick={() => navigateTo('themes')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'themes'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Thèmes
            </button>
            <button
              type="button"
              onClick={() => navigateTo('passerelles')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'passerelles'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Passerelles{exchanges.length > 0 ? ` (${exchanges.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => navigateTo('carnet')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'carnet'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Mon carnet
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void openComposer()}
                className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap shrink-0"
              >
                Écrire un récit
              </button>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap shrink-0"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation row */}
        <nav
          aria-label="Navigation mobile"
          className="md:hidden border-t border-stone-200 px-6 py-2 flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          {(
            [
              { id: 'recits', label: 'Salons' },
              { id: 'pelemele', label: 'Pêle-mêle' },
              { id: 'membres', label: 'Membres' },
              { id: 'themes', label: 'Thèmes' },
              {
                id: 'passerelles',
                label: `Passerelles${exchanges.length > 0 ? ` (${exchanges.length})` : ''}`,
              },
              { id: 'carnet', label: 'Mon carnet' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id, null, null, null)}
              className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                highlightedTab === item.id
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Inline Feedback Banners */}
      {authError && (
        <div className="max-w-6xl mx-auto w-full px-6 pt-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-md text-sm"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              aria-label="Fermer l’alerte"
              className="text-red-700 hover:text-red-900 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {toastNotice && (
        <div className="max-w-6xl mx-auto w-full px-6 pt-4">
          <div className="flex items-center justify-between gap-4 bg-white border border-stone-300 text-stone-900 px-4 py-3 rounded-md text-sm">
            <span>{toastNotice}</span>
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              aria-label="Fermer la notification"
              className="text-stone-500 hover:text-stone-900 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main
        className={`flex-1 transition-opacity duration-200 ease-out ${
          isViewFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {activeTab === 'recits' && activeSalonId !== null && (
          <SalonRoomView
            salonId={activeSalonId}
            publicStories={publicStories}
            storiesLoaded={storiesLoaded}
            onSelectSalon={(id) => enterSalon(id)}
            onReadStory={(story) => setReadingStory(story)}
            onWriteInSalon={(theme, prompt, starter) =>
              void openComposer({ theme, prompt, starter })
            }
            onOpenMemberWall={openMemberWall}
          />
        )}

        {activeTab === 'recits' && activeCustomSalonId !== null && (
          <CustomSalonRoomView
            salon={activeCustomSalon}
            salonsLoaded={customSalonsLoaded}
            onBackToSalons={() => enterSalon(null)}
            onEditSalon={(salonToEdit) => void openCustomSalonModal(salonToEdit)}
            onReadStory={(story) => setReadingStory(story)}
            onWriteInCustomSalon={(targetSalon) =>
              void openComposer({
                theme: 'creation',
                prompt: targetSalon.promptQuestion || undefined,
                customSalonId: targetSalon.salonId,
              })
            }
            onOpenMemberWall={openMemberWall}
          />
        )}

        {activeTab === 'pelemele' && (
          <PeleMeleStoriesView
            publicStories={publicStories}
            customSalons={customSalons}
            storiesLoaded={storiesLoaded}
            onReadStory={(story) => setReadingStory(story)}
            onEnterSalon={(id) => enterSalon(id)}
            onEnterCustomSalon={(id) => enterCustomSalon(id)}
            onOpenMemberWall={openMemberWall}
            onBackToSalons={() => enterSalon(null)}
            onWriteStory={() => void openComposer({ scope: 'pelemele' })}
          />
        )}

        {activeTab === 'confidentialite' && (
          <PrivacyPolicyView onBackToSalons={() => enterSalon(null)} />
        )}

        {activeTab === 'membres' && (
          <MembersDirectoryView
            profiles={discoverableProfiles}
            profilesLoaded={profilesLoaded}
            selectedMemberId={selectedMemberId}
            publicStories={publicStories}
            existingExchanges={exchanges}
            onSelectMember={(memberId) => navigateTo('membres', null, memberId)}
            onReadStory={(story) => setReadingStory(story)}
            onOpenExchange={(exchangeId) => {
              setSelectedExchangeId(exchangeId);
              navigateTo('passerelles');
            }}
            onStartDirectChat={handleStartDirectChat}
          />
        )}

        {activeTab === 'recits' && activeSalonId === null && activeCustomSalonId === null && (
          <div className="max-w-6xl mx-auto px-6 py-10 sm:py-14 space-y-16">
            {/* Hero 2-column Editorial Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
                <div className="space-y-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">
                    Maison d’édition participative · Salons & histoires pêle-mêle
                  </p>
                  <h1
                    className="font-display text-4xl sm:text-5xl font-medium text-stone-900 leading-[1.12]"
                    style={{ textWrap: 'balance' }}
                  >
                    Créer des histoires qui relient ceux qui peinent parfois à se parler.
                  </h1>
                  <p className="text-base sm:text-lg text-stone-600 leading-relaxed max-w-2xl">
                    Explorez les cinq salons de Lisière, parcourez toutes les histoires pêle-mêle ou créez votre propre salon public ou privé avec vos règles d’admission.
                  </p>
                </div>

                <div className="space-y-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void openComposer()}
                      className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Feather className="w-4 h-4" />
                      <span>Partager une histoire</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo('pelemele')}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Histoires pêle-mêle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openCustomSalonModal(null)}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-[#1B365D] bg-white border border-[#1B365D]/40 rounded-md hover:border-[#1B365D] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Créer un salon</span>
                    </button>
                  </div>

                  {/* Operational strip */}
                  <div className="grid grid-cols-3 gap-6 pt-6 border-t border-stone-200">
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                        {STORY_THEMES.length}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">Salons ouverts à la visite</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                        {publicStories.length}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">Récits de la communauté</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                        {user ? exchanges.length : '1 à 1'}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">
                        {user ? 'Passerelles ouvertes' : 'Passerelles privées'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <figure className="lg:col-span-5 flex flex-col">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_salon_letters_1794978652782.jpg"
                    alt="Carnet ouvert sur une table en bois baignée de lumière matinale avec une tasse de thé"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-72 lg:h-full object-cover rounded-sm border border-stone-200"
                  />
                ) : (
                  <div className="w-full h-72 lg:h-full rounded-sm border border-stone-200 bg-[#F4F0E8] flex flex-col items-center justify-center p-8 text-center">
                    <BookOpen className="w-8 h-8 text-stone-500 mb-3" />
                    <p className="font-display text-lg text-stone-800">
                      La table calme de la page écrite
                    </p>
                  </div>
                )}
                <figcaption className="text-xs font-serif italic text-stone-500 mt-2">
                  Fig. 1 — Prendre le temps d’écrire pour aller à la rencontre des autres
                </figcaption>
              </figure>
            </section>

            {/* Predefined Salons Tour Gallery */}
            <section
              id="galerie-salons"
              aria-labelledby="galerie-salons-title"
              className="pt-10 border-t border-stone-200 space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-stone-500">
                    Architecture des lieux · Parcours thématique
                  </p>
                  <h2
                    id="galerie-salons-title"
                    className="font-display text-3xl font-medium text-stone-900"
                    style={{ textWrap: 'balance' }}
                  >
                    Les cinq salons de Lisière
                  </h2>
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                    Chaque salon porte une couleur, une ambiance et une question posée sur la table — même avant l’arrivée de sa première histoire.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => enterSalon(STORY_THEMES[0].id)}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-[#1B365D] bg-white border border-[#1B365D] rounded-md hover:bg-[#1B365D] hover:text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
                >
                  <span>Commencer la visite au Salon I</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                {STORY_THEMES.map((salon, index) => {
                  const count = storyCountsBySalon[salon.id] ?? 0;
                  const imgFailed = Boolean(salonImgFailedMap[salon.id]);
                  const colSpanClass = index < 2 ? 'md:col-span-3' : 'md:col-span-2';

                  return (
                    <article
                      key={salon.id}
                      style={{
                        borderColor: salon.palette.borderTint,
                        borderTopColor: salon.palette.swatch,
                      }}
                      className={`${colSpanClass} bg-white border border-t-2 rounded-lg overflow-hidden flex flex-col justify-between transition-colors`}
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => enterSalon(salon.id)}
                          aria-label={`Entrer dans ${salon.salonName}`}
                          className="block w-full text-left group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D]"
                        >
                          <div
                            style={{
                              backgroundColor:
                                salon.imageFit === 'contain' ? '#FFFFFF' : salon.palette.softBg,
                            }}
                            className="aspect-[4/3] w-full overflow-hidden border-b border-stone-200/80 relative"
                          >
                            {!imgFailed ? (
                              <img
                                src={salon.imageUrl}
                                alt={salon.imageAlt}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setSalonImgFailedMap((prev) => ({
                                    ...prev,
                                    [salon.id]: true,
                                  }))
                                }
                                style={{
                                  objectPosition: salon.imagePosition ?? 'center',
                                }}
                                className={`w-full h-full transition-transform duration-300 group-hover:scale-[1.02] ${
                                  salon.imageFit === 'contain' ? 'object-contain p-4' : 'object-cover'
                                }`}
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                                <SalonEmblem
                                  type={salon.emblem}
                                  color={salon.palette.textAccent}
                                  className="w-9 h-9 mb-2"
                                />
                                <p className="font-display text-base text-stone-800">
                                  {salon.salonName}
                                </p>
                              </div>
                            )}
                          </div>
                        </button>

                        <div className="p-6 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-stone-500 tabular-nums">
                              Salon {salon.romanIndex} ·{' '}
                              {count === 0
                                ? 'Prêt pour un premier récit'
                                : `${count} récit${count > 1 ? 's' : ''}`}
                            </p>
                            <SalonEmblem
                              type={salon.emblem}
                              color={salon.palette.textAccent}
                              className="w-5 h-5 shrink-0"
                            />
                          </div>

                          <div>
                            <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                              <button
                                type="button"
                                onClick={() => enterSalon(salon.id)}
                                className="text-left hover:underline focus-visible:outline-none"
                              >
                                {salon.salonName}
                              </button>
                            </h3>
                            <p
                              style={{ color: salon.palette.textAccent }}
                              className="text-xs font-medium mt-1"
                            >
                              {salon.atmosphere}
                            </p>
                          </div>

                          <p className="text-sm text-stone-600 leading-relaxed">
                            {salon.description}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{ backgroundColor: salon.palette.softBg }}
                        className="px-6 py-3.5 border-t border-stone-200/70 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => enterSalon(salon.id)}
                          style={{ color: salon.palette.textAccent }}
                          className="min-h-[38px] text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-transform duration-150 ease-out active:scale-[0.96]"
                        >
                          <span>Entrer dans le salon</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void openComposer({
                              theme: salon.id,
                              prompt: salon.promptQuestion,
                              starter: `${salon.starterSentence} `,
                            })
                          }
                          className="min-h-[34px] px-3 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition-colors whitespace-nowrap shrink-0"
                        >
                          Y écrire
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* User-Created Community Salons Section */}
            <section
              id="salons-communaute"
              aria-labelledby="salons-communaute-title"
              className="pt-10 border-t border-stone-200 space-y-7"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-stone-500">
                    Cercles fondés par les membres · Publics ou privés
                  </p>
                  <h2
                    id="salons-communaute-title"
                    className="font-display text-3xl font-medium text-stone-900"
                    style={{ textWrap: 'balance' }}
                  >
                    Salons de la communauté
                  </h2>
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                    Chaque membre peut ouvrir son propre salon pour y partager des récits et définir librement ses règles d’admission, en accès public ou sur demande privée.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {customSalons.length > 0 && (
                    <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-md">
                      {(
                        [
                          { id: 'all', label: 'Tous' },
                          { id: 'public', label: 'Publics' },
                          { id: 'private', label: 'Privés' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCustomSalonFilter(opt.id)}
                          className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                            customSalonFilter === opt.id
                              ? 'bg-white text-stone-900 shadow-sm'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void openCustomSalonModal(null)}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Créer un salon</span>
                  </button>
                </div>
              </div>

              {!customSalonsLoaded ? (
                <div className="py-8 text-center text-sm text-stone-500">
                  Chargement des salons de la communauté…
                </div>
              ) : filteredCustomSalons.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-lg p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="space-y-1.5 max-w-xl">
                    <h3 className="font-display text-xl font-medium text-stone-900">
                      {customSalons.length === 0
                        ? 'Aucun salon communautaire n’a encore été ouvert'
                        : 'Aucun salon dans cette catégorie'}
                    </h3>
                    <p className="text-sm text-stone-600">
                      Créez un cercle ouvert à tous ou un salon privé avec vos propres conditions d’admission pour réunir vos lecteurs et vos histoires.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openCustomSalonModal(null)}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-[#1B365D] bg-white border border-[#1B365D] rounded-md hover:bg-[#1B365D] hover:text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ouvrir le premier salon</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCustomSalons.map((cs) => {
                    const pal = ACCENT_TONE_PALETTES[cs.accentTone] ?? ACCENT_TONE_PALETTES.ink;
                    return (
                      <article
                        key={cs.salonId}
                        style={{
                          borderColor: pal.borderTint,
                          borderTopColor: pal.swatch,
                        }}
                        className="bg-white border border-t-2 rounded-lg flex flex-col justify-between overflow-hidden"
                      >
                        <div className="p-6 space-y-3.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              style={{ color: pal.textAccent }}
                              className="font-semibold inline-flex items-center gap-1.5"
                            >
                              {cs.visibility === 'private' ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Salon privé</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="w-3.5 h-3.5" />
                                  <span>Salon public</span>
                                </>
                              )}
                            </span>
                            <span className="text-stone-500 tabular-nums inline-flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {cs.memberCount}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                              <button
                                type="button"
                                onClick={() => enterCustomSalon(cs.salonId)}
                                className="text-left hover:underline focus-visible:outline-none"
                              >
                                {cs.name}
                              </button>
                            </h3>
                            <p className="text-xs text-stone-500 mt-1">
                              Par{' '}
                              <button
                                type="button"
                                onClick={() => openMemberWall(cs.ownerId)}
                                className="font-medium text-stone-700 hover:underline"
                              >
                                {cs.ownerName}
                              </button>
                            </p>
                          </div>

                          <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                            {cs.description}
                          </p>

                          {cs.admissionRules.trim() && (
                            <div className="pt-2 border-t border-stone-100 text-xs text-stone-600 flex items-start gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{cs.admissionRules}</span>
                            </div>
                          )}
                        </div>

                        <div
                          style={{ backgroundColor: pal.softBg }}
                          className="px-6 py-3.5 border-t border-stone-200/70 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => enterCustomSalon(cs.salonId)}
                            style={{ color: pal.textAccent }}
                            className="min-h-[36px] text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>
                              {cs.visibility === 'private'
                                ? 'Voir les règles & demander'
                                : 'Entrer dans le salon'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Community Stories Feed (when stories exist in Firestore) */}
            {!storiesLoaded ? (
              <div className="py-10 text-center text-sm text-stone-500">
                Lecture des récits publiés…
              </div>
            ) : publicStories.length === 0 ? (
              <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-stone-600">
                <p>
                  Aucun récit public n’a encore été déposé — entrez dans l’un des cinq salons ci-dessus pour ouvrir son premier cahier.
                </p>
                <button
                  type="button"
                  onClick={() => void openComposer()}
                  className="text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  Publier le premier récit
                </button>
              </div>
            ) : (
              <div className="pt-8 border-t border-stone-200 space-y-8">
                {/* Filter & Search Toolbar */}
                <section
                  aria-label="Filtrer les récits"
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setThemeFilter('all')}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        themeFilter === 'all'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Tous les récits
                    </button>
                    {STORY_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setThemeFilter(t.id)}
                        style={
                          themeFilter === t.id
                            ? {
                                backgroundColor: t.palette.accent,
                                borderColor: t.palette.accent,
                                color: '#FFFFFF',
                              }
                            : undefined
                        }
                        className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                          themeFilter === t.id
                            ? ''
                            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {t.shortSalonName}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full lg:w-72 shrink-0">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher un titre, un auteur…"
                      aria-label="Rechercher un récit"
                      className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </section>

                {filteredPublicStories.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
                    <p className="font-display text-xl text-stone-900">
                      Aucun récit ne correspond à ce filtre
                    </p>
                    <p className="text-sm text-stone-600">
                      Essayez un autre mot-clé ou réinitialisez le filtre pour voir tous les récits publiés.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setThemeFilter('all');
                        setSearchQuery('');
                      }}
                      className="min-h-[40px] px-4 py-2 text-sm font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                    >
                      Afficher tous les récits
                    </button>
                  </div>
                ) : (
                  <section className="space-y-10" aria-label="Récits publiés">
                    {/* Tier 1: Lead Story */}
                    {leadStory && (
                      <article className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-8 space-y-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            {(() => {
                              const leadIsHorsSalon =
                                leadStory.storyScope === 'pelemele' && !leadStory.customSalonId;
                              const leadCustomSalon = leadStory.customSalonId
                                ? customSalons.find((cs) => cs.salonId === leadStory.customSalonId)
                                : undefined;
                              const leadPalette = leadIsHorsSalon
                                ? undefined
                                : leadCustomSalon
                                  ? ACCENT_TONE_PALETTES[leadCustomSalon.accentTone]
                                  : THEME_MAP[leadStory.theme]?.palette;
                              const leadOriginLabel =
                                leadStory.customSalonName ||
                                (leadIsHorsSalon
                                  ? 'Hors salon · Pêle-mêle'
                                  : THEME_MAP[leadStory.theme]?.salonName || 'Salon');
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    leadStory.customSalonId
                                      ? enterCustomSalon(leadStory.customSalonId)
                                      : leadIsHorsSalon
                                        ? navigateTo('pelemele')
                                        : enterSalon(leadStory.theme)
                                  }
                                  title={
                                    leadIsHorsSalon
                                      ? 'Histoire libre publiée hors salon — Voir tout Pêle-mêle'
                                      : `Salon d’origine : ${leadOriginLabel} — Cliquer pour y entrer`
                                  }
                                  style={{
                                    backgroundColor: leadPalette?.softBg ?? '#F5F5F4',
                                    borderColor: leadPalette?.borderTint ?? '#E7E5E4',
                                    color: leadPalette?.textAccent ?? '#1B365D',
                                  }}
                                  className="group relative inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-medium hover:brightness-95 transition cursor-pointer"
                                >
                                  <span>{leadOriginLabel}</span>
                                  <ArrowUpRight className="w-3 h-3 shrink-0 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 hidden sm:block absolute left-0 bottom-full mb-1.5 z-20 whitespace-nowrap rounded bg-stone-900 px-2.5 py-1 text-[11px] font-normal text-[#FBF9F5] shadow-md"
                                  >
                                    {leadIsHorsSalon
                                      ? 'Hors salon · Voir Pêle-mêle'
                                      : 'Salon d’origine · Cliquer pour y entrer'}
                                  </span>
                                </button>
                              );
                            })()}
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-stone-700">
                              {STORY_FORMAT_LABELS[leadStory.storyFormat ?? 'confession'].label}
                              {(leadStory.storyFormat ?? 'confession') === 'roman'
                                ? ` · ${leadStory.chapterCount ?? 1} chap.`
                                : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => openMemberWall(leadStory.authorId)}
                              className="hover:underline hover:text-stone-900"
                            >
                              Par {leadStory.authorName}
                            </button>
                            <span aria-hidden="true">·</span>
                            <span>{leadStory.readingMinutes} min de lecture</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(leadStory.createdAt?.toDate() ?? null)}</span>
                          </div>

                          <h2
                            className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
                            style={{ textWrap: 'balance' }}
                          >
                            {leadStory.title}
                          </h2>

                          <p className="text-base text-stone-700 leading-relaxed editorial-drop-cap max-w-2xl">
                            {leadStory.excerpt}
                          </p>
                        </div>

                        <div className="lg:col-span-4 lg:border-l lg:border-stone-200 lg:pl-8 flex flex-col justify-between h-full space-y-6">
                          {leadStory.promptQuestion && (
                            <div>
                              <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
                                Fil d’origine
                              </p>
                              <p className="text-sm text-stone-700 italic leading-relaxed">
                                « {leadStory.promptQuestion} »
                              </p>
                            </div>
                          )}

                          <div className="space-y-4">
                            <div className="flex items-center gap-5 text-xs text-stone-600 tabular-nums">
                              <span className="inline-flex items-center gap-1.5">
                                <Heart className="w-3.5 h-3.5 text-stone-500" />
                                {leadStory.resonanceCount} résonance
                                {leadStory.resonanceCount > 1 ? 's' : ''}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5 text-stone-500" />
                                {leadStory.echoCount} commentaire{leadStory.echoCount > 1 ? 's' : ''}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setReadingStory(leadStory)}
                              className="w-full min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] inline-flex items-center justify-center gap-2 whitespace-nowrap"
                            >
                              <span>Lire et commenter</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    )}

                    {/* Tier 2: Secondary Stories Grid */}
                    {secondaryStories.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {secondaryStories.map((story) => {
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
                          return (
                            <article
                              key={story.storyId}
                              className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      story.customSalonId
                                        ? enterCustomSalon(story.customSalonId)
                                        : isHorsSalon
                                          ? navigateTo('pelemele')
                                          : enterSalon(story.theme)
                                    }
                                    title={
                                      isHorsSalon
                                        ? 'Histoire libre publiée hors salon — Voir tout Pêle-mêle'
                                        : `Salon d’origine : ${originLabel} — Cliquer pour y entrer`
                                    }
                                    style={{
                                      backgroundColor: originPalette?.softBg ?? '#F5F5F4',
                                      borderColor: originPalette?.borderTint ?? '#E7E5E4',
                                      color: originPalette?.textAccent ?? '#1B365D',
                                    }}
                                    className="group relative inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium hover:brightness-95 transition cursor-pointer"
                                  >
                                    <span>{originLabel}</span>
                                    <ArrowUpRight className="w-3 h-3 shrink-0 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                    <span
                                      role="tooltip"
                                      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 hidden sm:block absolute left-0 bottom-full mb-1.5 z-20 whitespace-nowrap rounded bg-stone-900 px-2.5 py-1 text-[11px] font-normal text-[#FBF9F5] shadow-md"
                                    >
                                      {isHorsSalon
                                        ? 'Hors salon · Voir Pêle-mêle'
                                        : 'Salon d’origine · Cliquer pour y entrer'}
                                    </span>
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-medium text-stone-700">
                                    {STORY_FORMAT_LABELS[format].label}
                                    {format === 'roman' ? ` · ${story.chapterCount ?? 1} ch.` : ''}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <button
                                    type="button"
                                    onClick={() => openMemberWall(story.authorId)}
                                    className="hover:underline hover:text-stone-900"
                                  >
                                    {story.authorName}
                                  </button>
                                  <span aria-hidden="true">·</span>
                                  <span>{story.readingMinutes} min</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                                </div>

                                <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                                  {story.title}
                                </h3>
                                <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>
                              </div>

                              <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 text-xs text-stone-500 tabular-nums">
                                  <span className="inline-flex items-center gap-1">
                                    <Heart className="w-3.5 h-3.5" />
                                    {story.resonanceCount}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    {story.echoCount}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setReadingStory(story)}
                                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.96]"
                                >
                                  <span>Lire et commenter</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'themes' && (
          <ThemesView
            onStartFromTheme={(theme, promptQuestion, starter) => {
              void openComposer({ theme, prompt: promptQuestion, starter });
            }}
            onVisitSalon={(theme) => enterSalon(theme)}
          />
        )}

        {activeTab === 'passerelles' && (
          <ExchangesView
            exchanges={exchanges}
            discoverableProfiles={discoverableProfiles}
            selectedExchangeId={selectedExchangeId}
            initialRecipientId={pendingDirectRecipientId}
            onClearInitialRecipient={() => setPendingDirectRecipientId(null)}
            onSelectExchange={setSelectedExchangeId}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onOpenMemberWall={openMemberWall}
            onExploreStories={() => enterSalon(null)}
          />
        )}

        {activeTab === 'carnet' && (
          <JournalView
            myStories={myStories}
            existingExchanges={exchanges}
            onReadStory={(story) => setReadingStory(story)}
            onEditStory={(story) => void openComposer({ edit: story })}
            onNewStory={() => void openComposer()}
            onOpenExchange={(exchangeId) => {
              setSelectedExchangeId(exchangeId);
              navigateTo('passerelles');
            }}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-[#FBF9F5] mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-stone-500">
          <div className="space-y-1">
            <p>Lisière — Espace de récits personnels et de passerelles humaines</p>
            <p className="text-stone-700 font-medium">Créé par Kris Ivan N’dri</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={() => enterSalon(null)}
              className="hover:text-stone-900 transition-colors"
            >
              Salons
            </button>
            <button
              type="button"
              onClick={() => navigateTo('pelemele')}
              className="hover:text-stone-900 transition-colors"
            >
              Pêle-mêle
            </button>
            <button
              type="button"
              onClick={() => navigateTo('membres', null, null)}
              className="hover:text-stone-900 transition-colors"
            >
              Membres
            </button>
            <button
              type="button"
              onClick={() => navigateTo('themes')}
              className="hover:text-stone-900 transition-colors"
            >
              Thèmes
            </button>
            <button
              type="button"
              onClick={() => navigateTo('passerelles')}
              className="hover:text-stone-900 transition-colors"
            >
              Passerelles
            </button>
            <button
              type="button"
              onClick={() => navigateTo('carnet')}
              className="hover:text-stone-900 transition-colors"
            >
              Mon carnet
            </button>
            <button
              type="button"
              onClick={() => navigateTo('confidentialite')}
              className="hover:text-stone-900 transition-colors font-medium text-stone-700"
            >
              Politique de confidentialité
            </button>
          </div>
        </div>
      </footer>

      {/* Reader Modal */}
      <StoryReaderModal
        story={readingStory}
        onClose={() => setReadingStory(null)}
        existingExchanges={exchanges}
        customSalons={customSalons}
        onOpenExchange={(exchangeId) => {
          setSelectedExchangeId(exchangeId);
          navigateTo('passerelles');
        }}
        onOpenMemberWall={openMemberWall}
        onEnterSalon={(salonId) => enterSalon(salonId)}
        onEnterCustomSalon={(customSalonId) => enterCustomSalon(customSalonId)}
        onOpenPeleMele={() => navigateTo('pelemele')}
      />

      {/* Composer Modal */}
      {user && (
        <StoryComposerModal
          isOpen={composerOpen}
          onClose={() => {
            setComposerOpen(false);
            setEditingStory(null);
          }}
          authorId={user.uid}
          authorName={authorDisplayName}
          initialTheme={composerDefaults.theme}
          initialScope={composerDefaults.scope}
          initialPrompt={composerDefaults.prompt}
          initialStarter={composerDefaults.starter}
          customSalons={customSalons}
          initialCustomSalonId={composerDefaults.customSalonId ?? null}
          editingStory={editingStory}
          onSaved={(_storyId, visibility, savedTheme, savedCustomSalonId, savedScope) => {
            if (savedCustomSalonId) {
              enterCustomSalon(savedCustomSalonId);
              showNotice('Votre récit a été déposé dans le salon communautaire.');
            } else if (visibility === 'public' && savedScope === 'pelemele') {
              navigateTo('pelemele');
              showNotice('Votre histoire libre a été publiée dans Histoires pêle-mêle.');
            } else if (visibility === 'public') {
              navigateTo('recits', savedTheme);
              showNotice('Votre récit est désormais partagé dans le salon.');
            } else {
              navigateTo('carnet');
              showNotice('Votre brouillon privé a été enregistré dans votre carnet.');
            }
          }}
        />
      )}

      {/* Create / Edit Community Salon Modal */}
      {user && (
        <CustomSalonModal
          isOpen={customSalonModalOpen}
          onClose={() => {
            setCustomSalonModalOpen(false);
            setEditingCustomSalon(null);
          }}
          ownerId={user.uid}
          ownerName={authorDisplayName}
          editingSalon={editingCustomSalon}
          onSaved={(salonId, isEdit) => {
            enterCustomSalon(salonId);
            showNotice(
              isEdit
                ? 'Les règles et informations du salon ont été mises à jour.'
                : 'Votre salon a été ouvert ! Vous pouvez maintenant y déposer vos histoires.'
            );
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [showIntro, setShowIntro] = useState(true);

  return (
    <ErrorBoundary>
      <AuthProvider>
        {showIntro && <LaunchIntro onComplete={() => setShowIntro(false)} />}
        <SalonApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
