import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Feather,
  Flag,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  AGE_RATING_OPTIONS,
  checkLocalContentHygiene,
  isContentAllowedForAge,
  shouldShowMatureWarning,
} from '../lib/contentRegulation';
import { formatFrenchDate } from '../lib/themes';
import {
  addSalonThreadReply,
  createSalonThread,
  deleteSalonThread,
  deleteSalonThreadReply,
  formatFriendlyFirestoreError,
  runAutomatedContentBotGuard,
  subscribeToSalonThreadReplies,
  subscribeToSalonThreads,
} from '../lib/storyService';
import {
  AgeRating,
  FIELD_LIMITS,
  SalonThread,
  SalonThreadReply,
  SalonThreadScope,
} from '../types/story';
import { MatureContentBadge } from './MatureContentBadge';
import type { ReportDraft } from './ReportModal';

interface SalonThreadsPanelProps {
  scope: SalonThreadScope;
  salonId: string;
  salonTitle: string;
  salonOwnerId?: string;
  viewerAge: number | null;
  canPost?: boolean;
  onOpenMemberWall: (memberId: string) => void;
  onWriteFromThread?: (threadTitle: string, threadBody: string) => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

export function SalonThreadsPanel({
  scope,
  salonId,
  salonTitle,
  salonOwnerId,
  viewerAge,
  canPost = true,
  onOpenMemberWall,
  onWriteFromThread,
  onOpenReport,
}: SalonThreadsPanelProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [threads, setThreads] = useState<SalonThread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replies, setReplies] = useState<SalonThreadReply[]>([]);
  const [repliesLoaded, setRepliesLoaded] = useState(false);

