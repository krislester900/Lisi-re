import React, { useEffect, useState } from 'react';
import { BookOpen, Heart, MessageCircle, Plus, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  addStoryChapter,
  addStoryEcho,
  buildExchangeId,
  createExchangeWithFirstMessage,
  fetchPublicProfile,
  subscribeToStoryChapters,
  subscribeToStoryEchoes,
  subscribeToUserResonance,
  toggleStoryResonance,
} from '../lib/storyService';
import {
  ECHO_TYPE_LABELS,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  THEME_MAP,
} from '../lib/themes';
import {
  Chapter,
  Echo,
  EchoReplyType,
  Exchange,
  FIELD_LIMITS,
  PublicProfile,
  SeriesStatus,
  Story,
} from '../types/story';

interface StoryReaderModalProps {
  story: Story | null;
  onClose: () => void;
  existingExchanges: Exchange[];
  onOpenExchange: (exchangeId: string) => void;
  onOpenMemberWall: (userId: string) => void;
}

export function StoryReaderModal({
  story,
  onClose,
  existingExchanges,
  onOpenExchange,
  onOpenMemberWall,
}: StoryReaderModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0); // 0 = Chapitre 1 (story.content), >=1 = chapters[idx - 1]
  const [hasResonated, setHasResonated] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<PublicProfile | null>(null);
  const [resonateBusy, setResonateBusy] = useState(false);

  const [replyType, setReplyType] = useState<EchoReplyType>('comment');
  const [echoText, setEchoText] = useState('');
  const [echoBusy, setEchoBusy] = useState(false);
  const [echoError, setEchoError] = useState<string | null>(null);

  const [showBridgeBox, setShowBridgeBox] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState('');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Author chapter composer state
  const [showChapterForm, setShowChapterForm] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterNote, setChapterNote] = useState('');
  const [markCompleted, setMarkCompleted] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);

  useEffect(() => {
    if (!story) return;
    setEchoText('');
    setEchoError(null);
    setReplyType('comment');
    setShowBridgeBox(false);
    setBridgeMessage('');
    setBridgeError(null);
    setActiveChapterIdx(0);
    setShowChapterForm(false);
    setChapterTitle('');
    setChapterContent('');
    setChapterNote('');
    setMarkCompleted(false);
    setChapterError(null);

    const unsubChapters =
      story.storyFormat === 'roman'
        ? subscribeToStoryChapters(
            story.storyId,
            story.visibility,
            user?.uid ?? null,
            story.authorId,
            setChapters
          )
        : (() => {
            setChapters([]);
            return () => {};
          })();

    if (story.visibility !== 'public') {
      setEchoes([]);
      setHasResonated(false);
      setAuthorProfile(null);
      return () => {
        unsubChapters();
      };
    }

    const unsubEchoes = subscribeToStoryEchoes(story.storyId, setEchoes);

    let unsubResonance: (() => void) | null = null;
    if (user) {
      unsubResonance = subscribeToUserResonance(story.storyId, user.uid, setHasResonated);
    } else {
      setHasResonated(false);
    }

    void fetchPublicProfile(story.authorId)
      .then((p) => setAuthorProfile(p))
      .catch(() => setAuthorProfile(null));

    return () => {
      unsubChapters();
      unsubEchoes();
      if (unsubResonance) unsubResonance();
    };
  }, [story?.storyId, story?.visibility, story?.storyFormat, user]);

  if (!story) return null;

  const isAuthor = Boolean(user && user.uid === story.authorId);
  const isRoman = story.storyFormat === 'roman';
  const theme = THEME_MAP[story.theme];
  const totalChapters = isRoman ? 1 + chapters.length : 1;
  const activeFollowupChapter =
    isRoman && activeChapterIdx > 0 ? chapters[activeChapterIdx - 1] ?? null : null;

  const displayedContent = activeFollowupChapter ? activeFollowupChapter.content : story.content;
  const displayedMinutes = activeFollowupChapter
    ? activeFollowupChapter.readingMinutes
    : story.readingMinutes;

  const paragraphs = displayedContent
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const existingExchange =
    user && !isAuthor
      ? existingExchanges.find(
          (ex) => ex.exchangeId === buildExchangeId(story.storyId, user.uid, story.authorId)
        )
      : undefined;

  const handleResonate = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (resonateBusy) return;
    setResonateBusy(true);
    try {
      await toggleStoryResonance(story.storyId, user.uid);
    } finally {
      setResonateBusy(false);
    }
  };

  const handleEchoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEchoError(null);
    if (echoText.trim().length < FIELD_LIMITS.echoContent.min) {
      setEchoError('Écrivez au moins 2 caractères pour publier votre commentaire.');
      return;
    }
    setEchoBusy(true);
    try {
      const displayName = profile?.displayName || user.displayName || 'Auteur';
      await addStoryEcho(story.storyId, user.uid, displayName, replyType, echoText);
      setEchoText('');
    } catch (err) {
      setEchoError(
        err instanceof Error ? err.message : 'Impossible de publier ce commentaire.'
      );
    } finally {
      setEchoBusy(false);
    }
  };

  const handleAddChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAuthor) return;
    setChapterError(null);
    if (chapterTitle.trim().length < FIELD_LIMITS.chapterTitle.min) {
      setChapterError('Donnez un titre à ce chapitre.');
      return;
    }
    if (chapterContent.trim().length < FIELD_LIMITS.chapterContent.min) {
      setChapterError('Le chapitre doit contenir au moins 20 caractères.');
      return;
    }

    setChapterBusy(true);
    try {
      const nextNum = totalChapters + 1;
      const nextSeriesStatus: SeriesStatus = markCompleted ? 'termine' : 'en-cours';
      await addStoryChapter({
        story,
        authorId: user.uid,
        chapterNumber: nextNum,
        title: chapterTitle,
        content: chapterContent,
        authorNote: chapterNote,
        nextSeriesStatus,
      });
      setChapterTitle('');
      setChapterContent('');
      setChapterNote('');
      setShowChapterForm(false);
      setActiveChapterIdx(nextNum - 1);
    } catch (err) {
      setChapterError(
        err instanceof Error ? err.message : 'Impossible de publier ce chapitre.'
      );
    } finally {
      setChapterBusy(false);
    }
  };

  const handleOpenBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setBridgeError(null);
    if (!bridgeMessage.trim()) {
      setBridgeError('Écrivez quelques mots pour commencer cet échange.');
      return;
    }
    setBridgeBusy(true);
    try {
      const initiatorName = profile?.displayName || user.displayName || 'Auteur';
      const exchangeId = await createExchangeWithFirstMessage({
        storyId: story.storyId,
        storyTitle: story.title,
        initiatorId: user.uid,
        initiatorName,
        recipientId: story.authorId,
        recipientName: story.authorName,
        firstMessage: bridgeMessage,
      });
      onClose();
      onOpenExchange(exchangeId);
    } catch (err) {
      setBridgeError(
        err instanceof Error ? err.message : 'Impossible d’ouvrir cette passerelle.'
      );
    } finally {
      setBridgeBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-story-title"
    >
      <div className="w-full max-w-4xl bg-[#FBF9F5] border border-stone-300 rounded-lg my-auto overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-stone-500 min-w-0">
            <span className="truncate">{theme.salonName}</span>
            <span aria-hidden="true">·</span>
            <span>{STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap tabular-nums">{displayedMinutes} min de lecture</span>
            {story.visibility === 'private' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#1E3A8A]">Brouillon privé</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la lecture"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[84vh] overflow-y-auto px-6 sm:px-12 py-8 sm:py-10">
          <article className="max-w-prose mx-auto">
            {story.promptQuestion && (
              <p className="text-xs text-stone-500 mb-3 italic">
                En réponse au fil : « {story.promptQuestion} »
              </p>
            )}

            <h1
              id="reader-story-title"
              className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight mb-4"
              style={{ textWrap: 'balance' }}
            >
              {story.title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600 pb-6 border-b border-stone-200 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMemberWall(story.authorId);
                  }}
                  className="font-medium text-stone-900 hover:text-[#1B365D] hover:underline inline-flex items-center gap-1.5"
                >
                  <UserIcon className="w-3.5 h-3.5 text-stone-500" />
                  <span>{story.authorName}</span>
                </button>
                <span aria-hidden="true">·</span>
                <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                {isRoman && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{RELEASE_CADENCE_LABELS[story.releaseCadence ?? 'hebdomadaire']}</span>
                    <span aria-hidden="true">·</span>
                    <span>{SERIES_STATUS_LABELS[story.seriesStatus ?? 'en-cours']}</span>
                  </>
                )}
              </div>

              {isRoman && isAuthor && (
                <button
                  type="button"
                  onClick={() => setShowChapterForm((prev) => !prev)}
                  className="min-h-[34px] px-3 py-1 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Publier le chapitre {totalChapters + 1}</span>
                </button>
              )}
            </div>

            {/* Chapter Navigation Rail for Serialized Novels */}
            {isRoman && (
              <div className="mb-8 bg-white border border-stone-200 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span className="uppercase tracking-widest inline-flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Table des chapitres
                  </span>
                  <span className="tabular-nums">
                    {totalChapters} chapitre{totalChapters > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveChapterIdx(0)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors ${
                      activeChapterIdx === 0
                        ? 'bg-[#1B365D] text-white border-[#1B365D]'
                        : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    Chapitre 1
                  </button>
                  {chapters.map((chap, idx) => {
                    const chapIdx = idx + 1;
                    const active = activeChapterIdx === chapIdx;
                    return (
                      <button
                        key={chap.chapterId}
                        type="button"
                        onClick={() => setActiveChapterIdx(chapIdx)}
                        className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors ${
                          active
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        Ch. {chap.chapterNumber} · {chap.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Author Next-Chapter Form */}
            {isRoman && isAuthor && showChapterForm && (
              <form
                onSubmit={handleAddChapter}
                className="mb-8 bg-white border border-stone-300 rounded-md p-5 space-y-4"
              >
                <h2 className="font-display text-lg font-medium text-stone-900">
                  Publier le chapitre {totalChapters + 1}
                </h2>
                <div>
                  <label htmlFor="chap-title" className="block text-xs font-medium text-stone-700 mb-1">
                    Titre du chapitre
                  </label>
                  <input
                    id="chap-title"
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.chapterTitle.max}
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="Ex. La gare du matin…"
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <div>
                  <label htmlFor="chap-content" className="block text-xs font-medium text-stone-700 mb-1">
                    Texte du chapitre
                  </label>
                  <textarea
                    id="chap-content"
                    rows={8}
                    required
                    maxLength={FIELD_LIMITS.chapterContent.max}
                    value={chapterContent}
                    onChange={(e) => setChapterContent(e.target.value)}
                    placeholder="Poursuivez votre histoire…"
                    className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm leading-relaxed text-stone-800 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <div>
                  <label htmlFor="chap-note" className="block text-xs font-medium text-stone-700 mb-1">
                    Mot de fin pour les lecteurs (facultatif)
                  </label>
                  <input
                    id="chap-note"
                    type="text"
                    maxLength={FIELD_LIMITS.chapterNote.max}
                    value={chapterNote}
                    onChange={(e) => setChapterNote(e.target.value)}
                    placeholder="Ex. Prochain chapitre dimanche prochain !"
                    className="w-full px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-xs text-stone-800 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={markCompleted}
                    onChange={(e) => setMarkCompleted(e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>Marquer ce roman comme terminé après ce chapitre</span>
                </label>

                {chapterError && (
                  <p role="alert" className="text-xs text-red-700">
                    {chapterError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChapterForm(false)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={chapterBusy}
                    className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60"
                  >
                    {chapterBusy ? 'Publication…' : `Publier le chapitre ${totalChapters + 1}`}
                  </button>
                </div>
              </form>
            )}

            {activeFollowupChapter && (
              <div className="mb-6 pb-4 border-b border-stone-200">
                <p className="text-xs uppercase tracking-widest text-[#1B365D]">
                  Chapitre {activeFollowupChapter.chapterNumber}
                </p>
                <h2 className="font-display text-2xl font-medium text-stone-900 mt-1">
                  {activeFollowupChapter.title}
                </h2>
              </div>
            )}

            <div className="space-y-5 text-base sm:text-[17px] leading-[1.8] text-stone-800">
              {paragraphs.map((para, idx) => (
                <p key={idx} className={idx === 0 ? 'editorial-drop-cap' : ''}>
                  {para}
                </p>
              ))}
            </div>

            {activeFollowupChapter?.authorNote && (
              <div className="mt-8 p-4 bg-white border border-stone-200 rounded-md text-sm text-stone-700 italic">
                Note de {story.authorName} : « {activeFollowupChapter.authorNote} »
              </div>
            )}

            {isRoman && totalChapters > 1 && (
              <div className="mt-8 pt-5 border-t border-stone-200 flex items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={activeChapterIdx === 0}
                  onClick={() => setActiveChapterIdx((prev) => Math.max(0, prev - 1))}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 disabled:opacity-40"
                >
                  Chapitre précédent
                </button>
                <span className="text-xs text-stone-500 tabular-nums">
                  Chapitre {activeChapterIdx + 1} / {totalChapters}
                </span>
                <button
                  type="button"
                  disabled={activeChapterIdx >= totalChapters - 1}
                  onClick={() =>
                    setActiveChapterIdx((prev) => Math.min(totalChapters - 1, prev + 1))
                  }
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-40"
                >
                  Chapitre suivant
                </button>
              </div>
            )}

            {authorProfile && (authorProfile.bio || authorProfile.listeningNote) && (
              <div className="mt-10 p-5 bg-white border border-stone-200 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
                    À propos de {authorProfile.displayName}
                  </p>
                  {authorProfile.bio && (
                    <p className="text-sm text-stone-700 leading-relaxed">{authorProfile.bio}</p>
                  )}
                  {authorProfile.listeningNote && (
                    <p className="text-sm text-stone-600 mt-2">
                      <span className="font-medium text-stone-800">Disponibilité d’échange :</span>{' '}
                      {authorProfile.listeningNote}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMemberWall(story.authorId);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-[#1B365D] border border-[#CBD6E6] bg-[#F3F6FA] rounded-md hover:bg-[#E7EEF7] whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  Voir son mur
                </button>
              </div>
            )}

            {/* Social Action Bar */}
            <div className="mt-10 pt-6 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleResonate}
                  disabled={resonateBusy || story.visibility !== 'public'}
                  className={`min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    hasResonated
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-stone-800 border-stone-300 hover:border-stone-500'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${hasResonated ? 'fill-current' : ''}`} />
                  <span>Cela résonne</span>
                  <span className="tabular-nums opacity-80">({story.resonanceCount})</span>
                </button>

                {!isAuthor && story.visibility === 'public' && (
                  existingExchange ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExchange(existingExchange.exchangeId);
                      }}
                      className="min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border border-[#1E3A8A] text-[#1E3A8A] bg-white hover:bg-[#1E3A8A]/5 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Poursuivre en privé</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) {
                          await signInWithGoogle();
                          return;
                        }
                        setShowBridgeBox((prev) => !prev);
                      }}
                      className="min-h-[40px] px-4 py-2 text-sm font-medium rounded-md border border-stone-300 text-stone-800 bg-white hover:border-[#1E3A8A] hover:text-[#1E3A8A] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Écrire en privé à l’auteur</span>
                    </button>
                  )
                )}
              </div>

              <span className="text-xs text-stone-500 tabular-nums">
                {echoes.length} commentaire{echoes.length > 1 ? 's' : ''}
              </span>
            </div>

            {showBridgeBox && !isAuthor && (
              <form
                onSubmit={handleOpenBridge}
                className="mt-6 bg-white border border-stone-200 rounded-md p-5 space-y-4"
              >
                <div>
                  <h3 className="font-display text-lg font-medium text-stone-900">
                    Écrire en tête-à-tête à {story.authorName}
                  </h3>
                  <p className="text-xs text-stone-600 mt-1">
                    Votre premier message s’appuiera sur ce récit pour commencer une conversation calme et privée.
                  </p>
                </div>
                <textarea
                  rows={3}
                  maxLength={FIELD_LIMITS.messageContent.max}
                  value={bridgeMessage}
                  onChange={(e) => setBridgeMessage(e.target.value)}
                  placeholder={`Bonjour ${story.authorName}, votre texte m’a particulièrement touché parce que…`}
                  className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                />
                {bridgeError && (
                  <p role="alert" className="text-xs text-red-700">
                    {bridgeError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowBridgeBox(false)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={bridgeBusy}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap"
                  >
                    {bridgeBusy ? 'Ouverture…' : 'Envoyer en privé'}
                  </button>
                </div>
              </form>
            )}

            {/* Comments & Echoes Section */}
            {story.visibility === 'public' && (
              <section
                className="mt-10 pt-8 border-t border-stone-200"
                aria-label="Commentaires et échos des lecteurs"
              >
                <h2 className="font-display text-2xl font-medium text-stone-900 mb-2">
                  Commentaires des lecteurs
                </h2>
                <p className="text-sm text-stone-600 mb-6">
                  Réactions, retours de lecture et échos sincères sous cette histoire.
                </p>

                {echoes.length === 0 ? (
                  <p className="text-sm text-stone-500 italic py-4">
                    Aucun commentaire pour l’instant. Soyez la première personne à réagir à cette histoire.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 mb-8">
                    {echoes.map((echo) => (
                      <div key={echo.echoId} className="py-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-2">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenMemberWall(echo.authorId);
                            }}
                            className="font-semibold text-stone-900 hover:text-[#1B365D] hover:underline"
                          >
                            {echo.authorName}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#1E3A8A] font-medium">
                            {ECHO_TYPE_LABELS[echo.replyType]?.label ?? 'Commentaire'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(echo.createdAt?.toDate() ?? null)}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-stone-800 whitespace-pre-line">
                          {echo.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={handleEchoSubmit}
                  className="bg-white border border-stone-200 rounded-md p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest text-stone-500">
                      Laisser un commentaire
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(ECHO_TYPE_LABELS) as EchoReplyType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setReplyType(type)}
                          className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                            replyType === type
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {ECHO_TYPE_LABELS[type].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-stone-500">{ECHO_TYPE_LABELS[replyType].hint}</p>

                  {user ? (
                    <>
                      <textarea
                        rows={3}
                        maxLength={FIELD_LIMITS.echoContent.max}
                        value={echoText}
                        onChange={(e) => setEchoText(e.target.value)}
                        placeholder="Écrivez votre commentaire sous cette histoire…"
                        className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                      />
                      {echoError && (
                        <p role="alert" className="text-xs text-red-700">
                          {echoError}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-stone-500">
                          Visible par tous les lecteurs de ce salon.
                        </span>
                        <button
                          type="submit"
                          disabled={echoBusy}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {echoBusy ? 'Publication…' : 'Publier le commentaire'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-stone-600">
                        Connectez-vous avec Google pour commenter ou écrire en privé à l’auteur.
                      </p>
                      <button
                        type="button"
                        onClick={signInWithGoogle}
                        className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] whitespace-nowrap shrink-0"
                      >
                        Se connecter
                      </button>
                    </div>
                  )}
                </form>
              </section>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
