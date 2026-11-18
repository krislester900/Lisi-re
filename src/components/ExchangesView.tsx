import React, { useEffect, useRef, useState } from 'react';
import { Archive, BookOpen, MessageCircle, Plus, RotateCcw, Send, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  createDirectExchangeWithFirstMessage,
  sendExchangeMessage,
  subscribeToExchangeMessages,
  updateExchangeStatus,
} from '../lib/storyService';
import { formatFrenchDate } from '../lib/themes';
import { Exchange, ExchangeMessage, FIELD_LIMITS, PublicProfile } from '../types/story';

interface ExchangesViewProps {
  exchanges: Exchange[];
  discoverableProfiles: PublicProfile[];
  selectedExchangeId: string | null;
  initialRecipientId?: string | null;
  onClearInitialRecipient?: () => void;
  onSelectExchange: (exchangeId: string) => void;
  onOpenStoryById: (storyId: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onExploreStories: () => void;
}

export function ExchangesView({
  exchanges,
  discoverableProfiles,
  selectedExchangeId,
  initialRecipientId,
  onClearInitialRecipient,
  onSelectExchange,
  onOpenStoryById,
  onOpenMemberWall,
  onExploreStories,
}: ExchangesViewProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [messages, setMessages] = useState<ExchangeMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // New Direct Private Chat modal/panel
  const [showNewChat, setShowNewChat] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRecipientId) {
      setShowNewChat(true);
      setRecipientId(initialRecipientId);
      setCreateError(null);
      onClearInitialRecipient?.();
    }
  }, [initialRecipientId, onClearInitialRecipient]);

  const activeExchange =
    exchanges.find((ex) => ex.exchangeId === selectedExchangeId) ?? exchanges[0] ?? null;

  const otherMembers = discoverableProfiles.filter((p) => p.userId !== user?.uid);

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
            Passerelles · Chat privé 1 à 1
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 mb-3">
            Discuter en privé avec les membres de votre choix
          </h1>
          <p className="text-base text-stone-600 leading-relaxed mb-6">
            Les passerelles vous permettent d’ouvrir une conversation écrite calme et privée avec n’importe quel membre, librement ou à partir d’un récit du salon.
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

  const handleCreateDirectChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const target = otherMembers.find((m) => m.userId === recipientId);
    if (!target) {
      setCreateError('Choisissez un membre avec qui discuter.');
      return;
    }
    if (!firstMessage.trim()) {
      setCreateError('Écrivez votre premier message.');
      return;
    }
    setCreatingChat(true);
    try {
      const initiatorName = profile?.displayName || user.displayName || 'Auteur';
      const newId = await createDirectExchangeWithFirstMessage({
        initiatorId: user.uid,
        initiatorName,
        recipientId: target.userId,
        recipientName: target.displayName,
        firstMessage,
      });
      setRecipientId('');
      setFirstMessage('');
      setShowNewChat(false);
      onSelectExchange(newId);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Impossible de créer ce chat privé.');
    } finally {
      setCreatingChat(false);
    }
  };

  const activeOtherId =
    activeExchange &&
    (activeExchange.initiatorId === user.uid
      ? activeExchange.recipientId
      : activeExchange.initiatorId);
  const activeOtherName =
    activeExchange &&
    (activeExchange.initiatorId === user.uid
      ? activeExchange.recipientName
      : activeExchange.initiatorName);
  const isDirectExchange =
    activeExchange && (activeExchange.kind === 'direct' || activeExchange.storyId === 'direct');

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-stone-200">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 mb-2">
            Passerelles · Chat privé (texte uniquement)
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900">
            Vos conversations privées
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500 tabular-nums">
            {exchanges.length} conversation{exchanges.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowNewChat((prev) => !prev);
            }}
            className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {showNewChat ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showNewChat ? 'Fermer' : 'Nouveau chat privé'}</span>
          </button>
        </div>
      </div>

      {/* New Direct Private Chat Panel */}
      {showNewChat && (
        <form
          onSubmit={handleCreateDirectChat}
          className="bg-white border border-stone-300 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-medium text-stone-900">
              Écrire en privé à un membre
            </h2>
          </div>

          {otherMembers.length === 0 ? (
            <p className="text-sm text-stone-600">
              Aucun autre membre n’est encore inscrit dans l’annuaire pour le moment. Dès qu’un autre membre rejoint Lisière, vous pourrez lui écrire ici.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="dm-recipient" className="block text-xs font-medium text-stone-700 mb-1">
                    Destinataire
                  </label>
                  <select
                    id="dm-recipient"
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    required
                    className="w-full min-h-[40px] px-3 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  >
                    <option value="">Choisir un membre…</option>
                    {otherMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="dm-first-msg" className="block text-xs font-medium text-stone-700 mb-1">
                    Premier message
                  </label>
                  <input
                    id="dm-first-msg"
                    type="text"
                    required
                    maxLength={FIELD_LIMITS.messageContent.max}
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    placeholder="Bonjour, j’aimerais discuter avec toi…"
                    className="w-full min-h-[40px] px-3.5 py-2 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-900 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
              </div>

              {createError && (
                <p role="alert" className="text-xs text-red-700">
                  {createError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingChat}
                  className="min-h-[40px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{creatingChat ? 'Ouverture…' : 'Démarrer le chat privé'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {exchanges.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-10 text-center max-w-2xl mx-auto my-8">
          <MessageCircle className="w-8 h-8 text-stone-400 mx-auto mb-4" />
          <h2 className="font-display text-2xl font-medium text-stone-900 mb-2">
            Aucune conversation privée pour le moment
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed mb-6">
            Cliquez sur « Nouveau chat privé » pour écrire à un membre de votre choix, ou ouvrez une conversation depuis le mur d’un membre ou sous un récit du salon.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowNewChat(true)}
              className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] transition-colors whitespace-nowrap"
            >
              Choisir un membre
            </button>
            <button
              type="button"
              onClick={onExploreStories}
              className="min-h-[40px] px-5 py-2 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 transition-colors whitespace-nowrap"
            >
              Explorer les salons
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Exchanges sidebar */}
          <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg divide-y divide-stone-200 overflow-hidden">
            {exchanges.map((ex) => {
              const otherName =
                ex.initiatorId === user.uid ? ex.recipientName : ex.initiatorName;
              const isSelected = activeExchange?.exchangeId === ex.exchangeId;
              const isDirect = ex.kind === 'direct' || ex.storyId === 'direct';
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
                    {isDirect ? 'Discussion privée directe' : `Récit : ${ex.storyTitle}`}
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
                    Chat privé avec{' '}
                    <button
                      type="button"
                      onClick={() => activeOtherId && onOpenMemberWall(activeOtherId)}
                      className="font-semibold text-stone-900 hover:text-[#1B365D] hover:underline"
                    >
                      {activeOtherName}
                    </button>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>{activeExchange.status === 'active' ? 'Active' : 'Archivée'}</span>
                  </p>
                  <p className="font-display text-lg font-medium text-stone-900 truncate">
                    {isDirectExchange
                      ? 'Conversation privée 1 à 1'
                      : `À propos de « ${activeExchange.storyTitle} »`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeOtherId && (
                    <button
                      type="button"
                      onClick={() => onOpenMemberWall(activeOtherId)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>Voir son mur</span>
                    </button>
                  )}

                  {!isDirectExchange && (
                    <button
                      type="button"
                      onClick={() => onOpenStoryById(activeExchange.storyId)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 transition-[border-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Relire le récit</span>
                    </button>
                  )}

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
                      placeholder="Écrire votre message privé… (Entrée pour envoyer)"
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
                  Cette conversation est archivée. Cliquez sur « Rouvrir » pour reprendre l’échange.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
