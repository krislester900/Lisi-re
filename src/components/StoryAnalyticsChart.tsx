import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Eye, Heart, MessageCircle, RefreshCw } from 'lucide-react';
import { fetchAuthorReadingTimeline, formatLocalDateKey } from '../lib/storyService';
import { formatFrenchDate, STORY_FORMAT_LABELS } from '../lib/themes';
import { Story, StoryResonanceEvent, StoryViewEvent } from '../types/story';

interface StoryAnalyticsChartProps {
  authorId: string;
  myStories: Story[];
  onReadStory?: (story: Story) => void;
}

type DayRange = 7 | 14 | 30;
type ChartMode = 'daily' | 'by-story';
type BreakdownSort = 'views' | 'resonances' | 'recent';

interface DailyPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  vues: number;
  resonances: number;
}

interface StoryBarPoint {
  storyId: string;
  name: string;
  fullTitle: string;
  vues: number;
  resonances: number;
}

const FRENCH_SHORT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const FRENCH_FULL_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DailyPoint | StoryBarPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const heading = 'fullDate' in row ? row.fullDate : row.fullTitle;
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md shadow-sm px-3.5 py-2.5 text-xs space-y-1.5 max-w-[240px]">
      <p className="font-medium text-stone-900 dark:text-stone-100 capitalize truncate">{heading}</p>
      <div className="space-y-1 tabular-nums">
        <div className="flex items-center justify-between gap-4 text-stone-700 dark:text-stone-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1B365D] dark:bg-[#7FA3D6]" aria-hidden="true" />
            Vues
          </span>
          <span className="font-semibold text-stone-900 dark:text-stone-100">{row.vues}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-stone-700 dark:text-stone-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#9A3B29] dark:bg-[#E08A79]" aria-hidden="true" />
            Résonances
          </span>
          <span className="font-semibold text-stone-900 dark:text-stone-100">{row.resonances}</span>
        </div>
      </div>
    </div>
  );
}

