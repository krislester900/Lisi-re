import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  Compass,
  Eye,
  Feather,
  Globe,
  Heart,
  Home,
  Lock,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  Repeat2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { AgeOnboardingModal } from './components/AgeOnboardingModal';
import { CustomSalonModal } from './components/CustomSalonModal';
import { AppSidebar } from './components/AppSidebar';
import { CustomSalonRoomView } from './components/CustomSalonRoomView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExchangesView } from './components/ExchangesView';
import { ForYouView } from './components/ForYouView';
import { JournalSubTab, JournalView } from './components/JournalView';
import { LaunchIntro } from './components/LaunchIntro';
import { LisiereLogo } from './components/LisiereLogo';
import { MatureContentBadge } from './components/MatureContentBadge';
import { MembersDirectoryView } from './components/MembersDirectoryView';
import {
  MobileAppModal,
  OfflineIndicator,
  PWAInstallButton,
} from './components/MobileAppModal';
import { ModerationCenterView } from './components/ModerationCenterView';
import { NovelCoverArt } from './components/NovelCoverArt';
import { PeleMeleStoriesView } from './components/PeleMeleStoriesView';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import { ReportDraft, ReportModal } from './components/ReportModal';
import { RepostModal } from './components/RepostModal';
import { SalonEmblem } from './components/SalonEmblem';
import { SalonRoomView } from './components/SalonRoomView';
import { ShareStoryModal } from './components/ShareStoryModal';
import { StoryComposerModal } from './components/StoryComposerModal';
import { StoryFilterBar } from './components/StoryFilterBar';
import { StoryFormatKicker } from './components/StoryFormatKicker';
import { StoryReaderModal } from './components/StoryReaderModal';
import { ThemesView } from './components/ThemesView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import {
  evaluateStoryFormatCompliance,
  isContentAllowedForAge,
  isStoryCompliantForPublicFeed,
} from './lib/contentRegulation';
import { db } from './lib/firebase';
import { isModerationAdminEmail, WARNING_SEVERITY_LABELS } from './lib/moderationLabels';
import {
  createDefaultStoryFilterState,
  filterAndSortStories,
  StoryFilterState,
} from './lib/storyFilter';
import {
  acknowledgeUserWarning,
  buildDirectExchangeId,
  formatFriendlyFirestoreError,
  privatizeStoriesBatch,
  subscribeToAllModerationCases,
  subscribeToAllPredefinedSalonModerators,
  subscribeToAllWarnings,
  subscribeToCustomSalons,
  subscribeToDiscoverableProfiles,
  subscribeToMyModerationCases,
  subscribeToProfileReposts,
  subscribeToPublicStories,
  subscribeToUserBookmarks,
  subscribeToUserExchanges,
  subscribeToUserQuotes,
  subscribeToUserRelationships,
  subscribeToUserStories,
  subscribeToUserWarnings,
  toggleStoryBookmark,
} from './lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  formatFrenchDate,
  STORY_THEMES,
  THEME_MAP,
} from './lib/themes';
import {
  CustomSalon,
  Exchange,
  MemberWarning,
  ModerationCase,
  NovelGenre,
  PredefinedSalonModerator,
  PublicProfile,
  Story,
  StoryBookmark,
  StoryFormat,
  StoryQuote,
  StoryRepost,
  StoryThemeId,
  UserRelationship,
} from './types/story';

type NavTab =
  | 'recits'
  | 'pour-vous'
  | 'pelemele'
  | 'membres'
  | 'themes'
  | 'passerelles'
  | 'carnet'
  | 'moderation'
  | 'confidentialite';

const VALID_SALON_IDS = new Set<string>(STORY_THEMES.map((t) => t.id));

function parseLocationPath(pathname: string): {
  tab: NavTab;
  salonId: StoryThemeId | null;
  customSalonId: string | null;
  memberId: string | null;
  storyId: string | null;
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
        storyId: null,
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
        storyId: null,
      };
    }
  }
  if (clean === '/pour-vous') {
    return {
      tab: 'pour-vous',
      salonId: null,
      customSalonId: null,
      memberId: null,
      storyId: null,
    };
  }
  if (clean.startsWith('/histoires/')) {
    const storySlug = decodeURIComponent(clean.slice('/histoires/'.length));
    if (storySlug) {
      return {
        tab: 'pelemele',
        salonId: null,
        customSalonId: null,
        memberId: null,
        storyId: storySlug,
      };
    }
  }
  if (clean === '/histoires') {
    return { tab: 'pelemele', salonId: null, customSalonId: null, memberId: null, storyId: null };
  }
  if (clean === '/membres' || clean === '/profils') {
    return { tab: 'membres', salonId: null, customSalonId: null, memberId: null, storyId: null };
  }
  if (clean.startsWith('/membres/')) {
    const memberSlug = decodeURIComponent(clean.slice('/membres/'.length));
    if (memberSlug) {
      return {
        tab: 'membres',
        salonId: null,
        customSalonId: null,
        memberId: memberSlug,
        storyId: null,
      };
    }
  }
  if (clean.startsWith('/profils/')) {
    const memberSlug = decodeURIComponent(clean.slice('/profils/'.length));
    if (memberSlug) {
      return {
        tab: 'membres',
        salonId: null,
        customSalonId: null,
        memberId: memberSlug,
        storyId: null,
      };
    }
  }
  if (clean === '/themes' || clean === '/palmares') {
    return { tab: 'themes', salonId: null, customSalonId: null, memberId: null, storyId: null };
  }
  if (clean === '/passerelles') {
    return {
      tab: 'passerelles',
      salonId: null,
      customSalonId: null,
      memberId: null,
      storyId: null,
    };
  }
  if (clean === '/carnet') {
    return { tab: 'carnet', salonId: null, customSalonId: null, memberId: null, storyId: null };
  }
  if (clean === '/moderation') {
    return {
      tab: 'moderation',
      salonId: null,
      customSalonId: null,
      memberId: null,
      storyId: null,
    };
  }
  if (clean === '/confidentialite') {
    return {
      tab: 'confidentialite',
      salonId: null,
      customSalonId: null,
      memberId: null,
      storyId: null,
    };
  }
  return { tab: 'recits', salonId: null, customSalonId: null, memberId: null, storyId: null };
}

function buildLocationPath(
  tab: NavTab,
  salonId: StoryThemeId | null,
  memberId: string | null = null,
  customSalonId: string | null = null,
  storyId: string | null = null
): string {
  if (storyId) return `/histoires/${encodeURIComponent(storyId)}`;
  if (tab === 'pour-vous') return '/pour-vous';
  if (tab === 'pelemele') return '/histoires';
  if (tab === 'membres') {
    return memberId ? `/profils/${encodeURIComponent(memberId)}` : '/profils';
  }
  if (tab === 'themes') return '/palmares';
  if (tab === 'passerelles') return '/passerelles';
  if (tab === 'carnet') return '/carnet';
  if (tab === 'moderation') return '/moderation';
  if (tab === 'confidentialite') return '/confidentialite';
  if (customSalonId) return `/communaute/${encodeURIComponent(customSalonId)}`;
  if (salonId) return `/salons/${salonId}`;
  return '/';
}

