import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
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

  // Append-chapter-to-existing-novel fields
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterNote, setChapterNote] = useState('');
  const [appendSeriesStatus, setAppendSeriesStatus] = useState<SeriesStatus>('en-cours');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const isAppendMode = !editingStory && storyFormat === 'roman' && romanMode === 'append' && myNovels.length > 0;

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
      setVisibility(initialCs?.visibility === 'private' ? 'private' : 'public');
      setIsAnonymous(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isAppendMode && selectedNovel) {
      if (chapterTitle.trim().length < FIELD_LIMITS.chapterTitle.min) {
        setError('Donnez un titre d’au moins 2 caractères à ce chapitre.');
        return;
      }
      if (chapterContent.trim().length < FIELD_LIMITS.chapterContent.min) {
        setError('Le chapitre doit contenir au moins 20 caractères.');
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
      return;
    }
    if (content.trim().length < FIELD_LIMITS.content.min) {
      setError('Prenez un instant pour écrire au moins 20 caractères.');
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

  const readingMinutes = estimateReadingMinutes(isAppendMode ? chapterContent : content);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
    >
      <div className="w-full max-w-3xl bg-[#FBF9F5] border border-stone-300 rounded-lg my-auto overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500">
              {editingStory
                ? 'Modifier un texte'
                : isAppendMode
                  ? 'Suite de roman'
                  : 'Table d’écriture'}
            </p>
            <h2 id="composer-title" className="font-display text-xl font-medium text-stone-900">
              {editingStory
                ? 'Relire et ajuster votre publication'
                : isAppendMode
                  ? 'Ajouter un chapitre à un roman en cours'
                  : 'Publier une confession ou un roman'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la table d’écriture"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Format Selector: Confession vs Serialized Roman */}
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-widest text-stone-500">
              Format de l’histoire
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
                    className={`text-left p-4 rounded-md border transition-colors ${
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

          {/* When writing a Roman and author already has novels: New novel vs Append chapter */}
          {!editingStory && storyFormat === 'roman' && myNovels.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-md p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-widest text-stone-500">
                  Vous écrivez déjà {myNovels.length} roman{myNovels.length > 1 ? 's' : ''}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-stone-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => {
                      setRomanMode('new');
                      setError(null);
                    }}
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                      romanMode === 'new'
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nouveau roman</span>
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
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                      romanMode === 'append'
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Écrire un chapitre ({myNovels.length})</span>
                  </button>
                </div>
              </div>

              {romanMode === 'append' && (
                <div className="space-y-2 pt-1">
                  <span className="block text-xs font-medium text-stone-700">
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

          {/* MODE APPEND: Add Chapter into Selected Existing Novel */}
          {isAppendMode && selectedNovel ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-stone-200 rounded-md p-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">
                    Prochain chapitre
                  </p>
                  <p className="font-display text-lg font-medium text-stone-900">
                    Chapitre {(selectedNovel.chapterCount ?? 1) + 1} · {selectedNovel.title}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {selectedNovel.visibility === 'private'
                      ? 'Roman en brouillon privé'
                      : 'Roman publié — ce chapitre rejoindra aussitôt le salon'}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="append-roman-status"
                    className="block text-xs uppercase tracking-widest text-stone-500 mb-1.5"
                  >
                    Statut après publication
                  </label>
                  <select
                    id="append-roman-status"
                    value={appendSeriesStatus}
                    onChange={(e) => setAppendSeriesStatus(e.target.value as SeriesStatus)}
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
                  required
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
                    de lecture
                  </span>
                </div>
                <textarea
                  id="append-chap-content"
                  required
                  rows={9}
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
            <>
              {/* MODE NEW / EDIT: Roman Genre, Cadence, Status & Cover Art */}
              {storyFormat === 'roman' && (
                <div className="space-y-4">
                  <div className="bg-white border border-stone-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        Rythme de parution
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
                        Statut du roman
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

                  {/* Novel Cover Image Picker & Preview */}
                  <div className="bg-white border border-stone-200 rounded-md p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <NovelCoverArt
                        coverUrl={coverUrl}
                        title={title || 'Nouveau roman'}
                        genre={novelGenre}
                        size="md"
                        showFallbackWhenMissing={true}
                      />
                      <div className="flex-1 min-w-0 space-y-2.5 w-full">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-stone-500">
                            Couverture du roman (facultative)
                          </p>
                          <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                            Importez une illustration depuis votre téléphone ou ordinateur (format portrait recadré 2:3 automatiquement) ou collez un lien d’image.
                          </p>
                        </div>

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
                                  : 'Choisir une couverture'}
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

                        <div>
                          <label htmlFor="roman-cover-url" className="sr-only">
                            Lien d’image pour la couverture
                          </label>
                          <input
                            id="roman-cover-url"
                            type="url"
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
                        </div>

                        {coverError && (
                          <p role="alert" className="text-xs text-red-700">
                            {coverError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <span className="block text-xs uppercase tracking-widest text-stone-500 mb-2">
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
                        <div className="space-y-0.5">
                          <p
                            style={{ color: pal.textAccent }}
                            className="text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            {selectedCustomSalon.visibility === 'private' ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Salon privé · Réservé aux membres admis</span>
                              </>
                            ) : (
                              <>
                                <Globe className="w-3.5 h-3.5" />
                                <span>Salon public · Aussi visible dans Pêle-mêle</span>
                              </>
                            )}
                          </p>
                          <p className="font-display text-lg font-medium text-stone-900">
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
                          Histoire libre visible par tout le monde dans Pêle-mêle, sans entrer dans un salon.
                        </p>
                      </button>

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
                            Dans un salon
                          </span>
                        </div>
                        <p className="text-xs text-stone-600">
                          Publier dans un salon thématique ou un salon privé/public de la communauté.
                        </p>
                      </button>
                    </div>

                    {(storyScope === 'salon' || Boolean(selectedCustomSalonId)) && (
                      <div className="space-y-3 pt-1">
                        {!selectedCustomSalonId && (
                          <div className="flex flex-wrap gap-2">
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
                                  className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                                    active ? '' : 'bg-white text-stone-800 hover:bg-stone-50'
                                  }`}
                                >
                                  {item.romanIndex} · {item.salonName}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {!editingStory && selectableCustomSalons.length > 0 && (
                          <div className="bg-white border border-stone-200 rounded-md p-3.5 space-y-1.5">
                            <label
                              htmlFor="custom-salon-select"
                              className="block text-xs font-medium text-stone-700"
                            >
                              Salon de la communauté (optionnel)
                            </label>
                            <select
                              id="custom-salon-select"
                              value={selectedCustomSalonId ?? ''}
                              onChange={(e) => handleCustomSalonSelect(e.target.value)}
                              className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                            >
                              <option value="">
                                — Publier dans le salon Lisière ci-dessus —
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

              <div className="bg-white border border-stone-200 rounded-md p-4">
                <div className="flex items-center justify-between gap-4 mb-1.5">
                  <label
                    htmlFor="story-prompt"
                    className="text-xs uppercase tracking-widest text-stone-500"
                  >
                    Question d’amorce (facultative)
                  </label>
                  {!editingStory && (
                    <button
                      type="button"
                      onClick={handleInsertStarter}
                      className="text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
                    >
                      Insérer une phrase d’élan
                    </button>
                  )}
                </div>
                <input
                  id="story-prompt"
                  type="text"
                  maxLength={FIELD_LIMITS.promptQuestion.max}
                  value={promptQuestion}
                  onChange={(e) => setPromptQuestion(e.target.value)}
                  placeholder="Quelle question accompagne ce texte ?"
                  className="w-full text-sm text-stone-800 bg-transparent focus:outline-none placeholder:text-stone-400"
                />
              </div>

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
                  required
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
                      : 'Votre confession'}
                  </label>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {content.length}/{FIELD_LIMITS.content.max} · {readingMinutes} min de lecture
                  </span>
                </div>
                <textarea
                  id="story-content"
                  required
                  rows={9}
                  maxLength={FIELD_LIMITS.content.max}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    storyFormat === 'roman'
                      ? 'Écrivez le premier chapitre de votre roman. Vous pourrez ensuite ajouter les chapitres suivants au rythme choisi…'
                      : 'Prenez votre temps. Confiez un souvenir, une pensée ou ce que vous aimeriez partager avec quelqu’un qui saura l’écouter…'
                  }
                  className="w-full px-4 py-3 bg-white border border-stone-200 rounded-md text-base leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label htmlFor="story-excerpt" className="text-sm font-medium text-stone-800">
                    {storyFormat === 'roman'
                      ? 'Synopsis ou accroche affichée dans le salon (facultatif)'
                      : 'Accroche affichée dans le salon (facultative)'}
                  </label>
                  <span className="text-xs text-stone-500 tabular-nums">
                    {excerpt.length}/{FIELD_LIMITS.excerpt.max}
                  </span>
                </div>
                <input
                  id="story-excerpt"
                  type="text"
                  maxLength={FIELD_LIMITS.excerpt.max}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Laissé vide, les premières lignes de votre texte seront utilisées."
                  className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              {/* Anonymity Toggle: Available for both Confessions and Romans */}
              <div className="bg-white border border-stone-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isAnonymous ? (
                      <EyeOff className="w-4 h-4 text-[#1B365D] shrink-0" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-stone-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-stone-900">
                      Mode anonyme ({storyFormat === 'roman' ? 'roman' : 'confession'})
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {isAnonymous
                      ? `Votre nom (${authorName}) est masqué sur la fiche de lecture, dans les salons et hors de votre mur public : le récit s’affiche sous « Auteur anonyme ».`
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
                  <span>{isAnonymous ? 'Mode anonyme activé' : 'Publier anonymement'}</span>
                </button>
              </div>
            </>
          )}

          {/* Anti-Plagiarism Policy & Automated Overlap Detection (Romans Only) */}
          {storyFormat === 'roman' && (
            <div className="bg-white border border-stone-200 rounded-md p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#1B365D] mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest text-[#1B365D] font-semibold">
                    Politique anti-plagiat des romans
                  </p>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Tout roman publié sur Lisière doit être une création originale dont vous détenez les droits. Toute copie d’un livre existant, d’un texte d’un autre auteur ou d’une œuvre publiée ailleurs entraîne le retrait du roman ; les lecteurs peuvent également signaler un plagiat directement depuis la lecture.
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

          <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              <div className="flex items-center gap-2 p-1 bg-stone-100 rounded-md w-fit">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    visibility === 'public'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Partager dans le salon
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    visibility === 'private'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Brouillon privé
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                {submitting
                  ? 'Enregistrement…'
                  : isAppendMode
                    ? `Publier le chapitre ${(selectedNovel?.chapterCount ?? 1) + 1}`
                    : editingStory
                      ? 'Enregistrer les modifications'
                      : isPrivateCustomSalon
                        ? 'Publier dans le salon privé'
                        : visibility === 'public'
                          ? 'Publier dans le salon'
                          : 'Garder dans mon carnet'}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-4 py-2.5"
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