export function StoryAnalyticsChart({
  authorId,
  myStories,
  onReadStory,
}: StoryAnalyticsChartProps) {
  const [dayRange, setDayRange] = useState<DayRange>(14);
  const [chartMode, setChartMode] = useState<ChartMode>('daily');
  const [selectedStoryId, setSelectedStoryId] = useState<string>('all');
  const [breakdownSort, setBreakdownSort] = useState<BreakdownSort>('views');

  const [views, setViews] = useState<StoryViewEvent[]>([]);
  const [resonances, setResonances] = useState<StoryResonanceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const publicStories = useMemo(
    () => myStories.filter((s) => s.visibility === 'public'),
    [myStories]
  );

  const storySyncSignature = useMemo(
    () =>
      publicStories
        .map((s) => `${s.storyId}:${s.viewCount ?? 0}:${s.resonanceCount ?? 0}`)
        .join('|'),
    [publicStories]
  );

  useEffect(() => {
    if (selectedStoryId !== 'all' && !publicStories.some((s) => s.storyId === selectedStoryId)) {
      setSelectedStoryId('all');
    }
  }, [publicStories, selectedStoryId]);

  useEffect(() => {
    let active = true;
    if (publicStories.length === 0) {
      setViews([]);
      setResonances([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    void fetchAuthorReadingTimeline(authorId, publicStories)
      .then((res) => {
        if (!active) return;
        setViews(res.views);
        setResonances(res.resonances);
      })
      .catch(() => {
        if (!active) return;
        setError('Impossible de charger l’historique journalier de lecture.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authorId, storySyncSignature, reloadTick]);

  const dailySeries = useMemo<DailyPoint[]>(() => {
    const viewByDay: Record<string, number> = {};
    const resonanceByDay: Record<string, number> = {};

    for (const v of views) {
      if (selectedStoryId !== 'all' && v.storyId !== selectedStoryId) continue;
      const key =
        v.dateKey ||
        (v.createdAt ? formatLocalDateKey(v.createdAt.toDate()) : '');
      if (key) viewByDay[key] = (viewByDay[key] || 0) + 1;
    }

    for (const r of resonances) {
      if (selectedStoryId !== 'all' && r.storyId !== selectedStoryId) continue;
      const key = r.createdAt ? formatLocalDateKey(r.createdAt.toDate()) : '';
      if (key) resonanceByDay[key] = (resonanceByDay[key] || 0) + 1;
    }

    const points: DailyPoint[] = [];
    const today = new Date();
    for (let i = dayRange - 1; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = formatLocalDateKey(d);
      points.push({
        dateKey: key,
        label: FRENCH_SHORT_DATE.format(d),
        fullDate: FRENCH_FULL_DATE.format(d),
        vues: viewByDay[key] || 0,
        resonances: resonanceByDay[key] || 0,
      });
    }
    return points;
  }, [views, resonances, dayRange, selectedStoryId]);

  const storyBarSeries = useMemo<StoryBarPoint[]>(() => {
    return publicStories.slice(0, 8).map((s) => ({
      storyId: s.storyId,
      name: s.title.length > 18 ? `${s.title.slice(0, 17).trim()}…` : s.title,
      fullTitle: s.title,
      vues: s.viewCount ?? 0,
      resonances: s.resonanceCount ?? 0,
    }));
  }, [publicStories]);

  const filteredStories = useMemo(
    () =>
      selectedStoryId === 'all'
        ? publicStories
        : publicStories.filter((s) => s.storyId === selectedStoryId),
    [publicStories, selectedStoryId]
  );

  const totalViewsAllTime = useMemo(
    () => filteredStories.reduce((sum, s) => sum + (s.viewCount ?? 0), 0),
    [filteredStories]
  );

  const totalResonancesAllTime = useMemo(
    () => filteredStories.reduce((sum, s) => sum + (s.resonanceCount ?? 0), 0),
    [filteredStories]
  );

  const periodViews = useMemo(
    () => dailySeries.reduce((sum, d) => sum + d.vues, 0),
    [dailySeries]
  );

  const periodResonances = useMemo(
    () => dailySeries.reduce((sum, d) => sum + d.resonances, 0),
    [dailySeries]
  );

  const sortedBreakdownStories = useMemo(() => {
    const list = [...publicStories];
    list.sort((a, b) => {
      if (breakdownSort === 'views') {
        const diff = (b.viewCount ?? 0) - (a.viewCount ?? 0);
        if (diff !== 0) return diff;
      } else if (breakdownSort === 'resonances') {
        const diff = (b.resonanceCount ?? 0) - (a.resonanceCount ?? 0);
        if (diff !== 0) return diff;
      }
      const bMs = b.createdAt ? b.createdAt.toMillis() : 0;
      const aMs = a.createdAt ? a.createdAt.toMillis() : 0;
      return bMs - aMs;
    });
    return list;
  }, [publicStories, breakdownSort]);

  const maxStoryViews = useMemo(
    () => Math.max(1, ...publicStories.map((s) => s.viewCount ?? 0)),
    [publicStories]
  );

  return (
    <section
      aria-label="Statistiques de lecture de vos récits"
      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400">
            <BarChart3 className="w-3.5 h-3.5 text-[#1B365D] dark:text-[#93B4E2]" />
            <span>Statistiques de lecture</span>
          </div>
          <h2 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100">
            Vues et résonances par jour
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-md">
            <button
              type="button"
              onClick={() => setChartMode('daily')}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'daily'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Par jour
            </button>
            <button
              type="button"
              onClick={() => setChartMode('by-story')}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'by-story'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Par récit
            </button>
          </div>

          {chartMode === 'daily' && (
            <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-md">
              {([7, 14, 30] as DayRange[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDayRange(days)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    dayRange === days
                      ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {days} j
                </button>
              ))}
            </div>
          )}

          {chartMode === 'daily' && publicStories.length > 1 && (
            <select
              aria-label="Filtrer par récit"
              value={selectedStoryId}
              onChange={(e) => setSelectedStoryId(e.target.value)}
              className="min-h-[38px] max-w-[220px] px-3 py-1.5 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md text-xs text-stone-800 dark:text-stone-100 focus:outline-none focus:border-[#1B365D] dark:focus:border-[#93B4E2]"
            >
              <option value="all">Tous mes récits ({publicStories.length})</option>
              {publicStories.map((s) => (
                <option key={s.storyId} value={s.storyId}>
                  {s.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            disabled={loading}
            aria-label="Actualiser les statistiques"
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-[#FBF9F5] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md hover:border-stone-400 dark:hover:border-stone-500 disabled:opacity-50 inline-flex items-center justify-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Period & Total KPI Row + Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-[#1B365D] dark:text-[#93B4E2] shrink-0" />
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Vues {chartMode === 'daily' ? `(${dayRange} j)` : '(total)'}
              </p>
              <p className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                {chartMode === 'daily' ? periodViews : totalViewsAllTime}
                {chartMode === 'daily' && totalViewsAllTime !== periodViews && (
                  <span className="text-xs font-sans font-normal text-stone-500 dark:text-stone-400 ml-1.5">
                    / {totalViewsAllTime} au total
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Heart className="w-4 h-4 text-[#9A3B29] dark:text-[#E08A79] shrink-0" />
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Résonances {chartMode === 'daily' ? `(${dayRange} j)` : '(total)'}
              </p>
              <p className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 tabular-nums">
                {chartMode === 'daily' ? periodResonances : totalResonancesAllTime}
                {chartMode === 'daily' && totalResonancesAllTime !== periodResonances && (
                  <span className="text-xs font-sans font-normal text-stone-500 dark:text-stone-400 ml-1.5">
                    / {totalResonancesAllTime} au total
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs text-stone-600 dark:text-stone-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1B365D] dark:bg-[#7FA3D6]" aria-hidden="true" />
            <span>Nombre de vues</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#9A3B29] dark:bg-[#E08A79]" aria-hidden="true" />
            <span>Résonances par jour</span>
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded px-3 py-2">
          {error}
        </p>
      )}

      {publicStories.length === 0 ? (
        <div className="py-10 px-4 text-center bg-[#FBF9F5] dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-md space-y-1.5">
          <p className="font-display text-lg text-stone-900 dark:text-stone-100">
            Aucun récit publié pour le moment
          </p>
          <p className="text-xs text-stone-600 dark:text-stone-400 max-w-md mx-auto">
            Publiez votre premier récit dans un salon pour suivre ici les lectures quotidiennes et les résonances de la communauté.
          </p>
        </div>
      ) : (
        <div className="w-full h-[270px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === 'daily' ? (
              <AreaChart
                data={dailySeries}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="lisiereViewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1B365D" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#1B365D" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="lisiereResonancesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9A3B29" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#9A3B29" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E7E5E4' }}
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="vues"
                  name="Vues"
                  stroke="#1B365D"
                  strokeWidth={2}
                  fill="url(#lisiereViewsGrad)"
                  activeDot={{ r: 4, fill: '#1B365D', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="resonances"
                  name="Résonances"
                  stroke="#9A3B29"
                  strokeWidth={2}
                  fill="url(#lisiereResonancesGrad)"
                  activeDot={{ r: 4, fill: '#9A3B29', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              <BarChart
                data={storyBarSeries}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke="#E7E5E4" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E7E5E4' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="vues" name="Vues" fill="#1B365D" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar
                  dataKey="resonances"
                  name="Résonances"
                  fill="#9A3B29"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {publicStories.length > 0 && !loading && totalViewsAllTime === 0 && totalResonancesAllTime === 0 && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Les courbes se rempliront automatiquement au fil des lectures et des résonances déposées sur vos récits publiés.
        </p>
      )}

      {publicStories.length > 0 && (
        <div className="pt-5 border-t border-stone-200 dark:border-stone-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-medium text-stone-900 dark:text-stone-100">
                Détail des lectures par récit
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Performance de chacun de vos récits publiés
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-md self-start sm:self-auto">
              {(
                [
                  { id: 'views', label: 'Plus vus' },
                  { id: 'resonances', label: 'Résonances' },
                  { id: 'recent', label: 'Récents' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBreakdownSort(opt.id)}
                  className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    breakdownSort === opt.id
                      ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-md bg-[#FBF9F5] dark:bg-stone-950/60">
            {sortedBreakdownStories.map((story) => {
              const viewsCount = story.viewCount ?? 0;
              const barPct = viewsCount > 0 ? Math.max(4, Math.round((viewsCount / maxStoryViews) * 100)) : 0;
              return (
                <div
                  key={story.storyId}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {onReadStory ? (
                      <button
                        type="button"
                        onClick={() => onReadStory(story)}
                        className="font-medium text-sm text-stone-900 dark:text-stone-100 hover:text-[#1B365D] dark:hover:text-[#93B4E2] hover:underline text-left truncate block max-w-full"
                      >
                        {story.title}
                      </button>
                    ) : (
                      <p className="font-medium text-sm text-stone-900 dark:text-stone-100 truncate">
                        {story.title}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <span>{STORY_FORMAT_LABELS[story.storyFormat ?? 'confession']?.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatFrenchDate(story.createdAt?.toDate() ?? null)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{story.readingMinutes} min</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0">
                    <div className="w-24 hidden md:block">
                      <div className="h-1.5 w-full bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${barPct}%` }}
                          className="h-full bg-[#1B365D] dark:bg-[#7FA3D6] rounded-full transition-[width] duration-200 motion-reduce:transition-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-stone-700 dark:text-stone-300 tabular-nums">
                      <span className="inline-flex items-center gap-1 font-medium text-stone-900 dark:text-stone-100" title="Vues">
                        <Eye className="w-3.5 h-3.5 text-[#1B365D] dark:text-[#93B4E2]" />
                        {viewsCount}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Résonances">
                        <Heart className="w-3.5 h-3.5 text-[#9A3B29] dark:text-[#E08A79]" />
                        {story.resonanceCount ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Commentaires">
                        <MessageCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                        {story.echoCount ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
