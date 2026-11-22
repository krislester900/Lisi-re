import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  EyeOff,
  Feather,
  Globe,
  ImagePlus,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { checkNovelPlagiarism } from '../lib/plagiarismCheck';
import { compressNovelCover } from '../lib/storageService';
import { addStoryChapter, createStory, updateStory } from '../lib/storyService';
import {
  ACCENT_TONE_PALETTES,
  estimateReadingMinutes,
  NOVEL_GENRES,
  NOVEL_GENRE_LABELS,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import {
  CustomSalon,
  FIELD_LIMITS,
  NovelGenre,
  ReleaseCadence,
  SeriesStatus,
  Story,
  StoryFormat,
  StoryScope,
  StoryThemeId,
  StoryVisibility,
} from '../types/story';
import { NovelCoverArt } from './NovelCoverArt';

type ComposerStep = 1 | 2 | 3;

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: string;
  authorName: string;
  initialTheme?: StoryThemeId;
  initialScope?: StoryScope;
  initialPrompt?: string;
  initialStarter?: string;
  initialFormat?: StoryFormat;
  initialRomanMode?: 'new' | 'append';
  initialNovelId?: string | null;
  customSalons?: CustomSalon[];
  initialCustomSalonId?: string | null;
  myStories?: Story[];
  publicStories?: Story[];
  editingStory?: Story | null;
  onChapterSaved?: (novel: Story) => void;
  onSaved: (
    storyId: string,
    visibility: StoryVisibility,
    theme: StoryThemeId,
    customSalonId?: string | null,
    scope?: StoryScope
  ) => void;
}

