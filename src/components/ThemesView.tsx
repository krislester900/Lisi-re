import React, { useState } from 'react';
import { ArrowRight, Feather } from 'lucide-react';
import { STORY_THEMES } from '../lib/themes';
import { StoryThemeId } from '../types/story';

interface ThemesViewProps {
  onStartFromTheme: (theme: StoryThemeId, promptQuestion: string, starter: string) => void;
}

export function ThemesView({ onStartFromTheme }: ThemesViewProps) {
  const [img1Failed, setImg1Failed] = useState(false);
  const [img2Failed, setImg2Failed] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
              Fils d’écriture · Trouver les premiers mots
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight mb-4"
              style={{ textWrap: 'balance' }}
            >
              Des questions simples pour ouvrir la conversation sans malaise
            </h1>
            <p className="text-base text-stone-600 leading-relaxed max-w-xl">
              Il est parfois plus facile de se raconter à partir d’une question précise que devant une feuille blanche. Choisissez un fil qui vous ressemble et utilisez sa phrase d’élan si vous le souhaitez.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-stone-200">
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">5</p>
              <p className="text-xs text-stone-600 mt-1">Thèmes ouverts à tous les parcours</p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900">1 à 1</p>
              <p className="text-xs text-stone-600 mt-1">Passerelles directes depuis chaque récit</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <figure className="flex flex-col">
            {!img1Failed ? (
              <img
                src="/src/assets/images/theme_creation_workshop_1794978654371.jpg"
                alt="Mains écrivant des idées dans un carnet près d’un ordinateur"
                referrerPolicy="no-referrer"
                onError={() => setImg1Failed(true)}
                className="w-full h-60 lg:h-full object-cover rounded-sm border border-stone-200"
              />
            ) : (
              <div className="w-full h-60 lg:h-full rounded-sm border border-stone-200 bg-stone-100 flex items-center justify-center p-4 text-center text-xs text-stone-500">
                Atelier d’écriture et de création
              </div>
            )}
            <figcaption className="text-xs font-serif italic text-stone-500 mt-2">
              Fig. 2 — Dessiner des outils pour relier
            </figcaption>
          </figure>

          <figure className="flex flex-col">
            {!img2Failed ? (
              <img
                src="/src/assets/images/theme_quiet_connection_1794978654450.jpg"
                alt="Deux personnes échangeant calmement près d’une fenêtre avec leurs carnets"
                referrerPolicy="no-referrer"
                onError={() => setImg2Failed(true)}
                className="w-full h-60 lg:h-full object-cover rounded-sm border border-stone-200"
              />
            ) : (
              <div className="w-full h-60 lg:h-full rounded-sm border border-stone-200 bg-stone-100 flex items-center justify-center p-4 text-center text-xs text-stone-500">
                Échanges calmes et attentifs
              </div>
            )}
            <figcaption className="text-xs font-serif italic text-stone-500 mt-2">
              Fig. 3 — Prendre le temps d’écouter
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="divide-y divide-stone-200 border-t border-b border-stone-200">
        {STORY_THEMES.map((theme, idx) => (
          <div
            key={theme.id}
            className="py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <div className="lg:col-span-4">
              <p className="text-xs font-mono text-stone-500 tabular-nums mb-1">
                0{idx + 1}. {theme.label}
              </p>
              <h2 className="font-display text-2xl font-medium text-stone-900">
                {theme.promptQuestion}
              </h2>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <p className="text-sm text-stone-600 leading-relaxed">{theme.description}</p>
              <p className="text-sm text-stone-700 italic bg-white border border-stone-200 rounded-md px-4 py-3">
                Phrase d’élan : « {theme.starterSentence} »
              </p>
            </div>

            <div className="lg:col-span-3 flex lg:justify-end">
              <button
                type="button"
                onClick={() =>
                  onStartFromTheme(theme.id, theme.promptQuestion, `${theme.starterSentence} `)
                }
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A] rounded-md hover:bg-[#1E3A8A] hover:text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Feather className="w-4 h-4" />
                <span>Écrire sur ce fil</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
