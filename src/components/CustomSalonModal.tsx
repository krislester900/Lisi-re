import React, { useEffect, useState } from 'react';
import { Globe, Lock, ShieldCheck, X } from 'lucide-react';
import { createCustomSalon, updateCustomSalon } from '../lib/storyService';
import { ACCENT_TONE_PALETTES } from '../lib/themes';
import {
  CustomSalon,
  CustomSalonVisibility,
  FIELD_LIMITS,
  WallAccentTone,
} from '../types/story';

interface CustomSalonModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  ownerName: string;
  editingSalon?: CustomSalon | null;
  onSaved: (salonId: string, isEdit: boolean) => void;
}

const TONE_OPTIONS: WallAccentTone[] = ['ink', 'ochre', 'terracotta', 'sage', 'sand'];

export function CustomSalonModal({
  isOpen,
  onClose,
  ownerId,
  ownerName,
  editingSalon,
  onSaved,
}: CustomSalonModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptQuestion, setPromptQuestion] = useState('');
  const [admissionRules, setAdmissionRules] = useState('');
  const [visibility, setVisibility] = useState<CustomSalonVisibility>('public');
  const [accentTone, setAccentTone] = useState<WallAccentTone>('ink');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingSalon) {
      setName(editingSalon.name);
      setDescription(editingSalon.description);
      setPromptQuestion(editingSalon.promptQuestion);
      setAdmissionRules(editingSalon.admissionRules);
      setVisibility(editingSalon.visibility);
      setAccentTone(editingSalon.accentTone);
    } else {
      setName('');
      setDescription('');
      setPromptQuestion('');
      setAdmissionRules(
        'Bienveillance, écoute attentive et respect des récits déposés par chaque membre.'
      );
      setVisibility('public');
      setAccentTone('ink');
    }
  }, [isOpen, editingSalon]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < FIELD_LIMITS.salonName.min) {
      setError('Donnez un nom d’au moins 3 caractères à votre salon.');
      return;
    }
    if (description.trim().length < FIELD_LIMITS.salonDescription.min) {
      setError('Décrivez l’esprit du salon en au moins 10 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        description,
        promptQuestion,
        admissionRules,
        visibility,
        accentTone,
      };
      if (editingSalon) {
        await updateCustomSalon(editingSalon.salonId, ownerName, payload);
        onSaved(editingSalon.salonId, true);
      } else {
        const createdId = await createCustomSalon(ownerId, ownerName, payload);
        onSaved(createdId, false);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible d’enregistrer le salon pour le moment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-salon-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#FBF9F5] border border-stone-300 rounded-lg my-auto overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500">
              {editingSalon ? 'Paramètres du salon' : 'Nouvel espace de la communauté'}
            </p>
            <h2
              id="custom-salon-modal-title"
              className="font-display text-xl font-medium text-stone-900"
            >
              {editingSalon ? 'Modifier le salon et ses règles' : 'Créer votre propre salon'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de salon"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Visibility: Public vs Private */}
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-widest text-stone-500">
              Accès et visibilité du salon
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`text-left p-4 rounded-md border transition-colors ${
                  visibility === 'public'
                    ? 'bg-white border-[#1B365D] ring-1 ring-[#1B365D]'
                    : 'bg-white/70 border-stone-200 hover:border-stone-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe
                    className={`w-4 h-4 ${
                      visibility === 'public' ? 'text-[#1B365D]' : 'text-stone-500'
                    }`}
                  />
                  <span className="text-sm font-semibold text-stone-900">Salon public</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Ouvert à toute la communauté : chacun peut lire, rejoindre librement et y publier selon vos règles.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`text-left p-4 rounded-md border transition-colors ${
                  visibility === 'private'
                    ? 'bg-white border-[#1B365D] ring-1 ring-[#1B365D]'
                    : 'bg-white/70 border-stone-200 hover:border-stone-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Lock
                    className={`w-4 h-4 ${
                      visibility === 'private' ? 'text-[#1B365D]' : 'text-stone-500'
                    }`}
                  />
                  <span className="text-sm font-semibold text-stone-900">Salon privé</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Accès sur demande : vous examinez chaque candidature avant d’ouvrir les récits et le chat privé.
                </p>
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-name" className="text-sm font-medium text-stone-800">
                Nom du salon
              </label>
              <span className="text-xs text-stone-500 tabular-nums">
                {name.length}/{FIELD_LIMITS.salonName.max}
              </span>
            </div>
            <input
              id="salon-name"
              type="text"
              required
              maxLength={FIELD_LIMITS.salonName.max}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Le Cercle des Carnets de Nuit…"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md font-display text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-desc" className="text-sm font-medium text-stone-800">
                Esprit et présentation du lieu
              </label>
              <span className="text-xs text-stone-500 tabular-nums">
                {description.length}/{FIELD_LIMITS.salonDescription.max}
              </span>
            </div>
            <textarea
              id="salon-desc"
              required
              rows={3}
              maxLength={FIELD_LIMITS.salonDescription.max}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Expliquez quels types de récits, de romans ou d’échanges trouvent leur place ici…"
              className="w-full px-4 py-2.5 bg-white border border-stone-200 rounded-md text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {/* Admission Rules */}
          <div className="bg-white border border-stone-200 rounded-md p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="salon-rules"
                className="text-sm font-medium text-stone-900 inline-flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-[#1B365D]" />
                <span>
                  Règles d’admission ({visibility === 'private' ? 'salon privé' : 'salon public'})
                </span>
              </label>
              <span className="text-xs text-stone-500 tabular-nums">
                {admissionRules.length}/{FIELD_LIMITS.salonAdmissionRules.max}
              </span>
            </div>
            <textarea
              id="salon-rules"
              rows={3}
              maxLength={FIELD_LIMITS.salonAdmissionRules.max}
              value={admissionRules}
              onChange={(e) => setAdmissionRules(e.target.value)}
              placeholder={
                visibility === 'private'
                  ? 'Ex. Indiquez dans votre demande quel genre de texte vous aimez lire ou écrire. Confidentialité absolue demandée sur les textes partagés.'
                  : 'Ex. Restez attentif au ton de chacun, pas de spoilers sans prévenir, partagez vos textes avec sincérité.'
              }
              className="w-full px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {/* Optional Prompt Question */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-prompt" className="text-sm font-medium text-stone-800">
                Question d’ouverture posée sur la table (facultative)
              </label>
              <span className="text-xs text-stone-500 tabular-nums">
                {promptQuestion.length}/{FIELD_LIMITS.salonPrompt.max}
              </span>
            </div>
            <input
              id="salon-prompt"
              type="text"
              maxLength={FIELD_LIMITS.salonPrompt.max}
              value={promptQuestion}
              onChange={(e) => setPromptQuestion(e.target.value)}
              placeholder="Ex. Quel souvenir ou chapitre vous habite cette semaine ?"
              className="w-full px-4 py-2 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>

          {/* Accent Tone */}
          <div>
            <span className="block text-xs uppercase tracking-widest text-stone-500 mb-2">
              Couleur atmosphérique
            </span>
            <div className="flex flex-wrap gap-2">
              {TONE_OPTIONS.map((tone) => {
                const pal = ACCENT_TONE_PALETTES[tone];
                const active = accentTone === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setAccentTone(tone)}
                    style={
                      active
                        ? {
                            backgroundColor: pal.accent,
                            borderColor: pal.accent,
                            color: '#FFFFFF',
                          }
                        : { borderColor: pal.borderTint }
                    }
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      active ? '' : 'bg-white text-stone-800 hover:bg-stone-50'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: active ? '#FFFFFF' : pal.swatch }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      aria-hidden="true"
                    />
                    <span>{pal.label}</span>
                  </button>
                );
              })}
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

          <div className="pt-2 border-t border-stone-200 flex items-center justify-end gap-3">
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
                : editingSalon
                  ? 'Enregistrer le salon'
                  : 'Ouvrir le salon'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
