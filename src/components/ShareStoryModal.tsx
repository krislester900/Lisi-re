import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  Link2,
  Lock,
  MessageSquare,
  Search,
  Send,
  Share2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkLocalContentHygiene,
  evaluateStoryFormatCompliance,
} from '../lib/contentRegulation';
import {
  buildSocialShareTargets,
  buildStoryShareSummary,
  buildStoryShareUrl,
} from '../lib/storyShare';
import {
  createDirectExchangeWithFirstMessage,
  formatFriendlyFirestoreError,
  runAutomatedContentBotGuard,
  sendCustomSalonMessage,
  sendSalonMessage,
} from '../lib/storyService';
import { ACCENT_TONE_PALETTES, STORY_THEMES } from '../lib/themes';
import {
  CustomSalon,
  PublicProfile,
  Story,
  StoryThemeId,
} from '../types/story';
import { SalonEmblem } from './SalonEmblem';

interface ShareStoryModalProps {
  story: Story | null;
  customSalons: CustomSalon[];
  discoverableProfiles: PublicProfile[];
  hiddenUserIds?: Set<string>;
  onClose: () => void;
  onEnterSalon?: (salonId: StoryThemeId) => void;
  onEnterCustomSalon?: (customSalonId: string) => void;
  onOpenExchange?: (exchangeId: string) => void;
  onSharedNotice?: (message: string) => void;
}

type ShareTab = 'social' | 'salon' | 'member';

type SelectedSalonTarget =
  | { kind: 'predefined'; id: StoryThemeId; label: string }
  | { kind: 'custom'; id: string; label: string };

