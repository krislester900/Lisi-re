import React, { useEffect, useState } from 'react';
import { Camera, Globe, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import { AGE_RATING_OPTIONS, checkLocalContentHygiene } from '../lib/contentRegulation';
import { compressAvatarForProfile } from '../lib/storageService';
import {
  createCustomSalon,
  runAutomatedContentBotGuard,
  updateCustomSalon,
} from '../lib/storyService';
import { ACCENT_TONE_PALETTES } from '../lib/themes';
import {
  AgeRating,
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
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [minAge, setMinAge] = useState<AgeRating>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setAvatarPreviewFailed(false);
    if (editingSalon) {
      setName(editingSalon.name);
      setDescription(editingSalon.description);
      setPromptQuestion(editingSalon.promptQuestion);
      setAdmissionRules(editingSalon.admissionRules);
      setVisibility(editingSalon.visibility);
      setAccentTone(editingSalon.accentTone);
      setAvatarUrl(editingSalon.avatarUrl ?? '');
      setMinAge(editingSalon.minAge ?? 0);
    } else {
      setName('');
      setDescription('');
      setPromptQuestion('');
      setAdmissionRules(
        'Bienveillance, écoute attentive et respect des récits déposés par chaque membre.'
      );
      setVisibility('public');
      setAccentTone('ink');
      setAvatarUrl('');
      setMinAge(0);
    }
  }, [isOpen, editingSalon]);

  if (!isOpen) return null;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAvatarBusy(true);
    try {
      const compressed = await compressAvatarForProfile(file);
      setAvatarUrl(compressed);
      setAvatarPreviewFailed(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de préparer la photo de ce salon.'
      );
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

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

    const nameCheck = checkLocalContentHygiene(name, { label: 'Le nom du salon' });
    if (!nameCheck.ok) {
      setError(nameCheck.reason ?? 'Nom de salon invalide.');
      return;
    }
    const descCheck = checkLocalContentHygiene(description, {
      label: 'La présentation du salon',
      minWords: 2,
      strictSentenceQuality: true,
    });
    if (!descCheck.ok) {
      setError(descCheck.reason ?? 'Présentation invalide.');
      return;
    }

    setSubmitting(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'custom_salon',
        title: name.trim(),
        text: `${description.trim()}\n${admissionRules.trim()}`,
        declaredMinAge: minAge,
      });

      if (!verdict.allowed) {
        setError(
          verdict.blockedReason ||
            'Le bot de régulation Lisière a bloqué la création de ce salon (propos haineux ou incohérents).'
        );
        return;
      }

      const effectiveMinAge = Math.max(minAge, verdict.recommendedMinAge) as AgeRating;

      const payload = {
        name,
        description,
        promptQuestion,
        admissionRules,
        visibility,
        accentTone,
        avatarUrl,
        minAge: effectiveMinAge,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 dark:bg-stone-950/75 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-salon-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#FBF9F5] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg my-auto overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              {editingSalon ? 'Paramètres du salon' : 'Nouvel espace de la communauté'}
            </p>
            <h2
              id="custom-salon-modal-title"
              className="font-display text-xl font-medium text-stone-900 dark:text-stone-100"
            >
              {editingSalon ? 'Modifier le salon et ses règles' : 'Créer votre propre salon'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de salon"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Visibility: Public vs Private */}
          <div className="space-y-2">
            <span className="block text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Accès et visibilité du salon
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`text-left p-4 rounded-md border transition-colors ${
                  visibility === 'public'
                    ? 'bg-white dark:bg-stone-800 border-[#1B365D] dark:border-[#6088C2] ring-1 ring-[#1B365D] dark:ring-[#6088C2]'
                    : 'bg-white/70 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe
                    className={`w-4 h-4 ${
                      visibility === 'public' ? 'text-[#1B365D] dark:text-[#93B4E2]' : 'text-stone-500 dark:text-stone-400'
                    }`}
                  />
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Salon public</span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  Ouvert à toute la communauté : chacun peut lire, rejoindre librement et y publier selon vos règles.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`text-left p-4 rounded-md border transition-colors ${
                  visibility === 'private'
                    ? 'bg-white dark:bg-stone-800 border-[#1B365D] dark:border-[#6088C2] ring-1 ring-[#1B365D] dark:ring-[#6088C2]'
                    : 'bg-white/70 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Lock
                    className={`w-4 h-4 ${
                      visibility === 'private' ? 'text-[#1B365D] dark:text-[#93B4E2]' : 'text-stone-500 dark:text-stone-400'
                    }`}
                  />
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Salon privé</span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  Accès sur demande : vous examinez chaque candidature avant d’ouvrir les récits et le chat privé.
                </p>
              </button>
            </div>
          </div>

          {/* Salon Profile Photo */}
          <div className="p-4 bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md flex flex-col sm:flex-row sm:items-center gap-4">
            {avatarUrl && !avatarPreviewFailed ? (
              <img
                src={avatarUrl}
                alt={name || 'Photo du salon'}
                referrerPolicy="no-referrer"
                onError={() => setAvatarPreviewFailed(true)}
                className="w-16 h-16 rounded-lg object-cover border border-stone-300 dark:border-stone-700 shrink-0"
              />
            ) : (
              <div
                style={{
                  backgroundColor: ACCENT_TONE_PALETTES[accentTone]?.softBg ?? '#F3F6FA',
                  color: ACCENT_TONE_PALETTES[accentTone]?.textAccent ?? '#1B365D',
                  borderColor: ACCENT_TONE_PALETTES[accentTone]?.borderTint ?? '#CBD6E6',
                }}
                className="w-16 h-16 rounded-lg border flex items-center justify-center font-display text-2xl shrink-0"
              >
                {(name.trim() || 'S').slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-xs font-medium text-stone-800 dark:text-stone-200">
                  Photo de profil du salon (facultative)
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Affichée dans la barre latérale, sur la carte du salon et en tête du salon.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-[#1B365D] dark:bg-[#3B629B] rounded-md hover:bg-[#132744] dark:hover:bg-[#2F5183] cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{avatarBusy ? 'Préparation…' : 'Choisir une image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="sr-only"
                  />
                </label>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl('');
                      setAvatarPreviewFailed(false);
                    }}
                    className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-red-300 dark:hover:border-red-700 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Retirer</span>
                  </button>
                )}
              </div>

              <input
                type="url"
                aria-label="Lien d’image pour le salon"
                maxLength={FIELD_LIMITS.avatarUrl.max}
                value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                onChange={(e) => {
                  setAvatarUrl(e.target.value);
                  setAvatarPreviewFailed(false);
                }}
                placeholder="Ou coller un lien d’image (https://…)"
                className="w-full px-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-name" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Nom du salon
              </label>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
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
              className="w-full px-4 py-2.5 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md font-display text-lg text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-[#6088C2]"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-desc" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Esprit et présentation du lieu
              </label>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
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
              className="w-full px-4 py-2.5 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm leading-relaxed text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-[#6088C2]"
            />
          </div>

          {/* Admission Rules */}
          <div className="bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="salon-rules"
                className="text-sm font-medium text-stone-900 dark:text-stone-100 inline-flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4 text-[#1B365D] dark:text-[#93B4E2]" />
                <span>
                  Règles d’admission ({visibility === 'private' ? 'salon privé' : 'salon public'})
                </span>
              </label>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
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
              className="w-full px-3 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm leading-relaxed text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-[#6088C2]"
            />
          </div>

          {/* Optional Prompt Question */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="salon-prompt" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Question d’ouverture posée sur la table (facultative)
              </label>
              <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
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
              className="w-full px-4 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-[#6088C2]"
            />
          </div>

          {/* Optional Salon Age Restriction */}
          <div className="bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md p-4 space-y-2">
            <label htmlFor="salon-min-age" className="block text-sm font-medium text-stone-900 dark:text-stone-100">
              Public conseillé pour ce salon
            </label>
            <select
              id="salon-min-age"
              value={minAge}
              onChange={(e) => setMinAge(Number(e.target.value) as AgeRating)}
              className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
            >
              {AGE_RATING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Accent Tone */}
          <div>
            <span className="block text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">
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
                      active ? '' : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700'
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
              className="text-sm text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md px-4 py-2.5"
            >
              {error}
            </p>
          )}

          <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 transition-colors whitespace-nowrap shrink-0"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] dark:bg-[#3B629B] rounded-md hover:bg-[#172D6B] dark:hover:bg-[#2F5183] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
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
