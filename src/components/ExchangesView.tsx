import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Ban,
  BookOpen,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Flag,
  MessageCircle,
  MoreVertical,
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
import { stripSharedStoryUrlFromText } from '../lib/storyShare';
import { formatFrenchDate } from '../lib/themes';
import {
  Exchange,
  ExchangeMessage,
  FIELD_LIMITS,
  PublicProfile,
  Story,
  UserRelationship,
} from '../types/story';
import type { ReportDraft } from './ReportModal';
import { SharedStoryPreviewCard } from './SharedStoryPreviewCard';

interface ExchangesViewProps {
  exchanges: Exchange[];
  stories?: Story[];
  discoverableProfiles: PublicProfile[];
  relationships?: UserRelationship[];
  selectedExchangeId: string | null;
  initialRecipientId?: string | null;
  onClearInitialRecipient?: () => void;
  onSelectExchange: (exchangeId: string) => void;
  onReadStory?: (story: Story) => void;
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

function getInitialLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : 'M';
}

export function ExchangesView({
  exchanges,
  stories = [],
  discoverableProfiles,
  relationships = [],
  selectedExchangeId,
  initialRecipientId,
  onClearInitialRecipient,
  onSelectExchange,
  onReadStory,
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

  // Mobile master/detail navigation + organized thread menu
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>(
    selectedExchangeId ? 'thread' : 'list'
  );
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);

  // Sidebar tabs & search
  const [sidebarTab, setSidebarTab] = useState<SidebarFilterTab>('active');
  const [sidebarSearch, setSidebarSearch] = useState('');

  // In-conversation search
  const [showThreadSearch, setShowThreadSearch] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState('');
  const [filterToMatches, setFilterToMatches] = useState(false);
  const [focusedMatchIdx, setFocusedMatchIdx] = useState(0);

  // Per-message & conversation confirmations
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [confirmBlockMember, setConfirmBlockMember] = useState(false);

  // New Direct Private Chat panel
  const [showNewChat, setShowNewChat] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedExchangeId) {
      setMobilePane('thread');
    }
  }, [selectedExchangeId]);

  useEffect(() => {
    if (initialRecipientId) {
      setShowNewChat(true);
      setRecipientId(initialRecipientId);
      setCreateError(null);
      onClearInitialRecipient?.();
    }
  }, [initialRecipientId, onClearInitialRecipient]);

  useEffect(() => {
    if (!threadMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setThreadMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [threadMenuOpen]);

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
    const q = sidebarSearch.trim().toLowerCase();
    return visibleExchanges.filter((ex) => {
      const otherId = ex.initiatorId === user.uid ? ex.recipientId : ex.initiatorId;
      const otherName = (
        ex.initiatorId === user.uid ? ex.recipientName : ex.initiatorName
      ).toLowerCase();
      const rel = relationshipMap.get(otherId)?.relation;

      let matchesTab = false;
      if (sidebarTab === 'blocked') matchesTab = rel === 'blocked';
      else if (sidebarTab === 'not_interested') matchesTab = rel === 'not_interested';
      else if (rel === 'blocked' || rel === 'not_interested') matchesTab = false;
      else if (sidebarTab === 'archived') matchesTab = ex.status === 'archived';
      else matchesTab = ex.status === 'active';

      if (!matchesTab) return false;
      if (!q) return true;
      return (
        otherName.includes(q) ||
        ex.storyTitle.toLowerCase().includes(q) ||
        ex.lastMessagePreview.toLowerCase().includes(q)
      );
    });
  }, [visibleExchanges, relationshipMap, sidebarTab, sidebarSearch, user]);

  const relationshipEntriesForTab = useMemo(() => {
    if (sidebarTab !== 'blocked' && sidebarTab !== 'not_interested') return [];
    const q = sidebarSearch.trim().toLowerCase();
    return relationships.filter((r) => {
      if (r.relation !== sidebarTab) return false;
      if (!q) return true;
      return r.targetName.toLowerCase().includes(q);
    });
  }, [relationships, sidebarTab, sidebarSearch]);

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
    setThreadMenuOpen(false);
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
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8 sm:p-10">
          <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-3">
            Passerelles · Chat privé 1 à 1
          </p>
          <h1 className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100 mb-3">
            Discuter en privé avec les membres de votre choix
          </h1>
          <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed mb-6">
            Les passerelles vous permettent d’ouvrir une conversation écrite calme et privée avec n’importe quel membre, librement ou à partir d’un récit du salon.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-[#1E3A8A] dark:bg-amber-600 rounded-md hover:bg-[#172D6B] dark:hover:bg-amber-500 transition-colors whitespace-nowrap"
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
    setThreadMenuOpen(false);
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
      setThreadMenuOpen(false);
      setMobilePane('list');
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
    setThreadMenuOpen(false);
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
      setMobilePane('thread');
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-stone-200 dark:border-stone-800">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
            Passerelles · Discussions privées 1 à 1
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-stone-900 dark:text-stone-100">
            Vos conversations privées
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            {visibleExchanges.length} conversation{visibleExchanges.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowNewChat((prev) => !prev);
            }}
            className="min-h-[38px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {showNewChat ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showNewChat ? 'Fermer' : 'Nouveau message'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible New Direct Private Chat Panel */}
      {showNewChat && (
        <form
          onSubmit={handleCreateDirectChat}
          className="bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-medium text-stone-900 dark:text-stone-100">
              Démarrer une conversation privée
            </h2>
          </div>

          {otherMembers.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Aucun autre membre disponible pour démarrer un échange pour le moment.
            </p>
          ) : (
            <>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="md:w-64 shrink-0">
                  <label
                    htmlFor="dm-recipient"
                    className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
                  >
                    Destinataire
                  </label>
                  <select
                    id="dm-recipient"
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    required
                    className="w-full min-h-[40px] px-3 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
                  >
                    <option value="">Choisir un membre…</option>
                    {otherMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="dm-first-msg"
                    className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
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
                    placeholder="Bonjour, j’aimerais échanger avec toi…"
                    className="w-full min-h-[40px] px-3.5 py-2 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
                  />
                </div>
              </div>

              {createError && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {createError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingChat}
                  className="min-h-[38px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{creatingChat ? 'Envoi…' : 'Envoyer le message'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {visibleExchanges.length === 0 && relationships.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-10 text-center max-w-2xl mx-auto my-8">
          <MessageCircle className="w-8 h-8 text-stone-400 mx-auto mb-4" />
          <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 mb-2">
            Aucune conversation privée pour le moment
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed mb-6">
            Cliquez sur « Nouveau message » pour écrire à un membre de votre choix, ou ouvrez une conversation depuis le mur d’un membre ou sous un récit du salon.
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
              className="min-h-[40px] px-5 py-2 text-sm font-medium text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md hover:border-stone-500 transition-colors whitespace-nowrap"
            >
              Explorer les salons
            </button>
          </div>
        </div>
      ) : (
        /* Unified Flex Split-Pane Inbox + Active Conversation */
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden flex flex-col lg:flex-row min-h-[540px] lg:h-[680px]">
          {/* Left Pane: Conversations Sidebar */}
          <aside
            className={`${
              mobilePane === 'list' ? 'flex' : 'hidden lg:flex'
            } flex-col w-full lg:w-[330px] xl:w-[360px] shrink-0 border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-stone-800 min-h-0 bg-[#FBF9F5]/40 dark:bg-stone-950/40`}
          >
            {/* Sidebar Search */}
            <div className="p-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-2.5 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Filtrer par membre ou mot…"
                  aria-label="Filtrer les conversations"
                  className="w-full min-h-[36px] pl-8 pr-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
                />
              </div>

              {/* Flex Filter Pills */}
              <div
                role="tablist"
                aria-label="Catégories de conversations"
                className="flex items-center gap-1 overflow-x-auto pb-0.5"
              >
                {(
                  [
                    { id: 'active', label: `Actives (${sidebarCounts.active})` },
                    { id: 'archived', label: `Archivées (${sidebarCounts.archived})` },
                    { id: 'not_interested', label: `Ignorés (${sidebarCounts.not_interested})` },
                    { id: 'blocked', label: `Bloqués (${sidebarCounts.blocked})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === tab.id}
                    onClick={() => setSidebarTab(tab.id)}
                    className={`min-h-[30px] px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      sidebarTab === tab.id
                        ? 'bg-[#1B365D] text-white border-[#1B365D]'
                        : 'bg-[#FBF9F5] dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sidebar List */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-200 dark:divide-stone-800">
              {filteredSidebarExchanges.length === 0 && relationshipEntriesForTab.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
                  {sidebarSearch.trim()
                    ? 'Aucune conversation ne correspond à cette recherche.'
                    : sidebarTab === 'active'
                      ? 'Aucune conversation active.'
                      : sidebarTab === 'archived'
                        ? 'Aucune conversation archivée.'
                        : sidebarTab === 'not_interested'
                          ? 'Aucun membre marqué « Pas intéressé ».'
                          : 'Aucun membre bloqué.'}
                </div>
              ) : (
                <>
                  {filteredSidebarExchanges.map((ex) => {
                    const otherName =
                      ex.initiatorId === user.uid ? ex.recipientName : ex.initiatorName;
                    const isSelected = activeExchange?.exchangeId === ex.exchangeId;
                    const isDirect = ex.kind === 'direct' || ex.storyId === 'direct';
                    return (
                      <button
                        key={ex.exchangeId}
                        type="button"
                        onClick={() => {
                          onSelectExchange(ex.exchangeId);
                          setMobilePane('thread');
                        }}
                        className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${
                          isSelected
                            ? 'bg-[#F3F6FA] dark:bg-stone-800 border-l-2 border-l-[#1B365D] dark:border-l-amber-400'
                            : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-[#EFEAE0] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 flex items-center justify-center font-display text-sm font-medium shrink-0 mt-0.5">
                          {getInitialLetter(otherName)}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-stone-900 dark:text-stone-100 truncate">
                              {otherName}
                            </span>
                            <span className="text-[11px] text-stone-500 dark:text-stone-400 whitespace-nowrap shrink-0">
                              {ex.status === 'archived'
                                ? 'Archivée'
                                : formatFrenchDate(ex.updatedAt?.toDate() ?? null)}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#1E3A8A] dark:text-amber-300 truncate">
                            {isDirect ? 'Discussion directe' : ex.storyTitle}
                          </p>
                          <p className="text-xs text-stone-600 dark:text-stone-400 truncate">
                            {ex.lastMessagePreview || 'Conversation ouverte'}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {relationshipEntriesForTab
                    .filter(
                      (rel) =>
                        !filteredSidebarExchanges.some(
                          (ex) =>
                            ex.initiatorId === rel.targetUserId ||
                            ex.recipientId === rel.targetUserId
                        )
                    )
                    .map((rel) => (
                      <div
                        key={rel.targetUserId}
                        className="px-4 py-3.5 flex items-center justify-between gap-3 bg-white dark:bg-stone-900"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 flex items-center justify-center font-display text-xs shrink-0">
                            {getInitialLetter(rel.targetName)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                              {rel.targetName}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">
                              {rel.relation === 'blocked' ? 'Membre bloqué' : 'Pas intéressé'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={relBusy}
                          onClick={() =>
                            void handleSetRelation(rel.targetUserId, rel.targetName, null)
                          }
                          className="min-h-[30px] px-2.5 py-1 text-xs font-medium text-[#1B365D] dark:text-amber-300 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded hover:border-[#1B365D] whitespace-nowrap shrink-0"
                        >
                          {rel.relation === 'blocked' ? 'Débloquer' : 'Rétablir'}
                        </button>
                      </div>
                    ))}
                </>
              )}
            </div>
          </aside>

          {/* Right Pane: Active Thread */}
          <section
            className={`${
              mobilePane === 'thread' ? 'flex' : 'hidden lg:flex'
            } flex-1 min-w-0 flex-col min-h-0 bg-white dark:bg-stone-900`}
          >
            {activeExchange ? (
              <>
                {/* Clean Flex Thread Header */}
                <div className="px-4 sm:px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 shrink-0 space-y-2.5 bg-white dark:bg-stone-900">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setMobilePane('list')}
                        aria-label="Revenir à la liste des conversations"
                        className="lg:hidden min-h-[36px] min-w-[36px] rounded-md border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center justify-center shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <div className="w-9 h-9 rounded-full bg-[#EFEAE0] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 flex items-center justify-center font-display text-sm font-medium shrink-0">
                        {getInitialLetter(activeOtherName || 'M')}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => activeOtherId && onOpenMemberWall(activeOtherId)}
                            className="font-medium text-sm sm:text-base text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline truncate"
                          >
                            {activeOtherName}
                          </button>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 shrink-0">
                            {activeExchange.status === 'active' ? 'Active' : 'Archivée'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          {isDirectExchange ? (
                            'Conversation privée directe'
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenStoryById(activeExchange.storyId)}
                              className="hover:text-[#1B365D] dark:hover:text-amber-300 hover:underline truncate text-left"
                            >
                              À propos de « {activeExchange.storyTitle} »
                            </button>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Compact Actions: Search + Organized Options Popover */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowThreadSearch((prev) => !prev)}
                        aria-expanded={showThreadSearch}
                        aria-label="Rechercher un mot dans la conversation"
                        title="Rechercher dans la conversation"
                        className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap ${
                          showThreadSearch
                            ? 'bg-[#1B365D] text-white border-[#1B365D]'
                            : 'text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                        }`}
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Rechercher</span>
                      </button>

                      <div className="relative" ref={menuContainerRef}>
                        <button
                          type="button"
                          onClick={() => setThreadMenuOpen((prev) => !prev)}
                          aria-expanded={threadMenuOpen}
                          aria-haspopup="menu"
                          className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Options</span>
                        </button>

                        {threadMenuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-xl py-1.5 z-30 text-xs"
                          >
                            {activeOtherId && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setThreadMenuOpen(false);
                                  onOpenMemberWall(activeOtherId);
                                }}
                                className="w-full px-3.5 py-2 text-left text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2.5"
                              >
                                <UserIcon className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                <span>Voir le profil de {activeOtherName}</span>
                              </button>
                            )}

                            {!isDirectExchange && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setThreadMenuOpen(false);
                                  onOpenStoryById(activeExchange.storyId);
                                }}
                                className="w-full px-3.5 py-2 text-left text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2.5"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                <span>Lire le récit associé</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              disabled={statusBusy}
                              onClick={() => void handleToggleArchive()}
                              className="w-full px-3.5 py-2 text-left text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2.5 disabled:opacity-50"
                            >
                              {activeExchange.status === 'active' ? (
                                <>
                                  <Archive className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                  <span>Archiver la conversation</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                                  <span>Rouvrir la conversation</span>
                                </>
                              )}
                            </button>

                            {activeOtherId && activeOtherName && (
                              <>
                                <div className="my-1 border-t border-stone-100 dark:border-stone-800" />

                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={relBusy}
                                  onClick={() =>
                                    void handleSetRelation(
                                      activeOtherId,
                                      activeOtherName,
                                      isNotInterested ? null : 'not_interested'
                                    )
                                  }
                                  className="w-full px-3.5 py-2 text-left text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2.5 disabled:opacity-50"
                                >
                                  <EyeOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                                  <span>
                                    {isNotInterested
                                      ? 'Retirer « Pas intéressé »'
                                      : 'Marquer en « Pas intéressé »'}
                                  </span>
                                </button>

                                {isBlocked ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={relBusy}
                                    onClick={() =>
                                      void handleSetRelation(activeOtherId, activeOtherName, null)
                                    }
                                    className="w-full px-3.5 py-2 text-left text-red-800 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center gap-2.5 disabled:opacity-50"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Débloquer {activeOtherName}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setThreadMenuOpen(false);
                                      setConfirmBlockMember(true);
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-red-800 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center gap-2.5"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Bloquer {activeOtherName}</span>
                                  </button>
                                )}

                                {onOpenReport && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setThreadMenuOpen(false);
                                      const latestFromOther = [...visibleMessages]
                                        .reverse()
                                        .find((m) => m.senderId === activeOtherId);
                                      onOpenReport({
                                        targetUserId: activeOtherId,
                                        targetUserName: activeOtherName,
                                        targetType: 'private_message',
                                        targetId:
                                          latestFromOther?.messageId || activeExchange.exchangeId,
                                        targetContextId: activeExchange.exchangeId,
                                        targetExcerpt:
                                          latestFromOther?.content ||
                                          activeExchange.lastMessagePreview ||
                                          '',
                                        targetSummaryLabel: `Signaler ${activeOtherName}`,
                                      });
                                    }}
                                    className="w-full px-3.5 py-2 text-left text-red-800 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center gap-2.5"
                                  >
                                    <Flag className="w-3.5 h-3.5" />
                                    <span>Signaler ce membre</span>
                                  </button>
                                )}
                              </>
                            )}

                            <div className="my-1 border-t border-stone-100 dark:border-stone-800" />

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setThreadMenuOpen(false);
                                setConfirmDeleteThread(true);
                              }}
                              className="w-full px-3.5 py-2 text-left text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center gap-2.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Supprimer la conversation</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Confirmation Banner: Delete Thread */}
                  {confirmDeleteThread && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs text-red-950 dark:text-red-200">
                      <span>Retirer cette conversation de votre boîte de réception ?</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={statusBusy}
                          onClick={() => void handleHideConversation()}
                          className="px-3 py-1 rounded bg-red-700 text-white font-medium hover:bg-red-800"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteThread(false)}
                          className="px-2 py-1 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation Banner: Block Member */}
                  {confirmBlockMember && activeOtherId && activeOtherName && !isBlocked && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs text-red-950 dark:text-red-200">
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
                          className="px-2 py-1 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {/* In-Conversation Word Search Bar */}
                  {showThreadSearch && (
                    <div className="p-2.5 bg-[#FBF9F5] dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700 rounded-md flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          autoFocus
                          value={threadSearchQuery}
                          onChange={(e) => setThreadSearchQuery(e.target.value)}
                          placeholder="Rechercher un mot dans la conversation…"
                          aria-label="Rechercher un mot dans la conversation"
                          className="w-full min-h-[34px] pl-8 pr-3 py-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-amber-400"
                        />
                      </div>

                      {normalizedSearch && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300 tabular-nums">
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
                            className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-stone-400 disabled:opacity-40"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={matchedMessageIds.length === 0}
                            onClick={() => stepMatch(1)}
                            aria-label="Occurrence suivante"
                            className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-stone-400 disabled:opacity-40"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFilterToMatches((prev) => !prev)}
                            className={`min-h-[30px] px-2.5 py-1 rounded border text-[11px] font-medium whitespace-nowrap ${
                              filterToMatches
                                ? 'bg-[#1B365D] text-white border-[#1B365D]'
                                : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-stone-400'
                            }`}
                          >
                            {filterToMatches ? 'Tout voir' : 'Filtrer'}
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
                        className="p-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Status Notice when Blocked or Not Interested */}
                  {(isBlocked || isNotInterested) && activeOtherId && activeOtherName && (
                    <div
                      className={`px-3.5 py-2 rounded-md border flex flex-wrap items-center justify-between gap-2 text-xs ${
                        isBlocked
                          ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-950 dark:text-red-200'
                          : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                      }`}
                    >
                      <span>
                        {isBlocked
                          ? `Vous avez bloqué ${activeOtherName}. Les messages privés sont désactivés.`
                          : `${activeOtherName} est marqué(e) en « Pas intéressé ».`}
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

                {/* Scrollable Flex Message List */}
                <div
                  ref={threadContainerRef}
                  className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 bg-[#FBF9F5]/60 dark:bg-stone-950/60"
                >
                  {!messagesLoaded ? (
                    <p className="text-sm text-stone-500 dark:text-stone-400 italic text-center py-10">
                      Chargement de la conversation…
                    </p>
                  ) : displayedMessages.length === 0 ? (
                    <p className="text-sm text-stone-500 dark:text-stone-400 italic text-center py-10">
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
                          className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400 mb-1 px-1">
                            <span className="font-medium text-stone-700 dark:text-stone-300">{msg.senderName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(msg.createdAt?.toDate() ?? null)}</span>
                          </div>

                          <div
                            className={`flex items-end gap-1.5 max-w-[90%] sm:max-w-[80%] ${
                              isMine ? 'flex-row-reverse' : 'flex-row'
                            }`}
                          >
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line border transition-shadow ${
                                isMine
                                  ? 'bg-[#1E3A8A] dark:bg-amber-700 text-white border-[#1E3A8A] dark:border-amber-600 rounded-br-sm'
                                  : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 border-stone-200 dark:border-stone-700 rounded-bl-sm'
                              } ${isFocused ? 'ring-2 ring-amber-400 shadow-sm' : ''}`}
                            >
                              {(() => {
                                const cleanText = stripSharedStoryUrlFromText(msg.content);
                                return (
                                  <>
                                    {cleanText && (
                                      <span>
                                        {renderHighlightedText(
                                          cleanText,
                                          threadSearchQuery,
                                          isFocused
                                        )}
                                      </span>
                                    )}
                                    <SharedStoryPreviewCard
                                      content={msg.content}
                                      stories={stories}
                                      onReadStory={onReadStory}
                                      onOpenStoryById={onOpenStoryById}
                                      isMineBubble={isMine}
                                    />
                                  </>
                                );
                              })()}
                            </div>

                            {/* Compact Action Controls alongside bubble */}
                            <div className="flex items-center gap-1 shrink-0 pb-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              {isMine ? (
                                !isConfirmingDel && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMsgId(msg.messageId)}
                                    aria-label="Supprimer ce message"
                                    title="Supprimer ce message"
                                    className="p-1.5 rounded-full text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusyDel}
                                    onClick={() => void handleHideMsgForMe(msg)}
                                    aria-label="Supprimer pour moi"
                                    title="Supprimer pour moi"
                                    className="p-1.5 rounded-full text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
                                      aria-label="Signaler ce message"
                                      title="Signaler ce message"
                                      className="p-1.5 rounded-full text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                                    >
                                      <Flag className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {isMine && isConfirmingDel && (
                            <div className="mt-1 inline-flex items-center gap-2 text-[11px] bg-white dark:bg-stone-900 border border-red-200 dark:border-red-800 rounded px-2.5 py-1">
                              <span className="text-red-800 dark:text-red-300">Supprimer pour tous ?</span>
                              <button
                                type="button"
                                disabled={isBusyDel}
                                onClick={() => void handleDeleteOwnMsg(msg)}
                                className="font-semibold text-red-700 dark:text-red-400 hover:underline"
                              >
                                {isBusyDel ? 'Suppression…' : 'Confirmer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMsgId(null)}
                                className="text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {/* Pinned Flex Footer Composer */}
                {isBlocked ? (
                  <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-red-50/70 dark:bg-red-950/40 text-center text-xs text-red-900 dark:text-red-200 shrink-0">
                    Vous avez bloqué ce membre. Utilisez « Options → Débloquer » pour reprendre la conversation.
                  </div>
                ) : activeExchange.status === 'active' ? (
                  <form
                    onSubmit={handleSend}
                    className="p-3.5 sm:p-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-2 shrink-0"
                  >
                    <div className="flex items-end gap-2.5">
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
                        className="flex-1 min-w-0 px-3.5 py-2.5 bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1E3A8A] dark:focus:border-amber-400 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={sending || !draft.trim()}
                        className="min-h-[42px] px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] rounded-md hover:bg-[#172D6B] disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">Envoyer</span>
                      </button>
                    </div>
                    {error && (
                      <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                        {error}
                      </p>
                    )}
                  </form>
                ) : (
                  <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-center text-xs text-stone-600 dark:text-stone-400 shrink-0">
                    Cette conversation est archivée. Rouvrez-la via « Options » pour reprendre l’échange.
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-sm text-stone-500 dark:text-stone-400">
                <MessageCircle className="w-7 h-7 text-stone-300 dark:text-stone-600 mb-3" />
                <p>Sélectionnez une conversation dans la liste à gauche.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
