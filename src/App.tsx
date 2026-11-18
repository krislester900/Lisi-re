import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Feather, Heart, MessageCircle, Search, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExchangesView } from './components/ExchangesView';
import { JournalView } from './components/JournalView';
import { StoryComposerModal } from './components/StoryComposerModal';
import { StoryReaderModal } from './components/StoryReaderModal';
import { ThemesView } from './components/ThemesView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { db } from './lib/firebase';
import { EDITORIAL_OPENING_STORIES } from './lib/foundingStories';
import {
  subscribeToPublicStories,
  subscribeToUserExchanges,
  subscribeToUserStories,
} from './lib/storyService';
import { formatFrenchDate, STORY_THEMES, THEME_MAP } from './lib/themes';
import { Exchange, Story, StoryThemeId } from './types/story';

type NavTab = 'recits' | 'themes' | 'passerelles' | 'carnet';

function SalonApp() {
  const { user, profile, authError, signInWithGoogle, clearAuthError } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('recits');
  const [publicStories, setPublicStories] = useState<Story[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);

  const [themeFilter, setThemeFilter] = useState<'all' | StoryThemeId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const [readingStory, setReadingStory] = useState<Story | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [composerDefaults, setComposerDefaults] = useState<{
    theme: StoryThemeId;
    prompt?: string;
    starter?: string;
  }>({ theme: 'creation' });

  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Subscribe to public stories
  useEffect(() => {
    const unsub = subscribeToPublicStories((stories) => {
      setPublicStories(stories);
      setStoriesLoaded(true);
    });
    return () => unsub();
  }, []);

  // Subscribe to user's own stories and exchanges when signed in
  useEffect(() => {
    if (!user) {
      setMyStories([]);
      setExchanges([]);
      return;
    }
    const unsubMyStories = subscribeToUserStories(user.uid, setMyStories);
    const unsubExchanges = subscribeToUserExchanges(user.uid, setExchanges);
    return () => {
      unsubMyStories();
      unsubExchanges();
    };
  }, [user]);

  // Keep readingStory synced with real-time updates (e.g. resonanceCount / echoCount)
  useEffect(() => {
    if (!readingStory || readingStory.isEditorialSample) return;
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
    prompt?: string;
    starter?: string;
    edit?: Story | null;
  }) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEditingStory(options?.edit ?? null);
    setComposerDefaults({
      theme: options?.theme ?? 'creation',
      prompt: options?.prompt,
      starter: options?.starter,
    });
    setComposerOpen(true);
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

  const filteredPublicStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publicStories.filter((story) => {
      if (themeFilter !== 'all' && story.theme !== themeFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        story.authorName.toLowerCase().includes(q)
      );
    });
  }, [publicStories, themeFilter, searchQuery]);

  const filteredOpeningStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EDITORIAL_OPENING_STORIES.filter((story) => {
      if (themeFilter !== 'all' && story.theme !== themeFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q)
      );
    });
  }, [themeFilter, searchQuery]);

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
            onClick={() => setActiveTab('recits')}
            className="font-display text-2xl font-semibold tracking-tight text-stone-900 whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E3A8A]"
          >
            Lisière
          </button>

          {/* Zone 2: 4 concise single-line text nav links */}
          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('recits')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'recits'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Récits
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('themes')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'themes'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Thèmes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('passerelles')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'passerelles'
                  ? 'text-stone-900 border-[#1E3A8A]'
                  : 'text-stone-600 border-transparent hover:text-stone-900'
              }`}
            >
              Passerelles{exchanges.length > 0 ? ` (${exchanges.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('carnet')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'carnet'
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

        {/* Mobile navigation row (non-sticky so mobile sticky height = 0%) */}
        <nav
          aria-label="Navigation mobile"
          className="md:hidden border-t border-stone-200 px-6 py-2 flex items-center gap-6 overflow-x-auto text-sm font-medium"
        >
          {(
            [
              { id: 'recits', label: 'Récits' },
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
              onClick={() => setActiveTab(item.id)}
              className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === item.id
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

      <main className="flex-1">
        {activeTab === 'recits' && (
          <div className="max-w-6xl mx-auto px-6 py-10 sm:py-14 space-y-14">
            {/* Hero 2-column Editorial Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
                <div className="space-y-5">
                  <p className="text-xs uppercase tracking-widest text-stone-500">
                    Salon littéraire · Échanges personnels
                  </p>
                  <h1
                    className="font-display text-4xl sm:text-5xl font-medium text-stone-900 leading-[1.12]"
                    style={{ textWrap: 'balance' }}
                  >
                    Créer des histoires qui relient ceux qui peinent parfois à se parler.
                  </h1>
                  <p className="text-base sm:text-lg text-stone-600 leading-relaxed max-w-2xl">
                    Lisière est un espace calme pour raconter un morceau de votre parcours, déposer un écho bienveillant sous le récit d’une autre personne, ou ouvrir une passerelle en tête-à-tête à partir de mots vrais.
                  </p>
                </div>

                <div className="space-y-8">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => void openComposer()}
                      className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Feather className="w-4 h-4" />
                      <span>Partager une histoire</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('themes')}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <span>Explorer les fils d’écriture</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Operational strip */}
                  <div className="grid grid-cols-3 gap-6 pt-6 border-t border-stone-200">
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                        {publicStories.length}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">Récits de la communauté</p>
                    </div>
                    <div>
                      <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                        {STORY_THEMES.length}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">Fils de conversation</p>
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

            {/* Filter & Search Toolbar */}
            <section
              aria-label="Filtrer les récits"
              className="pt-6 border-t border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
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
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      themeFilter === t.id
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {t.shortLabel}
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
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </section>

            {/* Salon Feed */}
            {!storiesLoaded ? (
              <div className="py-16 text-center text-sm text-stone-500">
                Ouverture du salon des récits…
              </div>
            ) : publicStories.length === 0 ? (
              <section className="space-y-8" aria-label="Anthologie d’ouverture">
                <div className="bg-white border border-stone-200 rounded-lg p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
                      Première page du salon
                    </p>
                    <h2 className="font-display text-2xl font-medium text-stone-900 mb-1">
                      La communauté attend son premier récit publié
                    </h2>
                    <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
                      En attendant votre propre histoire, parcourez ces trois textes d’ouverture qui posent l’esprit de Lisière.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openComposer()}
                    className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap shrink-0"
                  >
                    Publier le premier récit
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {filteredOpeningStories.map((story) => (
                    <article
                      key={story.storyId}
                      className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                          <span className="font-medium text-stone-800">
                            {THEME_MAP[story.theme].label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{story.readingMinutes} min</span>
                        </div>
                        <h3 className="font-display text-xl font-medium text-stone-900 leading-snug">
                          {story.title}
                        </h3>
                        <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>
                      </div>
                      <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-xs text-stone-500">{story.authorName}</span>
                        <button
                          type="button"
                          onClick={() => setReadingStory(story)}
                          className="text-xs font-medium text-[#1E3A8A] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>Lire le texte</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : filteredPublicStories.length === 0 ? (
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
              <section className="space-y-12" aria-label="Récits publiés">
                {/* Tier 1: Lead Story */}
                {leadStory && (
                  <article className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span className="uppercase tracking-widest text-[#1E3A8A] font-medium">
                          À la une · {THEME_MAP[leadStory.theme]?.label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Par {leadStory.authorName}</span>
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
                            {leadStory.echoCount} écho{leadStory.echoCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setReadingStory(leadStory)}
                          className="w-full min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          <span>Lire le récit et répondre</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                )}

                {/* Tier 2: Secondary Stories Grid */}
                {secondaryStories.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {secondaryStories.map((story) => (
                      <article
                        key={story.storyId}
                        className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            <span className="font-medium text-stone-800">
                              {THEME_MAP[story.theme]?.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{story.authorName}</span>
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
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#1E3A8A] hover:underline inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>Lire et échanger</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {activeTab === 'themes' && (
          <ThemesView
            onStartFromTheme={(theme, promptQuestion, starter) => {
              void openComposer({ theme, prompt: promptQuestion, starter });
            }}
          />
        )}

        {activeTab === 'passerelles' && (
          <ExchangesView
            exchanges={exchanges}
            selectedExchangeId={selectedExchangeId}
            onSelectExchange={setSelectedExchangeId}
            onOpenStoryById={(id) => void handleOpenStoryById(id)}
            onExploreStories={() => setActiveTab('recits')}
          />
        )}

        {activeTab === 'carnet' && (
          <JournalView
            myStories={myStories}
            onReadStory={(story) => setReadingStory(story)}
            onEditStory={(story) => void openComposer({ edit: story })}
            onNewStory={() => void openComposer()}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-[#FBF9F5] mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-stone-500">
          <p>Lisière — Espace de récits personnels et de passerelles humaines</p>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('recits')}
              className="hover:text-stone-900 transition-colors"
            >
              Récits
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('themes')}
              className="hover:text-stone-900 transition-colors"
            >
              Thèmes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('passerelles')}
              className="hover:text-stone-900 transition-colors"
            >
              Passerelles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('carnet')}
              className="hover:text-stone-900 transition-colors"
            >
              Mon carnet
            </button>
          </div>
        </div>
      </footer>

      {/* Reader Modal */}
      <StoryReaderModal
        story={readingStory}
        onClose={() => setReadingStory(null)}
        existingExchanges={exchanges}
        onOpenExchange={(exchangeId) => {
          setSelectedExchangeId(exchangeId);
          setActiveTab('passerelles');
        }}
        onWriteInspired={(sample) => {
          void openComposer({
            theme: sample.theme,
            prompt: sample.promptQuestion,
          });
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
          initialPrompt={composerDefaults.prompt}
          initialStarter={composerDefaults.starter}
          editingStory={editingStory}
          onSaved={(_storyId, visibility) => {
            if (visibility === 'public') {
              setActiveTab('recits');
              showNotice('Votre récit est désormais partagé dans le salon.');
            } else {
              setActiveTab('carnet');
              showNotice('Votre brouillon privé a été enregistré dans votre carnet.');
            }
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SalonApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