export function ShareStoryModal({
  story,
  customSalons,
  discoverableProfiles,
  hiddenUserIds,
  onClose,
  onEnterSalon,
  onEnterCustomSalon,
  onOpenExchange,
  onSharedNotice,
}: ShareStoryModalProps) {
  const { user, profile, signInWithGoogle } = useAuth();

  const [activeTab, setActiveTab] = useState<ShareTab>('social');
  const [linkCopied, setLinkCopied] = useState(false);

  // Salon share state
  const [selectedSalon, setSelectedSalon] = useState<SelectedSalonTarget>({
    kind: 'predefined',
    id: STORY_THEMES[0].id,
    label: STORY_THEMES[0].shortSalonName,
  });
  const [salonNote, setSalonNote] = useState('');
  const [salonBusy, setSalonBusy] = useState(false);
  const [salonError, setSalonError] = useState<string | null>(null);
  const [salonSuccessTarget, setSalonSuccessTarget] = useState<SelectedSalonTarget | null>(null);

  // Member DM share state
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<PublicProfile | null>(null);
  const [memberNote, setMemberNote] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccessExchangeId, setMemberSuccessExchangeId] = useState<string | null>(null);
  const [memberSuccessName, setMemberSuccessName] = useState<string | null>(null);

  useEffect(() => {
    if (!story) return;
    setActiveTab('social');
    setLinkCopied(false);
    setSelectedSalon({
      kind: 'predefined',
      id: story.theme,
      label: STORY_THEMES.find((t) => t.id === story.theme)?.shortSalonName ?? 'Salon',
    });
    setSalonNote('');
    setSalonError(null);
    setSalonSuccessTarget(null);
    setMemberSearch('');
    setSelectedMember(null);
    setMemberNote('');
    setMemberError(null);
    setMemberSuccessExchangeId(null);
    setMemberSuccessName(null);
  }, [story?.storyId]);

  useEffect(() => {
    if (!story) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [story, onClose]);

  const eligibleCustomSalons = useMemo(() => {
    return customSalons.filter(
      (cs) => cs.visibility === 'public' || (user && cs.ownerId === user.uid)
    );
  }, [customSalons, user]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return discoverableProfiles
      .filter((p) => {
        if (user && p.userId === user.uid) return false;
        if (hiddenUserIds && hiddenUserIds.has(p.userId)) return false;
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          (p.bio ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 24);
  }, [discoverableProfiles, memberSearch, user, hiddenUserIds]);

  if (!story) return null;

  const formatCompliance = evaluateStoryFormatCompliance(story);
  const canSharePublicLink =
    story.visibility === 'public' &&
    story.customSalonVisibility !== 'private' &&
    formatCompliance.compliant;

  const directUrl = buildStoryShareUrl(story.storyId);
  const summaryText = buildStoryShareSummary(story);
  const socialShareTargets = buildSocialShareTargets({
    url: directUrl,
    title: `${story.title} — Lisière`,
    summary: summaryText,
  });
  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(directUrl);
      setLinkCopied(true);
      onSharedNotice?.('Lien du récit copié dans le presse-papiers.');
      window.setTimeout(() => setLinkCopied(false), 2400);
    } catch {
      setLinkCopied(false);
    }
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare) return;
    try {
      await navigator.share({
        title: `${story.title} — Lisière`,
        text: summaryText,
        url: directUrl,
      });
    } catch {
      // User cancelled native share
    }
  };

  const handleShareToSalon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!canSharePublicLink) return;

    setSalonError(null);
    setSalonSuccessTarget(null);

    const trimmedNote = salonNote.trim();
    if (trimmedNote) {
      const hygiene = checkLocalContentHygiene(trimmedNote, {
        label: 'Votre message',
        minWords: 1,
        strictSentenceQuality: false,
      });
      if (!hygiene.ok) {
        setSalonError(hygiene.reason ?? 'Veuillez vérifier votre message.');
        return;
      }
    }

    const composedMessage = trimmedNote
      ? `${trimmedNote}\n\n${summaryText}\n${directUrl}`
      : `Je partage ce récit avec vous : ${summaryText}\n${directUrl}`;

    setSalonBusy(true);
    try {
      if (trimmedNote) {
        const verdict = await runAutomatedContentBotGuard({
          kind: 'chat',
          title: selectedSalon.label,
          text: trimmedNote,
        });
        if (!verdict.allowed) {
          setSalonError(
            verdict.blockedReason ||
              'Le bot de régulation a bloqué ce message d’accompagnement.'
          );
          return;
        }
      }

      const senderName = profile?.displayName || user.displayName || 'Auteur';
      if (selectedSalon.kind === 'predefined') {
        await sendSalonMessage({
          salonId: selectedSalon.id,
          senderId: user.uid,
          senderName,
          rawContent: composedMessage,
        });
      } else {
        await sendCustomSalonMessage({
          salonId: selectedSalon.id,
          senderId: user.uid,
          senderName,
          rawContent: composedMessage,
        });
      }

      setSalonSuccessTarget(selectedSalon);
      setSalonNote('');
      onSharedNotice?.(`Récit partagé dans « ${selectedSalon.label} ».`);
    } catch (err) {
      setSalonError(
        formatFriendlyFirestoreError(
          err,
          'Impossible de partager ce récit dans ce salon pour le moment.'
        )
      );
    } finally {
      setSalonBusy(false);
    }
  };

  const handleShareToMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!canSharePublicLink) return;
    if (!selectedMember) {
      setMemberError('Choisissez un membre destinataire dans la liste.');
      return;
    }

    setMemberError(null);
    setMemberSuccessExchangeId(null);

    const trimmedNote = memberNote.trim();
    if (trimmedNote) {
      const hygiene = checkLocalContentHygiene(trimmedNote, {
        label: 'Votre message',
        minWords: 1,
        strictSentenceQuality: false,
      });
      if (!hygiene.ok) {
        setMemberError(hygiene.reason ?? 'Veuillez vérifier votre message.');
        return;
      }
    }

    const composedMessage = trimmedNote
      ? `${trimmedNote}\n\n${summaryText}\n${directUrl}`
      : `Je voulais partager ce récit avec toi : ${summaryText}\n${directUrl}`;

    setMemberBusy(true);
    try {
      if (trimmedNote) {
        const verdict = await runAutomatedContentBotGuard({
          kind: 'chat',
          title: `Partage privé à ${selectedMember.displayName}`,
          text: trimmedNote,
        });
        if (!verdict.allowed) {
          setMemberError(
            verdict.blockedReason ||
              'Le bot de régulation a bloqué ce message d’accompagnement.'
          );
          return;
        }
      }

      const senderName = profile?.displayName || user.displayName || 'Auteur';
      const exchangeId = await createDirectExchangeWithFirstMessage({
        initiatorId: user.uid,
        initiatorName: senderName,
        recipientId: selectedMember.userId,
        recipientName: selectedMember.displayName,
        firstMessage: composedMessage,
      });

      setMemberSuccessExchangeId(exchangeId);
      setMemberSuccessName(selectedMember.displayName);
      setMemberNote('');
      onSharedNotice?.(`Récit envoyé en privé à ${selectedMember.displayName}.`);
    } catch (err) {
      setMemberError(
        formatFriendlyFirestoreError(
          err,
          'Impossible d’envoyer ce récit à ce membre pour le moment.'
        )
      );
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-stone-950/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-story-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-[#1A1815] text-stone-900 dark:text-stone-100 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-[#141210] flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Partager un récit
            </p>
            <h2
              id="share-story-modal-title"
              className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 leading-snug truncate"
            >
              « {story.title} »
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {story.isAnonymous
                ? 'Auteur anonyme — le lien préserve strictement l’anonymat.'
                : `Par ${story.authorName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de partage"
            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Non-public guard */}
        {!canSharePublicLink ? (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-950 dark:text-amber-200 leading-relaxed space-y-1.5">
              <p className="font-semibold">Partage indisponible pour cet écrit</p>
              <p>
                {story.visibility !== 'public'
                  ? 'Ce texte est enregistré en brouillon privé. Publiez-le dans un salon ouvert pour pouvoir le partager.'
                  : story.customSalonVisibility === 'private'
                    ? 'Ce récit appartient à un salon privé : son accès reste réservé aux membres admis.'
                    : 'Ce récit est actuellement masqué par les seuils de longueur de Lisière.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[40px] px-4 py-2 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-800 dark:text-stone-200"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* 3 Destination Tabs */}
            <div
              role="tablist"
              aria-label="Canaux de partage"
              className="grid grid-cols-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-[#141210] px-3 pt-2 gap-1"
            >
              {(
                [
                  { id: 'social', label: 'Lien & réseaux', icon: Link2 },
                  { id: 'salon', label: 'Dans un salon', icon: MessageSquare },
                  { id: 'member', label: 'À un membre', icon: UserIcon },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-[40px] px-2 py-2 text-xs font-medium border-b-2 -mb-px inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      active
                        ? 'border-[#1B365D] dark:border-amber-400 text-[#1B365D] dark:text-amber-300 font-semibold'
                        : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {/* TAB 1: Link & Social Networks */}
              {activeTab === 'social' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="share-modal-direct-url"
                      className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                    >
                      Lien direct vers le récit
                    </label>
                    <div className="flex items-stretch gap-2">
                      <input
                        id="share-modal-direct-url"
                        type="text"
                        readOnly
                        value={directUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 px-3 py-2 text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md text-stone-800 dark:text-stone-200 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopyLink()}
                        className="min-h-[38px] px-3.5 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        {linkCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {canUseNativeShare && (
                    <button
                      type="button"
                      onClick={() => void handleNativeShare()}
                      className="w-full min-h-[40px] px-4 py-2 rounded-md border border-[#1B365D] dark:border-sky-400/50 bg-[#F3F6FA] dark:bg-sky-950/40 text-[#1B365D] dark:text-sky-200 text-xs font-medium hover:bg-[#E7EEF7] dark:hover:bg-sky-900/50 inline-flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Partager via les applications de l’appareil…</span>
                    </button>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                      Partager sur un réseau social
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {socialShareTargets.map((target) => (
                        <a
                          key={target.id}
                          href={target.href}
                          target={target.isExternal ? '_blank' : undefined}
                          rel={target.isExternal ? 'noopener noreferrer' : undefined}
                          className={`min-h-[38px] px-3 py-2 rounded-md border text-xs font-medium inline-flex items-center justify-between gap-1.5 ${
                            target.id === 'linkedin'
                              ? 'border-[#0A66C2]/40 bg-[#0A66C2]/10 dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-sky-300 hover:border-[#0A66C2]'
                              : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-400 dark:hover:border-stone-500'
                          }`}
                        >
                          <span>{target.label}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Share inside a Salon */}
              {activeTab === 'salon' && (
                !user ? (
                  <div className="p-5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-center space-y-3">
                    <p className="text-sm text-stone-700 dark:text-stone-300">
                      Connectez-vous pour partager cette histoire dans le chat d’un salon.
                    </p>
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="min-h-[40px] px-4 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744]"
                    >
                      Se connecter avec Google
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleShareToSalon} className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                        Choisir un salon de Lisière
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                        {STORY_THEMES.map((s) => {
                          const selected =
                            selectedSalon.kind === 'predefined' && selectedSalon.id === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                setSelectedSalon({
                                  kind: 'predefined',
                                  id: s.id,
                                  label: s.shortSalonName,
                                })
                              }
                              className={`min-h-[40px] px-3 py-2 rounded-md border text-left text-xs flex items-center gap-2 transition-colors ${
                                selected
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 font-semibold text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-400'
                              }`}
                            >
                              <SalonEmblem
                                type={s.emblem}
                                color={s.palette.textAccent}
                                className="w-4 h-4 shrink-0"
                              />
                              <span className="truncate">
                                {s.romanIndex} · {s.shortSalonName}
                              </span>
                            </button>
                          );
                        })}

                        {eligibleCustomSalons.map((cs) => {
                          const selected =
                            selectedSalon.kind === 'custom' && selectedSalon.id === cs.salonId;
                          const pal = ACCENT_TONE_PALETTES[cs.accentTone] ?? ACCENT_TONE_PALETTES.ink;
                          return (
                            <button
                              key={cs.salonId}
                              type="button"
                              onClick={() =>
                                setSelectedSalon({
                                  kind: 'custom',
                                  id: cs.salonId,
                                  label: cs.name,
                                })
                              }
                              className={`min-h-[40px] px-3 py-2 rounded-md border text-left text-xs flex items-center gap-2 transition-colors ${
                                selected
                                  ? 'border-[#1B365D] dark:border-amber-400 bg-[#F3F6FA] dark:bg-stone-800 font-semibold text-[#1B365D] dark:text-amber-300'
                                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:border-stone-400'
                              }`}
                            >
                              {cs.visibility === 'private' ? (
                                <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: pal.textAccent }} />
                              ) : (
                                <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: pal.textAccent }} />
                              )}
                              <span className="truncate">{cs.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="share-salon-note"
                        className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                      >
                        Mot d’accompagnement (facultatif)
                      </label>
                      <textarea
                        id="share-salon-note"
                        rows={2}
                        maxLength={280}
                        value={salonNote}
                        onChange={(e) => setSalonNote(e.target.value)}
                        placeholder={`Ex. Je vous recommande cette lecture dans ${selectedSalon.label}…`}
                        className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>

                    {salonError && (
                      <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                        {salonError}
                      </p>
                    )}

                    {salonSuccessTarget && (
                      <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Partagé dans « {salonSuccessTarget.label} »</span>
                        </span>
                        {(salonSuccessTarget.kind === 'predefined' && onEnterSalon) ||
                        (salonSuccessTarget.kind === 'custom' && onEnterCustomSalon) ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              if (salonSuccessTarget.kind === 'predefined') {
                                onEnterSalon?.(salonSuccessTarget.id);
                              } else {
                                onEnterCustomSalon?.(salonSuccessTarget.id);
                              }
                            }}
                            className="font-semibold underline inline-flex items-center gap-1"
                          >
                            <span>Ouvrir le salon</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : null}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={salonBusy}
                      className="w-full min-h-[42px] px-4 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {salonBusy
                          ? 'Envoi dans le salon…'
                          : `Partager dans ${selectedSalon.label}`}
                      </span>
                    </button>
                  </form>
                )
              )}

              {/* TAB 3: Share directly with a Member */}
              {activeTab === 'member' && (
                !user ? (
                  <div className="p-5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-center space-y-3">
                    <p className="text-sm text-stone-700 dark:text-stone-300">
                      Connectez-vous pour envoyer une histoire en message privé à un membre.
                    </p>
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="min-h-[40px] px-4 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744]"
                    >
                      Se connecter avec Google
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleShareToMember} className="space-y-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="share-member-search"
                        className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                      >
                        Choisir un destinataire
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="share-member-search"
                          type="search"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Rechercher un membre par nom…"
                          className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1B365D]"
                        />
                      </div>

                      <div className="max-h-44 overflow-y-auto divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-md bg-white dark:bg-stone-900">
                        {filteredMembers.length === 0 ? (
                          <p className="p-3 text-xs text-stone-500 dark:text-stone-400 text-center">
                            Aucun membre public correspondant trouvé.
                          </p>
                        ) : (
                          filteredMembers.map((member) => {
                            const isSelected = selectedMember?.userId === member.userId;
                            return (
                              <button
                                key={member.userId}
                                type="button"
                                onClick={() => setSelectedMember(member)}
                                className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                                  isSelected
                                    ? 'bg-[#F3F6FA] dark:bg-stone-800 text-[#1B365D] dark:text-amber-300'
                                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {member.avatarUrl ? (
                                    <img
                                      src={member.avatarUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="w-7 h-7 rounded-full object-cover border border-stone-200 dark:border-stone-700 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-xs font-display shrink-0">
                                      {member.displayName.slice(0, 1).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate">
                                      {member.displayName}
                                    </p>
                                    {member.bio && (
                                      <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                                        {member.bio}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="share-member-note"
                        className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                      >
                        Message personnel (facultatif)
                      </label>
                      <textarea
                        id="share-member-note"
                        rows={2}
                        maxLength={280}
                        value={memberNote}
                        onChange={(e) => setMemberNote(e.target.value)}
                        placeholder={
                          selectedMember
                            ? `Un mot pour ${selectedMember.displayName}…`
                            : 'Choisissez d’abord un membre…'
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1B365D]"
                      />
                    </div>

                    {memberError && (
                      <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                        {memberError}
                      </p>
                    )}

                    {memberSuccessExchangeId && (
                      <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Envoyé à {memberSuccessName}</span>
                        </span>
                        {onOpenExchange && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenExchange(memberSuccessExchangeId);
                            }}
                            className="font-semibold underline inline-flex items-center gap-1"
                          >
                            <span>Ouvrir la discussion</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={memberBusy || !selectedMember}
                      className="w-full min-h-[42px] px-4 py-2 rounded-md bg-[#1B365D] text-white text-xs font-medium hover:bg-[#132744] disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {memberBusy
                          ? 'Envoi en privé…'
                          : selectedMember
                            ? `Envoyer à ${selectedMember.displayName}`
                            : 'Sélectionnez un membre'}
                      </span>
                    </button>
                  </form>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
