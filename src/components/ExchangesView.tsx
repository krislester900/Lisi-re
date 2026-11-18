import React, { useEffect, useRef, useState } from 'react';
import { Archive, BookOpen, MessageCircle, RotateCcw, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  sendExchangeMessage,
  subscribeToExchangeMessages,
  updateExchangeStatus,
} from '../lib/storyService';
import { formatFrenchDate } from '../lib/themes';
import { Exchange, ExchangeMessage, FIELD_LIMITS } from '../types/story';

interface ExchangesViewProps {
  exchanges: Exchange[];
  selectedExchangeId: string | null;
  onSelectExchange: (exchangeId: string) => void;
  onOpenStoryById: (storyId: string) => void;
  onExploreStories: () => void;
}

export function ExchangesView({
  exchanges,
  selectedExchangeId,
  onSelectExchange,
  onOpenStoryById,
  onExploreStories,
}: ExchangesViewProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [messages, setMessages] = useState<ExchangeMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeExchange =
    exchanges.find((ex) => ex.exchangeId === selectedExchangeId) ?? exchanges[0] ?? null;

  useEffect(() => {
    if (!user || !activeExchange) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToExchangeMessages(activeExchange.exchangeId, user.uid, setMessages);
    return () => unsub();
  }, [user, activeExchange?.exchangeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-3">
            Passerelles · Conversations privées
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Échanger en tête-à-tête à partir d’un récit partagé
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Les passerelles permettent de prolonger une lecture par un dialogue calme et privé entre deux personnes. Connectez-vous pour retrouver vos conversations ou en ouvrir une nouvelle depuis un récit du salon.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap"
          >
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExchange || activeExchange.status !== 'active') return;
    setError(null);
    if (!draft.trim()) return;

    setSending(true);
    try {
      const senderName = profile?.displayName || user.displayName || 'Auteur';
      await sendExchangeMessage({
        exchange: activeExchange,
        senderId: user.uid,
        senderName,
        rawContent: draft,
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’envoyer ce message.');
    } finally {
      setSending(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!activeExchange || statusBusy) return;
    setStatusBusy(true);
    try {
      const nextStatus = activeExchange.status === 'active' ? 'archived' : 'active';
      await updateExchangeStatus(activeExchange.exchangeId, nextStatus);
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-2">
            Passerelles · Échanges directs
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Vos conversations ancrées dans les récits
          </h1>
        </div>
        <span className="text-xs text-stone-500 tabular-nums">
          {exchanges.length} passerelle{exchanges.length > 1 ? 's' : ''}
        </span>
      </div>

      {exchanges.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-10 text-center max-w-2xl mx-auto my-8">
          <MessageCircle className="w-8 h-8 text-stone-400 mx-auto mb-4" />
          <h2 className="font-display text-2xl font-medium text-stone-900 mb-2">
            Aucune passerelle ouverte pour le moment
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed mb-6">
            Lorsque vous lisez l’histoire d’un membre dans le salon et qu’elle résonne avec votre vécu, cliquez sur « Ouvrir une passerelle » pour engager une conversation tranquille.
          </p>
          <button
            type="button"
            onClick={onExploreStories}
            className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] transition-colors whitespace-nowrap"
          >
            Découvrir les récits du salon
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Exchanges sidebar */}
          <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg divide-y divide-stone-200 overflow-hidden">
            {exchanges.map((ex) => {
              const otherName =
                ex.initiatorId === user.uid ? ex.recipientName : ex.initiatorName;
              const isSelected = activeExchange?.exchangeId === ex.exchangeId;
              return (
                <button
                  key={ex.exchangeId}
                  type="button"
                  onClick={() => onSelectExchange(ex.exchangeId)}
                  className={`w-full text-left p-4 transition-colors block ${
                    isSelected ? 'bg-[#F4F0E8]' : 'bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-sm text-stone-900 truncate">
                      {otherName}
                    </span>
                    <span className="text-xs text-stone-500 whitespace-nowrap shrink-0">
                      {ex.status === 'archived'
                        ? 'Archivée'
                        : formatFrenchDate(ex.updatedAt?.toDate() ?? null)}
                    </span>
                  </div>
                  <p className="text-xs text-[#1E3A8A] truncate mb-1">
                    Récit : {ex.storyTitle}
                  </p>
                  <p className="text-xs text-stone-600 truncate">
                    {ex.lastMessagePreview || 'Conversation ouverte'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Active thread */}
          {activeExchange && (
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-lg flex flex-col min-h-[520px] max-h-[680px]">
              <div className="px-6 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-stone-500 mb-0.5">
                    Échange avec{' '}
                    <span className="font-semibold text-stone-900">
                      {activeExchange.initiatorId === user.uid
                        ? activeExchange.recipientName
                        : activeExchange.initiatorName}
                    </span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{activeExchange.status === 'active' ? 'Active' : 'Archivée'}</span>
                  </p>
                  <p className="font-display text-lg font-medium text-stone-900 truncate">
                    À propos de « {activeExchange.storyTitle} »
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenStoryById(activeExchange.storyId)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 transition-[border-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Relire le récit</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleArchive}
                    disabled={statusBusy}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {activeExchange.status === 'active' ? (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archiver</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rouvrir</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FBF9F5]/60">
                {messages.length === 0 ? (
                  <p className="text-sm text-stone-500 italic text-center py-10">
                    Chargement de la conversation…
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === user.uid;
                    return (
                      <div
                        key={msg.messageId}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                          <span className="font-medium text-stone-700">{msg.senderName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(msg.createdAt?.toDate() ?? null)}</span>
                        </div>
                        <div
                          className={`max-w-[82%] px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-line border ${
                            isMine
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                              : 'bg-white text-stone-800 border-stone-200'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              {activeExchange.status === 'active' ? (
                <form
                  onSubmit={handleSend}
                  className="p-4 border-t border-stone-200 bg-white space-y-2"
                >
                  <div className="flex items-end gap-3">
                    <textarea
                      rows={2}
                      maxLength={FIELD_LIMITS.messageContent.max}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend(e);
                        }
                      }}
                      placeholder="Écrire votre réponse… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"
                      className="flex-1 px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1E3A8A] resize-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span>Envoyer</span>
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </form>
              ) : (
                <div className="p-4 border-t border-stone-200 bg-stone-50 text-center text-xs text-stone-600">
                  Cette passerelle est archivée. Cliquez sur « Rouvrir » si vous souhaitez reprendre l’échange.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
