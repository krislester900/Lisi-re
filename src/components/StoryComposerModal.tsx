import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createStory, updateStory } from '../lib/storyService';
import { estimateReadingMinutes, STORY_THEMES, THEME_MAP } from '../lib/themes';
import { FIELD_LIMITS, Story, StoryThemeId, StoryVisibility } from '../types/story';

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: string;
  authorName: string;
  initialTheme?: StoryThemeId;
  initialPrompt?: string;
  initialStarter?: string;
  editingStory?: Story | null;
  onSaved: (storyId: string, visibility: StoryVisibility) => void;
}

export function StoryComposerModal({
  isOpen,
  onClose,
  authorId,
  authorName,
  initialTheme = 'creation',
  initialPrompt,
  initialStarter,
  editingStory,
  onSaved,
}: StoryComposerModalProps) {
  const [theme, setTheme] = useState<StoryThemeId>(initialTheme);
  const [promptQuestion, setPromptQuestion] = useState(
    initialPrompt ?? THEME_MAP[initialTheme].promptQuestion
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingStory) {
      setTheme(editingStory.theme);
      setPromptQuestion(editingStory.promptQuestion);
      setTitle(editingStory.title);
      setContent(editingStory.content);
      setExcerpt(editingStory.excerpt);
      setVisibility(editingStory.visibility);
    } else {
      const nextTheme = initialTheme || 'creation';
      setTheme(nextTheme);
      setPromptQuestion(initialPrompt ?? THEME_MAP[nextTheme].promptQuestion);
      setTitle('');
      setContent(initialStarter ?? '');
      setExcerpt('');
      setVisibility('public');
    }
  }, [isOpen, editingStory, initialTheme, initialPrompt, initialStarter]);

  if (!isOpen) return null;

  const handleThemeChange = (nextTheme: StoryThemeId) => {
    setTheme(nextTheme);
    if (!editingStory && !initialPrompt) {
      setPromptQuestion(THEME_MAP[nextTheme].promptQuestion);
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
      if (editingStory) {
        await updateStory(editingStory.storyId, authorName, {
          title,
          excerpt,
          content,
          theme,
          promptQuestion,
          visibility,
        });
        onSaved(editingStory.storyId, visibility);
      } else {
        const createdId = await createStory(authorId, authorName, {
          title,
          excerpt,
          content,
          theme,
          promptQuestion,
          visibility,
        });
        onSaved(createdId, visibility);
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
              {editingStory ? 'Modifier un récit' : 'Table d’écriture'}
            </p>
            <h2 id="composer-title" className="font-display text-xl font-medium text-stone-900">
              {editingStory ? 'Relire et ajuster votre texte' : 'Déposer une histoire personnelle'}
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
          <div>
            <span className="block text-xs uppercase tracking-widest text-stone-500 mb-2">
              Salon de destination
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
                      active
                        ? ''
                        : 'bg-white text-stone-800 hover:bg-stone-50'
                    }`}
                  >
                    {item.romanIndex} · {item.salonName}
                  </button>
                );
              })}
            </div>
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
                Titre du récit
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
              placeholder="Un titre simple et sincère…"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md font-display text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="story-content" className="text-sm font-medium text-stone-800">
                Votre histoire
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
              placeholder="Prenez votre temps. Racontez un souvenir, une intention, ce que vous aimeriez partager avec quelqu’un qui saura l’écouter…"
              className="w-full px-4 py-3 bg-white border border-stone-200 rounded-md text-base leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="story-excerpt" className="text-sm font-medium text-stone-800">
                Accroche affichée dans le salon (facultative)
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
              placeholder="Laissée vide, les premières lignes de votre récit seront utilisées."
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