  const [showNewThreadForm, setShowNewThreadForm] = useState(false);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');
  const [threadMinAge, setThreadMinAge] = useState<AgeRating>(0);
  const [threadIsMature, setThreadIsMature] = useState(false);
  const [threadMatureReason, setThreadMatureReason] = useState('');
  const [threadCharterChecked, setThreadCharterChecked] = useState(true);
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [botFeedback, setBotFeedback] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    setThreadsLoaded(false);
    setSelectedThreadId(null);
    setReplies([]);
    const unsub = subscribeToSalonThreads(scope, salonId, (loaded) => {
      setThreads(loaded);
      setThreadsLoaded(true);
    });
    return () => unsub();
  }, [scope, salonId]);

  const { visibleThreads, hiddenByAgeCount } = useMemo(() => {
    const allowed: SalonThread[] = [];
    let hidden = 0;
    for (const thread of threads) {
      const isAuthor = Boolean(user && thread.authorId === user.uid);
      if (isContentAllowedForAge(thread, viewerAge, isAuthor)) {
        allowed.push(thread);
      } else {
        hidden += 1;
      }
    }
    return { visibleThreads: allowed, hiddenByAgeCount: hidden };
  }, [threads, viewerAge, user]);

  const activeThread = useMemo(
    () => visibleThreads.find((t) => t.threadId === selectedThreadId) ?? null,
    [visibleThreads, selectedThreadId]
  );

  useEffect(() => {
    if (!activeThread) {
      setReplies([]);
      setRepliesLoaded(false);
      return;
    }
    setRepliesLoaded(false);
    const unsub = subscribeToSalonThreadReplies(scope, salonId, activeThread.threadId, (loaded) => {
      setReplies(loaded);
      setRepliesLoaded(true);
    });
    return () => unsub();
  }, [scope, salonId, activeThread?.threadId]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!canPost) return;

    setThreadError(null);
    setBotFeedback(null);

    const cleanTitle = threadTitle.trim();
    const cleanBody = threadBody.trim();

    if (cleanTitle.length < FIELD_LIMITS.threadTitle.min) {
      setThreadError('Le titre du thème de discussion doit contenir au moins 4 caractères.');
      return;
    }
    if (!threadCharterChecked) {
      setThreadError('Confirmez le respect de la charte anti-haine et de bienveillance.');
      return;
    }

    const titleCheck = checkLocalContentHygiene(cleanTitle, {
      label: 'Le titre du fil',
      minWords: 1,
    });
    if (!titleCheck.ok) {
      setThreadError(titleCheck.reason ?? 'Titre invalide.');
      return;
    }

    if (cleanBody.length > 0) {
      const bodyCheck = checkLocalContentHygiene(cleanBody, {
        label: 'La présentation du fil',
        minWords: 2,
        strictSentenceQuality: true,
      });
      if (!bodyCheck.ok) {
        setThreadError(bodyCheck.reason ?? 'Texte invalide.');
        return;
      }
    }

    setThreadBusy(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'thread',
        title: cleanTitle,
        text: cleanBody || cleanTitle,
        declaredMinAge: threadMinAge,
        isMature: threadIsMature,
      });

      if (!verdict.allowed) {
        setThreadError(
          verdict.blockedReason ||
            'Le bot de régulation Lisière a bloqué ce fil (propos haineux, offensants ou incohérents).'
        );
        return;
      }

      const effectiveMinAge = Math.max(threadMinAge, verdict.recommendedMinAge) as AgeRating;
      const effectiveIsMature = Boolean(
        threadIsMature || verdict.isMature || effectiveMinAge >= 16
      );
      const effectiveReason = threadMatureReason.trim() || verdict.matureReason;

      const createdId = await createSalonThread({
        scope,
        salonId,
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Auteur',
        title: cleanTitle,
        body: cleanBody,
        minAge: effectiveMinAge,
        isMature: effectiveIsMature,
        matureReason: effectiveReason,
      });

      setThreadTitle('');
      setThreadBody('');
      setThreadMinAge(0);
      setThreadIsMature(false);
      setThreadMatureReason('');
      setShowNewThreadForm(false);
      setSelectedThreadId(createdId);
      if (effectiveIsMature && !threadIsMature) {
        setBotFeedback(
          'Bot de régulation : fil publié avec mention automatique « Contenu mature ».'
        );
      }
    } catch (err) {
      setThreadError(
        formatFriendlyFirestoreError(err, 'Impossible d’ouvrir ce fil de discussion.')
      );
    } finally {
      setThreadBusy(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!canPost) return;

    setReplyError(null);
    const cleanReply = replyText.trim();
    if (cleanReply.length < FIELD_LIMITS.threadReply.min) {
      setReplyError('Votre réponse doit contenir au moins 2 caractères.');
      return;
    }

    const hygiene = checkLocalContentHygiene(cleanReply, {
      label: 'Votre réponse',
      minWords: 1,
      strictSentenceQuality: true,
    });
    if (!hygiene.ok) {
      setReplyError(hygiene.reason ?? 'Message refusé par le contrôle qualité.');
      return;
    }

    setReplyBusy(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'reply',
        title: activeThread.title,
        text: cleanReply,
      });

      if (!verdict.allowed) {
        setReplyError(
          verdict.blockedReason ||
            'Réponse bloquée par le bot de régulation Lisière (propos offensants ou incohérents).'
        );
        return;
      }

      await addSalonThreadReply({
        scope,
        salonId,
        threadId: activeThread.threadId,
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Auteur',
        content: cleanReply,
      });
      setReplyText('');
    } catch (err) {
      setReplyError(formatFriendlyFirestoreError(err, 'Impossible d’envoyer cette réponse.'));
    } finally {
      setReplyBusy(false);
    }
  };

  const handleDeleteThread = async (thread: SalonThread) => {
    try {
      await deleteSalonThread(scope, salonId, thread.threadId);
      if (selectedThreadId === thread.threadId) {
        setSelectedThreadId(null);
      }
    } catch (err) {
      setThreadError(
        formatFriendlyFirestoreError(err, 'Impossible de supprimer ce fil de discussion.')
      );
    }
  };

  const handleDeleteReply = async (threadId: string, replyId: string) => {
    try {
      await deleteSalonThreadReply(scope, salonId, threadId, replyId);
    } catch (err) {
      setReplyError(formatFriendlyFirestoreError(err, 'Impossible de supprimer cette réponse.'));
    }
  };

  return (
    <section
      aria-label={`Fils de discussion de ${salonTitle}`}
      className="space-y-5"
    >
      {/* Top Toolbar */}
      <div className="bg-white border border-stone-200 rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl sm:text-2xl font-medium text-stone-900">
              Fils &amp; thèmes de discussion
            </h2>
            <span className="text-xs text-stone-500 tabular-nums">
              ({visibleThreads.length})
            </span>
          </div>
          <p className="text-xs text-stone-600 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
            <span>
              Charte bienveillante &amp; bot de régulation Lisière actifs : aucun propos haineux, offensant ou spam.
            </span>
          </p>
        </div>

        {canPost && (
          <button
            type="button"
            onClick={() => {
              if (!user) {
                void signInWithGoogle();
                return;
              }
              setThreadError(null);
              setShowNewThreadForm((prev) => !prev);
            }}
            className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{showNewThreadForm ? 'Fermer le formulaire' : 'Ouvrir un fil'}</span>
          </button>
        )}
      </div>

      {botFeedback && (
        <p
          role="status"
          className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3.5 py-2.5"
        >
          {botFeedback}
        </p>
      )}

      {hiddenByAgeCount > 0 && (
        <div className="bg-stone-100 border border-stone-200 rounded-md px-4 py-2.5 text-xs text-stone-700">
          {hiddenByAgeCount} fil{hiddenByAgeCount > 1 ? 's' : ''} classé
          {hiddenByAgeCount > 1 ? 's' : ''} pour un public plus âgé ou mature{' '}
          {viewerAge === null
            ? 'est masqué tant que votre âge n’est pas renseigné dans votre profil.'
            : `est masqué selon votre âge enregistré (${viewerAge} ans).`}
        </div>
      )}

      {/* New Thread Form */}
      {showNewThreadForm && canPost && (
        <form
          onSubmit={handleCreateThread}
          className="bg-white border border-stone-200 rounded-lg p-5 sm:p-6 space-y-4"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-[#1B365D] font-semibold">
              Nouveau thème dans {salonTitle}
            </p>
            <h3 className="font-display text-lg font-medium text-stone-900">
              Lancer une question ou un sujet d’échange
            </h3>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label htmlFor="new-thread-title" className="text-xs font-medium text-stone-800">
                Titre du fil ou thème
              </label>
              <span className="text-[11px] text-stone-500 tabular-nums">
                {threadTitle.length}/{FIELD_LIMITS.threadTitle.max}
              </span>
            </div>
            <input
              id="new-thread-title"
              type="text"
              required
              maxLength={FIELD_LIMITS.threadTitle.max}
              value={threadTitle}
              onChange={(e) => setThreadTitle(e.target.value)}
              placeholder="Ex. Comment oser écrire sans chercher la perfection ?"
              className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label htmlFor="new-thread-body" className="text-xs font-medium text-stone-800">
                Message d’ouverture (facultatif)
              </label>
              <span className="text-[11px] text-stone-500 tabular-nums">
                {threadBody.length}/{FIELD_LIMITS.threadBody.max}
              </span>
            </div>
            <textarea
              id="new-thread-body"
              rows={3}
              maxLength={FIELD_LIMITS.threadBody.max}
              value={threadBody}
              onChange={(e) => setThreadBody(e.target.value)}
              placeholder="Donnez le contexte, posez une question précise ou invitez les membres à réagir…"
              className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1B365D]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div>
              <label htmlFor="new-thread-age" className="block text-xs font-medium text-stone-800 mb-1">
                Âge minimum conseillé
              </label>
              <select
                id="new-thread-age"
                value={threadMinAge}
                onChange={(e) => {
                  const val = Number(e.target.value) as AgeRating;
                  setThreadMinAge(val);
                  if (val >= 16) setThreadIsMature(true);
                }}
                className="w-full min-h-[38px] px-3 py-1.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
              >
                {AGE_RATING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end gap-1.5">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-800 cursor-pointer min-h-[38px]">
                <input
                  type="checkbox"
                  checked={threadIsMature || threadMinAge >= 16}
                  onChange={(e) => setThreadIsMature(e.target.checked)}
                  className="rounded border-stone-300 text-[#1B365D] focus:ring-[#1B365D]"
                />
                <span>Signaler comme contenu mature (avertissement lecteur)</span>
              </label>
            </div>
          </div>

          {(threadIsMature || threadMinAge >= 16) && (
            <div>
              <label htmlFor="new-thread-mature-reason" className="block text-xs font-medium text-stone-800 mb-1">
                Précision de l’avertissement mature (facultatif)
              </label>
              <input
                id="new-thread-mature-reason"
                type="text"
                maxLength={FIELD_LIMITS.matureReason.max}
                value={threadMatureReason}
                onChange={(e) => setThreadMatureReason(e.target.value)}
                placeholder="Ex. Deuil difficile, santé mentale, thème adulte…"
                className="w-full px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
              />
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-stone-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={threadCharterChecked}
              onChange={(e) => setThreadCharterChecked(e.target.checked)}
              className="mt-0.5 rounded border-stone-300 text-[#1B365D] focus:ring-[#1B365D]"
            />
            <span>
              Je confirme que ce sujet ne contient aucun propos haineux, discriminatoire, insultant ou incohérent.
            </span>
          </label>

          {threadError && (
            <p
              role="alert"
              className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3.5 py-2"
            >
              {threadError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowNewThreadForm(false)}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={threadBusy}
              className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <span>{threadBusy ? 'Vérification par le bot…' : 'Publier ce fil'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Selected Thread Detail OR Thread List */}
      {activeThread ? (
        <div className="bg-white border border-stone-200 rounded-lg p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
            <button
              type="button"
              onClick={() => setSelectedThreadId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 hover:text-stone-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tous les fils du salon</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {onWriteFromThread && (
                <button
                  type="button"
                  onClick={() => onWriteFromThread(activeThread.title, activeThread.body)}
                  className="min-h-[34px] px-3 py-1 text-xs font-medium text-[#1B365D] bg-[#F3F6FA] border border-[#CBD6E6] rounded-md hover:border-[#1B365D] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>Écrire un récit sur ce fil</span>
                </button>
              )}
              {user && activeThread.authorId !== user.uid && onOpenReport && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenReport({
                      targetUserId: activeThread.authorId,
                      targetUserName: activeThread.authorName,
                      targetType: 'salon_thread',
                      targetId: activeThread.threadId,
                      targetContextId: salonId,
                      targetExcerpt: `${activeThread.title}\n${activeThread.body}`.slice(0, 600),
                      targetSummaryLabel: `Signaler le fil « ${activeThread.title} »`,
                    })
                  }
                  className="min-h-[34px] px-2.5 py-1 text-xs text-stone-600 border border-stone-200 rounded-md hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Signaler</span>
                </button>
              )}
              {user &&
                (activeThread.authorId === user.uid ||
                  (salonOwnerId && salonOwnerId === user.uid)) && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteThread(activeThread)}
                    className="min-h-[34px] px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer</span>
                  </button>
                )}
            </div>
          </div>

          {/* Mandatory Contenu Mature Notice inside Thread even when age matches */}
          {shouldShowMatureWarning(activeThread) && (
            <div
              role="note"
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5"
            >
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  Contenu mature — Même si ce fil est adapté à votre âge, il aborde des thèmes sensibles.
                </p>
                {activeThread.matureReason && (
                  <p className="text-amber-900">Motif signalé : {activeThread.matureReason}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <button
                type="button"
                onClick={() => onOpenMemberWall(activeThread.authorId)}
                className="font-semibold text-stone-900 hover:text-[#1B365D] hover:underline"
              >
                {activeThread.authorName}
              </button>
              <span aria-hidden="true">·</span>
              <span>{formatFrenchDate(activeThread.createdAt?.toDate() ?? null)}</span>
              <MatureContentBadge minAge={activeThread.minAge} isMature={activeThread.isMature} />
            </div>

            <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
              {activeThread.title}
            </h3>

            {activeThread.body && (
              <p className="text-sm sm:text-base text-stone-700 leading-relaxed whitespace-pre-line">
                {activeThread.body}
              </p>
            )}
          </div>

          {/* Replies */}
          <div className="pt-5 border-t border-stone-200 space-y-4">
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Réponses ({repliesLoaded ? replies.length : activeThread.replyCount})
            </p>

            {!repliesLoaded ? (
              <p className="text-xs text-stone-500">Chargement des réponses…</p>
            ) : replies.length === 0 ? (
              <p className="text-sm text-stone-500 italic">
                Aucune réponse pour l’instant. Lancez la discussion ci-dessous.
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {replies.map((reply) => {
                  const canDeleteReply = Boolean(
                    user &&
                      (reply.authorId === user.uid || (salonOwnerId && salonOwnerId === user.uid))
                  );
                  return (
                    <div key={reply.replyId} className="py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenMemberWall(reply.authorId)}
                            className="font-semibold text-stone-900 hover:text-[#1B365D] hover:underline"
                          >
                            {reply.authorName}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(reply.createdAt?.toDate() ?? null)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {user && reply.authorId !== user.uid && onOpenReport && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenReport({
                                  targetUserId: reply.authorId,
                                  targetUserName: reply.authorName,
                                  targetType: 'thread_reply',
                                  targetId: reply.replyId,
                                  targetContextId: `${salonId}_${activeThread.threadId}`,
                                  targetExcerpt: reply.content,
                                  targetSummaryLabel: `Signaler la réponse de ${reply.authorName}`,
                                })
                              }
                              title="Signaler cette réponse"
                              className="p-1 text-stone-400 hover:text-red-700 rounded"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDeleteReply && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteReply(activeThread.threadId, reply.replyId)}
                              title="Supprimer cette réponse"
                              className="p-1 text-stone-400 hover:text-red-700 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-line">
                        {reply.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {canPost && (
              <form onSubmit={handleSendReply} className="pt-2 space-y-2.5">
                {user ? (
                  <>
                    <textarea
                      rows={3}
                      maxLength={FIELD_LIMITS.threadReply.max}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Contribuer à ce fil de discussion (vérifié par le bot anti-haine Lisière)…"
                      className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1B365D]"
                    />
                    {replyError && (
                      <p role="alert" className="text-xs text-red-700">
                        {replyError}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={replyBusy}
                        className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{replyBusy ? 'Vérification…' : 'Répondre au fil'}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#FBF9F5] border border-stone-200 rounded-md">
                    <p className="text-xs text-stone-600">
                      Connectez-vous avec Google pour participer à ce fil de discussion.
                    </p>
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] whitespace-nowrap"
                    >
                      Se connecter
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      ) : !threadsLoaded ? (
        <div className="py-8 text-center text-sm text-stone-500">
          Chargement des fils de discussion…
        </div>
      ) : visibleThreads.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
          <MessageSquare className="w-6 h-6 text-stone-400 mx-auto" />
          <p className="font-display text-xl text-stone-900">
            Aucun fil de discussion ouvert ici pour le moment
          </p>
          <p className="text-sm text-stone-600 max-w-md mx-auto">
            Proposez un thème de conversation, une question d’écriture ou un point de vue à partager avec les membres de {salonTitle}.
          </p>
          {canPost && (
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  void signInWithGoogle();
                  return;
                }
                setShowNewThreadForm(true);
              }}
              className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lancer le premier fil</span>
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-lg">
          {visibleThreads.map((thread) => (
            <article key={thread.threadId} className="p-5 sm:p-6 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenMemberWall(thread.authorId)}
                    className="font-medium text-stone-800 hover:text-[#1B365D] hover:underline"
                  >
                    {thread.authorName}
                  </button>
                  <span aria-hidden="true">·</span>
                  <span>{formatFrenchDate(thread.createdAt?.toDate() ?? null)}</span>
                  <MatureContentBadge minAge={thread.minAge} isMature={thread.isMature} compact />
                </div>

                <span className="inline-flex items-center gap-1 text-xs text-stone-600 tabular-nums">
                  <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
                  <span>
                    {thread.replyCount} réponse{thread.replyCount > 1 ? 's' : ''}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedThreadId(thread.threadId)}
                className="text-left block w-full group"
              >
                <h3 className="font-display text-lg sm:text-xl font-medium text-stone-900 group-hover:text-[#1B365D] transition-colors">
                  {thread.title}
                </h3>
                {thread.body && (
                  <p className="text-sm text-stone-600 leading-relaxed line-clamp-2 mt-1">
                    {thread.body}
                  </p>
                )}
              </button>

              <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedThreadId(thread.threadId)}
                  className="text-xs font-medium text-[#1B365D] hover:underline"
                >
                  Ouvrir le fil &rarr;
                </button>

                {onWriteFromThread && (
                  <button
                    type="button"
                    onClick={() => onWriteFromThread(thread.title, thread.body)}
                    className="text-xs text-stone-600 hover:text-[#1B365D] inline-flex items-center gap-1"
                  >
                    <Feather className="w-3 h-3" />
                    <span>Écrire un récit sur ce fil</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
