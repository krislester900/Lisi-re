import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Lock,
  Menu,
  MessageCircle,
  Plus,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { CustomSalonModal } from './components/CustomSalonModal';
import { CustomSalonRoomView } from './components/CustomSalonRoomView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExchangesView } from './components/ExchangesView';
import { JournalSubTab, JournalView } from './components/JournalView';
import { LaunchIntro } from './components/LaunchIntro';
import { LisiereLogo } from './components/LisiereLogo';
import { MembersDirectoryView } from './components/MembersDirectoryView';
import { ModerationCenterView } from './components/ModerationCenterView';
import { NovelCoverArt } from './components/NovelCoverArt';
import { PeleMeleStoriesView } from './components/PeleMeleStoriesView';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import { ReportDraft, ReportModal } from './components/ReportModal';
import { RepostModal } from './components/RepostModal';
import { SalonEmblem } from './components/SalonEmblem';
import { SalonRoomView } from './components/SalonRoomView';
import { StoryComposerModal } from './components/StoryComposerModal';
import { StoryFilterBar } from './components/StoryFilterBar';
import { StoryReaderModal } from './components/StoryReaderModal';
import { ThemesView } from './components/ThemesView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
  subscribeToAllModerationCases,
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
  NOVEL_GENRE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from './lib/themes';
