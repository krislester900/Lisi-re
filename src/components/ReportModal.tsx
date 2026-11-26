import React, { useEffect, useState } from 'react';
import { CheckCircle2, Flag, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MODERATION_CATEGORY_LABELS, MODERATION_TARGET_LABELS } from '../lib/moderationLabels';
import {
  formatFriendlyFirestoreError,
  requestModerationAiAnalysis,
  submitModerationCase,
  upsertUserRelationship,
} from '../lib/storyService';
import {
  FIELD_LIMITS,
  ModerationAiAnalysis,
  ModerationReportCategory,
  ModerationTargetType,
} from '../types/story';

export interface ReportDraft {
  targetUserId: string;
  targetUserName: string;
  targetType: ModerationTargetType;
  targetId: string;
  targetContextId?: string;
  targetExcerpt: string;
  targetSummaryLabel: string;
  allowBlockOption?: boolean;
  isAnonymousTarget?: boolean;
}

interface ReportModalProps {
  draft: ReportDraft | null;
  onClose: () => void;
  onSubmitted?: (caseId: string, alsoBlocked: boolean) => void;
}

export function ReportModal({ draft, onClose, onSubmitted }: ReportModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [category, setCategory] = useState<ModerationReportCategory>('propos-outrageants');
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setCategory('propos-outrageants');
    setDescription('');
    setAlsoBlock(false);
    setBusy(false);
    setError(null);
    setSubmittedId(null);
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, busy, onClose]);

  if (!draft) return null;

  const canOfferBlock =
    draft.allowBlockOption !== false &&
    !draft.isAnonymousTarget &&
    Boolean(user && draft.targetUserId !== user.uid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setError(null);

    if (description.trim().length < FIELD_LIMITS.moderationDescription.min) {
      setError('Décrivez les faits ou propos en au moins 10 caractères pour l’étude de cas.');
      return;
    }

    setBusy(true);
    try {
      const reporterName = profile?.displayName || user.displayName || 'Membre';
      const resolvedTargetName = draft.isAnonymousTarget ? 'Auteur anonyme' : draft.targetUserName;

      let aiAnalysis: ModerationAiAnalysis | undefined;
      try {
        aiAnalysis = await requestModerationAiAnalysis({
          targetType: draft.targetType,
          category,
          targetUserName: resolvedTargetName,
          targetExcerpt: draft.targetExcerpt,
          description,
        });
      } catch {
        // AI pre-triage is optional at submission; admin can still run or handle the case manually.
      }

      const caseId = await submitModerationCase({
        reporterId: user.uid,
        reporterName,
        targetUserId: draft.targetUserId,
        targetUserName: resolvedTargetName,
        targetType: draft.targetType,
        targetId: draft.targetId,
        targetContextId: draft.targetContextId,
        targetExcerpt: draft.targetExcerpt,
        category,
        description,
        aiAnalysis,
      });

      let blockedNow = false;
      if (alsoBlock && canOfferBlock) {
        await upsertUserRelationship({
          ownerId: user.uid,
          targetUserId: draft.targetUserId,
          targetName: draft.targetUserName,
          relation: 'blocked',
          reason: MODERATION_CATEGORY_LABELS[category].label,
        });
        blockedNow = true;
      }

      setSubmittedId(caseId);
      onSubmitted?.(caseId, blockedNow);
    } catch (err) {
      setError(
        formatFriendlyFirestoreError(err, 'Impossible d’enregistrer ce signalement pour le moment.')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/50 dark:bg-stone-950/75 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="bg-[#FBF9F5] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg w-full max-w-xl overflow-hidden shadow-xl my-auto">
        <div className="px-6 py-4 bg-white dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
                Signalement &amp; étude de cas
              </p>
              <h2
                id="report-modal-title"
                className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 truncate"
              >
                {draft.targetSummaryLabel}
              </h2>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Fermer la fenêtre de signalement"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submittedId ? (
          <div className="p-6 sm:p-7 space-y-5">
            <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-md p-4 text-emerald-950 dark:text-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">Signalement transmis avec capture figée des faits</p>
                <p className="text-xs leading-relaxed text-emerald-900 dark:text-emerald-300">
                  Votre dossier va suivre la procédure d’étude de cas en 4 étapes (réception, analyse des faits, qualification de la gravité et décision motivée). Si l’acte outrageant est avéré, un avertissement officiel sera adressé au membre concerné.
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Vous pouvez suivre l’avancement de ce dossier dans « Mon carnet → Signalements ».
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] dark:bg-[#3B629B] rounded-md hover:bg-[#132744] dark:hover:bg-[#2F5183]"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : !user ? (
          <div className="p-6 sm:p-7 space-y-4">
            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
              Connectez-vous avec votre compte Google pour soumettre un signalement et suivre l’étude de cas correspondante.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1B365D] dark:bg-[#3B629B] rounded-md hover:bg-[#132744] dark:hover:bg-[#2F5183]"
              >
                Se connecter avec Google
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md p-4 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                <span>Type : {MODERATION_TARGET_LABELS[draft.targetType]}</span>
                <span>
                  Membre concerné :{' '}
                  <strong className="text-stone-800 dark:text-stone-100">
                    {draft.isAnonymousTarget ? 'Auteur anonyme' : draft.targetUserName}
                  </strong>
                </span>
              </div>
              {draft.targetExcerpt.trim() && (
                <blockquote className="mt-2 pt-2 border-t border-stone-100 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300 italic leading-relaxed line-clamp-4 whitespace-pre-line">
                  « {draft.targetExcerpt} »
                </blockquote>
              )}
            </div>

            <div>
              <label
                htmlFor="report-category"
                className="block text-xs font-medium text-stone-800 dark:text-stone-200 mb-1.5"
              >
                Motif principal du signalement
              </label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ModerationReportCategory)}
                className="w-full min-h-[42px] px-3 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
              >
                {(Object.keys(MODERATION_CATEGORY_LABELS) as ModerationReportCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {MODERATION_CATEGORY_LABELS[key].label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
                {MODERATION_CATEGORY_LABELS[category].hint}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="report-description"
                  className="block text-xs font-medium text-stone-800 dark:text-stone-200"
                >
                  Contexte et explication des faits
                </label>
                <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
                  {description.length} / {FIELD_LIMITS.moderationDescription.max}
                </span>
              </div>
              <textarea
                id="report-description"
                rows={4}
                required
                minLength={FIELD_LIMITS.moderationDescription.min}
                maxLength={FIELD_LIMITS.moderationDescription.max}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez précisément ce qui s’est produit ou quels propos vous semblent outrageants…"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#6088C2]"
              />
            </div>

            {canOfferBlock && (
              <label className="flex items-start gap-2.5 p-3.5 bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-700 dark:text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={(e) => setAlsoBlock(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 dark:border-stone-600 text-[#1B365D]"
                />
                <span>
                  <strong className="text-stone-900 dark:text-stone-100 block mb-0.5">
                    Bloquer également {draft.targetUserName}
                  </strong>
                  Empêche tout nouvel échange privé entre vous et masque ses écrits et commentaires de votre espace.
                </span>
              </label>
            )}

            <div className="flex items-start gap-2 text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0 mt-0.5" />
              <span>
                Une copie figée de l’extrait signalé est conservée pour l’étude de cas afin que l’équipe de modération puisse vérifier les faits même si le message d’origine est supprimé.
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md px-3.5 py-2"
              >
                {error}
              </p>
            )}

            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-red-800 dark:bg-red-700 rounded-md hover:bg-red-900 dark:hover:bg-red-800 disabled:opacity-60 inline-flex items-center gap-2"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{busy ? 'Envoi…' : 'Transmettre le signalement'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
