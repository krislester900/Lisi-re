import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatFriendlyFirestoreError, updateUserAgeProfile } from '../lib/storyService';
import { FIELD_LIMITS } from '../types/story';

interface AgeOnboardingModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSaved?: (age: number) => void;
}

export function AgeOnboardingModal({ isOpen, onDismiss, onSaved }: AgeOnboardingModalProps) {
  const { user, profile } = useAuth();
  const [ageInput, setAgeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = Number(ageInput.trim());
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < FIELD_LIMITS.userAge.min ||
      parsed > FIELD_LIMITS.userAge.max
    ) {
      setError(
        `Indiquez votre âge en nombre entier entre ${FIELD_LIMITS.userAge.min} et ${FIELD_LIMITS.userAge.max} ans.`
      );
      return;
    }

    setSaving(true);
    try {
      const saved = await updateUserAgeProfile(user.uid, parsed);
      onSaved?.(saved);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible d’enregistrer votre âge.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-onboarding-title"
    >
      <div className="bg-[#FBF9F5] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-[#1B365D] dark:text-[#93B4E2] font-semibold">
              Cadre du compte · Âge privé
            </p>
            <h2
              id="age-onboarding-title"
              className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100"
            >
              Adapter Lisière à votre âge
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Compléter plus tard"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          Bienvenue{profile?.displayName ? `, ${profile.displayName}` : ''}. Renseignez votre âge (confidentiel, jamais affiché publiquement) afin que les salons ne vous proposent que des récits et fils adaptés.
        </p>

        <div className="bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md p-3.5 space-y-2 text-xs text-stone-600 dark:text-stone-300">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Même lorsque votre âge autorise la lecture, un avertissement <strong>« Contenu mature »</strong> s’affichera systématiquement avant d’ouvrir un texte sensible.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1B365D] dark:text-[#93B4E2] shrink-0 mt-0.5" />
            <span>
              Modifiable à tout moment dans <strong>Profils &rarr; Modifier mon profil</strong>.
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="onboarding-user-age"
              className="block text-sm font-medium text-stone-800 dark:text-stone-200 mb-1.5"
            >
              Votre âge (en années)
            </label>
            <input
              id="onboarding-user-age"
              type="number"
              min={FIELD_LIMITS.userAge.min}
              max={FIELD_LIMITS.userAge.max}
              step={1}
              required
              autoFocus
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              placeholder="Ex. 24"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-md text-base text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
            >
              Plus tard
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] dark:bg-[#3B629B] rounded-md hover:bg-[#132744] dark:hover:bg-[#2F5183] disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>{saving ? 'Enregistrement…' : 'Enregistrer mon âge'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