import {
  CustomSalon,
  Exchange,
  MemberWarning,
  ModerationCase,
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
  if (clean === '/membres' || clean === '/profils') {
    return { tab: 'membres', salonId: null, customSalonId: null, memberId: null };
  }
  if (clean.startsWith('/membres/')) {
    const memberSlug = decodeURIComponent(clean.slice('/membres/'.length));
    if (memberSlug) {
      return { tab: 'membres', salonId: null, customSalonId: null, memberId: memberSlug };
    }
  }
  if (clean.startsWith('/profils/')) {
    const memberSlug = decodeURIComponent(clean.slice('/profils/'.length));
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
  if (clean === '/moderation') {
    return { tab: 'moderation', salonId: null, customSalonId: null, memberId: null };
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
    return memberId ? `/profils/${encodeURIComponent(memberId)}` : '/profils';
  }
  if (tab === 'themes') return '/themes';
  if (tab === 'passerelles') return '/passerelles';
  if (tab === 'carnet') return '/carnet';
  if (tab === 'moderation') return '/moderation';
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
  const [profilesSubTab, setProfilesSubTab] = useState<'directory' | 'my-profile' | 'edit-profile'>(
    'directory'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isViewFading, setIsViewFading] = useState(false);
  const navTimerRef = useRef<number | null>(null);
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

  const [readingStory, setReadingStory] = useState<Story | null>(null);
  const [repostingStory, setRepostingStory] = useState<Story | null>(null);
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

  const isModerationAdmin = isModerationAdminEmail(user?.email);

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

  const unacknowledgedWarnings = useMemo(
    () => userWarnings.filter((w) => !w.acknowledged),
    [userWarnings]
  );

  const pendingModerationCount = useMemo(
    () =>
      allModerationCases.filter((c) => c.status === 'open' || c.status === 'under_review').length,
    [allModerationCases]
  );

  const openFeedStories = useMemo(() => {
    const privateCustomIds = new Set(
      customSalons.filter((cs) => cs.visibility === 'private').map((cs) => cs.salonId)
    );
    return visiblePublicStories.filter((story) => {
      if (story.customSalonVisibility === 'private') return false;
      if (story.customSalonId && privateCustomIds.has(story.customSalonId)) return false;
      return true;
    });
  }, [visiblePublicStories, customSalons]);

  const filteredPublicStories = useMemo(
    () => filterAndSortStories(openFeedStories, feedFilter),
    [openFeedStories, feedFilter]
  );

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
    let nextTitle = 'Lisière — Récits personnels et échanges humains';
    if (activeTab === 'recits' && activeCustomSalonId) {
      nextTitle = activeCustomSalon
        ? `${activeCustomSalon.name} — Lisière`
        : 'Salon communautaire — Lisière';
    } else if (activeTab === 'recits' && activeSalonId) {
      const salon = THEME_MAP[activeSalonId];
      nextTitle = `${salon.salonName} — Lisière`;
    } else if (activeTab === 'pelemele') {
      nextTitle = 'Histoires pêle-mêle — Lisière';
    } else if (activeTab === 'membres') {
      nextTitle = selectedMemberId ? 'Profil du membre — Lisière' : 'Profils — Lisière';
    } else if (activeTab === 'themes') {
      nextTitle = 'Thèmes et fils d’écriture — Lisière';
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
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-stone-900">
      {/* Top Bar Contract: 1-row, 3-zone */}
      <header className="border-b border-stone-200 bg-[#FBF9F5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-8">
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
              onClick={() => {
                setProfilesSubTab('directory');
                navigateTo('membres', null, null);
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                highlightedTab === 'membres'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Profils
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
              Mon carnet{unacknowledgedWarnings.length > 0 ? ` (${unacknowledgedWarnings.length})` : ''}
            </button>
            {isModerationAdmin && (
              <button
                type="button"
                onClick={() => navigateTo('moderation')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 inline-flex items-center gap-1.5 ${
                  highlightedTab === 'moderation'
                    ? 'text-stone-900 border-red-800'
                    : 'text-stone-600 border-transparent hover:text-stone-900'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-700" />
                <span>
                  Modération{pendingModerationCount > 0 ? ` (${pendingModerationCount})` : ''}
                </span>
              </button>
            )}
          </nav>

          {/* Zone 3: Primary action + mobile menu button */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void openComposer();
                }}
                className="min-h-[40px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap shrink-0"
              >
                Écrire un récit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void signInWithGoogle();
                }}
                className="min-h-[40px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap shrink-0"
              >
                Se connecter
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
              aria-label={mobileMenuOpen ? 'Fermer le menu de navigation' : 'Ouvrir le menu de navigation'}
              className={`md:hidden min-h-[40px] min-w-[40px] px-2.5 inline-flex items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mobileMenuOpen
                  ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                  : 'border-stone-300 bg-white text-stone-800 hover:border-stone-500'
              }`}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span className="hidden min-[390px]:inline">Menu</span>
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Drawer with smooth opening transition */}
        <div
          id="mobile-navigation-drawer"
          aria-hidden={!mobileMenuOpen}
          className={`md:hidden grid transition-[grid-template-rows,opacity] duration-250 ease-out motion-reduce:transition-none ${
            mobileMenuOpen
              ? 'grid-rows-[1fr] opacity-100 border-t border-stone-200'
              : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <nav
              aria-label="Navigation mobile"
              className={`px-4 py-3 bg-[#FBF9F5] grid grid-cols-2 gap-1.5 text-sm font-medium transition-transform duration-250 ease-out motion-reduce:transition-none ${
                mobileMenuOpen ? 'translate-y-0' : '-translate-y-2'
              }`}
            >
              {(
                [
                  { id: 'recits', label: 'Salons' },
                  { id: 'pelemele', label: 'Pêle-mêle' },
                  { id: 'membres', label: 'Profils' },
                  { id: 'themes', label: 'Thèmes' },
                  {
                    id: 'passerelles',
                    label: `Passerelles${exchanges.length > 0 ? ` (${exchanges.length})` : ''}`,
                  },
                  {
                    id: 'carnet',
                    label: `Mon carnet${unacknowledgedWarnings.length > 0 ? ` (${unacknowledgedWarnings.length})` : ''}`,
                  },
                  ...(isModerationAdmin
                    ? [
                        {
                          id: 'moderation' as const,
                          label: `Modération${pendingModerationCount > 0 ? ` (${pendingModerationCount})` : ''}`,
                        },
                      ]
                    : []),
                ] as ReadonlyArray<{ id: NavTab; label: string }>
              ).map((item) => {
                const isActive = highlightedTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    tabIndex={mobileMenuOpen ? 0 : -1}
                    onClick={() => {
                      if (item.id === 'membres') setProfilesSubTab('directory');
                      navigateTo(item.id, null, null, null);
                    }}
                    className={`min-h-[42px] px-3 py-2 rounded-md border text-left flex items-center justify-between transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-white border-[#1E3A8A]/35 text-[#1E3A8A] font-semibold'
                        : 'bg-white/60 border-stone-200 text-stone-700 hover:bg-white hover:text-stone-900'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
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

      {unacknowledgedWarnings.length > 0 && (() => {
        const latestWarning = unacknowledgedWarnings[0];
        const sev = WARNING_SEVERITY_LABELS[latestWarning.severity];
        return (
          <div className="max-w-6xl mx-auto w-full px-6 pt-4">
            <div
              role="alert"
              className="bg-red-50 border border-red-300 rounded-md p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-red-900">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Avertissement officiel de modération</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${sev.toneClass}`}>
                    {sev.label}
                  </span>
                  {unacknowledgedWarnings.length > 1 && (
                    <span className="text-red-800 tabular-nums">
                      ({unacknowledgedWarnings.length} avertissements en attente)
                    </span>
                  )}
                </div>
                <p className="text-sm text-red-950 leading-relaxed">{latestWarning.justification}</p>
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
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-red-900 bg-white border border-red-200 rounded-md hover:border-red-400 whitespace-nowrap"
                >
                  Voir dans Mon carnet
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <main
        className={`flex-1 transition-opacity duration-200 ease-out ${
          isViewFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {activeTab === 'recits' && activeSalonId !== null && (
          <SalonRoomView
            salonId={activeSalonId}
            publicStories={visiblePublicStories}
            storiesLoaded={storiesLoaded}
            hiddenUserIds={hiddenUserIds}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
            onSelectSalon={(id) => enterSalon(id)}
            onReadStory={(story) => setReadingStory(story)}
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
            publicStories={visiblePublicStories}
            myStories={myStories}
            hiddenUserIds={hiddenUserIds}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
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
            onOpenReport={setReportDraft}
          />
        )}

        {activeTab === 'pelemele' && (
          <PeleMeleStoriesView
            publicStories={visiblePublicStories}
            customSalons={customSalons}
            storiesLoaded={storiesLoaded}
            bookmarkedStoryIds={bookmarkedStoryIds}
            repostedStoryIds={repostedStoryIds}
            onToggleBookmark={(story) => void handleToggleBookmark(story)}
            onOpenRepost={(story) => void handleOpenRepost(story)}
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
            initialSubTab={profilesSubTab}
            publicStories={visiblePublicStories}
            myStories={myStories}
            myReposts={myReposts}
            existingExchanges={exchanges}
            relationships={userRelationships}
            onSelectMember={(memberId) => navigateTo('membres', null, memberId)}
            onReadStory={(story) => setReadingStory(story)}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onOpenExchange={(exchangeId) => {
              setSelectedExchangeId(exchangeId);
              navigateTo('passerelles');
            }}
            onStartDirectChat={handleStartDirectChat}
            onOpenReport={setReportDraft}
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
                {/* Salon Theme Pills + Multi-Criteria Sort & Filter Toolbar */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par salon">
                    <button
                      type="button"
                      onClick={() => setFeedFilter((prev) => ({ ...prev, theme: 'all' }))}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        feedFilter.theme === 'all'
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
                        onClick={() => setFeedFilter((prev) => ({ ...prev, theme: t.id }))}
                        style={
                          feedFilter.theme === t.id
                            ? {
                                backgroundColor: t.palette.accent,
                                borderColor: t.palette.accent,
                                color: '#FFFFFF',
                              }
                            : undefined
                        }
                        className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                          feedFilter.theme === t.id
                            ? ''
                            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {t.shortSalonName}
                      </button>
                    ))}
                  </div>

                  <StoryFilterBar
                    value={feedFilter}
                    onChange={setFeedFilter}
                    defaultSort="recent"
                    searchPlaceholder="Rechercher un titre, un auteur…"
                    ariaLabel="Trier et filtrer les récits publiés"
                    totalCount={openFeedStories.length}
                    filteredCount={filteredPublicStories.length}
                  />
                </div>

                {filteredPublicStories.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-lg p-10 text-center space-y-4">
                    <p className="font-display text-xl text-stone-900">
                      Aucun récit ne correspond à ce filtre
                    </p>
                    <p className="text-sm text-stone-600">
                      Essayez d’autres critères ou réinitialisez les filtres pour voir tous les récits publiés.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFeedFilter(createDefaultStoryFilterState('recent'))}
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
                              {(leadStory.storyFormat ?? 'confession') === 'roman' &&
                              leadStory.novelGenre
                                ? ` · ${NOVEL_GENRE_LABELS[leadStory.novelGenre]}`
                                : ''}
                              {(leadStory.storyFormat ?? 'confession') === 'roman'
                                ? ` · ${leadStory.chapterCount ?? 1} chap. · ${
                                    SERIES_STATUS_LABELS[leadStory.seriesStatus ?? 'en-cours']
                                  }`
                                : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            {leadStory.isAnonymous ? (
                              <span className="text-stone-600">Par Auteur anonyme</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openMemberWall(leadStory.authorId)}
                                className="hover:underline hover:text-stone-900"
                              >
                                Par {leadStory.authorName}
                              </button>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{leadStory.readingMinutes} min de lecture</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(leadStory.createdAt?.toDate() ?? null)}</span>
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
                                  className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
                                  style={{ textWrap: 'balance' }}
                                >
                                  {leadStory.title}
                                </h2>

                                <p className="text-base text-stone-700 leading-relaxed editorial-drop-cap max-w-2xl">
                                  {leadStory.excerpt}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h2
                                className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
                                style={{ textWrap: 'balance' }}
                              >
                                {leadStory.title}
                              </h2>

                              <p className="text-base text-stone-700 leading-relaxed editorial-drop-cap max-w-2xl">
                                {leadStory.excerpt}
                              </p>
                            </>
                          )}
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
                            <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 tabular-nums">
                              <span className="inline-flex items-center gap-1.5" title="Vues">
                                <Eye className="w-3.5 h-3.5 text-stone-500" />
                                {leadStory.viewCount ?? 0} vue
                                {(leadStory.viewCount ?? 0) > 1 ? 's' : ''}
                              </span>
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

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setReadingStory(leadStory)}
                                className="flex-1 min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] inline-flex items-center justify-center gap-2 whitespace-nowrap"
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
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
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
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                                }`}
                              >
                                <Repeat2 className="w-4 h-4" />
                              </button>
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
                                    {format === 'roman' && story.novelGenre
                                      ? ` · ${NOVEL_GENRE_LABELS[story.novelGenre]}`
                                      : ''}
                                    {format === 'roman'
                                      ? ` · ${story.chapterCount ?? 1} ch. · ${
                                          SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']
                                        }`
                                      : ''}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  {story.isAnonymous ? (
                                    <span className="text-stone-600">Auteur anonyme</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openMemberWall(story.authorId)}
                                      className="hover:underline hover:text-stone-900"
                                    >
                                      {story.authorName}
                                    </button>
                                  )}
                                  <span aria-hidden="true">·</span>
                                  <span>{story.readingMinutes} min</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
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
                                      <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                                        {story.title}
                                      </h3>
                                      <p className="text-sm text-stone-600 leading-relaxed">
                                        {story.excerpt}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                                      {story.title}
                                    </h3>
                                    <p className="text-sm text-stone-600 leading-relaxed">
                                      {story.excerpt}
                                    </p>
                                  </>
                                )}
                              </div>

                              <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3.5 text-xs text-stone-500 tabular-nums">
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
                                        ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
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
                                        ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
                                    }`}
                                  >
                                    <Repeat2 className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setReadingStory(story)}
                                    className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-[#1B365D] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.96]"
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
            relationships={userRelationships}
            selectedExchangeId={selectedExchangeId}
            initialRecipientId={pendingDirectRecipientId}
            onClearInitialRecipient={() => setPendingDirectRecipientId(null)}
            onSelectExchange={setSelectedExchangeId}
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
            onReadStory={(story) => setReadingStory(story)}
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
            onOpenMemberWall={openMemberWall}
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
              onClick={() => {
                setProfilesSubTab('directory');
                navigateTo('membres', null, null);
              }}
              className="hover:text-stone-900 transition-colors"
            >
              Profils
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
        existingStories={[...publicStories, ...myStories]}
        customSalons={customSalons}
        userQuotes={userQuotes}
        hiddenUserIds={hiddenUserIds}
        isBookmarked={Boolean(readingStory && bookmarkedStoryIds.has(readingStory.storyId))}
        isReposted={Boolean(readingStory && repostedStoryIds.has(readingStory.storyId))}
        onToggleBookmark={(story) => void handleToggleBookmark(story)}
        onOpenRepost={(story) => void handleOpenRepost(story)}
        onOpenExchange={(exchangeId) => {
          setSelectedExchangeId(exchangeId);
          navigateTo('passerelles');
        }}
        onOpenMemberWall={openMemberWall}
        onEnterSalon={(salonId) => enterSalon(salonId)}
        onEnterCustomSalon={(customSalonId) => enterCustomSalon(customSalonId)}
        onOpenPeleMele={() => navigateTo('pelemele')}
        onOpenReport={setReportDraft}
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
