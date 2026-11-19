import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Feather,
  Heart,
  MessageCircle,
  MessageSquare,
  Repeat2,
  Search,
} from 'lucide-react';
import {
  formatCumulativeMinutes,
  formatFrenchDate,
  RELEASE_CADENCE_LABELS,
  SERIES_STATUS_LABELS,
  STORY_FORMAT_LABELS,
  STORY_THEMES,
  THEME_MAP,
} from '../lib/themes';
import { Story, StoryFormat, StoryThemeId } from '../types/story';
import { SalonChatPanel } from './SalonChatPanel';
import { SalonEmblem } from './SalonEmblem';

interface SalonRoomViewProps {
  salonId: StoryThemeId;
  publicStories: Story[];
  storiesLoaded: boolean;
  bookmarkedStoryIds?: Set<string>;
  repostedStoryIds?: Set<string>;
  onToggleBookmark?: (story: Story) => void;
  onOpenRepost?: (story: Story) => void;
  onSelectSalon: (salonId: StoryThemeId | null) => void;
  onReadStory: (story: Story) => void;
  onWriteInSalon: (theme: StoryThemeId, promptQuestion?: string, starter?: string) => void;
  onOpenMemberWall: (userId: string) => void;
}

export function SalonRoomView({
  salonId,
  publicStories,
  storiesLoaded,
  bookmarkedStoryIds,
  repostedStoryIds,
  onToggleBookmark,
  onOpenRepost,
  onSelectSalon,
  onReadStory,
  onWriteInSalon,
  onOpenMemberWall,
}: SalonRoomViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | StoryFormat>('all');
  const [roomSection, setRoomSection] = useState<'stories' | 'chat'>('stories');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setSearchQuery('');
    setFormatFilter('all');
    setRoomSection('stories');
    setImgFailed(false);
  }, [salonId]);

  const salon = THEME_MAP[salonId];
  const currentIndex = STORY_THEMES.findIndex((t) => t.id === salonId);
  const prevSalon =
    STORY_THEMES[(currentIndex - 1 + STORY_THEMES.length) % STORY_THEMES.length];
  const nextSalon = STORY_THEMES[(currentIndex + 1) % STORY_THEMES.length];

  const allInSalon = useMemo(
    () =>
      publicStories.filter(
        (story) =>
          story.theme === salonId &&
          !story.customSalonId &&
          story.storyScope !== 'pelemele'
      ),
    [publicStories, salonId]
  );

  const salonStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allInSalon.filter((story) => {
      const fmt: StoryFormat = story.storyFormat ?? 'confession';
      if (formatFilter !== 'all' && fmt !== formatFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        story.excerpt.toLowerCase().includes(q) ||
        story.authorName.toLowerCase().includes(q)
      );
    });
  }, [allInSalon, formatFilter, searchQuery]);

  const totalInSalon = allInSalon.length;
  const totalEchoesInSalon = useMemo(
    () => allInSalon.reduce((sum, s) => sum + (s.echoCount || 0), 0),
    [allInSalon]
  );
  const totalMinutesInSalon = useMemo(
    () => allInSalon.reduce((sum, s) => sum + (s.readingMinutes || 0), 0),
    [allInSalon]
  );

  const leadStory = salonStories[0] ?? null;
  const secondaryStories = salonStories.slice(1);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 sm:py-12 space-y-12">
      {/* Salon Tour Navigation Rail */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-stone-200">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0">
          <button
            type="button"
            onClick={() => onSelectSalon(null)}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tous les salons</span>
          </button>

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Visiter les salons">
            {STORY_THEMES.map((item) => {
              const isActive = item.id === salonId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectSalon(item.id)}
                  style={
                    isActive
                      ? {
                          backgroundColor: item.palette.accent,
                          borderColor: item.palette.accent,
                          color: '#FFFFFF',
                        }
                      : undefined
                  }
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? ''
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                  }`}
                >
                  {item.romanIndex} · {item.shortSalonName}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelectSalon(nextSalon.id)}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 hover:text-stone-900 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start lg:self-auto"
        >
          <span>Salon suivant : {nextSalon.shortSalonName}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Atmospheric Salon Identity Banner */}
      <section
        aria-labelledby="salon-room-heading"
        style={{
          backgroundColor: salon.palette.softBg,
          borderColor: salon.palette.borderTint,
          borderTopColor: salon.palette.swatch,
        }}
        className="border border-t-2 rounded-lg p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch"
      >
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                style={{
                  borderColor: salon.palette.borderTint,
                  backgroundColor: '#FFFFFF',
                }}
                className="w-10 h-10 rounded-md border flex items-center justify-center shrink-0"
              >
                <SalonEmblem
                  type={salon.emblem}
                  color={salon.palette.textAccent}
                  className="w-5 h-5"
                />
              </div>
              <p className="text-xs uppercase tracking-widest text-stone-600">
                Salon {salon.romanIndex} · {salon.atmosphere}
              </p>
            </div>

            <div>
              <h1
                id="salon-room-heading"
                className="font-display text-3xl sm:text-4xl font-medium text-stone-900 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {salon.salonName}
              </h1>
              <p
                style={{ color: salon.palette.textAccent }}
                className="text-sm font-medium mt-1.5"
              >
                {salon.label} · {totalInSalon} histoire{totalInSalon > 1 ? 's' : ''} publiée
                {totalInSalon > 1 ? 's' : ''}
              </p>
            </div>

            <p className="text-base text-stone-700 leading-relaxed max-w-2xl">
              {salon.curatorialNote}
            </p>
          </div>

          <div className="pt-5 border-t border-stone-900/10 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-stone-500 mb-1">
                La question posée sur la table
              </p>
              <p className="font-display text-lg sm:text-xl text-stone-900 italic leading-snug">
                « {salon.promptQuestion} »
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onWriteInSalon(
                    salon.id,
                    salon.promptQuestion,
                    `${salon.starterSentence} `
                  )
                }
                style={{ backgroundColor: salon.palette.accent }}
                className="min-h-[42px] px-5 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-opacity inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Feather className="w-4 h-4" />
                <span>Publier dans ce salon</span>
              </button>
              <button
                type="button"
                onClick={() => setRoomSection('chat')}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-stone-800 bg-white border border-stone-300 rounded-md hover:border-stone-500 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat du salon</span>
              </button>
            </div>
          </div>
        </div>

        <figure className="lg:col-span-5 flex flex-col">
          {!imgFailed ? (
            <img
              src={salon.imageUrl}
              alt={salon.imageAlt}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              style={{
                objectPosition: salon.imagePosition ?? 'center',
              }}
              className={`w-full h-64 lg:h-full rounded-sm border border-stone-200 bg-white ${
                salon.imageFit === 'contain' ? 'object-contain p-6' : 'object-cover'
              }`}
            />
          ) : (
            <div
              style={{ borderColor: salon.palette.borderTint }}
              className="w-full h-64 lg:h-full rounded-sm border bg-white flex flex-col items-center justify-center p-8 text-center"
            >
              <SalonEmblem
                type={salon.emblem}
                color={salon.palette.textAccent}
                className="w-10 h-10 mb-3"
              />
              <p className="font-display text-lg text-stone-800">{salon.salonName}</p>
            </div>
          )}
          <figcaption className="text-xs font-serif italic text-stone-600 mt-2">
            Salon {salon.romanIndex} — {salon.salonName}
          </figcaption>
        </figure>
      </section>

      {/* Salon Page Epigraph, Live Room Metrics & Architectural Pillars */}
      <section aria-label={`Identité de ${salon.salonName}`} className="space-y-8">
        <div className="bg-white border border-stone-200 rounded-lg p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <blockquote className="font-display italic text-xl sm:text-2xl text-stone-800 leading-snug max-w-2xl">
            {salon.epigraph}
          </blockquote>

          <div className="grid grid-cols-3 gap-6 pt-4 lg:pt-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-stone-200 shrink-0">
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {totalInSalon}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Histoire{totalInSalon > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {totalEchoesInSalon}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Commentaire{totalEchoesInSalon > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-medium text-stone-900 tabular-nums">
                {formatCumulativeMinutes(totalMinutesInSalon)}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">Lecture</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {salon.roomPillars.map((pillar, idx) => (
            <div
              key={pillar.title}
              className="bg-white border border-stone-200 rounded-lg p-6 space-y-2"
            >
              <p
                style={{ color: salon.palette.textAccent }}
                className="text-xs font-mono tabular-nums"
              >
                0{idx + 1}. {pillar.title}
              </p>
              <p className="text-sm text-stone-700 leading-relaxed">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Salon Room Switcher: Stories/Romans vs Public Text Chat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setRoomSection('stories')}
            className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
              roomSection === 'stories'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Romans & Confessions ({totalInSalon})</span>
          </button>
          <button
            type="button"
            onClick={() => setRoomSection('chat')}
            className={`min-h-[38px] px-4 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
              roomSection === 'chat'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat du salon (texte)</span>
          </button>
        </div>

        {roomSection === 'stories' && totalInSalon > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: 'Tous' },
                { id: 'roman', label: 'Romans' },
                { id: 'confession', label: 'Confessions' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFormatFilter(opt.id)}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
                  formatFilter === opt.id
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Section A: Public Text-Only Salon Chat */}
      {roomSection === 'chat' && (
        <SalonChatPanel salonId={salonId} onOpenMemberWall={onOpenMemberWall} />
      )}

      {/* Section B: Salon Stories & Novels Feed */}
      {roomSection === 'stories' && (
        !storiesLoaded ? (
          <div className="py-12 text-center text-sm text-stone-500">
            Ouverture des pages de ce salon…
          </div>
        ) : totalInSalon === 0 ? (
          <section
            aria-label="Invitation à ouvrir ce salon"
            className="bg-white border border-stone-200 rounded-lg p-7 sm:p-10 space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-stone-200">
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs uppercase tracking-widest text-stone-500">
                  La table est prête
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-medium text-stone-900">
                  Ce salon attend sa première histoire
                </h2>
                <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
                  Aucun roman ni aucune confession n’a encore été déposé dans {salon.salonName}. Vous pouvez inaugurer la lecture ou lancer la discussion dans le chat écrit du salon.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectSalon(nextSalon.id)}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-800 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
              >
                <span>Découvrir {nextSalon.salonName}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {salon.invitationTopics.map((topic, index) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() =>
                    onWriteInSalon(salon.id, topic, `${salon.starterSentence} `)
                  }
                  className="text-left p-5 bg-[#FBF9F5] border border-stone-200 rounded-md hover:border-stone-400 transition-colors flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-2">
                    <p
                      style={{ color: salon.palette.textAccent }}
                      className="text-xs font-mono tabular-nums"
                    >
                      Piste 0{index + 1}
                    </p>
                    <p className="font-display text-lg font-medium text-stone-900 leading-snug">
                      {topic}
                    </p>
                  </div>
                  <span
                    style={{ color: salon.palette.textAccent }}
                    className="text-xs font-medium inline-flex items-center gap-1.5 group-hover:underline"
                  >
                    <span>Écrire à partir de cette piste</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-sm text-stone-600 italic">
                Phrase d’élan proposée : « {salon.starterSentence} »
              </p>
              <button
                type="button"
                onClick={() =>
                  onWriteInSalon(
                    salon.id,
                    salon.promptQuestion,
                    `${salon.starterSentence} `
                  )
                }
                style={{ color: salon.palette.textAccent, borderColor: salon.palette.textAccent }}
                className="min-h-[40px] px-4 py-2 text-xs font-medium bg-white border rounded-md hover:bg-stone-50 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                <Feather className="w-3.5 h-3.5" />
                <span>Commencer avec cette phrase</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="space-y-8" aria-label={`Récits dans ${salon.salonName}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-medium text-stone-900">
                Histoires et romans du salon
              </h2>
              {totalInSalon > 1 && (
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher dans ce salon…"
                    aria-label="Rechercher un récit dans ce salon"
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
                  />
                </div>
              )}
            </div>

            {salonStories.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-lg p-8 text-center space-y-3">
                <p className="font-display text-lg text-stone-900">
                  Aucune histoire ne correspond à ce filtre dans ce salon
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFormatFilter('all');
                  }}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-stone-800 border border-stone-300 rounded-md hover:border-stone-500"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {leadStory && (
                  <article className="bg-white border border-stone-200 rounded-lg p-7 sm:p-9 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span
                          style={{ color: salon.palette.textAccent }}
                          className="uppercase tracking-widest font-medium"
                        >
                          {STORY_FORMAT_LABELS[leadStory.storyFormat ?? 'confession']?.label}
                        </span>
                        {leadStory.storyFormat === 'roman' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {leadStory.chapterCount ?? 1} chap. ·{' '}
                              {RELEASE_CADENCE_LABELS[leadStory.releaseCadence ?? 'hebdomadaire']}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {SERIES_STATUS_LABELS[leadStory.seriesStatus ?? 'en-cours']}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => onOpenMemberWall(leadStory.authorId)}
                          className="font-medium text-stone-800 hover:underline"
                        >
                          Par {leadStory.authorName}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span>{leadStory.readingMinutes} min de lecture</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFrenchDate(leadStory.createdAt?.toDate() ?? null)}</span>
                      </div>

                      <h3
                        className="font-display text-3xl font-medium text-stone-900 leading-tight"
                        style={{ textWrap: 'balance' }}
                      >
                        {leadStory.title}
                      </h3>

                      <p className="text-base text-stone-700 leading-relaxed editorial-drop-cap max-w-2xl">
                        {leadStory.excerpt}
                      </p>
                    </div>

                    <div className="lg:col-span-4 lg:border-l lg:border-stone-200 lg:pl-8 flex flex-col justify-between h-full space-y-6">
                      {leadStory.promptQuestion && (
                        <div>
                          <p className="text-xs uppercase tracking-widest text-stone-500 mb-1.5">
                            Amorce
                          </p>
                          <p className="text-sm text-stone-700 italic leading-relaxed">
                            « {leadStory.promptQuestion} »
                          </p>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex items-center gap-5 text-xs text-stone-600 tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Heart className="w-3.5 h-3.5 text-stone-500" />
                            {leadStory.resonanceCount} résonance
                            {leadStory.resonanceCount > 1 ? 's' : ''}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MessageCircle className="w-3.5 h-3.5 text-stone-500" />
                            {leadStory.echoCount} commentaire{leadStory.echoCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onReadStory(leadStory)}
                            style={{ backgroundColor: salon.palette.accent }}
                            className="flex-1 min-h-[42px] px-4 py-2 text-sm font-medium text-white rounded-md hover:opacity-90 transition-[opacity,transform] duration-150 ease-out active:scale-[0.97] inline-flex items-center justify-center gap-2 whitespace-nowrap"
                          >
                            <span>Lire le récit et répondre</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>

                          {onToggleBookmark && (
                            <button
                              type="button"
                              onClick={() => onToggleBookmark(leadStory)}
                              title={
                                bookmarkedStoryIds?.has(leadStory.storyId)
                                  ? 'Retirer des favoris'
                                  : 'Enregistrer pour lire plus tard'
                              }
                              aria-label="Enregistrer pour lire plus tard"
                              className={`min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                bookmarkedStoryIds?.has(leadStory.storyId)
                                  ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                              }`}
                            >
                              <Bookmark
                                className={`w-4 h-4 ${
                                  bookmarkedStoryIds?.has(leadStory.storyId) ? 'fill-current' : ''
                                }`}
                              />
                            </button>
                          )}

                          {onOpenRepost && (
                            <button
                              type="button"
                              onClick={() => onOpenRepost(leadStory)}
                              title={
                                repostedStoryIds?.has(leadStory.storyId)
                                  ? 'Repartagé — Modifier'
                                  : 'Repartager sur mon compte'
                              }
                              aria-label="Repartager"
                              className={`min-h-[42px] min-w-[42px] inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
                                repostedStoryIds?.has(leadStory.storyId)
                                  ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                              }`}
                            >
                              <Repeat2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )}

                {secondaryStories.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {secondaryStories.map((story) => (
                      <article
                        key={story.storyId}
                        className="bg-white border border-stone-200 rounded-lg p-6 flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                            <span
                              style={{ color: salon.palette.textAccent }}
                              className="font-medium"
                            >
                              {STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label}
                            </span>
                            {story.storyFormat === 'roman' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {story.chapterCount ?? 1} chap.
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => onOpenMemberWall(story.authorId)}
                              className="font-medium text-stone-800 hover:underline"
                            >
                              {story.authorName}
                            </button>
                            <span aria-hidden="true">·</span>
                            <span>{story.readingMinutes} min</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                          </div>

                          <h3 className="font-display text-2xl font-medium text-stone-900 leading-snug">
                            {story.title}
                          </h3>
                          <p className="text-sm text-stone-600 leading-relaxed">{story.excerpt}</p>
                        </div>

                        <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-4 text-xs text-stone-500 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5" />
                              {story.resonanceCount}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {story.echoCount}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {onToggleBookmark && (
                              <button
                                type="button"
                                onClick={() => onToggleBookmark(story)}
                                title={
                                  bookmarkedStoryIds?.has(story.storyId)
                                    ? 'Retirer des favoris'
                                    : 'Enregistrer pour lire plus tard'
                                }
                                aria-label="Enregistrer pour lire plus tard"
                                className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                  bookmarkedStoryIds?.has(story.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
                                }`}
                              >
                                <Bookmark
                                  className={`w-3.5 h-3.5 ${
                                    bookmarkedStoryIds?.has(story.storyId) ? 'fill-current' : ''
                                  }`}
                                />
                              </button>
                            )}
                            {onOpenRepost && (
                              <button
                                type="button"
                                onClick={() => onOpenRepost(story)}
                                title={
                                  repostedStoryIds?.has(story.storyId)
                                    ? 'Repartagé — Modifier'
                                    : 'Repartager sur mon compte'
                                }
                                aria-label="Repartager"
                                className={`min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded border transition-colors ${
                                  repostedStoryIds?.has(story.storyId)
                                    ? 'border-[#1B365D] bg-[#F3F6FA] text-[#1B365D]'
                                    : 'border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800'
                                }`}
                              >
                                <Repeat2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onReadStory(story)}
                              style={{ color: salon.palette.textAccent }}
                              className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium hover:underline inline-flex items-center gap-1.5 whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.96]"
                            >
                              <span>Lire et commenter</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      )}

      {/* Bottom Salon-to-Salon Passageway */}
      <nav
        aria-label="Passage vers les autres salons"
        className="pt-8 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <button
          type="button"
          onClick={() => onSelectSalon(prevSalon.id)}
          className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:border-stone-400 transition-[border-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>
            Salon {prevSalon.romanIndex} · {prevSalon.shortSalonName}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSalon(null)}
          className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          Vue d’ensemble des cinq salons
        </button>

        <button
          type="button"
          onClick={() => onSelectSalon(nextSalon.id)}
          style={{ color: salon.palette.textAccent, borderColor: salon.palette.borderTint }}
          className="min-h-[40px] px-4 py-2 text-xs font-medium bg-white border rounded-md hover:bg-stone-50 transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          <span>
            Salon {nextSalon.romanIndex} · {nextSalon.shortSalonName}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </nav>
    </div>
  );
}
