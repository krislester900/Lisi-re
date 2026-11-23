import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, MessageSquare, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { checkLocalContentHygiene } from '../lib/contentRegulation';
import {
  deleteSalonMessage,
  runAutomatedContentBotGuard,
  sendSalonMessage,
  subscribeToSalonMessages,
} from '../lib/storyService';
import { formatFrenchDate, THEME_MAP } from '../lib/themes';
import { FIELD_LIMITS, SalonMessage, StoryThemeId } from '../types/story';
import type { ReportDraft } from './ReportModal';

interface SalonChatPanelProps {
  salonId: StoryThemeId;
  hiddenUserIds?: Set<string>;
  onOpenMemberWall: (userId: string) => void;
  onOpenReport?: (draft: ReportDraft) => void;
}

export function SalonChatPanel({
  salonId,
  hiddenUserIds,
  onOpenMemberWall,
  onOpenReport,
}: SalonChatPanelProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [messages, setMessages] = useState<SalonMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const salon = THEME_MAP[salonId];

  useEffect(() => {
    setError(null);
    if (!user) {
      setMessages([]);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    const unsub = subscribeToSalonMessages(salonId, (list) => {
      setMessages(list);
      setLoaded(true);
    });
    return () => unsub();
  }, [salonId, user]);

  const visibleMessages = useMemo(() => {
    if (!hiddenUserIds || hiddenUserIds.size === 0) return messages;
    return messages.filter((m) => !hiddenUserIds.has(m.senderId));
  }, [messages, hiddenUserIds]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setError(null);
    if (!draft.trim()) return;

    const hygiene = checkLocalContentHygiene(draft, {
      label: 'Votre message',
      minWords: 1,
      strictSentenceQuality: false,
    });
    if (!hygiene.ok) {
      setError(hygiene.reason ?? 'Message non conforme à la charte.');
      return;
    }

    setSending(true);
    try {
      const verdict = await runAutomatedContentBotGuard({
        kind: 'chat',
        title: salon.shortSalonName,
        text: draft,
      });
      if (!verdict.allowed) {
        setError(
          verdict.blockedReason ||
            'Le bot de régulation a bloqué ce message (propos offensants, haineux ou incompréhensibles).'
        );
        return;
      }

      const senderName = profile?.displayName || user.displayName || 'Auteur';
      await sendSalonMessage({
        salonId,
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

  if (!user) {
    return (
      <section
        aria-label={`Chat textuel de ${salon.salonName}`}
        className="bg-white border border-stone-200 rounded-lg p-8 sm:p-10 text-center space-y-4"
      >
        <MessageSquare className="w-7 h-7 text-stone-400 mx-auto" />
        <h2 className="font-display text-2xl font-medium text-stone-900">
          Discussion ouverte de {salon.salonName}
        </h2>
        <p className="text-sm text-stone-600 max-w-xl mx-auto leading-relaxed">
          Un chat calme et uniquement écrit (sans appel ni message vocal) pour échanger en direct avec les autres membres autour des thèmes de ce salon.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          style={{ backgroundColor: salon.palette.accent }}
          className="min-h-[42px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity"
        >
          Se connecter pour rejoindre le chat
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={`Chat textuel de ${salon.salonName}`}
      className="bg-white border border-stone-200 rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FBF9F5]">
        <div>
          <h2 className="font-display text-xl font-medium text-stone-900">
            Chat écrit de {salon.salonName}
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Discussion collective entre membres · Texte uniquement, sans appel ni vocal · Cliquez sur un prénom pour voir son mur
          </p>
        </div>
        <span className="text-xs text-stone-500 tabular-nums whitespace-nowrap shrink-0">
          {visibleMessages.length} message{visibleMessages.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-[420px] overflow-y-auto p-6 space-y-4 bg-[#FBF9F5]/50">
        {!loaded ? (
          <p className="text-sm text-stone-500 italic text-center py-12">
            Ouverture du fil de discussion…
          </p>
        ) : visibleMessages.length === 0 ? (
          <div className="text-center py-14 space-y-2">
            <p className="font-display text-lg text-stone-800">
              Le salon est silencieux pour l’instant
            </p>
            <p className="text-sm text-stone-600">
              Déposez quelques mots ci-dessous pour saluer les autres membres ou réagir au thème du salon.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = msg.senderId === user.uid;
            return (
              <div
                key={msg.messageId}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                  <button
                    type="button"
                    onClick={() => onOpenMemberWall(msg.senderId)}
                    className="font-semibold text-stone-800 hover:underline"
                  >
                    {msg.senderName}
                  </button>
                  <span aria-hidden="true">·</span>
                  <span>{formatFrenchDate(msg.createdAt?.toDate() ?? null)}</span>
                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => void deleteSalonMessage(salonId, msg.messageId)}
                      aria-label="Supprimer ce message"
                      className="text-stone-400 hover:text-red-700 p-0.5 ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  ) : (
                    onOpenReport && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenReport({
                            targetUserId: msg.senderId,
                            targetUserName: msg.senderName,
                            targetType: 'salon_message',
                            targetId: msg.messageId,
                            targetContextId: salonId,
                            targetExcerpt: msg.content,
                            targetSummaryLabel: `Signaler un message dans ${salon.shortSalonName}`,
                          })
                        }
                        title="Signaler ce message"
                        aria-label="Signaler ce message"
                        className="text-stone-400 hover:text-red-700 p-0.5 ml-1"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )
                  )}
                </div>

                <div
                  style={isMine ? { backgroundColor: salon.palette.accent } : undefined}
                  className={`max-w-[82%] px-4 py-2.5 rounded-lg text-sm leading-relaxed whitespace-pre-line border ${
                    isMine
                      ? 'text-white border-transparent'
                      : 'bg-white text-stone-800 border-stone-200'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-stone-200 bg-white space-y-2">
        <div className="flex items-end gap-3">
          <textarea
            rows={2}
            maxLength={FIELD_LIMITS.salonChatContent.max}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
            placeholder={`Écrire dans ${salon.shortSalonName}… (Entrée pour envoyer)`}
            className="flex-1 px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 focus:outline-none focus:border-[#1B365D] resize-none"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            style={{ backgroundColor: salon.palette.accent }}
            className="min-h-[42px] px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-[opacity,transform] duration-150 ease-out active:scale-[0.96]"
          >
            <Send className="w-4 h-4" />
            <span>Envoyer</span>
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1B365D] shrink-0" />
            <span>Échanges régulés : aucun propos haineux, insultant ni spam.</span>
          </span>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
