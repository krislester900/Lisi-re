import React, { useState } from 'react';
import { ArrowRight, Feather } from 'lucide-react';
import { STORY_THEMES } from '../lib/themes';
import { StoryThemeId } from '../types/story';
import { SalonEmblem } from './SalonEmblem';

interface ThemesViewProps {
  onStartFromTheme: (theme: StoryThemeId, promptQuestion: string, starter: string) => void;
  onVisitSalon: (theme: StoryThemeId) => void;
}

export function ThemesView({ onStartFromTheme, onVisitSalon }: ThemesViewProps) {
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
              Chaque fil correspond à l’un des cinq salons de Lisière. Vous pouvez visiter un salon pour en ressentir l’atmosphère, ou partir directement de sa question d’ouverture.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-stone-200">
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">5</p>
              <p className="text-xs text-stone-600 mt-1">Salons et fils ouverts à tous les parcours</p>
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
              <div className="w-full aspect-[3/4] rounded-sm border border-stone-200 bg-white overflow-hidden">
                <img
                  src="/assets/aistudio/0e2eea87952ac6209f6b8adc4f36e5a1_e3232990.jpg"
                  alt="Silhouette monochrome assise en train de lire au sommet d’une haute pile de livres"
                  referrerPolicy="no-referrer"
                  onError={() => setImg1Failed(true)}
                  className="w-full h-full object-contain p-2"
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] rounded-sm border border-stone-200 bg-stone-100 flex items-center justify-center p-4 text-center text-xs text-stone-500">
                Plonger dans la lecture et l’écriture
              </div>
            )}
            <figcaption className="text-xs font-serif italic text-stone-500 mt-2">
              Fig. 2 — Prendre de la hauteur par les mots
            </figcaption>
          </figure>

          <figure className="flex flex-col">
            {!img2Failed ? (
              <div className="w-full aspect-[3/4] rounded-sm border border-stone-200 bg-[#F4E6AE] overflow-hidden">
                <img
                  src="/assets/aistudio/81e1cb2d98f4d0407dd276e96bfde77f_04c63d1e.jpg"
                  alt="Illustration de lecteurs réunis autour d’une table ronde bleue avec des tasses et des carnets ouverts"
                  referrerPolicy="no-referrer"
                  onError={() => setImg2Failed(true)}
                  className="w-full h-full object-cover object-center"
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] rounded-sm border border-stone-200 bg-stone-100 flex items-center justify-center p-4 text-center text-xs text-stone-500">
                Échanges autour d’une même table
              </div>
            )}
            <figcaption className="text-xs font-serif italic text-stone-500 mt-2">
              Fig. 3 — Se retrouver autour des récits partagés
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="divide-y divide-stone-200 border-t border-b border-stone-200">
        {STORY_THEMES.map((theme) => (
          <div
            key={theme.id}
            className="py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <div className="lg:col-span-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <SalonEmblem
                  type={theme.emblem}
                  color={theme.palette.textAccent}
                  className="w-5 h-5 shrink-0"
                />
                <p
                  style={{ color: theme.palette.textAccent }}
                  className="text-xs font-medium tracking-wide"
                >
                  Salon {theme.romanIndex} · {theme.salonName}
                </p>
              </div>
              <h2 className="font-display text-2xl font-medium text-stone-900">
                {theme.promptQuestion}
              </h2>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <p className="text-sm text-stone-600 leading-relaxed">{theme.description}</p>
              <p
                style={{
                  backgroundColor: theme.palette.softBg,
                  borderColor: theme.palette.borderTint,
                }}
                className="text-sm text-stone-800 italic border rounded-md px-4 py-3"
              >
                Phrase d’élan : « {theme.starterSentence} »
              </p>
            </div>

            <div className="lg:col-span-3 flex flex-wrap lg:flex-col lg:items-end gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onStartFromTheme(theme.id, theme.promptQuestion, `${theme.starterSentence} `)
                }
                style={{ backgroundColor: theme.palette.accent }}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Feather className="w-4 h-4" />
                <span>Écrire sur ce fil</span>
              </button>
              <button
                type="button"
                onClick={() => onVisitSalon(theme.id)}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition-[border-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span>Visiter le salon</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