export function StoryComposerModal({
  isOpen,
  onClose,
  authorId,
  authorName,
  initialTheme = 'creation',
  initialScope = 'salon',
  initialPrompt,
  initialStarter,
  initialFormat = 'confession',
  initialRomanMode = 'new',
  initialNovelId = null,
  customSalons = [],
  initialCustomSalonId = null,
  myStories = [],
  publicStories = [],
  editingStory,
  onChapterSaved,
  onSaved,
}: StoryComposerModalProps) {
  const [step, setStep] = useState<ComposerStep>(1);
  const [theme, setTheme] = useState<StoryThemeId>(initialTheme);
  const [storyScope, setStoryScope] = useState<StoryScope>(initialScope);
  const [storyFormat, setStoryFormat] = useState<StoryFormat>(initialFormat);
  const [romanMode, setRomanMode] = useState<'new' | 'append'>(initialRomanMode);
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(initialNovelId);
  const [novelGenre, setNovelGenre] = useState<NovelGenre>('contemporain');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [plagiarismAttested, setPlagiarismAttested] = useState(false);

  const [releaseCadence, setReleaseCadence] = useState<ReleaseCadence>('hebdomadaire');
  const [seriesStatus, setSeriesStatus] = useState<SeriesStatus>('en-cours');
  const [promptQuestion, setPromptQuestion] = useState(
    initialPrompt ?? THEME_MAP[initialTheme].promptQuestion
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('public');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedCustomSalonId, setSelectedCustomSalonId] = useState<string | null>(
    initialCustomSalonId
  );
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showWritingExtras, setShowWritingExtras] = useState(false);

  // Append-chapter-to-existing-novel fields
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterNote, setChapterNote] = useState('');
  const [appendSeriesStatus, setAppendSeriesStatus] = useState<SeriesStatus>('en-cours');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  const myNovels = useMemo(
    () => myStories.filter((s) => s.storyFormat === 'roman'),
    [myStories]
  );

  const selectedNovel = useMemo(
    () => myNovels.find((n) => n.storyId === selectedNovelId) ?? myNovels[0] ?? null,
    [myNovels, selectedNovelId]
  );

  const corpusStories = useMemo(() => {
    const byId = new Map<string, Story>();
    for (const s of publicStories) byId.set(s.storyId, s);
    for (const s of myStories) byId.set(s.storyId, s);
    return Array.from(byId.values());
  }, [publicStories, myStories]);

  const selectableCustomSalons = customSalons.filter(
    (s) =>
      s.visibility === 'public' ||
      s.ownerId === authorId ||
      s.salonId === initialCustomSalonId
  );

  const selectedCustomSalon =
    customSalons.find((s) => s.salonId === selectedCustomSalonId) ?? null;

  const isPrivateCustomSalon =
    editingStory?.customSalonVisibility === 'private' ||
    selectedCustomSalon?.visibility === 'private';

  const isAppendMode =
    !editingStory && storyFormat === 'roman' && romanMode === 'append' && myNovels.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCoverError(null);
    if (editingStory) {
      setTheme(editingStory.theme);
      setStoryScope(
        editingStory.customSalonId ? 'salon' : (editingStory.storyScope ?? 'salon')
      );
      setStoryFormat(editingStory.storyFormat ?? 'confession');
      setRomanMode('new');
      setSelectedNovelId(null);
      setNovelGenre(editingStory.novelGenre ?? 'contemporain');
      setCoverUrl(editingStory.coverUrl ?? '');
      setPlagiarismAttested(Boolean(editingStory.plagiarismAttested));
      setReleaseCadence(editingStory.releaseCadence ?? 'hebdomadaire');
      setSeriesStatus(editingStory.seriesStatus ?? 'en-cours');
      setPromptQuestion(editingStory.promptQuestion);
      setTitle(editingStory.title);
      setContent(editingStory.content);
      setExcerpt(editingStory.excerpt);
      setVisibility(editingStory.visibility);
      setIsAnonymous(Boolean(editingStory.isAnonymous));
      setSelectedCustomSalonId(editingStory.customSalonId ?? null);
      setShowDestinationPicker(false);
      setShowCoverPicker(Boolean(editingStory.coverUrl));
      setShowWritingExtras(false);
      setStep(2);
    } else {
      const nextTheme = initialTheme || 'creation';
      const initialCs = initialCustomSalonId
        ? customSalons.find((s) => s.salonId === initialCustomSalonId) ?? null
        : null;
      const resolvedScope: StoryScope = initialCs ? 'salon' : initialScope;
      const novels = myStories.filter((s) => s.storyFormat === 'roman');
      const nextFormat: StoryFormat = initialFormat ?? 'confession';
      const nextRomanMode: 'new' | 'append' =
        nextFormat === 'roman' && initialRomanMode === 'append' && novels.length > 0
          ? 'append'
          : 'new';
      const pickedNovel =
        (initialNovelId ? novels.find((n) => n.storyId === initialNovelId) : null) ??
        novels[0] ??
        null;

      setTheme(nextTheme);
      setStoryScope(resolvedScope);
      setStoryFormat(nextFormat);
      setRomanMode(nextRomanMode);
      setSelectedNovelId(pickedNovel?.storyId ?? null);
      setAppendSeriesStatus(
        pickedNovel?.seriesStatus === 'termine' ? 'termine' : 'en-cours'
      );
      setNovelGenre('contemporain');
      setCoverUrl('');
      setPlagiarismAttested(false);
      setReleaseCadence('hebdomadaire');
      setSeriesStatus('en-cours');
      setPromptQuestion(
        initialPrompt ??
          (initialCs
            ? initialCs.promptQuestion
            : resolvedScope === 'pelemele'
              ? ''
              : THEME_MAP[nextTheme].promptQuestion)
      );
      setTitle('');
      setContent(initialStarter ?? '');
      setExcerpt('');
      setChapterTitle('');
      setChapterContent('');
      setChapterNote('');
      setSelectedCustomSalonId(initialCustomSalonId ?? null);
      setShowDestinationPicker(!initialCustomSalonId);
      setShowCoverPicker(false);
      setShowWritingExtras(false);
      setVisibility(initialCs?.visibility === 'private' ? 'private' : 'public');
      setIsAnonymous(false);

      // Jump straight to writing when opened directly from a salon prompt/starter or append chapter
      const openedWithDirectContext =
        Boolean(initialPrompt || initialStarter || initialCustomSalonId) ||
        nextRomanMode === 'append';
      setStep(openedWithDirectContext ? 2 : 1);
    }
  }, [
    isOpen,
    editingStory,
    initialTheme,
    initialScope,
    initialPrompt,
    initialStarter,
    initialFormat,
    initialRomanMode,
    initialNovelId,
    initialCustomSalonId,
  ]);

  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const plagiarismCheck = useMemo(() => {
    if (storyFormat !== 'roman') return null;
    const candidate = isAppendMode ? chapterContent : content;
    if (candidate.trim().length < 20) return null;
    return checkNovelPlagiarism({
      candidateText: candidate,
      candidateTitle: isAppendMode ? chapterTitle : title,
      currentAuthorId: authorId,
      existingStories: corpusStories,
      excludeStoryId: isAppendMode
        ? selectedNovel?.storyId ?? null
        : editingStory?.storyId ?? null,
    });
  }, [
    storyFormat,
    isAppendMode,
    chapterContent,
    content,
    chapterTitle,
    title,
    authorId,
    corpusStories,
    selectedNovel?.storyId,
    editingStory?.storyId,
  ]);

  if (!isOpen) return null;

  const activeTitleValue = isAppendMode ? chapterTitle : title;
  const activeContentValue = isAppendMode ? chapterContent : content;
  const minTitleLen = isAppendMode ? FIELD_LIMITS.chapterTitle.min : FIELD_LIMITS.title.min;
  const minContentLen = isAppendMode
    ? FIELD_LIMITS.chapterContent.min
    : FIELD_LIMITS.content.min;
  const isWritingReady =
    activeTitleValue.trim().length >= minTitleLen &&
    activeContentValue.trim().length >= minContentLen;

  const destinationSummaryLabel = (() => {
    if (isAppendMode && selectedNovel) {
      return `Chapitre ${(selectedNovel.chapterCount ?? 1) + 1} · ${selectedNovel.title}`;
    }
    if (editingStory?.customSalonId) {
      return editingStory.customSalonName || 'Salon communautaire';
    }
    if (selectedCustomSalon) {
      return selectedCustomSalon.name;
    }
    if (storyScope === 'pelemele') {
      return 'Hors salon (Pêle-mêle)';
    }
    const t = THEME_MAP[theme];
    return `Salon ${t.romanIndex} · ${t.shortSalonName}`;
  })();

  const handleThemeChange = (nextTheme: StoryThemeId) => {
    setTheme(nextTheme);
    if (!editingStory && !initialPrompt && !selectedCustomSalonId) {
      setPromptQuestion(THEME_MAP[nextTheme].promptQuestion);
    }
  };

  const handleCustomSalonSelect = (salonId: string) => {
    if (!salonId) {
      setSelectedCustomSalonId(null);
      setVisibility('public');
      if (!initialPrompt) {
        setPromptQuestion(THEME_MAP[theme].promptQuestion);
      }
      return;
    }
    const found = customSalons.find((s) => s.salonId === salonId);
    setSelectedCustomSalonId(salonId);
    if (found) {
      if (found.visibility === 'private') {
        setVisibility('private');
      }
      if (!initialPrompt && found.promptQuestion) {
        setPromptQuestion(found.promptQuestion);
      }
    }
  };

  const handleInsertStarter = () => {
    const starter = THEME_MAP[theme].starterSentence;
    if (!content.trim()) {
      setContent(`${starter} `);
    } else if (!content.includes(starter)) {
      setContent(`${content.trimEnd()}\n\n${starter} `);
    }
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverError(null);
    setCoverUploadBusy(true);
    try {
      const compressed = await compressNovelCover(file);
      setCoverUrl(compressed);
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : 'Impossible de charger cette couverture.'
      );
    } finally {
      setCoverUploadBusy(false);
    }
  };

  const handleGoToStep = (target: ComposerStep) => {
    setError(null);
    if (target === 3 && !isWritingReady) {
      if (activeTitleValue.trim().length < minTitleLen) {
        setError(
          isAppendMode
            ? 'Donnez un titre d’au moins 2 caractères à ce chapitre.'
            : 'Donnez un titre d’au moins 3 caractères à votre récit.'
        );
      } else {
        setError('Prenez un instant pour écrire au moins 20 caractères avant de publier.');
      }
      setStep(2);
      return;
    }
    setStep(target);
  };

  const handleNextStep = () => {
    if (step === 1) {
      setError(null);
      setStep(2);
      return;
    }
    if (step === 2) {
      handleGoToStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step < 3) {
      handleNextStep();
      return;
    }

    if (isAppendMode && selectedNovel) {
      if (chapterTitle.trim().length < FIELD_LIMITS.chapterTitle.min) {
        setError('Donnez un titre d’au moins 2 caractères à ce chapitre.');
        setStep(2);
        return;
      }
      if (chapterContent.trim().length < FIELD_LIMITS.chapterContent.min) {
        setError('Le chapitre doit contenir au moins 20 caractères.');
        setStep(2);
        return;
      }
      if (!plagiarismAttested) {
        setError(
          'Veuillez confirmer la charte anti-plagiat en certifiant que ce chapitre est une œuvre originale.'
        );
        return;
      }
      if (plagiarismCheck?.isSuspicious && !plagiarismCheck.matchedIsOwnStory) {
        setError(
          `Publication bloquée : une similitude très élevée (${plagiarismCheck.similarityPercent} %) a été détectée avec « ${plagiarismCheck.matchedStoryTitle} ». Publiez uniquement un texte original.`
        );
        return;
      }

      setSubmitting(true);
      try {
        const nextNum = (selectedNovel.chapterCount ?? 1) + 1;
        await addStoryChapter({
          story: selectedNovel,
          authorId,
          chapterNumber: nextNum,
          title: chapterTitle,
          content: chapterContent,
          authorNote: chapterNote,
          nextSeriesStatus: appendSeriesStatus,
        });
        if (onChapterSaved) {
          onChapterSaved(selectedNovel);
        } else {
          onSaved(
            selectedNovel.storyId,
            selectedNovel.visibility,
            selectedNovel.theme,
            selectedNovel.customSalonId ?? null,
            selectedNovel.storyScope
          );
        }
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Impossible d’ajouter ce chapitre pour le moment.'
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (title.trim().length < FIELD_LIMITS.title.min) {
      setError('Donnez un titre d’au moins 3 caractères à votre récit.');
      setStep(2);
      return;
    }
    if (content.trim().length < FIELD_LIMITS.content.min) {
      setError('Prenez un instant pour écrire au moins 20 caractères.');
      setStep(2);
      return;
    }
    if (storyFormat === 'roman') {
      if (!plagiarismAttested) {
        setError(
          'Veuillez accepter la charte anti-plagiat des romans avant de publier ou d’enregistrer.'
        );
        return;
      }
      if (plagiarismCheck?.isSuspicious && !plagiarismCheck.matchedIsOwnStory) {
        setError(
          `Publication bloquée par la protection anti-plagiat : ${plagiarismCheck.similarityPercent} % de passages identiques avec « ${plagiarismCheck.matchedStoryTitle} ».`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const effectiveVisibility: StoryVisibility = isPrivateCustomSalon ? 'private' : visibility;
      const customSalonTarget =
        !editingStory && storyScope === 'salon' && selectedCustomSalon
          ? {
              salonId: selectedCustomSalon.salonId,
              name: selectedCustomSalon.name,
              visibility: selectedCustomSalon.visibility,
            }
          : null;
      const effectiveScope: StoryScope = customSalonTarget ? 'salon' : storyScope;

      const payload = {
        title,
        excerpt,
        content,
        theme,
        storyScope: effectiveScope,
        customSalon: customSalonTarget,
        storyFormat,
        novelGenre: storyFormat === 'roman' ? novelGenre : undefined,
        coverUrl: storyFormat === 'roman' ? coverUrl : '',
        plagiarismAttested: storyFormat === 'roman' ? plagiarismAttested : undefined,
        releaseCadence: storyFormat === 'confession' ? 'unique' : releaseCadence,
        seriesStatus: storyFormat === 'confession' ? 'complet' : seriesStatus,
        promptQuestion,
        visibility: effectiveVisibility,
        isAnonymous,
      };
      if (editingStory) {
        await updateStory(editingStory.storyId, authorName, payload);
        onSaved(
          editingStory.storyId,
          effectiveVisibility,
          theme,
          editingStory.customSalonId ?? null,
          effectiveScope
        );
      } else {
        const createdId = await createStory(authorId, authorName, payload);
        onSaved(
          createdId,
          effectiveVisibility,
          theme,
          customSalonTarget?.salonId ?? null,
          effectiveScope
        );
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer votre récit pour le moment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const readingMinutes = estimateReadingMinutes(activeContentValue);

  const stepsMeta: Array<{ id: ComposerStep; shortLabel: string; done: boolean }> = [
    { id: 1, shortLabel: '1. Cadre & lieu', done: step > 1 },
    { id: 2, shortLabel: '2. Écriture', done: isWritingReady },
    {
      id: 3,
      shortLabel: '3. Publication',
      done: isWritingReady && (storyFormat !== 'roman' || plagiarismAttested),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-[#FBF9F5] sm:border sm:border-stone-300 sm:rounded-lg flex flex-col overflow-hidden"
      >
        {/* Sticky Modal Header */}
        <div className="shrink-0 bg-white border-b border-stone-200 px-4 sm:px-6 pt-3.5 pb-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-stone-500">
                {editingStory
                  ? 'Modifier un texte'
                  : isAppendMode
                    ? 'Suite de roman'
                    : 'Table d’écriture'}
              </p>
              <h2
                id="composer-title"
                className="font-display text-lg sm:text-xl font-medium text-stone-900 leading-snug truncate"
              >
                {editingStory
                  ? 'Relire et ajuster votre publication'
                  : isAppendMode
                    ? 'Ajouter un chapitre'
                    : 'Publier une confession ou un roman'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer la table d’écriture"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 3-Step Navigable Rail */}
          <nav
            aria-label="Étapes de publication"
            className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 rounded-md"
          >
            {stepsMeta.map((item) => {
              const isCurrent = step === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleGoToStep(item.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`min-h-[34px] px-2 py-1 rounded text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 truncate ${
                    isCurrent
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {item.done && !isCurrent && (
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  )}
                  <span className="truncate">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Scrollable Step Body */}
        <div
          ref={scrollBodyRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-5"
        >
          {/* STEP 1: FORMAT & DESTINATION */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Format Selector */}
              <div className="space-y-2">
                <span className="block text-xs uppercase tracking-widest text-stone-500">
                  Quel format souhaitez-vous écrire ?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      { id: 'confession', icon: Feather },
                      { id: 'roman', icon: BookOpen },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const active = storyFormat === item.id;
                    const meta = STORY_FORMAT_LABELS[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setStoryFormat(item.id);
                          setError(null);
                        }}
                        className={`text-left p-3.5 rounded-md border transition-colors ${
                          active
                            ? 'bg-white border-[#1B365D] ring-1 ring-[#1B365D]'
                            : 'bg-white/70 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon
                            className={`w-4 h-4 ${active ? 'text-[#1B365D]' : 'text-stone-500'}`}
                          />
                          <span className="text-sm font-semibold text-stone-900">{meta.label}</span>
                        </div>
                        <p className="text-xs text-stone-600 leading-relaxed">{meta.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Existing Novels Toggle */}
              {!editingStory && storyFormat === 'roman' && myNovels.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-md p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-medium text-stone-700">
                      Vous avez déjà {myNovels.length} roman{myNovels.length > 1 ? 's' : ''} :
                    </span>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-md">
                      <button
                        type="button"
                        onClick={() => {
                          setRomanMode('new');
                          setError(null);
                        }}
                        className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center justify-center gap-1.5 ${
                          romanMode === 'new'
                            ? 'bg-white text-stone-900 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nouveau</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRomanMode('append');
                          if (!selectedNovelId && myNovels[0]) {
                            setSelectedNovelId(myNovels[0].storyId);
                            setAppendSeriesStatus(
                              myNovels[0].seriesStatus === 'termine' ? 'termine' : 'en-cours'
                            );
                          }
                          setError(null);
                        }}
                        className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center justify-center gap-1.5 ${
                          romanMode === 'append'
                            ? 'bg-white text-stone-900 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Chapitre suivant</span>
                      </button>
                    </div>
                  </div>

                  {romanMode === 'append' && (
                    <div className="space-y-2 pt-1">
                      <span className="block text-xs text-stone-600">
                        Choisissez le roman à poursuivre :
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {myNovels.map((novel) => {
                          const active = selectedNovel?.storyId === novel.storyId;
                          const genreLabel = novel.novelGenre
                            ? NOVEL_GENRE_LABELS[novel.novelGenre]
                            : null;
                          const statusLabel =
                            SERIES_STATUS_LABELS[novel.seriesStatus ?? 'en-cours'];
                          return (
                            <button
                              key={novel.storyId}
                              type="button"
                              onClick={() => {
                                setSelectedNovelId(novel.storyId);
                                setAppendSeriesStatus(
                                  novel.seriesStatus === 'termine' ? 'termine' : 'en-cours'
                                );
                              }}
                              className={`text-left p-2.5 rounded-md border flex items-center gap-3 transition-colors ${
                                active
                                  ? 'bg-[#F3F6FA] border-[#1B365D] ring-1 ring-[#1B365D]'
                                  : 'bg-[#FBF9F5] border-stone-200 hover:border-stone-400'
                              }`}
                            >
                              <NovelCoverArt
                                coverUrl={novel.coverUrl}
                                title={novel.title}
                                genre={novel.novelGenre}
                                size="xs"
                                showFallbackWhenMissing={true}
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="font-display text-sm font-medium text-stone-900 truncate">
                                  {novel.title}
                                </p>
                                <p className="text-[11px] text-stone-600 truncate tabular-nums">
                                  {novel.chapterCount ?? 1} chap. · {statusLabel}
                                  {genreLabel ? ` · ${genreLabel}` : ''}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Destination Selector (for new story / editing) */}
              {!isAppendMode && (
                <div className="space-y-3">
                  <span className="block text-xs uppercase tracking-widest text-stone-500">
                    Où publier cette histoire ?
                  </span>

                  {editingStory?.customSalonId ? (
                    <div className="px-4 py-3 bg-white border border-stone-200 rounded-md text-xs text-stone-700 flex items-center gap-2">
                      {editingStory.customSalonVisibility === 'private' ? (
                        <Lock className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
                      )}
                      <span>
                        Salon communautaire : <strong>{editingStory.customSalonName}</strong>
                      </span>
                    </div>
                  ) : selectedCustomSalon && !showDestinationPicker ? (
                    (() => {
                      const pal =
                        ACCENT_TONE_PALETTES[selectedCustomSalon.accentTone] ??
                        ACCENT_TONE_PALETTES.ink;
                      return (
                        <div
                          style={{ backgroundColor: pal.softBg, borderColor: pal.borderTint }}
                          className="p-4 border rounded-md flex items-center justify-between gap-4"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <p
                              style={{ color: pal.textAccent }}
                              className="text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              {selectedCustomSalon.visibility === 'private' ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 shrink-0" />
                                  <span>Salon privé</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="w-3.5 h-3.5 shrink-0" />
                                  <span>Salon public communautaire</span>
                                </>
                              )}
                            </p>
                            <p className="font-display text-lg font-medium text-stone-900 truncate">
                              {selectedCustomSalon.name}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowDestinationPicker(true)}
                            className="text-xs font-medium text-stone-700 hover:underline shrink-0"
                          >
                            Changer
                          </button>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setStoryScope('salon');
                            if (!editingStory && !initialPrompt && !selectedCustomSalonId) {
                              setPromptQuestion(THEME_MAP[theme].promptQuestion);
                            }
                          }}
                          className={`text-left p-3.5 rounded-md border transition-colors ${
                            storyScope === 'salon' || Boolean(selectedCustomSalonId)
                              ? 'bg-white border-[#1B365D] ring-1 ring-[#1B365D]'
                              : 'bg-white/70 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <Globe
                              className={`w-4 h-4 ${
                                storyScope === 'salon' || Boolean(selectedCustomSalonId)
                                  ? 'text-[#1B365D]'
                                  : 'text-stone-500'
                              }`}
                            />
                            <span className="text-xs font-semibold text-stone-900">
                              Dans un salon thématique
                            </span>
                          </div>
                          <p className="text-xs text-stone-600">
                            Publier dans l’un des 6 salons Lisière ou un salon communautaire.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setStoryScope('pelemele');
                            setSelectedCustomSalonId(null);
                            if (!editingStory && !initialPrompt) {
                              setPromptQuestion('');
                            }
                          }}
                          className={`text-left p-3.5 rounded-md border transition-colors ${
                            storyScope === 'pelemele' && !selectedCustomSalonId
                              ? 'bg-white border-[#1B365D] ring-1 ring-[#1B365D]'
                              : 'bg-white/70 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <Compass
                              className={`w-4 h-4 ${
                                storyScope === 'pelemele' && !selectedCustomSalonId
                                  ? 'text-[#1B365D]'
                                  : 'text-stone-500'
                              }`}
                            />
                            <span className="text-xs font-semibold text-stone-900">
                              Hors salon (Pêle-mêle)
                            </span>
                          </div>
                          <p className="text-xs text-stone-600">
                            Visible directement dans la bibliothèque ouverte pour tous.
                          </p>
                        </button>
                      </div>

                      {(storyScope === 'salon' || Boolean(selectedCustomSalonId)) && (
                        <div className="space-y-3 bg-white border border-stone-200 rounded-md p-3.5">
                          {!selectedCustomSalonId && (
                            <div className="space-y-2">
                              <span className="block text-xs font-medium text-stone-700">
                                Choisissez le salon :
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {STORY_THEMES.map((item) => {
                                  const active = theme === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => handleThemeChange(item.id)}
                                      style={
                                        active
                                          ? {
                                              backgroundColor: item.palette.accent,
                                              borderColor: item.palette.accent,
                                              color: '#FFFFFF',
                                            }
                                          : {
                                              borderColor: item.palette.borderTint,
                                            }
                                      }
                                      className={`text-left px-3 py-2 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                                        active
                                          ? ''
                                          : 'bg-[#FBF9F5] text-stone-800 hover:bg-stone-50'
                                      }`}
                                    >
                                      <span className="text-xs font-semibold truncate">
                                        {item.romanIndex} · {item.shortSalonName}
                                      </span>
                                      <span
                                        className={`text-[11px] truncate ${
                                          active ? 'text-white/80' : 'text-stone-500'
                                        }`}
                                      >
                                        {item.atmosphere}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {!editingStory && selectableCustomSalons.length > 0 && (
                            <div className="pt-2 border-t border-stone-100 space-y-1.5">
                              <label
                                htmlFor="custom-salon-select"
                                className="block text-xs font-medium text-stone-700"
                              >
                                Ou un salon de la communauté (optionnel)
                              </label>
                              <select
                                id="custom-salon-select"
                                value={selectedCustomSalonId ?? ''}
                                onChange={(e) => handleCustomSalonSelect(e.target.value)}
                                className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                              >
                                <option value="">
                                  — Utiliser le salon Lisière sélectionné ci-dessus —
                                </option>
                                {selectableCustomSalons.map((cs) => (
                                  <option key={cs.salonId} value={cs.salonId}>
                                    {cs.name} (
                                    {cs.visibility === 'private' ? 'Salon privé' : 'Salon public'})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Roman Genre, Cadence, Status & Cover Art */}
              {!isAppendMode && storyFormat === 'roman' && (
                <div className="space-y-4">
                  <div className="bg-white border border-stone-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label
                        htmlFor="roman-genre"
                        className="block text-xs uppercase tracking-widest text-stone-500 mb-1.5"
                      >
                        Type de roman
                      </label>
                      <select
                        id="roman-genre"
                        value={novelGenre}
                        onChange={(e) => setNovelGenre(e.target.value as NovelGenre)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                      >
                        {NOVEL_GENRES.map((g) => (
                          <option key={g} value={g}>
                            {NOVEL_GENRE_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="roman-cadence"
                        className="block text-xs uppercase tracking-widest text-stone-500 mb-1.5"
                      >
                        Rythme
                      </label>
                      <select
                        id="roman-cadence"
                        value={releaseCadence}
                        onChange={(e) => setReleaseCadence(e.target.value as ReleaseCadence)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                      >
                        {(['hebdomadaire', 'bihebdomadaire', 'libre'] as ReleaseCadence[]).map(
                          (cad) => (
                            <option key={cad} value={cad}>
                              {RELEASE_CADENCE_LABELS[cad]}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="roman-status"
                        className="block text-xs uppercase tracking-widest text-stone-500 mb-1.5"
                      >
                        Statut
                      </label>
                      <select
                        id="roman-status"
                        value={seriesStatus}
                        onChange={(e) => setSeriesStatus(e.target.value as SeriesStatus)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                      >
                        {(['en-cours', 'termine'] as SeriesStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {SERIES_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Collapsible Novel Cover Image Picker */}
                  <div className="bg-white border border-stone-200 rounded-md overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={showCoverPicker}
                      onClick={() => setShowCoverPicker((prev) => !prev)}
                      className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-[#FBF9F5] transition-colors"
                    >
                      <span className="text-xs font-medium text-stone-800 inline-flex items-center gap-2">
                        <ImagePlus className="w-4 h-4 text-[#1B365D]" />
                        <span>
                          {coverUrl
                            ? 'Couverture ajoutée (cliquer pour modifier)'
                            : 'Ajouter une image de couverture (facultatif)'}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${
                          showCoverPicker ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {showCoverPicker && (
                      <div className="px-4 pb-4 pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-start gap-4">
                        <NovelCoverArt
                          coverUrl={coverUrl}
                          title={title || 'Nouveau roman'}
                          genre={novelGenre}
                          size="md"
                          showFallbackWhenMissing={true}
                        />
                        <div className="flex-1 min-w-0 space-y-2.5 w-full">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              ref={coverFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={(e) => void handleCoverFileChange(e)}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={coverUploadBusy}
                              onClick={() => coverFileInputRef.current?.click()}
                              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded-md hover:border-[#1B365D] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <ImagePlus className="w-3.5 h-3.5" />
                              <span>
                                {coverUploadBusy
                                  ? 'Compression…'
                                  : coverUrl
                                    ? 'Changer l’image'
                                    : 'Importer depuis l’appareil'}
                              </span>
                            </button>

                            {coverUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCoverUrl('');
                                  setCoverError(null);
                                }}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Retirer</span>
                              </button>
                            )}
                          </div>

                          <input
                            id="roman-cover-url"
                            type="url"
                            aria-label="Lien d’image pour la couverture"
                            maxLength={FIELD_LIMITS.coverUrl.max}
                            value={coverUrl.startsWith('data:') ? '' : coverUrl}
                            onChange={(e) => setCoverUrl(e.target.value)}
                            placeholder={
                              coverUrl.startsWith('data:')
                                ? 'Image importée depuis votre appareil'
                                : 'Ou collez une URL d’image (https://…)'
                            }
                            className="w-full px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                          />

                          {coverError && (
                            <p role="alert" className="text-xs text-red-700">
                              {coverError}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: WRITING */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Compact Context Banner */}
              <div className="bg-white border border-stone-200 rounded-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-stone-700 min-w-0">
                  <span className="text-stone-500">Destination : </span>
                  <strong className="text-stone-900">{destinationSummaryLabel}</strong>
                  <span className="text-stone-400 mx-1.5">·</span>
                  <span>
                    {storyFormat === 'roman'
                      ? isAppendMode
                        ? 'Suite de roman'
                        : `Roman (${NOVEL_GENRE_LABELS[novelGenre]})`
                      : 'Confession / Récit'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleGoToStep(1)}
                  className="text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                >
                  Modifier le cadre
                </button>
              </div>

              {isAppendMode && selectedNovel ? (
                <div className="space-y-4">
                  <div className="bg-white border border-stone-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-stone-500">
                        Prochain chapitre
                      </p>
                      <p className="font-display text-lg font-medium text-stone-900">
                        Chapitre {(selectedNovel.chapterCount ?? 1) + 1} · {selectedNovel.title}
                      </p>
                    </div>
                    <div className="sm:w-52">
                      <label
                        htmlFor="append-roman-status"
                        className="block text-[11px] uppercase tracking-widest text-stone-500 mb-1"
                      >
                        Statut après publication
                      </label>
                      <select
                        id="append-roman-status"
                        value={appendSeriesStatus}
                        onChange={(e) => setAppendSeriesStatus(e.target.value as SeriesStatus)}
                        className="w-full min-h-[36px] px-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
                      >
                        {(['en-cours', 'termine'] as SeriesStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {SERIES_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label htmlFor="append-chap-title" className="text-sm font-medium text-stone-800">
                        Titre du chapitre {(selectedNovel.chapterCount ?? 1) + 1}
                      </label>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {chapterTitle.length}/{FIELD_LIMITS.chapterTitle.max}
                      </span>
                    </div>
                    <input
                      id="append-chap-title"
                      type="text"
                      maxLength={FIELD_LIMITS.chapterTitle.max}
                      value={chapterTitle}
                      onChange={(e) => setChapterTitle(e.target.value)}
                      placeholder="Ex. La gare du matin…"
                      className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md font-display text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label htmlFor="append-chap-content" className="text-sm font-medium text-stone-800">
                        Texte du chapitre
                      </label>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {chapterContent.length}/{FIELD_LIMITS.chapterContent.max} · {readingMinutes} min
                      </span>
                    </div>
                    <textarea
                      id="append-chap-content"
                      rows={10}
                      maxLength={FIELD_LIMITS.chapterContent.max}
                      value={chapterContent}
                      onChange={(e) => setChapterContent(e.target.value)}
                      placeholder="Poursuivez le fil de votre roman…"
                      className="w-full px-4 py-3 bg-white border border-stone-200 rounded-md text-base leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label htmlFor="append-chap-note" className="text-sm font-medium text-stone-800">
                        Mot de fin pour les lecteurs (facultatif)
                      </label>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {chapterNote.length}/{FIELD_LIMITS.chapterNote.max}
                      </span>
                    </div>
                    <input
                      id="append-chap-note"
                      type="text"
                      maxLength={FIELD_LIMITS.chapterNote.max}
                      value={chapterNote}
                      onChange={(e) => setChapterNote(e.target.value)}
                      placeholder="Ex. Rendez-vous la semaine prochaine pour la suite."
                      className="w-full px-4 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label htmlFor="story-title" className="text-sm font-medium text-stone-800">
                        {storyFormat === 'roman' ? 'Titre du roman' : 'Titre de la confession'}
                      </label>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {title.length}/{FIELD_LIMITS.title.max}
                      </span>
                    </div>
                    <input
                      id="story-title"
                      type="text"
                      maxLength={FIELD_LIMITS.title.max}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        storyFormat === 'roman'
                          ? 'Ex. Les Lettres de novembre…'
                          : 'Un titre simple et sincère…'
                      }
                      className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md font-display text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label htmlFor="story-content" className="text-sm font-medium text-stone-800">
                        {storyFormat === 'roman'
                          ? 'Chapitre 1 — Ouverture du roman'
                          : 'Votre texte'}
                      </label>
                      <span className="text-xs text-stone-500 tabular-nums">
                        {content.length}/{FIELD_LIMITS.content.max} · {readingMinutes} min
                      </span>
                    </div>
                    <textarea
                      id="story-content"
                      rows={11}
                      maxLength={FIELD_LIMITS.content.max}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        storyFormat === 'roman'
                          ? 'Écrivez le premier chapitre de votre roman…'
                          : 'Écrivez librement votre histoire, votre souvenir ou votre question…'
                      }
                      className="w-full px-4 py-3 bg-white border border-stone-200 rounded-md text-base leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>

                  {/* Collapsible Optional Prompt & Excerpt Drawer */}
                  <div className="bg-white border border-stone-200 rounded-md overflow-hidden">
                    <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={showWritingExtras}
                        onClick={() => setShowWritingExtras((prev) => !prev)}
                        className="text-xs font-medium text-stone-700 hover:text-stone-900 inline-flex items-center gap-1.5"
                      >
                        <ChevronDown
                          className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${
                            showWritingExtras ? 'rotate-180' : ''
                          }`}
                        />
                        <span>Amorce &amp; résumé (facultatif)</span>
                      </button>

                      {!editingStory && (
                        <button
                          type="button"
                          onClick={handleInsertStarter}
                          className="text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap"
                        >
                          + Phrase d’élan
                        </button>
                      )}
                    </div>

                    {showWritingExtras && (
                      <div className="px-4 pb-4 pt-3 border-t border-stone-100 space-y-3.5">
                        <div>
                          <label
                            htmlFor="story-prompt"
                            className="block text-xs font-medium text-stone-700 mb-1"
                          >
                            Question d’amorce
                          </label>
                          <textarea
                            id="story-prompt"
                            rows={2}
                            maxLength={FIELD_LIMITS.promptQuestion.max}
                            value={promptQuestion}
                            onChange={(e) => setPromptQuestion(e.target.value)}
                            placeholder="Quelle question accompagne ce texte ?"
                            className="w-full text-sm leading-relaxed text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#1E3A8A] placeholder:text-stone-400 resize-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between mb-1">
                            <label htmlFor="story-excerpt" className="text-xs font-medium text-stone-700">
                              {storyFormat === 'roman'
                                ? 'Synopsis court'
                                : 'Accroche dans le salon'}
                            </label>
                            <span className="text-[11px] text-stone-500 tabular-nums">
                              {excerpt.length}/{FIELD_LIMITS.excerpt.max}
                            </span>
                          </div>
                          <textarea
                            id="story-excerpt"
                            rows={2}
                            maxLength={FIELD_LIMITS.excerpt.max}
                            value={excerpt}
                            onChange={(e) => setExcerpt(e.target.value)}
                            placeholder="Laissé vide, les premières lignes seront utilisées."
                            className="w-full px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A] resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: ANONYMITY, ANTI-PLAGIARISM & VISIBILITY */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Ready-to-publish recap card */}
              <div className="bg-white border border-stone-200 rounded-md p-4 space-y-2">
                <p className="text-[11px] uppercase tracking-widest text-stone-500">
                  Récapitulatif avant envoi
                </p>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-medium text-stone-900">
                    {activeTitleValue.trim() || 'Sans titre'}
                  </h3>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {readingMinutes} min de lecture
                  </span>
                </div>
                <p className="text-xs text-stone-600">
                  Publication dans : <strong>{destinationSummaryLabel}</strong>
                </p>
              </div>

              {/* Anonymity Toggle */}
              {!isAppendMode && (
                <div className="bg-white border border-stone-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isAnonymous ? (
                        <EyeOff className="w-4 h-4 text-[#1B365D] shrink-0" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-stone-500 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-stone-900">
                        Publication anonyme ({storyFormat === 'roman' ? 'roman' : 'confession'})
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {isAnonymous
                        ? `Votre nom (${authorName}) est masqué sur la fiche et dans le salon : le récit s’affiche sous « Auteur anonyme ».`
                        : `Votre nom (${authorName}) sera affiché avec un lien vers votre mur personnel.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isAnonymous}
                    aria-label="Publier ce récit en mode anonyme"
                    onClick={() => setIsAnonymous((prev) => !prev)}
                    className={`min-h-[40px] px-4 py-2 rounded-md border text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center ${
                      isAnonymous
                        ? 'bg-[#1B365D] text-white border-[#1B365D] hover:bg-[#132744]'
                        : 'bg-[#FBF9F5] text-stone-800 border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>{isAnonymous ? 'Anonyme activé' : 'Publier anonymement'}</span>
                  </button>
                </div>
              )}

              {/* Anti-Plagiarism Policy (Romans Only) */}
              {storyFormat === 'roman' && (
                <div className="bg-white border border-stone-200 rounded-md p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#1B365D] mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-widest text-[#1B365D] font-semibold">
                        Politique anti-plagiat des romans
                      </p>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Tout roman publié sur Lisière doit être une création originale dont vous détenez les droits. Toute copie d’une œuvre existante ou d’un autre auteur entraîne le retrait du texte.
                      </p>
                    </div>
                  </div>

                  {plagiarismCheck &&
                    (plagiarismCheck.isSuspicious || plagiarismCheck.isModerateOverlap) &&
                    !plagiarismCheck.matchedIsOwnStory && (
                      <div
                        role="status"
                        className={`rounded-md border px-3.5 py-2.5 text-xs flex items-start gap-2 ${
                          plagiarismCheck.isSuspicious
                            ? 'bg-red-50 border-red-200 text-red-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {plagiarismCheck.isSuspicious
                            ? `Similitude très élevée (${plagiarismCheck.similarityPercent} %) détectée avec « ${plagiarismCheck.matchedStoryTitle} ». Modifiez votre texte pour publier une œuvre originale.`
                            : `Attention : ${plagiarismCheck.similarityPercent} % de passages proches de « ${plagiarismCheck.matchedStoryTitle} ». Vérifiez l’originalité avant de publier.`}
                        </span>
                      </div>
                    )}

                  <label className="flex items-start gap-2.5 text-xs text-stone-800 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={plagiarismAttested}
                      onChange={(e) => setPlagiarismAttested(e.target.checked)}
                      className="mt-0.5 rounded border-stone-300 text-[#1B365D] focus:ring-[#1B365D]"
                    />
                    <span className="leading-relaxed">
                      Je certifie sur l’honneur que {isAppendMode ? 'ce chapitre' : 'ce roman'} est une œuvre originale écrite par mes soins et respecte la charte anti-plagiat de Lisière.
                    </span>
                  </label>
                </div>
              )}

              {/* Visibility */}
              <div className="bg-white border border-stone-200 rounded-md p-4 space-y-2.5">
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  Visibilité de la publication
                </p>
                {isAppendMode ? (
                  <p className="text-xs text-stone-600">
                    Ce chapitre sera ajouté immédiatement à <strong>{selectedNovel?.title}</strong>.
                  </p>
                ) : isPrivateCustomSalon ? (
                  <div className="inline-flex items-center gap-2 px-3 py-2 bg-stone-100 rounded-md text-xs text-stone-700">
                    <Lock className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
                    <span>
                      Salon privé : visible uniquement par les membres admis de ce salon.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`min-h-[42px] px-3.5 py-2 text-xs font-medium rounded-md border text-left transition-colors ${
                        visibility === 'public'
                          ? 'bg-[#F3F6FA] border-[#1B365D] text-[#1B365D] ring-1 ring-[#1B365D]'
                          : 'bg-[#FBF9F5] border-stone-200 text-stone-700 hover:border-stone-400'
                      }`}
                    >
                      Partager dans le salon (public)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('private')}
                      className={`min-h-[42px] px-3.5 py-2 text-xs font-medium rounded-md border text-left transition-colors ${
                        visibility === 'private'
                          ? 'bg-[#F3F6FA] border-[#1B365D] text-[#1B365D] ring-1 ring-[#1B365D]'
                          : 'bg-[#FBF9F5] border-stone-200 text-stone-700 hover:border-stone-400'
                      }`}
                    >
                      Enregistrer en brouillon privé
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-4 py-2.5"
            >
              {error}
            </p>
          )}
        </div>

        {/* Sticky Bottom Footer Navigation */}
        <div className="shrink-0 bg-white border-t border-stone-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {step === 1 ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3.5 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap"
            >
              Annuler
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleGoToStep((step - 1) as ComposerStep)}
              className="min-h-[40px] px-3.5 py-2 text-sm font-medium text-stone-700 bg-stone-100 rounded-md hover:bg-stone-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>{step === 1 ? 'Passer à l’écriture' : 'Options & publication'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {submitting
                  ? 'Enregistrement…'
                  : isAppendMode
                    ? `Publier le chapitre ${(selectedNovel?.chapterCount ?? 1) + 1}`
                    : editingStory
                      ? 'Enregistrer'
                      : isPrivateCustomSalon
                        ? 'Publier en privé'
                        : visibility === 'public'
                          ? 'Publier dans le salon'
                          : 'Garder dans mon carnet'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
