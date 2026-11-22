import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Flag,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  CASE_STUDY_CRITERIA,
  isModerationAdminEmail,
  MODERATION_CATEGORY_LABELS,
  MODERATION_GRAVITY_LABELS,
  MODERATION_REVIEW_STEPS,
  MODERATION_STATUS_LABELS,
  MODERATION_TARGET_LABELS,
  WARNING_SEVERITY_LABELS,
} from '../lib/moderationLabels';
import {
  acknowledgeUserWarning,
  dismissModerationCase,
  formatFriendlyFirestoreError,
  resolveModerationCaseWithWarning,
  updateModerationCaseStudy,
} from '../lib/storyService';
import { formatFrenchDate } from '../lib/themes';
import {
  FIELD_LIMITS,
  MemberWarning,
  ModerationCase,
  ModerationCaseStatus,
  ModerationGravityLevel,
  WarningSeverity,
} from '../types/story';

interface ModerationCenterViewProps {
  allCases: ModerationCase[];
  allWarnings: MemberWarning[];
  myCases: ModerationCase[];
  userWarnings: MemberWarning[];
  onOpenMemberWall: (userId: string) => void;
}

type CaseFilter = 'all' | ModerationCaseStatus;

export function ModerationCenterView({
  allCases,
  allWarnings,
  myCases,
  userWarnings,
  onOpenMemberWall,
}: ModerationCenterViewProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const isAdmin = isModerationAdminEmail(user?.email);

  const [statusFilter, setStatusFilter] = useState<CaseFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Editable case study fields for the selected case
  const [caseNotes, setCaseNotes] = useState('');
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [gravityLevel, setGravityLevel] = useState<ModerationGravityLevel>('aucune');
  const [decisionReason, setDecisionReason] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null
  );
  const [confirmWarn, setConfirmWarn] = useState(false);

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allCases.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.targetUserName.toLowerCase().includes(q) ||
        c.reporterName.toLowerCase().includes(q) ||
        c.targetExcerpt.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        MODERATION_CATEGORY_LABELS[c.category].label.toLowerCase().includes(q)
      );
    });
  }, [allCases, statusFilter, searchQuery]);

  const activeCase = useMemo(
    () =>
      filteredCases.find((c) => c.caseId === selectedCaseId) ??
      allCases.find((c) => c.caseId === selectedCaseId) ??
      filteredCases[0] ??
      null,
    [filteredCases, allCases, selectedCaseId]
  );

  useEffect(() => {
    if (!activeCase) return;
    setCaseNotes(activeCase.caseNotes ?? '');
    setSelectedCriteria(activeCase.evaluationCriteria ?? []);
    setGravityLevel(activeCase.gravityLevel ?? 'aucune');
    setDecisionReason(activeCase.decisionReason ?? '');
    setConfirmWarn(false);
    setFeedback(null);
  }, [activeCase?.caseId]);

  const counts = useMemo(
    () => ({
      open: allCases.filter((c) => c.status === 'open').length,
      under_review: allCases.filter((c) => c.status === 'under_review').length,
      resolved_warned: allCases.filter((c) => c.status === 'resolved_warned').length,
      resolved_dismissed: allCases.filter((c) => c.status === 'resolved_dismissed').length,
    }),
    [allCases]
  );

  const targetHistory = useMemo(() => {
    if (!activeCase) return { priorCases: 0, priorWarnings: 0 };
    const priorCases = allCases.filter(
      (c) => c.targetUserId === activeCase.targetUserId && c.caseId !== activeCase.caseId
    ).length;
    const priorWarnings = allWarnings.filter(
      (w) => w.targetUserId === activeCase.targetUserId
    ).length;
    return { priorCases, priorWarnings };
  }, [activeCase, allCases, allWarnings]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 space-y-4">
          <p className="text-xs uppercase tracking-widest text-stone-500">
            Modération &amp; étude de cas
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Espace de suivi des signalements
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            Connectez-vous avec votre compte Google pour consulter l’état de vos signalements ou accéder au centre d’étude de cas si vous êtes administrateur.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744]"
          >
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white border border-stone-200 rounded-lg p-7 space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500">
            <ShieldCheck className="w-4 h-4 text-[#1B365D]" />
            <span>Accès réservé à la modération</span>
          </div>
          <h1 className="font-display text-2xl font-medium text-stone-900">
            Centre d’étude de cas réservé à l’administration
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            L’instruction des signalements et l’émission des avertissements officiels sont gérées exclusivement par l’administrateur de Lisière. Vous pouvez néanmoins consulter ci-dessous vos propres signalements et éventuels avertissements reçus.
          </p>
        </div>

        {userWarnings.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-medium text-stone-900">
              Avertissements officiels reçus ({userWarnings.length})
            </h2>
            <div className="space-y-3">
              {userWarnings.map((w) => (
                <div
                  key={w.warningId}
                  className="bg-white border border-red-200 rounded-lg p-5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-medium ${
                        WARNING_SEVERITY_LABELS[w.severity].toneClass
                      }`}
                    >
                      {WARNING_SEVERITY_LABELS[w.severity].label}
                    </span>
                    <span className="text-xs text-stone-500">
                      {formatFrenchDate(w.createdAt?.toDate() ?? null)}
                    </span>
                  </div>
                  <p className="text-sm text-stone-800 leading-relaxed">{w.justification}</p>
                  {!w.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => void acknowledgeUserWarning(w.warningId)}
                      className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-red-800 rounded-md hover:bg-red-900"
                    >
                      Accuser réception
                    </button>
                  ) : (
                    <p className="text-xs text-emerald-800 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Pris connaissance</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium text-stone-900">
            Mes signalements transmis ({myCases.length})
          </h2>
          {myCases.length === 0 ? (
            <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-lg p-6">
              Vous n’avez soumis aucun signalement pour le moment.
            </p>
          ) : (
            <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-200">
              {myCases.map((c) => (
                <div key={c.caseId} className="p-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-stone-900">
                      {MODERATION_CATEGORY_LABELS[c.category].label}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded border font-medium ${
                        MODERATION_STATUS_LABELS[c.status].toneClass
                      }`}
                    >
                      {MODERATION_STATUS_LABELS[c.status].label}
                    </span>
                  </div>
                  {c.decisionReason && (
                    <p className="text-xs text-stone-700 bg-[#FBF9F5] border border-stone-200 rounded px-3 py-2">
                      Décision : {c.decisionReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const reviewerName = profile?.displayName || user.displayName || 'Modérateur Lisière';
  const isResolved =
    activeCase?.status === 'resolved_warned' || activeCase?.status === 'resolved_dismissed';

  const currentStepIdx = activeCase
    ? MODERATION_REVIEW_STEPS.findIndex((s) => s.id === activeCase.reviewStep)
    : 0;

  const toggleCriterion = (id: string) => {
    setSelectedCriteria((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSaveStepProgress = async (
    targetStep: ModerationCase['reviewStep'],
    successMsg: string
  ) => {
    if (!activeCase || busyAction) return;
    setFeedback(null);
    setBusyAction(targetStep);
    try {
      await updateModerationCaseStudy({
        caseId: activeCase.caseId,
        reviewStep: targetStep,
        evaluationCriteria: selectedCriteria,
        gravityLevel,
        caseNotes,
        reviewerId: user.uid,
        reviewerName,
      });
      setFeedback({ kind: 'success', message: successMsg });
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: formatFriendlyFirestoreError(err, 'Impossible de sauvegarder cette étape.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleIssueWarning = async () => {
    if (!activeCase || busyAction) return;
    setFeedback(null);

    if (gravityLevel === 'aucune') {
      setFeedback({
        kind: 'error',
        message:
          'Sélectionnez un niveau de gravité (modérée, sérieuse ou critique) à l’étape 3 avant d’émettre un avertissement.',
      });
      return;
    }
    if (decisionReason.trim().length < FIELD_LIMITS.moderationDecisionReason.min) {
      setFeedback({
        kind: 'error',
        message:
          'Rédigez une justification motivée de l’acte outrageant (au moins 10 caractères).',
      });
      return;
    }

    setBusyAction('warn');
    try {
      await resolveModerationCaseWithWarning({
        moderationCase: activeCase,
        severity: gravityLevel as WarningSeverity,
        evaluationCriteria: selectedCriteria,
        caseNotes,
        decisionReason,
        reviewerId: user.uid,
        reviewerName,
      });
      setConfirmWarn(false);
      setFeedback({
        kind: 'success',
        message: `L’acte outrageant a été justifié et un avertissement officiel a été envoyé à ${activeCase.targetUserName}.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: formatFriendlyFirestoreError(
          err,
          'Impossible d’émettre cet avertissement officiel.'
        ),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDismissCase = async () => {
    if (!activeCase || busyAction) return;
    setFeedback(null);

    if (decisionReason.trim().length < FIELD_LIMITS.moderationDecisionReason.min) {
      setFeedback({
        kind: 'error',
        message: 'Indiquez brièvement le motif du classement sans suite (au moins 10 caractères).',
      });
      return;
    }

    setBusyAction('dismiss');
    try {
      await dismissModerationCase({
        moderationCase: activeCase,
        evaluationCriteria: selectedCriteria,
        caseNotes,
        decisionReason,
        reviewerId: user.uid,
        reviewerName,
      });
      setFeedback({
        kind: 'success',
        message: 'Le dossier a été classé sans suite avec votre motif consigné.',
      });
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: formatFriendlyFirestoreError(err, 'Impossible de classer ce dossier.'),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 sm:py-10 space-y-6">
      {/* Header + Live Counters */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5 inline-flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-[#1B365D]" />
            <span>Administration · Procédure d’étude de cas de signalement</span>
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Modération &amp; avertissements officiels
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Examinez chaque signalement selon la procédure en 4 étapes : conservation des preuves, analyse des faits, qualification de la gravité et notification motivée au membre.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          {(
            [
              { id: 'open', label: 'À étudier', value: counts.open, tone: 'text-amber-900 bg-amber-50 border-amber-200' },
              { id: 'under_review', label: 'En étude', value: counts.under_review, tone: 'text-[#1B365D] bg-[#F3F6FA] border-[#CBD6E6]' },
              { id: 'resolved_warned', label: 'Avertis', value: counts.resolved_warned, tone: 'text-red-900 bg-red-50 border-red-200' },
              { id: 'resolved_dismissed', label: 'Classés', value: counts.resolved_dismissed, tone: 'text-stone-700 bg-stone-100 border-stone-200' },
            ] as const
          ).map((kpi) => (
            <button
              key={kpi.id}
              type="button"
              onClick={() => setStatusFilter(kpi.id)}
              className={`px-3 py-2 rounded-md border text-left transition-colors ${kpi.tone}`}
            >
              <p className="font-display text-xl font-medium tabular-nums leading-none">
                {kpi.value}
              </p>
              <p className="text-[11px] mt-1 whitespace-nowrap">{kpi.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200 rounded-lg p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `Tous (${allCases.length})` },
              { id: 'open', label: `À étudier (${counts.open})` },
              { id: 'under_review', label: `En cours (${counts.under_review})` },
              { id: 'resolved_warned', label: `Avertis (${counts.resolved_warned})` },
              { id: 'resolved_dismissed', label: `Classés (${counts.resolved_dismissed})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#1B365D] text-white border-[#1B365D]'
                  : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Membre, motif, extrait…"
            aria-label="Rechercher un dossier de signalement"
            className="w-full min-h-[36px] pl-8 pr-3 py-1 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
          />
        </div>
      </div>

      {allCases.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-12 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-emerald-700 mx-auto" />
          <h2 className="font-display text-2xl text-stone-900">
            Aucun signalement enregistré
          </h2>
          <p className="text-sm text-stone-600 max-w-md mx-auto">
            Lorsqu’un membre signalera un propos outrageant, un message privé ou un commentaire, le dossier apparaîtra ici pour instruction.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Case List Sidebar */}
          <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg divide-y divide-stone-200 overflow-hidden max-h-[760px] overflow-y-auto">
            {filteredCases.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                Aucun dossier ne correspond à ce filtre.
              </div>
            ) : (
              filteredCases.map((c) => {
                const isSelected = activeCase?.caseId === c.caseId;
                const priorWarnCount = allWarnings.filter(
                  (w) => w.targetUserId === c.targetUserId
                ).length;
                return (
                  <button
                    key={c.caseId}
                    type="button"
                    onClick={() => setSelectedCaseId(c.caseId)}
                    className={`w-full text-left p-4 space-y-2 transition-colors block ${
                      isSelected ? 'bg-[#F4F0E8]' : 'bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${
                          MODERATION_STATUS_LABELS[c.status].toneClass
                        }`}
                      >
                        {MODERATION_STATUS_LABELS[c.status].label}
                      </span>
                      <span className="text-[11px] text-stone-500 whitespace-nowrap">
                        {formatFrenchDate(c.createdAt?.toDate() ?? null)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-stone-900 truncate">
                        Visé : {c.targetUserName}
                      </p>
                      <p className="text-xs text-[#1B365D] truncate">
                        {MODERATION_CATEGORY_LABELS[c.category].label}
                      </p>
                    </div>

                    <p className="text-xs text-stone-600 line-clamp-2">{c.description}</p>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 pt-1">
                      <span>{MODERATION_TARGET_LABELS[c.targetType]}</span>
                      {priorWarnCount > 0 && (
                        <span className="text-red-800 font-medium tabular-nums">
                          {priorWarnCount} avert. antérieur{priorWarnCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* 4-Step Case Study Workspace */}
          {activeCase && (
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-lg p-6 space-y-6">
              {/* Case Header */}
              <div className="pb-5 border-b border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-medium ${
                        MODERATION_STATUS_LABELS[activeCase.status].toneClass
                      }`}
                    >
                      {MODERATION_STATUS_LABELS[activeCase.status].label}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-medium ${
                        MODERATION_GRAVITY_LABELS[activeCase.gravityLevel].toneClass
                      }`}
                    >
                      {MODERATION_GRAVITY_LABELS[activeCase.gravityLevel].label}
                    </span>
                    <span className="text-xs text-stone-500">
                      {MODERATION_TARGET_LABELS[activeCase.targetType]}
                    </span>
                  </div>

                  <span className="text-xs text-stone-500">
                    Signalé le {formatFrenchDate(activeCase.createdAt?.toDate() ?? null)}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-medium text-stone-900">
                      {MODERATION_CATEGORY_LABELS[activeCase.category].label}
                    </h2>
                    <p className="text-xs text-stone-600 mt-1">
                      Signalé par <strong className="text-stone-900">{activeCase.reporterName}</strong>{' '}
                      à l’encontre de{' '}
                      <button
                        type="button"
                        onClick={() => onOpenMemberWall(activeCase.targetUserId)}
                        className="font-semibold text-[#1B365D] hover:underline inline-flex items-center gap-1"
                      >
                        <UserIcon className="w-3 h-3" />
                        <span>{activeCase.targetUserName}</span>
                      </button>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded bg-[#FBF9F5] border border-stone-200 text-stone-700 tabular-nums">
                      {targetHistory.priorCases} autre{targetHistory.priorCases > 1 ? 's' : ''} dossier
                      {targetHistory.priorCases > 1 ? 's' : ''}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded border tabular-nums ${
                        targetHistory.priorWarnings > 0
                          ? 'bg-red-50 border-red-200 text-red-900 font-medium'
                          : 'bg-[#FBF9F5] border-stone-200 text-stone-700'
                      }`}
                    >
                      {targetHistory.priorWarnings} avertissement
                      {targetHistory.priorWarnings > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4-Step Progress Stepper */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                {MODERATION_REVIEW_STEPS.map((step, idx) => {
                  const isDone = isResolved || idx < currentStepIdx;
                  const isCurrent = !isResolved && idx === currentStepIdx;
                  return (
                    <div
                      key={step.id}
                      className={`p-3 rounded-md border text-xs space-y-1 ${
                        isCurrent
                          ? 'bg-[#F3F6FA] border-[#1B365D] text-stone-900'
                          : isDone
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                            : 'bg-[#FBF9F5] border-stone-200 text-stone-500'
                      }`}
                    >
                      <p className="font-semibold flex items-center gap-1.5">
                        {isDone && <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
                        <span className="truncate">{step.label}</span>
                      </p>
                      <p className="text-[11px] opacity-85 leading-snug">{step.description}</p>
                    </div>
                  );
                })}
              </div>

              {feedback && (
                <div
                  role={feedback.kind === 'error' ? 'alert' : 'status'}
                  className={`px-4 py-3 rounded-md border text-xs font-medium ${
                    feedback.kind === 'error'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              {/* Step 1: Preserved Facts & Reporter Statement */}
              <section className="bg-[#FBF9F5] border border-stone-200 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-widest text-stone-500 inline-flex items-center gap-1.5">
                    <FileSearch className="w-3.5 h-3.5 text-[#1B365D]" />
                    <span>Étape 1 · Pièce conservée &amp; récit du signalant</span>
                  </p>
                  {activeCase.status === 'open' && (
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void handleSaveStepProgress(
                          'analyse_faits',
                          'Étude de cas démarrée. Vous pouvez consigner votre analyse des faits.'
                        )
                      }
                      className="min-h-[34px] px-3 py-1 text-xs font-medium text-white bg-[#1B365D] rounded hover:bg-[#132744] disabled:opacity-60"
                    >
                      {busyAction === 'analyse_faits' ? 'Ouverture…' : 'Démarrer l’étude de cas'}
                    </button>
                  )}
                </div>

                {activeCase.targetExcerpt.trim() && (
                  <div className="bg-white border border-stone-200 rounded p-3.5 space-y-1">
                    <p className="text-[11px] uppercase tracking-widest text-stone-400">
                      Extrait figé au moment du signalement
                    </p>
                    <p className="text-sm text-stone-800 italic leading-relaxed whitespace-pre-line">
                      « {activeCase.targetExcerpt} »
                    </p>
                  </div>
                )}

                <div className="bg-white border border-stone-200 rounded p-3.5 space-y-1">
                  <p className="text-[11px] uppercase tracking-widest text-stone-400">
                    Description de {activeCase.reporterName}
                  </p>
                  <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-line">
                    {activeCase.description}
                  </p>
                </div>
              </section>

              {/* Step 2: Factual Analysis Notes */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="case-notes"
                    className="text-xs uppercase tracking-widest text-stone-500 font-medium inline-flex items-center gap-1.5"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 text-[#1B365D]" />
                    <span>Étape 2 · Analyse des faits &amp; contexte</span>
                  </label>
                  <span className="text-[11px] text-stone-400 tabular-nums">
                    {caseNotes.length} / {FIELD_LIMITS.moderationNotes.max}
                  </span>
                </div>

                <textarea
                  id="case-notes"
                  rows={3}
                  disabled={isResolved}
                  maxLength={FIELD_LIMITS.moderationNotes.max}
                  value={caseNotes}
                  onChange={(e) => setCaseNotes(e.target.value)}
                  placeholder="Consignez vos observations factuelles (récidive, contexte de la conversation, tonalité des propos…)"
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 disabled:opacity-75 focus:outline-none focus:border-[#1B365D]"
                />

                {!isResolved && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void handleSaveStepProgress(
                          'evaluation_gravite',
                          'Analyse enregistrée. Passez à la qualification des critères et de la gravité.'
                        )
                      }
                      className="min-h-[34px] px-3.5 py-1 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded hover:border-[#1B365D] disabled:opacity-60"
                    >
                      {busyAction === 'evaluation_gravite'
                        ? 'Enregistrement…'
                        : 'Enregistrer l’analyse & qualifier'}
                    </button>
                  </div>
                )}
              </section>

              {/* Step 3: Objective Criteria Checklist & Gravity */}
              <section className="space-y-3 pt-2 border-t border-stone-200">
                <p className="text-xs uppercase tracking-widest text-stone-500 font-medium inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Étape 3 · Critères retenus &amp; niveau de gravité</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CASE_STUDY_CRITERIA.map((criterion) => {
                    const checked = selectedCriteria.includes(criterion.id);
                    return (
                      <label
                        key={criterion.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#F3F6FA] border-[#1B365D]/40 text-stone-900'
                            : 'bg-[#FBF9F5] border-stone-200 text-stone-700'
                        } ${isResolved ? 'cursor-default opacity-85' : ''}`}
                      >
                        <input
                          type="checkbox"
                          disabled={isResolved}
                          checked={checked}
                          onChange={() => toggleCriterion(criterion.id)}
                          className="mt-0.5 rounded border-stone-300 text-[#1B365D]"
                        />
                        <span>{criterion.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-600 mr-1">Gravité retenue :</span>
                    {(
                      [
                        { id: 'aucune', label: 'Non qualifiée' },
                        { id: 'moderee', label: 'Modérée' },
                        { id: 'grave', label: 'Sérieuse' },
                        { id: 'critique', label: 'Critique' },
                      ] as const
                    ).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        disabled={isResolved}
                        onClick={() => setGravityLevel(g.id)}
                        className={`min-h-[32px] px-3 py-1 rounded border text-xs font-medium transition-colors ${
                          gravityLevel === g.id
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                        } disabled:opacity-75`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>

                  {!isResolved && (
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void handleSaveStepProgress(
                          'evaluation_gravite',
                          'Critères et niveau de gravité enregistrés.'
                        )
                      }
                      className="min-h-[32px] px-3 py-1 text-xs font-medium text-stone-700 border border-stone-300 rounded hover:border-stone-500"
                    >
                      Sauvegarder l’évaluation
                    </button>
                  )}
                </div>
              </section>

              {/* Step 4: Justification & Official Decision */}
              <section className="space-y-3 pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="decision-reason"
                    className="text-xs uppercase tracking-widest text-stone-500 font-medium inline-flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-red-800" />
                    <span>
                      Étape 4 · Justification de l’acte outrageant &amp; décision finale
                    </span>
                  </label>
                  <span className="text-[11px] text-stone-400 tabular-nums">
                    {decisionReason.length} / {FIELD_LIMITS.moderationDecisionReason.max}
                  </span>
                </div>

                <textarea
                  id="decision-reason"
                  rows={3}
                  disabled={isResolved}
                  maxLength={FIELD_LIMITS.moderationDecisionReason.max}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder="Rédigez la motivation claire qui expliquera au membre pourquoi son comportement est sanctionné d’un avertissement (ou le motif du classement sans suite)…"
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 disabled:opacity-75 focus:outline-none focus:border-[#1B365D]"
                />

                {!isResolved ? (
                  <div className="space-y-3 pt-1">
                    {confirmWarn ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-xs text-red-950 leading-relaxed">
                          Confirmer l’envoi d’un <strong>avertissement officiel ({MODERATION_GRAVITY_LABELS[gravityLevel].label})</strong> à <strong>{activeCase.targetUserName}</strong> ? Ce membre verra l’avertissement et votre justification dans son espace.
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => void handleIssueWarning()}
                            className="min-h-[36px] px-4 py-1.5 text-xs font-medium text-white bg-red-800 rounded-md hover:bg-red-900 disabled:opacity-60 whitespace-nowrap"
                          >
                            {busyAction === 'warn' ? 'Envoi…' : 'Confirmer l’avertissement'}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => setConfirmWarn(false)}
                            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-700 hover:text-stone-900"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleDismissCase()}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:border-stone-500 inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>
                            {busyAction === 'dismiss' ? 'Classement…' : 'Classer sans suite'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            if (gravityLevel === 'aucune') {
                              setFeedback({
                                kind: 'error',
                                message:
                                  'Choisissez un niveau de gravité (Modérée, Sérieuse ou Critique) avant d’émettre un avertissement.',
                              });
                              return;
                            }
                            if (
                              decisionReason.trim().length <
                              FIELD_LIMITS.moderationDecisionReason.min
                            ) {
                              setFeedback({
                                kind: 'error',
                                message:
                                  'Rédigez d’abord la justification écrite (au moins 10 caractères).',
                              });
                              return;
                            }
                            setFeedback(null);
                            setConfirmWarn(true);
                          }}
                          className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-red-800 rounded-md hover:bg-red-900 inline-flex items-center gap-1.5"
                        >
                          <Flag className="w-4 h-4" />
                          <span>Justifier l’acte outrageant &amp; Avertir le membre</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-[#FBF9F5] border border-stone-200 rounded-md p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-700">
                    <div>
                      <p className="font-medium text-stone-900">
                        Dossier clôturé par {activeCase.reviewerName || 'Modérateur'} le{' '}
                        {formatFrenchDate(activeCase.reviewedAt?.toDate() ?? null)}
                      </p>
                      {activeCase.warningIssued && activeCase.warningId && (() => {
                        const matchedWarn = allWarnings.find(
                          (w) => w.warningId === activeCase.warningId
                        );
                        if (!matchedWarn) return null;
                        return (
                          <p className="text-xs text-stone-600 mt-1">
                            Statut côté membre :{' '}
                            {matchedWarn.acknowledged
                              ? `Accusé de réception confirmé (${formatFrenchDate(
                                  matchedWarn.acknowledgedAt?.toDate() ?? null
                                )})`
                              : 'En attente d’accusé de réception'}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
