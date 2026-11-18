import React, { useEffect, useState } from 'react';
import { ArrowRight, Heart, MessageCircle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  addStoryEcho,
  buildExchangeId,
  createExchangeWithFirstMessage,
  fetchPublicProfile,
  subscribeToStoryEchoes,
  subscribeToUserResonance,
  toggleStoryResonance,
} from '../lib/storyService';
import { ECHO_TYPE_LABELS, formatFrenchDate, THEME_MAP } from '../lib/themes';
import { Echo, EchoReplyType, Exchange, FIELD_LIMITS, PublicProfile, Story } from '../types/story';

interface StoryReaderModalProps {
  story: Story | null;
  onClose: () => void;
  existingExchanges: Exchange[];
  onOpenExchange: (exchangeId: string) => void;
  onWriteInspired: (story: Story) => void;
}

export function StoryReaderModal({
  story,
  onClose,
  existingExchanges,
  onOpenExchange,
  onWriteInspired,
}: StoryReaderModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [hasResonated, setHasResonated] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<PublicProfile | null>(null);
  const [resonateBusy, setResonateBusy] = useState(false);

  const [replyType, setReplyType] = useState<EchoReplyType>('resonance');
  const [echoText, setEchoText] = useState('');
  const [echoBusy, setEchoBusy] = useState(false);
  const [echoError, setEchoError] = useState<string | null>(null);

  const [showBridgeBox, setShowBridgeBox] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState('');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    if (!story) return;
    setEchoText('');
    setEchoError(null);
    setShowBridgeBox(false);
    setBridgeMessage('');
    setBridgeError(null);

    if (story.isEditorialSample || story.visibility !== 'public') {
      setEchoes([]);
      setHasResonated(false);
      setAuthorProfile(null);
      return;
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
      unsubEchoes();
      if (unsubResonance) unsubResonance();
    };
  }, [story, user]);

  if (!story) return null;

  const isSample = Boolean(story.isEditorialSample);
  const isAuthor = Boolean(user && user.uid === story.authorId);
  const theme = THEME_MAP[story.theme];
  const paragraphs = story.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const existingExchange =
    user && !isSample && !isAuthor
      ? existingExchanges.find(
          (ex) => ex.exchangeId === buildExchangeId(story.storyId, user.uid, story.authorId)
        )
      : undefined;

  const handleResonate = async () => {
    if (isSample) return;
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
    if (isSample) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setEchoError(null);
    if (echoText.trim().length < FIELD_LIMITS.echoContent.min) {
      setEchoError('Écrivez au moins 5 caractères pour déposer un écho.');
      return;
    }
    setEchoBusy(true);
    try {
      const displayName = profile?.displayName || user.displayName || 'Auteur';
      await addStoryEcho(story.storyId, user.uid, displayName, replyType, echoText);
      setEchoText('');
    } catch (err) {
      setEchoError(err instanceof Error ? err.message : 'Impossible de publier cet écho.');
    } finally {
      setEchoBusy(false);
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
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 min-w-0">
            <span className="truncate">{theme.label}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{story.readingMinutes} min de lecture</span>
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

            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600 pb-6 border-b border-stone-200 mb-8">
              <span className="font-medium text-stone-900">{story.authorName}</span>
              <span aria-hidden="true">·</span>
              <span>
                {isSample
                  ? 'Texte d’ouverture de la rédaction'
                  : formatFrenchDate(story.createdAt?.toDate() ?? null)}
              </span>
            </div>

            <div className="space-y-5 text-base sm:text-[17px] leading-[1.8] text-stone-800">
              {paragraphs.map((para, idx) => (
                <p key={idx} className={idx === 0 ? 'editorial-drop-cap' : ''}>
                  {para}
                </p>
              ))}
            </div>

            {authorProfile && (authorProfile.bio || authorProfile.listeningNote) && (
              <div className="mt-10 p-5 bg-white border border-stone-200 rounded-md">
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
            )}

            {/* Social Action Bar */}
            <div className="mt-10 pt-6 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
              {isSample ? (
                <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-stone-200 rounded-md p-5">
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      Ce texte d’ouverture vous parle ?
                    </p>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Partagez votre propre histoire sur ce thème pour ouvrir les échanges avec la communauté.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onWriteInspired(story);
                    }}
                    className="min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <span>Écrire sur ce thème</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
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
                          <span>Poursuivre la passerelle</span>
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
                          <span>Ouvrir une passerelle</span>
                        </button>
                      )
                    )}
                  </div>

                  <span className="text-xs text-stone-500 tabular-nums">
                    {echoes.length} écho{echoes.length > 1 ? 's' : ''} déposé{echoes.length > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>

            {showBridgeBox && !isSample && !isAuthor && (
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
                  placeholder={`Bonjour ${story.authorName}, votre récit m’a particulièrement touché parce que…`}
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
                    {bridgeBusy ? 'Ouverture…' : 'Envoyer et ouvrir la passerelle'}
                  </button>
                </div>
              </form>
            )}

            {/* Echoes Section */}
            {!isSample && story.visibility === 'public' && (
              <section className="mt-10 pt-8 border-t border-stone-200" aria-label="Échos des lecteurs">
                <h2 className="font-display text-2xl font-medium text-stone-900 mb-2">
                  Échos des lecteurs
                </h2>
                <p className="text-sm text-stone-600 mb-6">
                  Des réponses posées et sincères pour prolonger le récit.
                </p>

                {echoes.length === 0 ? (
                  <p className="text-sm text-stone-500 italic py-4">
                    Aucun écho n’a encore été déposé. Soyez la première personne à répondre à ce texte.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-200 mb-8">
                    {echoes.map((echo) => (
                      <div key={echo.echoId} className="py-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-2">
                          <span className="font-semibold text-stone-900">{echo.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#1E3A8A] font-medium">
                            {ECHO_TYPE_LABELS[echo.replyType]?.label ?? 'En écho'}
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
                      Déposer un écho
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
                        placeholder="Partagez ce que ce récit réveille chez vous…"
                        className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A]"
                      />
                      {echoError && (
                        <p role="alert" className="text-xs text-red-700">
                          {echoError}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-stone-500">
                          Les échos sont des contributions permanentes dans le salon.
                        </span>
                        <button
                          type="submit"
                          disabled={echoBusy}
                          className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {echoBusy ? 'Publication…' : 'Publier cet écho'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-stone-600">
                        Connectez-vous avec Google pour déposer un écho ou ouvrir une passerelle.
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
