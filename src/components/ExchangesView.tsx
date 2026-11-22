import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Ban,
  BookOpen,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Flag,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  createDirectExchangeWithFirstMessage,
  deleteOwnExchangeMessage,
  formatFriendlyFirestoreError,
  hideExchangeForUser,
  hideExchangeMessageForUser,
  removeUserRelationship,
  sendExchangeMessage,
  subscribeToExchangeMessages,
  updateExchangeStatus,
  upsertUserRelationship,
} from '../lib/storyService';
import { formatFrenchDate } from '../lib/themes';
import {
  Exchange,
  ExchangeMessage,
  FIELD_LIMITS,
  PublicProfile,
  UserRelationship,
} from '../types/story';
import type { ReportDraft } from './ReportModal';

interface ExchangesViewProps {
  exchanges: Exchange[];
  discoverableProfiles: PublicProfile[];
  relationships?: UserRelationship[];
  selectedExchangeId: string | null;
  initialRecipientId?: string | null;
  onClearInitialRecipient?: () => void;
  onSelectExchange: (exchangeId: string) => void;
  onOpenStoryById: (storyId: string) => void;
  onOpenMemberWall: (userId: string) => void;
  onExploreStories: () => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

type SidebarFilterTab = 'active' | 'archived' | 'not_interested' | 'blocked';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(
  text: string,
  queryText: string,
  isFocusedMatch: boolean
): React.ReactNode {
  const clean = queryText.trim();
  if (!clean) return text;
  const regex = new RegExp(`(${escapeRegExp(clean)})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className={`rounded px-0.5 text-stone-950 ${
          isFocusedMatch ? 'bg-amber-300 ring-1 ring-amber-500 font-medium' : 'bg-amber-200/90'
        }`}
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export function ExchangesView({
  exchanges,
  discoverableProfiles,
  relationships = [],
  selectedExchangeId,
  initialRecipientId,
  onClearInitialRecipient,
  onSelectExchange,
  onOpenStoryById,
  onOpenMemberWall,
  onExploreStories,
  onOpenReport,
}: ExchangesViewProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [messages, setMessages] = useState<ExchangeMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [relBusy, setRelBusy] = useState(false);

  // Sidebar tabs
  const [sidebarTab, setSidebarTab] = useState<SidebarFilterTab>('active');

  // In-conversation search
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState('');
  const [filterToMatches, setFilterToMatches] = useState(false);
  const [focusedMatchIdx, setFocusedMatchIdx] = useState(0);

  // Per-message & conversation delete confirmations
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [confirmBlockMember, setConfirmBlockMember] = useState(false);

  // New Direct Private Chat modal/panel
  const [showNewChat, setShowNewChat] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const threadContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialRecipientId) {
      setShowNewChat(true);
      setRecipientId(initialRecipientId);
      setCreateError(null);
      onClearInitialRecipient?.();
    }
  }, [initialRecipientId, onClearInitialRecipient]);

  const relationshipMap = useMemo(() => {
    const map = new Map<string, UserRelationship>();
    for (const rel of relationships) {
      map.set(rel.targetUserId, rel);
    }
    return map;
  }, [relationships]);

  const visibleExchanges = useMemo(() => {
    if (!user) return [];
    return exchanges.filter((ex) => !(ex.hiddenFor ?? []).includes(user.uid));
  }, [exchanges, user]);

  const sidebarCounts = useMemo(() => {
    if (!user) return { active: 0, archived: 0, not_interested: 0, blocked: 0 };
    let active = 0;
    let archived = 0;
    for (const ex of visibleExchanges) {
      const otherId = ex.initiatorId === user.uid ? ex.recipientId : ex.initiatorId;
      const rel = relationshipMap.get(otherId)?.relation;
      if (rel === 'blocked' || rel === 'not_interested') continue;
      if (ex.status === 'archived') archived += 1;
      else active += 1;
    }
    const notInterested = relationships.filter((r) => r.relation === 'not_interested').length;
    const blocked = relationships.filter((r) => r.relation === 'blocked').length;
    return { active, archived, not_interested: notInterested, blocked };
  }, [visibleExchanges, relationships, relationshipMap, user]);

  const filteredSidebarExchanges = useMemo(() => {
    if (!user) return [];
    return visibleExchanges.filter((ex) => {
      const otherId = ex.initiatorId === user.uid ? ex.recipientId : ex.initiatorId;
      const rel = relationshipMap.get(otherId)?.relation;
      if (sidebarTab === 'blocked') return rel === 'blocked';
      if (sidebarTab === 'not_interested') return rel === 'not_interested';
      if (rel === 'blocked' || rel === 'not_interested') return false;
      if (sidebarTab === 'archived') return ex.status === 'archived';
      return ex.status === 'active';
    });
  }, [visibleExchanges, relationshipMap, sidebarTab, user]);

  const relationshipEntriesForTab = useMemo(() => {
    if (sidebarTab !== 'blocked' && sidebarTab !== 'not_interested') return [];
    const targetRel = sidebarTab;
    return relationships.filter((r) => r.relation === targetRel);
  }, [relationships, sidebarTab]);

  const activeExchange = useMemo(() => {
    if (selectedExchangeId) {
      const exact = visibleExchanges.find((ex) => ex.exchangeId === selectedExchangeId);
      if (exact) return exact;
    }
    return filteredSidebarExchanges[0] ?? visibleExchanges[0] ?? null;
  }, [selectedExchangeId, visibleExchanges, filteredSidebarExchanges]);

  const otherMembers = useMemo(
    () =>
      discoverableProfiles.filter((p) => {
        if (p.userId === user?.uid) return false;
        const rel = relationshipMap.get(p.userId)?.relation;
        return rel !== 'blocked';
      }),
    [discoverableProfiles, user?.uid, relationshipMap]
  );

  useEffect(() => {
    setError(null);
    setConfirmDeleteMsgId(null);
    setConfirmDeleteThread(false);
    setConfirmBlockMember(false);
    setThreadSearchQuery('');
    setFilterToMatches(false);
    setFocusedMatchIdx(0);
    if (!user || !activeExchange) {
      setMessages([]);
      setMessagesLoaded(true);
      return;
    }
    setMessagesLoaded(false);
    const unsub = subscribeToExchangeMessages(activeExchange.exchangeId, user.uid, (list) => {
      setMessages(list);
      setMessagesLoaded(true);
    });
    return () => unsub();
  }, [user, activeExchange?.exchangeId]);

  const visibleMessages = useMemo(() => {
    if (!user) return [];
    return messages.filter((m) => !(m.hiddenFor ?? []).includes(user.uid));
  }, [messages, user]);

  const normalizedSearch = threadSearchQuery.trim().toLowerCase();

  const matchedMessageIds = useMemo(() => {
    if (!normalizedSearch) return [];
    return visibleMessages
      .filter((m) => m.content.toLowerCase().includes(normalizedSearch))
      .map((m) => m.messageId);
  }, [visibleMessages, normalizedSearch]);

  useEffect(() => {
    setFocusedMatchIdx(0);
  }, [normalizedSearch, activeExchange?.exchangeId]);

  const focusedMessageId =
    matchedMessageIds.length > 0
      ? matchedMessageIds[Math.min(focusedMatchIdx, matchedMessageIds.length - 1)]
      : null;

  useEffect(() => {
    if (!focusedMessageId || !threadContainerRef.current) return;
    const targetEl = threadContainerRef.current.querySelector(
      `[data-msg-id="${focusedMessageId}"]`
    );
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedMessageId]);

  useEffect(() => {
    if (normalizedSearch) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, normalizedSearch]);

  const displayedMessages = useMemo(() => {
    if (!normalizedSearch || !filterToMatches) return visibleMessages;
    const matchSet = new Set(matchedMessageIds);
    return visibleMessages.filter((m) => matchSet.has(m.messageId));
  }, [visibleMessages, normalizedSearch, filterToMatches, matchedMessageIds]);

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
  const activeRelation = activeOtherId ? relationshipMap.get(activeOtherId) : undefined;
  const isBlocked = activeRelation?.relation === 'blocked';
  const isNotInterested = activeRelation?.relation === 'not_interested';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExchange || activeExchange.status !== 'active' || isBlocked) return;
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
      setError(
        formatFriendlyFirestoreError(
          err,
          'Impossible d’envoyer ce message.',
          'Impossible d’envoyer ce message : les échanges avec ce membre sont restreints ou bloqués.'
        )
      );
    } finally {
      setSending(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!activeExchange || statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      const nextStatus = activeExchange.status === 'active' ? 'archived' : 'active';
      await updateExchangeStatus(activeExchange.exchangeId, nextStatus);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible de modifier le statut.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleHideConversation = async () => {
    if (!activeExchange || statusBusy) return;
    setStatusBusy(true);
    setError(null);
    try {
      await hideExchangeForUser({ exchange: activeExchange, userId: user.uid });
      setConfirmDeleteThread(false);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible de supprimer cette conversation.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleSetRelation = async (
    targetId: string,
    targetName: string,
    nextRelation: 'blocked' | 'not_interested' | null
  ) => {
    if (relBusy) return;
    setRelBusy(true);
    setError(null);
    try {
      if (nextRelation === null) {
        await removeUserRelationship(user.uid, targetId);
      } else {
        await upsertUserRelationship({
          ownerId: user.uid,
          targetUserId: targetId,
          targetName,
          relation: nextRelation,
        });
      }
      setConfirmBlockMember(false);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible de mettre à jour cette préférence.'));
    } finally {
      setRelBusy(false);
    }
  };

  const handleDeleteOwnMsg = async (msg: ExchangeMessage) => {
    if (!activeExchange || deletingMsgId) return;
    setDeletingMsgId(msg.messageId);
    setError(null);
    try {
      await deleteOwnExchangeMessage({
        exchange: activeExchange,
        message: msg,
        remainingMessages: messages,
      });
      setConfirmDeleteMsgId(null);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible de supprimer ce message.'));
    } finally {
      setDeletingMsgId(null);
    }
  };

  const handleHideMsgForMe = async (msg: ExchangeMessage) => {
    if (!activeExchange || deletingMsgId) return;
    setDeletingMsgId(msg.messageId);
    setError(null);
    try {
      await hideExchangeMessageForUser({
        exchangeId: activeExchange.exchangeId,
        message: msg,
        userId: user.uid,
      });
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Impossible de masquer ce message.'));
    } finally {
      setDeletingMsgId(null);
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
      setSidebarTab('active');
      onSelectExchange(newId);
    } catch (err) {
      setCreateError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de créer ce chat privé.',
          'Impossible de démarrer cet échange : les messages privés avec ce membre sont restreints ou bloqués.'
        )
      );
    } finally {
      setCreatingChat(false);
    }
  };

  const stepMatch = (delta: number) => {
    if (matchedMessageIds.length === 0) return;
    setFocusedMatchIdx((prev) => {
      const len = matchedMessageIds.length;
      return (prev + delta + len) % len;
    });
  };

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
            {visibleExchanges.length} conversation{visibleExchanges.length > 1 ? 's' : ''}
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
              Aucun autre membre disponible pour démarrer un échange pour le moment.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="dm-recipient"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
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
                  <label
                    htmlFor="dm-first-msg"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
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

      {visibleExchanges.length === 0 && relationships.length === 0 ? (
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
          {/* Exchanges sidebar with filter tabs */}
          <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg overflow-hidden">
            <div
              role="tablist"
              aria-label="Filtrer les conversations privées"
              className="grid grid-cols-2 gap-1 p-1.5 bg-stone-100 border-b border-stone-200"
            >
              {(
                [
                  { id: 'active', label: `Actives (${sidebarCounts.active})` },
                  { id: 'archived', label: `Archivées (${sidebarCounts.archived})` },
                  {
                    id: 'not_interested',
                    label: `Pas intéressé (${sidebarCounts.not_interested})`,
                  },
                  { id: 'blocked', label: `Bloqués (${sidebarCounts.blocked})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className={`min-h-[32px] px-2 py-1 text-[11px] font-medium rounded transition-colors truncate ${
                    sidebarTab === tab.id
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredSidebarExchanges.length === 0 && relationshipEntriesForTab.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                {sidebarTab === 'active'
                  ? 'Aucune conversation active.'
                  : sidebarTab === 'archived'
                    ? 'Aucune conversation archivée.'
                    : sidebarTab === 'not_interested'
                      ? 'Aucun membre marqué « Pas intéressé ».'
                      : 'Aucun membre bloqué.'}
              </div>
            ) : (
              <div className="divide-y divide-stone-200 max-h-[600px] overflow-y-auto">
                {filteredSidebarExchanges.map((ex) => {
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

                {relationshipEntriesForTab
                  .filter(
                    (rel) =>
                      !filteredSidebarExchanges.some(
                        (ex) => ex.initiatorId === rel.targetUserId || ex.recipientId === rel.targetUserId
                      )
                  )
                  .map((rel) => (
                    <div
                      key={rel.targetUserId}
                      className="p-4 flex items-center justify-between gap-3 bg-[#FBF9F5]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {rel.targetName}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {rel.relation === 'blocked' ? 'Membre bloqué' : 'Pas intéressé'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={relBusy}
                        onClick={() => void handleSetRelation(rel.targetUserId, rel.targetName, null)}
                        className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-[#1B365D] bg-white border border-stone-200 rounded hover:border-[#1B365D] whitespace-nowrap"
                      >
                        {rel.relation === 'blocked' ? 'Débloquer' : 'Rétablir'}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Active thread */}
          {activeExchange ? (
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-lg flex flex-col min-h-[540px] max-h-[740px]">
              {/* Thread Header */}
              <div className="px-5 py-4 border-b border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span>{activeExchange.status === 'active' ? 'Active' : 'Archivée'}</span>
                    </p>
                    <p className="font-display text-lg font-medium text-stone-900 truncate">
                      {isDirectExchange
                        ? 'Conversation privée 1 à 1'
                        : `À propos de « ${activeExchange.storyTitle} »`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowThreadSearch((prev) => !prev)}
                      aria-expanded={showThreadSearch}
                      title="Rechercher un mot dans la conversation"
                      className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                        showThreadSearch
                          ? 'bg-[#1B365D] text-white border-[#1B365D]'
                          : 'text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Rechercher</span>
                    </button>

                    {activeOtherId && (
                      <button
                        type="button"
                        onClick={() => onOpenMemberWall(activeOtherId)}
                        className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Profil</span>
                      </button>
                    )}

                    {!isDirectExchange && (
                      <button
                        type="button"
                        onClick={() => onOpenStoryById(activeExchange.storyId)}
                        className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Récit</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleArchive}
                      disabled={statusBusy}
                      className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 rounded-md hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {activeExchange.status === 'active' ? (
                        <>
                          <Archive className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Archiver</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Rouvrir</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Member Safety & Thread Management Actions */}
                {activeOtherId && activeOtherName && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={relBusy}
                        onClick={() =>
                          void handleSetRelation(
                            activeOtherId,
                            activeOtherName,
                            isNotInterested ? null : 'not_interested'
                          )
                        }
                        className={`min-h-[32px] px-2.5 py-1 rounded border inline-flex items-center gap-1.5 whitespace-nowrap ${
                          isNotInterested
                            ? 'bg-amber-50 border-amber-300 text-amber-900 font-medium'
                            : 'bg-[#FBF9F5] border-stone-200 text-stone-700 hover:border-stone-400'
                        }`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>{isNotInterested ? 'Retirer « Pas intéressé »' : 'Pas intéressé'}</span>
                      </button>

                      {isBlocked ? (
                        <button
                          type="button"
                          disabled={relBusy}
                          onClick={() => void handleSetRelation(activeOtherId, activeOtherName, null)}
                          className="min-h-[32px] px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-900 font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Débloquer</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmBlockMember((prev) => !prev)}
                          className="min-h-[32px] px-2.5 py-1 rounded border border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Bloquer</span>
                        </button>
                      )}

                      {onOpenReport && (
                        <button
                          type="button"
                          onClick={() => {
                            const latestFromOther = [...visibleMessages]
                              .reverse()
                              .find((m) => m.senderId === activeOtherId);
                            onOpenReport({
                              targetUserId: activeOtherId,
                              targetUserName: activeOtherName,
                              targetType: 'private_message',
                              targetId: latestFromOther?.messageId || activeExchange.exchangeId,
                              targetContextId: activeExchange.exchangeId,
                              targetExcerpt:
                                latestFromOther?.content || activeExchange.lastMessagePreview || '',
                              targetSummaryLabel: `Signaler ${activeOtherName}`,
                            });
                          }}
                          className="min-h-[32px] px-2.5 py-1 rounded border border-stone-200 bg-[#FBF9F5] text-stone-700 hover:border-red-300 hover:text-red-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>Signaler</span>
                        </button>
                      )}
                    </div>

                    {confirmDeleteThread ? (
                      <div className="flex items-center gap-2">
                        <span className="text-red-800">Retirer de votre boîte ?</span>
                        <button
                          type="button"
                          disabled={statusBusy}
                          onClick={() => void handleHideConversation()}
                          className="px-2.5 py-1 rounded bg-red-700 text-white font-medium hover:bg-red-800"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteThread(false)}
                          className="px-2 py-1 text-stone-600 hover:text-stone-900"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteThread(true)}
                        className="min-h-[32px] px-2.5 py-1 rounded text-red-700 hover:bg-red-50 inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer la conversation</span>
                      </button>
                    )}
                  </div>
                )}

                {confirmBlockMember && activeOtherId && activeOtherName && !isBlocked && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs text-red-950">
                    <span>
                      Bloquer <strong>{activeOtherName}</strong> empêchera tout futur message privé dans les deux sens et masquera ses contenus.
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={relBusy}
                        onClick={() =>
                          void handleSetRelation(activeOtherId, activeOtherName, 'blocked')
                        }
                        className="px-3 py-1 rounded bg-red-800 text-white font-medium hover:bg-red-900"
                      >
                        Confirmer le blocage
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBlockMember(false)}
                        className="px-2 py-1 text-stone-700 hover:text-stone-900"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* In-Conversation Word Search Bar */}
                {showThreadSearch && (
                  <div className="p-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        autoFocus
                        value={threadSearchQuery}
                        onChange={(e) => setThreadSearchQuery(e.target.value)}
                        placeholder="Rechercher un mot dans la conversation…"
                        aria-label="Rechercher un mot dans la conversation"
                        className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-white border border-stone-200 rounded text-xs text-stone-900 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>

                    {normalizedSearch && (
                      <div className="flex items-center gap-1.5 text-xs text-stone-600 tabular-nums">
                        <span>
                          {matchedMessageIds.length === 0
                            ? '0 résultat'
                            : `${Math.min(focusedMatchIdx + 1, matchedMessageIds.length)} / ${
                                matchedMessageIds.length
                              }`}
                        </span>
                        <button
                          type="button"
                          disabled={matchedMessageIds.length === 0}
                          onClick={() => stepMatch(-1)}
                          aria-label="Occurrence précédente"
                          className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded border border-stone-200 bg-white hover:border-stone-400 disabled:opacity-40"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={matchedMessageIds.length === 0}
                          onClick={() => stepMatch(1)}
                          aria-label="Occurrence suivante"
                          className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded border border-stone-200 bg-white hover:border-stone-400 disabled:opacity-40"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterToMatches((prev) => !prev)}
                          className={`min-h-[30px] px-2.5 py-1 rounded border text-[11px] font-medium whitespace-nowrap ${
                            filterToMatches
                              ? 'bg-[#1B365D] text-white border-[#1B365D]'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          {filterToMatches ? 'Tous les messages' : 'Filtrer les résultats'}
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setThreadSearchQuery('');
                        setFilterToMatches(false);
                        setShowThreadSearch(false);
                      }}
                      aria-label="Fermer la recherche"
                      className="p-1 text-stone-500 hover:text-stone-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Status Notice when Blocked or Not Interested */}
                {(isBlocked || isNotInterested) && activeOtherId && activeOtherName && (
                  <div
                    className={`px-3.5 py-2.5 rounded-md border flex flex-wrap items-center justify-between gap-2 text-xs ${
                      isBlocked
                        ? 'bg-red-50 border-red-200 text-red-950'
                        : 'bg-amber-50 border-amber-200 text-amber-950'
                    }`}
                  >
                    <span>
                      {isBlocked
                        ? `Vous avez bloqué ${activeOtherName}. Les messages privés sont désactivés.`
                        : `${activeOtherName} est marqué(e) en « Pas intéressé ». Ses récits sont masqués de votre fil.`}
                    </span>
                    <button
                      type="button"
                      disabled={relBusy}
                      onClick={() => void handleSetRelation(activeOtherId, activeOtherName, null)}
                      className="font-medium underline whitespace-nowrap"
                    >
                      {isBlocked ? 'Débloquer' : 'Rétablir'}
                    </button>
                  </div>
                )}
              </div>

              {/* Message List */}
              <div
                ref={threadContainerRef}
                className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FBF9F5]/60"
              >
                {!messagesLoaded ? (
                  <p className="text-sm text-stone-500 italic text-center py-10">
                    Chargement de la conversation…
                  </p>
                ) : displayedMessages.length === 0 ? (
                  <p className="text-sm text-stone-500 italic text-center py-10">
                    {normalizedSearch
                      ? `Aucun message ne contient « ${threadSearchQuery} ».`
                      : 'Aucun message affiché dans cette conversation.'}
                  </p>
                ) : (
                  displayedMessages.map((msg) => {
                    const isMine = msg.senderId === user.uid;
                    const isFocused = focusedMessageId === msg.messageId;
                    const isConfirmingDel = confirmDeleteMsgId === msg.messageId;
                    const isBusyDel = deletingMsgId === msg.messageId;

                    return (
                      <div
                        key={msg.messageId}
                        data-msg-id={msg.messageId}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                          <span className="font-medium text-stone-700">{msg.senderName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatFrenchDate(msg.createdAt?.toDate() ?? null)}</span>
                        </div>

                        <div
                          className={`max-w-[84%] px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-line border transition-shadow ${
                            isMine
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                              : 'bg-white text-stone-800 border-stone-200'
                          } ${isFocused ? 'ring-2 ring-amber-400 shadow-sm' : ''}`}
                        >
                          {renderHighlightedText(msg.content, threadSearchQuery, isFocused)}
                        </div>

                        {/* Compact Per-Message Actions */}
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-stone-500">
                          {isMine ? (
                            isConfirmingDel ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-red-800">Supprimer pour tous ?</span>
                                <button
                                  type="button"
                                  disabled={isBusyDel}
                                  onClick={() => void handleDeleteOwnMsg(msg)}
                                  className="font-semibold text-red-700 hover:underline"
                                >
                                  {isBusyDel ? 'Suppression…' : 'Confirmer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMsgId(null)}
                                  className="text-stone-600 hover:text-stone-900"
                                >
                                  Annuler
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMsgId(msg.messageId)}
                                className="hover:text-red-700 inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Supprimer</span>
                              </button>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusyDel}
                                onClick={() => void handleHideMsgForMe(msg)}
                                className="hover:text-stone-800 inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Supprimer pour moi</span>
                              </button>
                              {onOpenReport && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenReport({
                                      targetUserId: msg.senderId,
                                      targetUserName: msg.senderName,
                                      targetType: 'private_message',
                                      targetId: msg.messageId,
                                      targetContextId: activeExchange.exchangeId,
                                      targetExcerpt: msg.content,
                                      targetSummaryLabel: `Signaler un message de ${msg.senderName}`,
                                    })
                                  }
                                  className="hover:text-red-700 inline-flex items-center gap-1"
                                >
                                  <Flag className="w-3 h-3" />
                                  <span>Signaler</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              {/* Composer / Blocked / Archived Footer */}
              {isBlocked ? (
                <div className="p-4 border-t border-stone-200 bg-red-50/70 text-center text-xs text-red-900">
                  Vous avez bloqué ce membre. Cliquez sur « Débloquer » ci-dessus pour reprendre la conversation.
                </div>
              ) : activeExchange.status === 'active' ? (
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
          ) : (
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-lg p-10 text-center text-sm text-stone-500">
              Sélectionnez une conversation dans la liste à gauche.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
