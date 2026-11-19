import React, { useEffect, useState } from 'react';
import { BookOpen, Feather, Lock, X } from 'lucide-react';
import { createStory, updateStory } from '../lib/storyService';
import {
  estimateReadingMinutes,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import {
  CustomSalon,
  FIELD_LIMITS,
  ReleaseCadence,
  SeriesStatus,
  Story,
  StoryFormat,
  StoryThemeId,
  StoryVisibility,
} from '../types/story';

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: string;
  authorName: string;
  initialTheme?: StoryThemeId;
  initialPrompt?: string;
  initialStarter?: string;
  customSalons?: CustomSalon[];
  initialCustomSalonId?: string | null;
  editingStory?: Story | null;
  onSaved: (
    storyId: string,
    visibility: StoryVisibility,
    theme: StoryThemeId,
    customSalonId?: string | null
  ) => void;
}

export function StoryComposerModal({
  isOpen,
  onClose,
  authorId,
  authorName,
  initialTheme = 'creation',
  initialPrompt,
  initialStarter,
  customSalons = [],
  initialCustomSalonId = null,
  editingStory,
  onSaved,
}: StoryComposerModalProps) {
  const [theme, setTheme] = useState<StoryThemeId>(initialTheme);
  const [storyFormat, setStoryFormat] = useState<StoryFormat>('confession');
  const [releaseCadence, setReleaseCadence] = useState<ReleaseCadence>('hebdomadaire');
  const [seriesStatus, setSeriesStatus] = useState<SeriesStatus>('en-cours');
  const [promptQuestion, setPromptQuestion] = useState(
    initialPrompt ?? THEME_MAP[initialTheme].promptQuestion
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('public');
  const [selectedCustomSalonId, setSelectedCustomSalonId] = useState<string | null>(
    initialCustomSalonId
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingStory) {
      setTheme(editingStory.theme);
      setStoryFormat(editingStory.storyFormat ?? 'confession');
      setReleaseCadence(editingStory.releaseCadence ?? 'hebdomadaire');
      setSeriesStatus(editingStory.seriesStatus ?? 'en-cours');
      setPromptQuestion(editingStory.promptQuestion);
      setTitle(editingStory.title);
      setContent(editingStory.content);
      setExcerpt(editingStory.excerpt);
      setVisibility(editingStory.visibility);
      setSelectedCustomSalonId(editingStory.customSalonId ?? null);
    } else {
      const nextTheme = initialTheme || 'creation';
      const initialCs = initialCustomSalonId
        ? customSalons.find((s) => s.salonId === initialCustomSalonId) ?? null
        : null;
      setTheme(nextTheme);
      setStoryFormat('confession');
      setReleaseCadence('hebdomadaire');
      setSeriesStatus('en-cours');
      setPromptQuestion(
        initialPrompt ?? initialCs?.promptQuestion ?? THEME_MAP[nextTheme].promptQuestion
      );
      setTitle('');
      setContent(initialStarter ?? '');
      setExcerpt('');
      setSelectedCustomSalonId(initialCustomSalonId ?? null);
      setVisibility(initialCs?.visibility === 'private' ? 'private' : 'public');
    }
  }, [isOpen, editingStory, initialTheme, initialPrompt, initialStarter, initialCustomSalonId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < FIELD_LIMITS.title.min) {
      setError('Donnez un titre d’au moins 3 caractères à votre récit.');
      return;
    }
    if (content.trim().length < FIELD_LIMITS.content.min) {
      setError('Prenez un instant pour écrire au moins 20 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      const effectiveVisibility: StoryVisibility = isPrivateCustomSalon ? 'private' : visibility;
      const customSalonTarget =
        !editingStory && selectedCustomSalon
          ? {
              salonId: selectedCustomSalon.salonId,
              name: selectedCustomSalon.name,
              visibility: selectedCustomSalon.visibility,
            }
          : null;

      const payload = {
        title,
        excerpt,
        content,
        theme,
        customSalon: customSalonTarget,
        storyFormat,
        releaseCadence: storyFormat === 'confession' ? 'unique' : releaseCadence,
        seriesStatus: storyFormat === 'confession' ? 'complet' : seriesStatus,
        promptQuestion,
        visibility: effectiveVisibility,
      };
      if (editingStory) {
        await updateStory(editingStory.storyId, authorName, payload);
        onSaved(
          editingStory.storyId,
          effectiveVisibility,
          theme,
          editingStory.customSalonId ?? null
        );
      } else {
        const createdId = await createStory(authorId, authorName, payload);
        onSaved(createdId, effectiveVisibility, theme, customSalonTarget?.salonId ?? null);
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

  const readingMinutes = estimateReadingMinutes(content);

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
              {editingStory ? 'Modifier un texte' : 'Table d’écriture'}
            </p>
            <h2 id="composer-title" className="font-display text-xl font-medium text-stone-900">
              {editingStory
                ? 'Relire et ajuster votre publication'
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
                    onClick={() => setStoryFormat(item.id)}
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

          {storyFormat === 'roman' && (
            <div className="bg-white border border-stone-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {(['hebdomadaire', 'bihebdomadaire', 'libre'] as ReleaseCadence[]).map((cad) => (
                    <option key={cad} value={cad}>
                      {RELEASE_CADENCE_LABELS[cad]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="roman-status"
                  className="block text-xs uppercase tracking-widest text-stone-500 mb-1.5"
                >
                  Avancement du roman
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
          )}

          <div>
            <span className="block text-xs uppercase tracking-widest text-stone-500 mb-2">
              {selectedCustomSalonId ? 'Thématique associée' : 'Salon de destination'}
            </span>
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
                    className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      active ? '' : 'bg-white text-stone-800 hover:bg-stone-50'
                    }`}
                  >
                    {item.romanIndex} · {item.salonName}
                  </button>
                );
              })}
            </div>

            {editingStory?.customSalonId ? (
              <div className="mt-3 px-3.5 py-2.5 bg-white border border-stone-200 rounded-md text-xs text-stone-700 flex items-center gap-2">
                {editingStory.customSalonVisibility === 'private' && (
                  <Lock className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
                )}
                <span>
                  Salon communautaire : <strong>{editingStory.customSalonName}</strong>
                </span>
              </div>
            ) : (
              selectableCustomSalons.length > 0 && (
                <div className="mt-3 bg-white border border-stone-200 rounded-md p-3.5 space-y-1.5">
                  <label
                    htmlFor="custom-salon-select"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Ou publier dans un salon de la communauté (facultatif)
                  </label>
                  <select
                    id="custom-salon-select"
                    value={selectedCustomSalonId ?? ''}
                    onChange={(e) => handleCustomSalonSelect(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  >
                    <option value="">
                      — Publier uniquement dans le salon Lisière sélectionné ci-dessus —
                    </option>
                    {selectableCustomSalons.map((cs) => (
                      <option key={cs.salonId} value={cs.salonId}>
                        {cs.name} ({cs.visibility === 'private' ? 'Salon privé' : 'Salon public'})
                      </option>
                    ))}
                  </select>
                </div>
              )
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
                {storyFormat === 'roman' ? 'Chapitre 1 — Ouverture du roman' : 'Votre confession'}
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

          <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {isPrivateCustomSalon ? (
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
            <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