function SalonApp() {
  const {
    user,
    profile,
    viewerAge,
    favoriteThemes,
    favoriteAuthors,
    needsAgeOnboarding,
    dismissAgeOnboarding,
    authError,
    signInWithGoogle,
    clearAuthError,
  } = useAuth();
  const initialRoute = useMemo(() => parseLocationPath(window.location.pathname), []);
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.tab);
  const [highlightedTab, setHighlightedTab] = useState<NavTab>(initialRoute.tab);
  const [activeSalonId, setActiveSalonId] = useState<StoryThemeId | null>(initialRoute.salonId);
  const [activeCustomSalonId, setActiveCustomSalonId] = useState<string | null>(
    initialRoute.customSalonId
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(initialRoute.memberId);
  const [profilesSubTab, setProfilesSubTab] = useState<'directory' | 'my-profile' | 'edit-profile'>(
    'directory'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileAppModal, setShowMobileAppModal] = useState(false);
  const [openMobileModalWithDiagnostics, setOpenMobileModalWithDiagnostics] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('lisiere_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    const isDark = themeMode === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem('lisiere_theme', themeMode);
    } catch {
      // Ignore storage errors
    }
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.content = isDark ? '#12100E' : '#FBF9F5';
    }
  }, [themeMode]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('lisiere_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const handleToggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('lisiere_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };
  const [isViewFading, setIsViewFading] = useState(false);
  const navTimerRef = useRef<number | null>(null);
  const storyRouteReturnPathRef = useRef<string | null>(null);
  const [publicStories, setPublicStories] = useState<Story[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [customSalons, setCustomSalons] = useState<CustomSalon[]>([]);
  const [customSalonsLoaded, setCustomSalonsLoaded] = useState(false);
  const [customSalonFilter, setCustomSalonFilter] = useState<'all' | 'public' | 'private'>('all');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [bookmarks, setBookmarks] = useState<StoryBookmark[]>([]);
  const [userQuotes, setUserQuotes] = useState<StoryQuote[]>([]);
  const [myReposts, setMyReposts] = useState<StoryRepost[]>([]);
  const [discoverableProfiles, setDiscoverableProfiles] = useState<PublicProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  const [userRelationships, setUserRelationships] = useState<UserRelationship[]>([]);
  const [myModerationCases, setMyModerationCases] = useState<ModerationCase[]>([]);
  const [userWarnings, setUserWarnings] = useState<MemberWarning[]>([]);
  const [allModerationCases, setAllModerationCases] = useState<ModerationCase[]>([]);
  const [allWarnings, setAllWarnings] = useState<MemberWarning[]>([]);
  const [predefinedSalonModerators, setPredefinedSalonModerators] = useState<
    Record<StoryThemeId, PredefinedSalonModerator[]>
  >(() => ({
    creation: [],
    rencontres: [],
    solitudes: [],
    'premiers-elans': [],
    quotidien: [],
    faq: [],
  }));
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [ackBannerBusyId, setAckBannerBusyId] = useState<string | null>(null);
  const [journalSubTabRequest, setJournalSubTabRequest] = useState<{
    tab: JournalSubTab;
    nonce: number;
  } | null>(null);

  const [feedFilter, setFeedFilter] = useState<StoryFilterState>(() =>
    createDefaultStoryFilterState('recent')
  );
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [salonImgFailedMap, setSalonImgFailedMap] = useState<Record<string, boolean>>({});
  const [customSalonImgFailedMap, setCustomSalonImgFailedMap] = useState<Record<string, boolean>>({});

  const [readingStory, setReadingStory] = useState<Story | null>(null);
  const [repostingStory, setRepostingStory] = useState<Story | null>(null);
  const [sharingStory, setSharingStory] = useState<Story | null>(null);
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
    format?: StoryFormat;
    romanMode?: 'new' | 'append';
    novelId?: string | null;
    novelGenre?: NovelGenre;
  }>({ theme: 'creation', scope: 'salon', customSalonId: null });

  const [customSalonModalOpen, setCustomSalonModalOpen] = useState(false);
  const [editingCustomSalon, setEditingCustomSalon] = useState<CustomSalon | null>(null);
  const [batchPrivatizeBusy, setBatchPrivatizeBusy] = useState(false);

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
    const unsubSalonMods = subscribeToAllPredefinedSalonModerators(
      setPredefinedSalonModerators
    );
    return () => {
      unsubStories();
      unsubSalons();
      unsubSalonMods();
    };
  }, []);

  const isModerationAdmin = isModerationAdminEmail(user?.email);

  const adminUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of discoverableProfiles) {
      if (p.isAdmin) ids.add(p.userId);
    }
    if (user && (isModerationAdmin || profile?.isAdmin)) {
      ids.add(user.uid);
    }
    return ids;
  }, [discoverableProfiles, user, isModerationAdmin, profile?.isAdmin]);

  useEffect(() => {
    if (!user) {
      setMyStories([]);
      setExchanges([]);
      setBookmarks([]);
      setUserQuotes([]);
      setMyReposts([]);
      setDiscoverableProfiles([]);
      setProfilesLoaded(false);
      setUserRelationships([]);
      setMyModerationCases([]);
      setUserWarnings([]);
      setAllModerationCases([]);
      setAllWarnings([]);
      return;
    }
    const unsubMyStories = subscribeToUserStories(user.uid, setMyStories);
    const unsubExchanges = subscribeToUserExchanges(user.uid, setExchanges);
    const unsubBookmarks = subscribeToUserBookmarks(user.uid, setBookmarks);
    const unsubQuotes = subscribeToUserQuotes(user.uid, setUserQuotes);
    const unsubMyReposts = subscribeToProfileReposts(user.uid, user.uid, setMyReposts);
    const unsubProfiles = subscribeToDiscoverableProfiles((profilesList) => {
      setDiscoverableProfiles(profilesList);
      setProfilesLoaded(true);
    });
    const unsubRelationships = subscribeToUserRelationships(user.uid, setUserRelationships);
    const unsubMyCases = subscribeToMyModerationCases(user.uid, setMyModerationCases);
    const unsubWarnings = subscribeToUserWarnings(user.uid, setUserWarnings);

    let unsubAllCases: (() => void) | null = null;
    let unsubAllWarnings: (() => void) | null = null;
    if (isModerationAdmin) {
      unsubAllCases = subscribeToAllModerationCases(setAllModerationCases);
      unsubAllWarnings = subscribeToAllWarnings(setAllWarnings);
    } else {
      setAllModerationCases([]);
      setAllWarnings([]);
    }

    return () => {
      unsubMyStories();
      unsubExchanges();
      unsubBookmarks();
      unsubQuotes();
      unsubMyReposts();
      unsubProfiles();
      unsubRelationships();
      unsubMyCases();
      unsubWarnings();
      if (unsubAllCases) unsubAllCases();
      if (unsubAllWarnings) unsubAllWarnings();
    };
  }, [user, isModerationAdmin]);

  useEffect(() => {
    if (!readingStory) return;
    const updated =
      publicStories.find((s) => s.storyId === readingStory.storyId) ??
      myStories.find((s) => s.storyId === readingStory.storyId);
    if (updated) {
      setReadingStory(updated);
    }
  }, [publicStories, myStories, readingStory?.storyId]);

  const bookmarkedStoryIds = useMemo(
    () => new Set(bookmarks.map((b) => b.storyId)),
    [bookmarks]
  );

  const repostedStoryIds = useMemo(
    () => new Set(myReposts.map((r) => r.storyId)),
    [myReposts]
  );

  const handleToggleBookmark = async (story: Story) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    try {
      const added = await toggleStoryBookmark(user.uid, story);
      showNotice(
        added
          ? 'Histoire enregistrée dans « À lire plus tard ».'
          : 'Histoire retirée de vos favoris.'
      );
    } catch {
      showNotice('Impossible d’enregistrer cette histoire pour le moment.');
    }
  };

  const handleOpenRepost = async (story: Story) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setRepostingStory(story);
  };

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
    format?: StoryFormat;
    romanMode?: 'new' | 'append';
    novelId?: string | null;
    novelGenre?: NovelGenre;
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
      format: options?.format ?? 'confession',
      romanMode: options?.romanMode ?? 'new',
      novelId: options?.novelId ?? null,
      novelGenre: options?.novelGenre,
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

  const openStoryReader = (story: Story, skipHistoryPush = false) => {
    setReadingStory(story);
    if (
      !skipHistoryPush &&
      story.visibility === 'public' &&
      story.customSalonVisibility !== 'private'
    ) {
      const targetPath = `/histoires/${encodeURIComponent(story.storyId)}`;
      if (window.location.pathname !== targetPath) {
        if (!window.location.pathname.startsWith('/histoires/')) {
          storyRouteReturnPathRef.current = window.location.pathname;
        }
        window.history.pushState(
          {
            tab: activeTab,
            salonId: activeSalonId,
            memberId: selectedMemberId,
            customSalonId: activeCustomSalonId,
            storyId: story.storyId,
          },
          '',
          targetPath
        );
      }
    }
  };

  const closeStoryReader = () => {
    setReadingStory(null);
    if (window.location.pathname.startsWith('/histoires/')) {
      const backPath =
        storyRouteReturnPathRef.current &&
        !storyRouteReturnPathRef.current.startsWith('/histoires/')
          ? storyRouteReturnPathRef.current
          : buildLocationPath(activeTab, activeSalonId, selectedMemberId, activeCustomSalonId);
      storyRouteReturnPathRef.current = null;
      window.history.replaceState(
        {
          tab: activeTab,
          salonId: activeSalonId,
          memberId: selectedMemberId,
          customSalonId: activeCustomSalonId,
        },
        '',
        backPath
      );
    }
  };

  const handleOpenStoryById = async (storyId: string, skipHistoryPush = false) => {
    const localMatch =
      publicStories.find((s) => s.storyId === storyId) ??
      myStories.find((s) => s.storyId === storyId);
    if (localMatch) {
      openStoryReader(localMatch, skipHistoryPush);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'stories', storyId));
      if (snap.exists()) {
        openStoryReader(snap.data() as Story, skipHistoryPush);
      } else {
        showNotice('Ce récit n’est plus accessible dans le salon.');
        if (window.location.pathname.startsWith('/histoires/')) {
          window.history.replaceState({}, '', '/histoires');
        }
      }
    } catch {
      showNotice('Ce récit n’est plus accessible.');
      if (window.location.pathname.startsWith('/histoires/')) {
        window.history.replaceState({}, '', '/histoires');
      }
    }
  };

  const hiddenUserIds = useMemo(
    () => new Set(userRelationships.map((r) => r.targetUserId)),
    [userRelationships]
  );

  const visiblePublicStories = useMemo(() => {
    if (hiddenUserIds.size === 0) return publicStories;
    return publicStories.filter(
      (story) => !hiddenUserIds.has(story.authorId) || story.authorId === user?.uid
    );
  }, [publicStories, hiddenUserIds, user?.uid]);

  // Retroactive format enforcement: confessions (> 3 lines) & novels (>= 2 pages ch.1)
  const regulatedPublicStories = useMemo(
    () => visiblePublicStories.filter((story) => isStoryCompliantForPublicFeed(story)),
    [visiblePublicStories]
  );

  const nonCompliantMyPublicStories = useMemo(
    () =>
      myStories.filter(
        (story) =>
          story.visibility === 'public' && !evaluateStoryFormatCompliance(story).compliant
      ),
    [myStories]
  );

  const unacknowledgedWarnings = useMemo(
    () => userWarnings.filter((w) => !w.acknowledged),
    [userWarnings]
  );

  const pendingModerationCount = useMemo(
    () =>
      allModerationCases.filter((c) => c.status === 'open' || c.status === 'under_review').length,
    [allModerationCases]
  );

  const openSalonEligibleStories = useMemo(() => {
    const privateCustomIds = new Set(
      customSalons.filter((cs) => cs.visibility === 'private').map((cs) => cs.salonId)
    );
    return regulatedPublicStories.filter((story) => {
      if (story.customSalonVisibility === 'private') return false;
      if (story.customSalonId && privateCustomIds.has(story.customSalonId)) return false;
      return true;
    });
  }, [regulatedPublicStories, customSalons]);

  const openFeedStories = useMemo(
    () =>
      openSalonEligibleStories.filter((story) =>
        isContentAllowedForAge(
          story,
          viewerAge,
          Boolean(user && story.authorId === user.uid)
        )
      ),
    [openSalonEligibleStories, viewerAge, user]
  );

  const hiddenFeedByAgeCount = Math.max(
    0,
    openSalonEligibleStories.length - openFeedStories.length
  );

  const deferredFeedFilter = useDeferredValue(feedFilter);

  const filteredPublicStories = useMemo(
    () => filterAndSortStories(openFeedStories, deferredFeedFilter),
    [openFeedStories, deferredFeedFilter]
  );

  const storyCountsBySalon = useMemo(() => {
    const counts: Record<StoryThemeId, number> = {
      creation: 0,
      'premiers-elans': 0,
      rencontres: 0,
      solitudes: 0,
      quotidien: 0,
      faq: 0,
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

    setMobileMenuOpen(false);
    const nextPath = buildLocationPath(tab, salonId, memberId, customSalonId);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ tab, salonId, memberId, customSalonId }, '', nextPath);
    }
    applyRouteChangeWithFade(tab, salonId, memberId, customSalonId);
  };

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (initialRoute.storyId) {
      void handleOpenStoryById(initialRoute.storyId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseLocationPath(window.location.pathname);
      if (parsed.storyId) {
        void handleOpenStoryById(parsed.storyId, true);
        return;
      }
      setReadingStory(null);
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
    let nextTitle = 'Lisière — Récits personnels et échanges humains';
    if (readingStory) {
      nextTitle = `${readingStory.title} — Lisière`;
    } else if (activeTab === 'recits' && activeCustomSalonId) {
      nextTitle = activeCustomSalon
        ? `${activeCustomSalon.name} — Lisière`
        : 'Salon communautaire — Lisière';
    } else if (activeTab === 'recits' && activeSalonId) {
      const salon = THEME_MAP[activeSalonId];
      nextTitle = `${salon.salonName} — Lisière`;
    } else if (activeTab === 'pour-vous') {
      nextTitle = 'Pour vous — Lisière';
    } else if (activeTab === 'pelemele') {
      nextTitle = 'Histoires pêle-mêle — Lisière';
    } else if (activeTab === 'membres') {
      nextTitle = selectedMemberId ? 'Profil du membre — Lisière' : 'Profils — Lisière';
    } else if (activeTab === 'themes') {
      nextTitle = 'Romans & palmarès — Lisière';
    } else if (activeTab === 'passerelles') {
      nextTitle = 'Passerelles privées — Lisière';
    } else if (activeTab === 'carnet') {
      nextTitle = 'Mon carnet — Lisière';
    } else if (activeTab === 'moderation') {
      nextTitle = 'Modération & études de cas — Lisière';
    } else if (activeTab === 'confidentialite') {
      nextTitle = 'Politique de confidentialité — Lisière';
    }

    document.title = nextTitle;

    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonicalEl) {
      canonicalEl.href = canonicalUrl;
    } else {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = canonicalUrl;
      document.head.appendChild(link);
    }

    const ogUrlEl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrlEl) {
      ogUrlEl.content = canonicalUrl;
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:url');
      meta.content = canonicalUrl;
      document.head.appendChild(meta);
    }

    const ogTitleEl = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitleEl) ogTitleEl.content = nextTitle;

    const twitterTitleEl = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
    if (twitterTitleEl) twitterTitleEl.content = nextTitle;

    const isPrivateRoute =
      activeTab === 'passerelles' || activeTab === 'carnet' || activeTab === 'moderation';
    const robotsEl = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robotsEl) {
      robotsEl.content = isPrivateRoute ? 'noindex, nofollow' : 'index, follow';
    }
  }, [
    activeTab,
    activeSalonId,
    activeCustomSalonId,
    activeCustomSalon,
    selectedMemberId,
    readingStory,
  ]);

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
    const isBlocked = userRelationships.some(
      (r) => r.targetUserId === member.userId && r.relation === 'blocked'
    );
    if (isBlocked) {
      showNotice(
        `Vous avez bloqué ${member.displayName}. Débloquez ce membre pour lui écrire en privé.`
      );
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

  const handleAckBannerWarning = async (warningId: string) => {
    if (ackBannerBusyId) return;
    setAckBannerBusyId(warningId);
    try {
      await acknowledgeUserWarning(warningId);
      showNotice('Accusé de réception enregistré.');
    } catch (err) {
      showNotice(formatFriendlyFirestoreError(err, 'Action impossible pour le moment.'));
    } finally {
      setAckBannerBusyId(null);
    }
  };

  const leadStory = filteredPublicStories[0] ?? null;
  const secondaryStories = filteredPublicStories.slice(1);
  const authorDisplayName = profile?.displayName || user?.displayName || 'Auteur';

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-[#12100E] text-stone-900 dark:text-stone-100 transition-colors">
      {/* Clean Single-Row Sticky Header (sidebar handles all destination & salon navigation) */}
      <header className="sticky top-0 z-40 min-h-[65px] pt-[env(safe-area-inset-top)] border-b border-stone-200 dark:border-stone-800 bg-[#FBF9F5]/95 dark:bg-[#12100E]/95 backdrop-blur-xs">
        <div className="h-[64px] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              className="lg:hidden min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-500 transition-colors shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleToggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Déployer le menu latéral' : 'Réduire le menu latéral'}
              title={sidebarCollapsed ? 'Déployer le menu latéral' : 'Réduire le menu latéral'}
              className="hidden lg:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:border-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => enterSalon(null)}
              aria-label="Lisière — Retour aux salons"
              className="text-stone-900 dark:text-stone-100 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E3A8A] flex items-center"
            >
              <LisiereLogo className="h-7 sm:h-8 w-auto" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-pressed={themeMode === 'dark'}
              aria-label={themeMode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              title={themeMode === 'dark' ? 'Mode clair' : 'Mode sombre'}
              className="min-h-[38px] min-w-[38px] sm:px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-amber-300 hover:border-stone-400 dark:hover:border-stone-500 transition-colors shrink-0"
            >
              {themeMode === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              <span className="hidden md:inline text-xs font-medium text-stone-700 dark:text-stone-200">
                {themeMode === 'dark' ? 'Clair' : 'Sombre'}
              </span>
            </button>

            <PWAInstallButton
              variant="header"
              onOpenMobileGuide={() => setShowMobileAppModal(true)}
            />

            {user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void openComposer();
                }}
                aria-label="Écrire un récit"
                className="min-h-[38px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] dark:bg-amber-600 rounded-md hover:bg-[#172D6B] dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              >
                <Feather className="w-3.5 h-3.5" />
                <span className="sm:hidden">Écrire</span>
                <span className="hidden sm:inline">Écrire un récit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void signInWithGoogle();
                }}
                className="min-h-[38px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] dark:bg-amber-600 rounded-md hover:bg-[#172D6B] dark:hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
              >
                Se connecter
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-w-0">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          activeTab={highlightedTab}
          activeSalonId={activeSalonId}
          activeCustomSalonId={activeCustomSalonId}
          exchangesCount={exchanges.length}
          warningsCount={unacknowledgedWarnings.length}
          isModerationAdmin={isModerationAdmin}
          pendingModerationCount={pendingModerationCount}
          storyCountsBySalon={storyCountsBySalon}
          customSalons={customSalons}
          onNavigateTab={(tab) => {
            if (tab === 'membres') setProfilesSubTab('directory');
            navigateTo(tab, null, null, null);
          }}
          onEnterSalon={(id) => enterSalon(id)}
          onEnterCustomSalon={(id) => enterCustomSalon(id)}
          onCreateCustomSalon={() => void openCustomSalonModal(null)}
          onOpenMobileAppGuide={() => setShowMobileAppModal(true)}
        />

        <div className="flex-1 min-w-0 flex flex-col">

      {/* Inline Feedback Banners */}
      {authError && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 px-4 py-3 rounded-md text-sm"
          >
            <span>{authError}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setOpenMobileModalWithDiagnostics(true);
                  setShowMobileAppModal(true);
                }}
                className="px-2.5 py-1 rounded border border-red-300 dark:border-red-800 bg-white/80 dark:bg-stone-900/80 text-xs font-medium text-red-800 dark:text-red-200 hover:bg-white dark:hover:bg-stone-900"
              >
                Diagnostiquer
              </button>
              <button
                type="button"
                onClick={clearAuthError}
                aria-label="Fermer l’alerte"
                className="text-red-700 dark:text-red-300 hover:text-red-900 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {toastNotice && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="flex items-center justify-between gap-4 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 px-4 py-3 rounded-md text-sm shadow-sm">
            <span>{toastNotice}</span>
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              aria-label="Fermer la notification"
              className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {unacknowledgedWarnings.length > 0 && (() => {
        const latestWarning = unacknowledgedWarnings[0];
        const sev = WARNING_SEVERITY_LABELS[latestWarning.severity];
        return (
          <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 rounded-md p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-red-900 dark:text-red-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Avertissement officiel de modération</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${sev.toneClass}`}>
                    {sev.label}
                  </span>
                  {unacknowledgedWarnings.length > 1 && (
                    <span className="text-red-800 dark:text-red-300 tabular-nums">
                      ({unacknowledgedWarnings.length} avertissements en attente)
                    </span>
                  )}
                </div>
                <p className="text-sm text-red-950 dark:text-red-100 leading-relaxed">{latestWarning.justification}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={ackBannerBusyId === latestWarning.warningId}
                  onClick={() => void handleAckBannerWarning(latestWarning.warningId)}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-red-800 rounded-md hover:bg-red-900 disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {ackBannerBusyId === latestWarning.warningId
                      ? 'Confirmation…'
                      : 'Accuser réception'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJournalSubTabRequest({ tab: 'moderation', nonce: Date.now() });
                    navigateTo('carnet');
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-red-900 dark:text-red-200 bg-white dark:bg-stone-900 border border-red-200 dark:border-red-800 rounded-md hover:border-red-400 whitespace-nowrap"
                >
                  Voir dans Mon carnet
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {user && nonCompliantMyPublicStories.length > 0 && activeTab !== 'carnet' && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="bg-amber-50/90 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-800/70 rounded-md p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-200 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span>
                  Régulation rétroactive : {nonCompliantMyPublicStories.length} de vos récits publics{' '}
                  {nonCompliantMyPublicStories.length > 1
                    ? 'sont sous le seuil minimal'
                    : 'est sous le seuil minimal'}
                </span>
              </p>
              <p className="text-xs text-amber-900 dark:text-amber-200/80 leading-relaxed">
                Les histoires de 3 lignes ou moins et les chapitres de roman de moins de 2 pages publiés avant la mise à jour sont masqués des salons publics jusqu’à régularisation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setJournalSubTabRequest({ tab: 'stories', nonce: Date.now() });
                  navigateTo('carnet');
                }}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1B365D] dark:text-amber-200 bg-white dark:bg-stone-900 border border-[#CBD6E6] dark:border-amber-800 rounded-md hover:border-[#1B365D] whitespace-nowrap"
              >
                Régulariser dans Mon carnet
              </button>
              <button
                type="button"
                disabled={batchPrivatizeBusy}
                onClick={async () => {
                  setBatchPrivatizeBusy(true);
                  try {
                    const count = await privatizeStoriesBatch(
                      nonCompliantMyPublicStories.map((s) => s.storyId)
                    );
                    showNotice(
                      `${count} récit${count > 1 ? 's' : ''} passé${count > 1 ? 's' : ''} en brouillon privé.`
                    );
                  } catch (err) {
                    showNotice(
                      formatFriendlyFirestoreError(
                        err,
                        'Impossible de passer ces textes en brouillon privé.'
                      )
                    );
                  } finally {
                    setBatchPrivatizeBusy(false);
                  }
                }}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-amber-900 rounded-md hover:bg-amber-950 disabled:opacity-60 whitespace-nowrap"
              >
                {batchPrivatizeBusy ? 'En cours…' : 'Passer en brouillons'}
              </button>
            </div>
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
            publicStories={regulatedPublicStories}
            storiesLoaded={storiesLoaded}
            hiddenUserIds={hiddenUserIds}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            adminUserIds={adminUserIds}
            moderators={predefinedSalonModerators[activeSalonId] ?? []}
            discoverableProfiles={discoverableProfiles}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onShareStory={setSharingStory}
            onSelectSalon={(id) => enterSalon(id)}
            onReadStory={(story) => openStoryReader(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onWriteInSalon={(theme, prompt, starter) =>
              void openComposer({ theme, prompt, starter })
            }
            onOpenMemberWall={openMemberWall}
            onOpenReport={setReportDraft}
          />
        )}

        {activeTab === 'recits' && activeCustomSalonId !== null && (
          <CustomSalonRoomView
            salon={activeCustomSalon}
            salonsLoaded={customSalonsLoaded}
            publicStories={regulatedPublicStories}
            myStories={myStories}
            hiddenUserIds={hiddenUserIds}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            adminUserIds={adminUserIds}
            discoverableProfiles={discoverableProfiles}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onShareStory={setSharingStory}
            onBackToSalons={() => enterSalon(null)}
            onEditSalon={(salonToEdit) => void openCustomSalonModal(salonToEdit)}
            onReadStory={(story) => openStoryReader(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onWriteInCustomSalon={(targetSalon, initialPrompt, starter) =>
              void openComposer({
                theme: 'creation',
                prompt: initialPrompt || targetSalon.promptQuestion || undefined,
                starter,
                customSalonId: targetSalon.salonId,
              })
            }
            onOpenMemberWall={openMemberWall}
            onOpenReport={setReportDraft}
          />
        )}

        {activeTab === 'pelemele' && (
          <PeleMeleStoriesView
            publicStories={regulatedPublicStories}
            customSalons={customSalons}
            storiesLoaded={storiesLoaded}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onShareStory={setSharingStory}
            onReadStory={(story) => openStoryReader(story)}
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
            initialSubTab={profilesSubTab}
            publicStories={regulatedPublicStories}
            myStories={myStories}
            myReposts={myReposts}
            existingExchanges={exchanges}
            relationships={userRelationships}
            adminUserIds={adminUserIds}
            predefinedSalonModerators={predefinedSalonModerators}
            onSelectMember={(memberId) => navigateTo('membres', null, memberId)}
            onReadStory={(story) => openStoryReader(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onShareStory={setSharingStory}
            onOpenExchange={(exchangeId) => {
              setSelectedExchangeId(exchangeId);
              navigateTo('passerelles');
            }}
            onStartDirectChat={handleStartDirectChat}
            onOpenReport={setReportDraft}
          />
        )}

        {((activeTab === 'recits' && activeSalonId === null && activeCustomSalonId === null) ||
          activeTab === 'pour-vous') && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7">
            <nav
              aria-label="Vues principales"
              className="flex items-center gap-1 sm:gap-2 border-b border-stone-200 dark:border-stone-800 overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => enterSalon(null)}
                aria-current={activeTab === 'recits' ? 'page' : undefined}
                className={`min-h-[42px] px-3 sm:px-4 py-2 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === 'recits'
                    ? 'border-[#1B365D] dark:border-amber-400 text-[#1B365D] dark:text-amber-300'
                    : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>Salons & à la une</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('pour-vous')}
                aria-current={activeTab === 'pour-vous' ? 'page' : undefined}
                className={`min-h-[42px] px-3 sm:px-4 py-2 text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === 'pour-vous'
                    ? 'border-[#1B365D] dark:border-amber-400 text-[#1B365D] dark:text-amber-300'
                    : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:border-stone-300 dark:hover:border-stone-700'
                }`}
              >
                <Star
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'pour-vous' ? 'fill-[#1B365D]/15 dark:fill-amber-400/20' : ''
                  }`}
                />
                <span>Pour vous</span>
                {user && favoriteThemes.length + favoriteAuthors.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[11px] rounded tabular-nums ${
                      activeTab === 'pour-vous'
                        ? 'bg-[#1B365D]/10 dark:bg-amber-950/50 text-[#1B365D] dark:text-amber-300'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {favoriteThemes.length + favoriteAuthors.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        )}

        {activeTab === 'pour-vous' && (
          <ForYouView
            stories={openFeedStories}
            storiesLoaded={storiesLoaded}
            customSalons={customSalons}
            discoverableProfiles={discoverableProfiles}
            hiddenUserIds={hiddenUserIds}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onShareStory={setSharingStory}
            onReadStory={(story) => openStoryReader(story)}
            onEnterSalon={(salonId) => enterSalon(salonId)}
            onEnterCustomSalon={(customSalonId) => enterCustomSalon(customSalonId)}
            onOpenPeleMele={() => navigateTo('pelemele')}
            onOpenMemberWall={openMemberWall}
            onOpenDirectory={() => {
              setProfilesSubTab('directory');
              navigateTo('membres');
            }}
            onWriteStory={() => void openComposer()}
            onShowNotice={showNotice}
          />
        )}

        {activeTab === 'recits' && activeSalonId === null && activeCustomSalonId === null && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-10 space-y-12 sm:space-y-16">
            {/* Hero 2-column Editorial Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-7 sm:space-y-8">
                <div className="space-y-4 sm:space-y-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    Maison d’édition participative · Salons & histoires pêle-mêle
                  </p>
                  <h1
                    className="font-display text-3xl sm:text-5xl font-medium text-stone-900 dark:text-stone-100 leading-[1.12]"
                    style={{ textWrap: 'balance' }}
                  >
                    Créer des histoires qui relient ceux qui peinent parfois à se parler.
                  </h1>
                  <p className="text-base sm:text-lg text-stone-600 dark:text-stone-300 leading-relaxed max-w-2xl">
                    Explorez les six salons de Lisière (dont le Salon FAQ), parcourez toutes les histoires pêle-mêle ou créez votre propre salon public ou privé avec vos règles d’admission.
                  </p>
                </div>

                <div className="space-y-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void openComposer()}
                      className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744] dark:hover:bg-amber-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Feather className="w-4 h-4" />
                      <span>Partager une histoire</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo('pelemele')}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 dark:hover:border-stone-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Histoires pêle-mêle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openCustomSalonModal(null)}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-900 border border-[#1B365D]/40 dark:border-amber-400/40 rounded-md hover:border-[#1B365D] dark:hover:border-amber-400 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Créer un salon</span>
                    </button>
                  </div>

                  {/* Operational strip */}
                  <div className="grid grid-cols-3 gap-6 pt-6 border-t border-stone-200 dark:border-stone-800">
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                        {STORY_THEMES.length}
                      </p>
                      <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">Salons ouverts à la visite</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                        {publicStories.length}
                      </p>
                      <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">Récits de la communauté</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                        {user ? exchanges.length : '1 à 1'}
                      </p>
                      <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
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
                    className="w-full h-72 lg:h-full object-cover rounded-sm border border-stone-200 dark:border-stone-800"
                  />
                ) : (
                  <div className="w-full h-72 lg:h-full rounded-sm border border-stone-200 dark:border-stone-800 bg-[#F4F0E8] dark:bg-stone-900 flex flex-col items-center justify-center p-8 text-center">
                    <BookOpen className="w-8 h-8 text-stone-500 dark:text-stone-400 mb-3" />
                    <p className="font-display text-lg text-stone-800 dark:text-stone-200">
                      La table calme de la page écrite
                    </p>
                  </div>
                )}
                <figcaption className="text-xs font-serif italic text-stone-500 dark:text-stone-400 mt-2">
                  Fig. 1 — Prendre le temps d’écrire pour aller à la rencontre des autres
                </figcaption>
              </figure>
            </section>

            {/* Predefined Salons Tour Gallery */}
            <section
              id="galerie-salons"
              aria-labelledby="galerie-salons-title"
              className="pt-10 border-t border-stone-200 dark:border-stone-800 space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    Architecture des lieux · Parcours thématique
                  </p>
                  <h2
                    id="galerie-salons-title"
                    className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100"
                    style={{ textWrap: 'balance' }}
                  >
                    Les six salons de Lisière
                  </h2>
                  <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 leading-relaxed">
                    Chaque salon porte une couleur, une ambiance et une question posée sur la table — dont un Salon FAQ dédié aux questions et à l’entraide.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => enterSalon(STORY_THEMES[0].id)}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-900 border border-[#1B365D] dark:border-amber-400/60 rounded-md hover:bg-[#1B365D] hover:text-white dark:hover:bg-amber-600 dark:hover:text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
                >
                  <span>Commencer la visite au Salon I</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                {STORY_THEMES.map((salon, index) => {
                  const count = storyCountsBySalon[salon.id] ?? 0;
                  const imgFailed = Boolean(salonImgFailedMap[salon.id]);
                  const colSpanClass =
                    salon.id === 'faq'
                      ? 'md:col-span-6'
                      : index < 2
                        ? 'md:col-span-3'
                        : 'md:col-span-2';

                  const isFaqCard = salon.id === 'faq';

                  return (
                    <article
                      key={salon.id}
                      style={{
                        borderColor: salon.palette.borderTint,
                        borderTopColor: salon.palette.swatch,
                      }}
                      className={`${colSpanClass} bg-white dark:bg-stone-900 border border-t-2 rounded-lg overflow-hidden transition-colors ${
                        isFaqCard ? 'md:grid md:grid-cols-12' : 'flex flex-col justify-between'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => enterSalon(salon.id)}
                        aria-label={`Entrer dans ${salon.salonName}`}
                        className={`block text-left group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] ${
                          isFaqCard ? 'w-full md:col-span-4 md:h-full' : 'w-full'
                        }`}
                      >
                        <div
                          style={{
                            ['--salon-bg' as string]:
                              salon.imageFit === 'contain' ? '#FFFFFF' : salon.palette.softBg,
                          }}
                          className={`w-full overflow-hidden relative bg-[var(--salon-bg)] dark:bg-stone-800 ${
                            isFaqCard
                              ? 'aspect-[4/3] md:aspect-auto md:h-full md:min-h-[260px] border-b md:border-b-0 md:border-r border-stone-200/80 dark:border-stone-800'
                              : 'aspect-[4/3] border-b border-stone-200/80 dark:border-stone-800'
                          }`}
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
                              <p className="font-display text-base text-stone-800 dark:text-stone-200">
                                {salon.salonName}
                              </p>
                            </div>
                          )}
                        </div>
                      </button>

                      <div
                        className={`flex flex-col justify-between ${
                          isFaqCard ? 'md:col-span-8' : 'flex-1'
                        }`}
                      >
                        <div className="p-5 space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                              Salon {salon.romanIndex} ·{' '}
                              {count === 0
                                ? 'Prêt à ouvrir'
                                : `${count} récit${count > 1 ? 's' : ''}`}
                            </p>
                            <SalonEmblem
                              type={salon.emblem}
                              color={salon.palette.textAccent}
                              className="w-5 h-5 shrink-0"
                            />
                          </div>

                          <div>
                            <h3 className="font-display text-xl sm:text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
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
                              className="text-xs font-medium mt-0.5 dark:brightness-125"
                            >
                              {salon.atmosphere}
                            </p>
                          </div>

                          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-2">
                            {salon.description}
                          </p>
                        </div>

                        <div
                          style={{ ['--salon-bg' as string]: salon.palette.softBg }}
                          className="px-6 py-3.5 border-t border-stone-200/70 dark:border-stone-800 bg-[var(--salon-bg)] dark:bg-stone-800/70 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => enterSalon(salon.id)}
                            style={{ color: salon.palette.textAccent }}
                            className="min-h-[38px] text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-transform duration-150 ease-out active:scale-[0.96] dark:brightness-125"
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
                            className="min-h-[34px] px-3 py-1 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 transition-colors whitespace-nowrap shrink-0"
                          >
                            Y écrire
                          </button>
                        </div>
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
              className="pt-10 border-t border-stone-200 dark:border-stone-800 space-y-7"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    Cercles fondés par les membres · Publics ou privés
                  </p>
                  <h2
                    id="salons-communaute-title"
                    className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100"
                    style={{ textWrap: 'balance' }}
                  >
                    Salons de la communauté
                  </h2>
                  <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 leading-relaxed">
                    Chaque membre peut ouvrir son propre salon pour y partager des récits et définir librement ses règles d’admission, en accès public ou sur demande privée.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {customSalons.length > 0 && (
                    <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-md">
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
                              ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
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
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744] dark:hover:bg-amber-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Créer un salon</span>
                  </button>
                </div>
              </div>

              {!customSalonsLoaded ? (
                <div className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                  Chargement des salons de la communauté…
                </div>
              ) : filteredCustomSalons.length === 0 ? (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div className="space-y-1.5 max-w-xl">
                    <h3 className="font-display text-xl font-medium text-stone-900 dark:text-stone-100">
                      {customSalons.length === 0
                        ? 'Aucun salon communautaire n’a encore été ouvert'
                        : 'Aucun salon dans cette catégorie'}
                    </h3>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      Créez un cercle ouvert à tous ou un salon privé avec vos propres conditions d’admission pour réunir vos lecteurs et vos histoires.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openCustomSalonModal(null)}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-800 border border-[#1B365D] dark:border-amber-400/60 rounded-md hover:bg-[#1B365D] hover:text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
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
                        className="bg-white dark:bg-stone-900 border border-t-2 rounded-lg flex flex-col justify-between overflow-hidden"
                      >
                        <div className="p-6 space-y-3.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                style={{ color: pal.textAccent }}
                                className="font-semibold inline-flex items-center gap-1.5 dark:brightness-125"
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
                              <MatureContentBadge minAge={cs.minAge} compact />
                            </div>
                            <span className="text-stone-500 dark:text-stone-400 tabular-nums inline-flex items-center gap-1 shrink-0">
                              <Users className="w-3.5 h-3.5" />
                              {cs.memberCount}
                            </span>
                          </div>

                          <div className="flex items-start gap-3">
                            {cs.avatarUrl && !customSalonImgFailedMap[cs.salonId] && (
                              <img
                                src={cs.avatarUrl}
                                alt={`Photo du salon ${cs.name}`}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setCustomSalonImgFailedMap((prev) => ({
                                    ...prev,
                                    [cs.salonId]: true,
                                  }))
                                }
                                className="w-11 h-11 rounded-md object-cover border border-stone-200 dark:border-stone-700 shrink-0 mt-0.5"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                <button
                                  type="button"
                                  onClick={() => enterCustomSalon(cs.salonId)}
                                  className="text-left hover:underline focus-visible:outline-none"
                                >
                                  {cs.name}
                                </button>
                              </h3>
                              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                                Par{' '}
                                <button
                                  type="button"
                                  onClick={() => openMemberWall(cs.ownerId)}
                                  className="font-medium text-stone-700 dark:text-stone-300 hover:underline"
                                >
                                  {cs.ownerName}
                                </button>
                              </p>
                            </div>
                          </div>

                          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3">
                            {cs.description}
                          </p>

                          {cs.admissionRules.trim() && (
                            <div className="pt-2 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 flex items-start gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{cs.admissionRules}</span>
                            </div>
                          )}
                        </div>

                        <div
                          style={{ ['--salon-bg' as string]: pal.softBg }}
                          className="px-6 py-3.5 border-t border-stone-200/70 dark:border-stone-800 bg-[var(--salon-bg)] dark:bg-stone-800/70 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => enterCustomSalon(cs.salonId)}
                            style={{ color: pal.textAccent }}
                            className="min-h-[36px] text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap dark:brightness-125"
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
              <div className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
                Lecture des récits publiés…
              </div>
            ) : publicStories.length === 0 ? (
              <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-stone-600 dark:text-stone-400">
                <p>
                  Aucun récit public n’a encore été déposé — entrez dans l’un des cinq salons ci-dessus pour ouvrir son premier cahier.
                </p>
                <button
                  type="button"
                  onClick={() => void openComposer()}
                  className="text-xs font-medium text-[#1B365D] dark:text-amber-300 hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  Publier le premier récit
                </button>
              </div>
            ) : (
              <div className="pt-8 border-t border-stone-200 dark:border-stone-800 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100">
                    Récits récents de la communauté
                  </h2>
                </div>

                {hiddenFeedByAgeCount > 0 && (
                  <div className="bg-amber-50/80 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 rounded-md px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        {hiddenFeedByAgeCount} récit{hiddenFeedByAgeCount > 1 ? 's' : ''}{' '}
                        comportant une limite d’âge (13+, 16+ ou 18+) {hiddenFeedByAgeCount > 1 ? 'sont masqués' : 'est masqué'} selon votre profil d’âge.
                      </span>
                    </div>
                    {user && viewerAge === null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProfilesSubTab('edit-profile');
                          navigateTo('membres', null, null);
                        }}
                        className="font-medium text-[#1B365D] dark:text-amber-300 hover:underline whitespace-nowrap shrink-0 self-start sm:self-center"
                      >
                        Renseigner mon âge
                      </button>
                    ) : !user ? (
                      <button
                        type="button"
                        onClick={() => void signInWithGoogle()}
                        className="font-medium text-[#1B365D] dark:text-amber-300 hover:underline whitespace-nowrap shrink-0 self-start sm:self-center"
                      >
                        Se connecter
                      </button>
                    ) : null}
                  </div>
                )}

                <StoryFilterBar
                  value={feedFilter}
                  onChange={setFeedFilter}
                  defaultSort="recent"
                  showThemeFilter={true}
                  searchPlaceholder="Rechercher un titre, un auteur…"
                  ariaLabel="Trier et filtrer les récits publiés"
                  totalCount={openFeedStories.length}
                  filteredCount={filteredPublicStories.length}
                />

                {filteredPublicStories.length === 0 ? (
                  <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-10 text-center space-y-4">
                    <p className="font-display text-xl text-stone-900 dark:text-stone-100">
                      Aucun récit ne correspond à ce filtre
                    </p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      Essayez d’autres critères ou réinitialisez les filtres pour voir tous les récits publiés.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFeedFilter(createDefaultStoryFilterState('recent'))}
                      className="min-h-[40px] px-4 py-2 text-sm font-medium text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500"
                    >
                      Afficher tous les récits
                    </button>
                  </div>
                ) : (
                  <section className="space-y-10" aria-label="Récits publiés">
                    {/* Tier 1: Lead Story */}
                    {leadStory && (
                      <article className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-8 space-y-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
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
                                    ['--pill-bg' as string]: leadPalette?.softBg ?? '#F5F5F4',
                                    borderColor: leadPalette?.borderTint ?? '#E7E5E4',
                                    color: leadPalette?.textAccent ?? '#1B365D',
                                  }}
                                  className="group relative inline-flex items-center gap-1 px-2.5 py-0.5 rounded border bg-[var(--pill-bg)] dark:bg-stone-800 text-[11px] font-medium hover:brightness-95 transition cursor-pointer dark:brightness-125"
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
                            <StoryFormatKicker story={leadStory} showDetails={true} />
                            <span aria-hidden="true">·</span>
                            {leadStory.isAnonymous ? (
                              <span className="text-stone-600 dark:text-stone-400">Par Auteur anonyme</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openMemberWall(leadStory.authorId)}
                                className="hover:underline hover:text-stone-900 dark:hover:text-stone-100"
                              >
                                Par {leadStory.authorName}
                              </button>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{leadStory.readingMinutes} min de lecture</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(leadStory.createdAt?.toDate() ?? null)}</span>
                            <MatureContentBadge
                              minAge={leadStory.minAge}
                              isMature={leadStory.isMature}
                              compact
                            />
                          </div>

                          {leadStory.storyFormat === 'roman' && leadStory.coverUrl ? (
                            <div className="flex flex-col sm:flex-row items-start gap-5">
                              <NovelCoverArt
                                coverUrl={leadStory.coverUrl}
                                title={leadStory.title}
                                genre={leadStory.novelGenre}
                                size="md"
                              />
                              <div className="min-w-0 flex-1 space-y-3">
                                <h2
                                  className="font-display text-3xl sm:text-4xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                                  style={{ textWrap: 'balance' }}
                                >
                                  {leadStory.title}
                                </h2>

                                <p className="text-base text-stone-700 dark:text-stone-300 leading-relaxed editorial-drop-cap max-w-2xl">
                                  {leadStory.excerpt}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h2
                                className="font-display text-3xl sm:text-4xl font-medium text-stone-900 dark:text-stone-100 leading-tight"
                                style={{ textWrap: 'balance' }}
                              >
                                {leadStory.title}
                              </h2>

                              <p className="text-base text-stone-700 dark:text-stone-300 leading-relaxed editorial-drop-cap max-w-2xl">
                                {leadStory.excerpt}
                              </p>
                            </>
                          )}
                        </div>

                        <div className="lg:col-span-4 lg:border-l lg:border-stone-200 dark:lg:border-stone-800 lg:pl-8 flex flex-col justify-between h-full space-y-6">
                          {leadStory.promptQuestion && (
                            <div>
                              <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1.5">
                                Fil d’origine
                              </p>
                              <p className="text-sm text-stone-700 dark:text-stone-300 italic leading-relaxed">
                                « {leadStory.promptQuestion} »
                              </p>
                            </div>
                          )}

                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 dark:text-stone-400 tabular-nums">
                              <span className="inline-flex items-center gap-1.5" title="Vues">
                                <Eye className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                {leadStory.viewCount ?? 0} vue
                                {(leadStory.viewCount ?? 0) > 1 ? 's' : ''}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Heart className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                {leadStory.resonanceCount} résonance
                                {leadStory.resonanceCount > 1 ? 's' : ''}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                {leadStory.echoCount} commentaire{leadStory.echoCount > 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openStoryReader(leadStory)}
                                className="flex-1 min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] dark:bg-amber-600 rounded-md hover:bg-[#132744] dark:hover:bg-amber-500 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] inline-flex items-center justify-center gap-2 whitespace-nowrap"
                              >
                                <span>Lire et commenter</span>
                                <ArrowRight className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleToggleBookmark(leadStory)}
                                title={
                                  bookmarkedStoryIds.has(leadStory.storyId)
                                    ? 'Retirer des favoris'
                                    : 'Enregistrer pour lire plus tard'
                                }
                                aria-label="Enregistrer pour lire plus tard"
                                className={`min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                  bookmarkedStoryIds.has(leadStory.storyId)
                                    ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-amber-950/40 text-[#1B365D] dark:text-amber-300'
                                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400'
                                }`}
                              >
                                <Bookmark
                                  className={`w-4 h-4 ${
                                    bookmarkedStoryIds.has(leadStory.storyId) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleOpenRepost(leadStory)}
                                title={
                                  repostedStoryIds.has(leadStory.storyId)
                                    ? 'Repartagé — Modifier'
                                    : 'Repartager sur mon compte'
                                }
                                aria-label="Repartager"
                                className={`min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                  repostedStoryIds.has(leadStory.storyId)
                                    ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-amber-950/40 text-[#1B365D] dark:text-amber-300'
                                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400'
                                }`}
                              >
                                <Repeat2 className="w-4 h-4" />
                              </button>

                              {leadStory.visibility === 'public' &&
                                leadStory.customSalonVisibility !== 'private' &&
                                isStoryCompliantForPublicFeed(leadStory) && (
                                  <button
                                    type="button"
                                    onClick={() => setSharingStory(leadStory)}
                                    title="Partager ce récit"
                                    aria-label={`Partager ${leadStory.title}`}
                                    className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D] dark:hover:text-amber-300 transition-colors shrink-0"
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                )}
                            </div>
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
                              className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 flex flex-col justify-between space-y-5"
                            >
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
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
                                      ['--pill-bg' as string]: originPalette?.softBg ?? '#F5F5F4',
                                      borderColor: originPalette?.borderTint ?? '#E7E5E4',
                                      color: originPalette?.textAccent ?? '#1B365D',
                                    }}
                                    className="group relative inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-[var(--pill-bg)] dark:bg-stone-800 text-[11px] font-medium hover:brightness-95 transition cursor-pointer dark:brightness-125"
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
                                  <StoryFormatKicker story={story} showDetails={true} />
                                  <span aria-hidden="true">·</span>
                                  {story.isAnonymous ? (
                                    <span className="text-stone-600 dark:text-stone-400">Auteur anonyme</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openMemberWall(story.authorId)}
                                      className="hover:underline hover:text-stone-900 dark:hover:text-stone-100"
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
                                      <h3 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                        {story.title}
                                      </h3>
                                      <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                                        {story.excerpt}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h3 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug">
                                      {story.title}
                                    </h3>
                                    <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                                      {story.excerpt}
                                    </p>
                                  </>
                                )}
                              </div>

                              <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3.5 text-xs text-stone-500 dark:text-stone-400 tabular-nums">
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
                                    onClick={() => void handleToggleBookmark(story)}
                                    title={
                                      bookmarkedStoryIds.has(story.storyId)
                                        ? 'Retirer des favoris'
                                        : 'Enregistrer pour lire plus tard'
                                    }
                                    aria-label="Enregistrer pour lire plus tard"
                                    className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                      bookmarkedStoryIds.has(story.storyId)
                                        ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-amber-950/40 text-[#1B365D] dark:text-amber-300'
                                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800 dark:hover:text-stone-100'
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
                                    onClick={() => void handleOpenRepost(story)}
                                    title={
                                      repostedStoryIds.has(story.storyId)
                                        ? 'Repartagé — Modifier'
                                        : 'Repartager sur mon compte'
                                    }
                                    aria-label="Repartager"
                                    className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                      repostedStoryIds.has(story.storyId)
                                        ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-amber-950/40 text-[#1B365D] dark:text-amber-300'
                                        : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-800 dark:hover:text-stone-100'
                                    }`}
                                  >
                                    <Repeat2 className="w-3.5 h-3.5" />
                                  </button>

                                  {story.visibility === 'public' &&
                                    story.customSalonVisibility !== 'private' &&
                                    isStoryCompliantForPublicFeed(story) && (
                                      <button
                                        type="button"
                                        onClick={() => setSharingStory(story)}
                                        title="Partager ce récit"
                                        aria-label={`Partager ${story.title}`}
                                        className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:border-[#1B365D] hover:text-[#1B365D] dark:hover:text-amber-300 transition-colors"
                                      >
                                        <Share2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                  <button
                                    type="button"
                                    onClick={() => openStoryReader(story)}
                                    className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-[#1B365D] dark:text-amber-300 hover:underline inline-flex items-center gap-1.5 whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.96]"
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
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'themes' && (
          <ThemesView
            stories={openFeedStories}
            storiesLoaded={storiesLoaded}
            myStories={myStories}
            customSalons={customSalons}
            discoverableProfiles={discoverableProfiles}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onShareStory={setSharingStory}
            onReadStory={(story) => openStoryReader(story)}
            onOpenMemberWall={openMemberWall}
            onEnterSalon={(salonId) => enterSalon(salonId)}
            onEnterCustomSalon={(customSalonId) => enterCustomSalon(customSalonId)}
            onOpenPeleMele={() => navigateTo('pelemele')}
            onWriteNovel={(genre) =>
              void openComposer({ format: 'roman', romanMode: 'new', novelGenre: genre })
            }
            onWriteConfession={(theme) =>
              void openComposer({ theme, format: 'confession' })
            }
            onShowNotice={showNotice}
          />
        )}

        {activeTab === 'passerelles' && (
          <ExchangesView
            exchanges={exchanges}
            stories={openSalonEligibleStories}
            discoverableProfiles={discoverableProfiles}
            relationships={userRelationships}
            selectedExchangeId={selectedExchangeId}
            initialRecipientId={pendingDirectRecipientId}
            onClearInitialRecipient={() => setPendingDirectRecipientId(null)}
            onSelectExchange={setSelectedExchangeId}
            onReadStory={(story) => openStoryReader(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onOpenMemberWall={openMemberWall}
            onExploreStories={() => enterSalon(null)}
            onOpenReport={setReportDraft}
          />
        )}

        {activeTab === 'carnet' && (
          <JournalView
            myStories={myStories}
            existingExchanges={exchanges}
            bookmarks={bookmarks}
            quotes={userQuotes}
            reposts={myReposts}
            userWarnings={userWarnings}
            myModerationCases={myModerationCases}
            relationships={userRelationships}
            requestedSubTab={journalSubTabRequest}
            onReadStory={(story) => openStoryReader(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onEditStory={(story) => void openComposer({ edit: story })}
            onAddChapterToNovel={(story) =>
              void openComposer({
                format: 'roman',
                romanMode: 'append',
                novelId: story.storyId,
                theme: story.theme,
                scope: story.storyScope,
                customSalonId: story.customSalonId ?? null,
              })
            }
            onNewStory={() => void openComposer()}
            onOpenExchange={(exchangeId) => {
              setSelectedExchangeId(exchangeId);
              navigateTo('passerelles');
            }}
            onOpenMyProfile={() => {
              setProfilesSubTab('my-profile');
              navigateTo('membres', null, null);
            }}
          />
        )}

        {activeTab === 'moderation' && (
          <ModerationCenterView
            allCases={allModerationCases}
            allWarnings={allWarnings}
            myCases={myModerationCases}
            userWarnings={userWarnings}
            publicStories={publicStories}
            discoverableProfiles={discoverableProfiles}
            predefinedSalonModerators={predefinedSalonModerators}
            onOpenMemberWall={openMemberWall}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-[#12100E] mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-7 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-stone-500 dark:text-stone-400">
          <div className="space-y-1">
            <p>Lisière — Espace de récits personnels et de passerelles humaines</p>
            <p className="text-stone-700 dark:text-stone-300 font-medium">Créé par Kris Ivan N’dri</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <button
              type="button"
              onClick={() => enterSalon(null)}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Salons
            </button>
            <button
              type="button"
              onClick={() => navigateTo('pour-vous')}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Pour vous
            </button>
            <button
              type="button"
              onClick={() => navigateTo('pelemele')}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Pêle-mêle
            </button>
            <button
              type="button"
              onClick={() => navigateTo('themes')}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Romans &amp; confessions
            </button>
            <button
              type="button"
              onClick={() => navigateTo('confidentialite')}
              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors font-medium text-stone-700 dark:text-stone-300"
            >
              Confidentialité
            </button>
            <PWAInstallButton
              variant="footer"
              onOpenMobileGuide={() => setShowMobileAppModal(true)}
            />
          </div>
        </div>
      </footer>
        </div>
      </div>

      {/* Dedicated Mobile Bottom Tab Bar */}
      <nav
        aria-label="Navigation rapide mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 dark:border-stone-800 bg-[#FBF9F5]/95 dark:bg-[#12100E]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-14">
          <button
            type="button"
            onClick={() => enterSalon(null)}
            aria-current={highlightedTab === 'recits' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              highlightedTab === 'recits'
                ? 'text-[#1B365D] dark:text-amber-300 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Salons</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('pour-vous')}
            aria-current={highlightedTab === 'pour-vous' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              highlightedTab === 'pour-vous'
                ? 'text-[#1B365D] dark:text-amber-300 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>Pour vous</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('pelemele')}
            aria-current={highlightedTab === 'pelemele' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              highlightedTab === 'pelemele'
                ? 'text-[#1B365D] dark:text-amber-300 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Pêle-mêle</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setProfilesSubTab('directory');
              navigateTo('membres', null, null);
            }}
            aria-current={highlightedTab === 'membres' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              highlightedTab === 'membres'
                ? 'text-[#1B365D] dark:text-amber-300 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Profils</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('carnet')}
            aria-current={highlightedTab === 'carnet' ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              highlightedTab === 'carnet'
                ? 'text-[#1B365D] dark:text-amber-300 font-semibold'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <span className="relative">
              <BookOpen className="w-4 h-4" />
              {unacknowledgedWarnings.length > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-600"
                />
              )}
            </span>
            <span>Carnet</span>
          </button>
        </div>
      </nav>

      {/* Reader Modal */}
      <StoryReaderModal
        story={readingStory}
        onClose={closeStoryReader}
        existingExchanges={exchanges}
        existingStories={[...publicStories, ...myStories]}
        customSalons={customSalons}
        userQuotes={userQuotes}
        discoverableProfiles={discoverableProfiles}
        hiddenUserIds={hiddenUserIds}
        adminUserIds={adminUserIds}
        moderatorsBySalon={predefinedSalonModerators}
        isBookmarked={Boolean(readingStory && bookmarkedStoryIds.has(readingStory.storyId))}
        isReposted={Boolean(readingStory && repostedStoryIds.has(readingStory.storyId))}
        onToggleBookmark={(story) => void handleToggleBookmark(story)}
        onOpenRepost={(story) => void handleOpenRepost(story)}
        onShareStory={setSharingStory}
        onOpenExchange={(exchangeId) => {
          setSelectedExchangeId(exchangeId);
          navigateTo('passerelles');
        }}
        onOpenMemberWall={openMemberWall}
        onEnterSalon={(salonId) => enterSalon(salonId)}
        onEnterCustomSalon={(customSalonId) => enterCustomSalon(customSalonId)}
        onOpenPeleMele={() => navigateTo('pelemele')}
        onOpenReport={setReportDraft}
        onOpenAgeSettings={() => {
          setReadingStory(null);
          setProfilesSubTab('edit-profile');
          navigateTo('membres', null, null);
        }}
        onEditStory={(storyToEdit) => {
          closeStoryReader();
          void openComposer({ edit: storyToEdit });
        }}
        onStoryClaimed={(claimedName) => {
          showNotice(`Cet écrit est désormais publié sous votre nom (${claimedName}).`);
        }}
      />

      {/* Social & In-App Share Modal */}
      <ShareStoryModal
        story={sharingStory}
        customSalons={customSalons}
        discoverableProfiles={discoverableProfiles}
        hiddenUserIds={hiddenUserIds}
        onClose={() => setSharingStory(null)}
        onEnterSalon={(id) => enterSalon(id)}
        onEnterCustomSalon={(id) => enterCustomSalon(id)}
        onOpenExchange={(exchangeId) => {
          setSelectedExchangeId(exchangeId);
          navigateTo('passerelles');
        }}
        onSharedNotice={showNotice}
      />

      {/* Global Reporting Modal */}
      <ReportModal
        draft={reportDraft}
        onClose={() => setReportDraft(null)}
        onSubmitted={(_caseId, blockedNow) => {
          showNotice(
            blockedNow
              ? 'Signalement transmis pour étude de cas et membre bloqué.'
              : 'Signalement transmis pour étude de cas.'
          );
        }}
      />

      {/* Repost Modal */}
      <RepostModal
        story={repostingStory}
        existingRepost={
          repostingStory
            ? myReposts.find((r) => r.storyId === repostingStory.storyId) ?? null
            : null
        }
        userProfile={profile}
        onClose={() => setRepostingStory(null)}
        onSaved={(vis, removed) => {
          if (removed) {
            showNotice('Repartage retiré de votre compte.');
          } else {
            showNotice(
              vis === 'public'
                ? 'Histoire repartagée publiquement sur votre mur.'
                : 'Histoire repartagée en privé sur votre compte.'
            );
          }
        }}
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
          initialFormat={composerDefaults.format ?? 'confession'}
          initialRomanMode={composerDefaults.romanMode ?? 'new'}
          initialNovelId={composerDefaults.novelId ?? null}
          initialNovelGenre={composerDefaults.novelGenre}
          customSalons={customSalons}
          initialCustomSalonId={composerDefaults.customSalonId ?? null}
          myStories={myStories}
          publicStories={publicStories}
          editingStory={editingStory}
          onChapterSaved={(novel) => {
            showNotice(
              `Le chapitre ${(novel.chapterCount ?? 1) + 1} a été ajouté à « ${novel.title} ».`
            );
          }}
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

      <AgeOnboardingModal
        isOpen={needsAgeOnboarding}
        onDismiss={dismissAgeOnboarding}
        onSaved={(age) =>
          showNotice(
            `Âge enregistré (${age} ans) : les récits proposés sont désormais adaptés à votre âge.`
          )
        }
      />

      <MobileAppModal
        open={showMobileAppModal}
        initialShowDiagnostics={openMobileModalWithDiagnostics}
        onClose={() => {
          setShowMobileAppModal(false);
          setOpenMobileModalWithDiagnostics(false);
        }}
      />

      <OfflineIndicator />
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
