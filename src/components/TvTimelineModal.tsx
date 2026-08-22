import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Crown,
  Skull,
  Flame,
  Calendar,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Sparkles,
  Shield,
  Filter,
  CheckCircle2,
  Swords,
  Scroll,
  MapPin,
  Users,
  Compass
} from 'lucide-react';
import { clsx } from 'clsx';
import { useGameStore } from '../store/useGameStore';
import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import { projectActualTimeline, projectCanonicalTimeline, type TimelineProjectionEvent } from '../features/world/worldHistoryProjection';
import { playerWorldEventViewer } from '../features/world/worldEventVisibility';
import { hiddenWorldEventIdsForPlayer, selectWorldEventsForView } from '../features/debug/worldEventDebug';
import { useWorldEventDisplays } from '../features/world/useWorldEventDisplays';
import type { CharacterId } from '../features/characters/types';
import type { WorldLocationRef } from '../features/map/types';

export interface TimelineEventNode {
  id: string;
  date_display: string;
  title: string;
  category: 'war' | 'intrigue' | 'death' | 'coronation' | 'magic';
  category_name: string;
  region: string;
  region_tag: string;
  characters: string[];
  summary: string;
  full_narrative: string;
  key_consequences: string[];
  fatalities: string[];
  iconic_quote?: string;
  status?: TimelineProjectionEvent['status'];
  status_reason?: string;
}

export interface YearBlock {
  year_ac: number;
  year_title: string;
  tagline: string;
  overview: string;
  events: TimelineEventNode[];
}

export interface PureTimelineData {
  title: string;
  calendar_system: string;
  timeline_span: string;
  total_events: number;
  years: YearBlock[];
}

interface TvTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCharacter?: (characterId: CharacterId) => void;
  onOpenLocation?: (location: WorldLocationRef) => void;
  onOpenAsset?: (assetId: string) => void;
}

const CATEGORY_MAP: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  war: { label: '史诗战役', color: 'border-red-700/60 bg-red-950/25 text-red-300', icon: Swords },
  intrigue: { label: '权谋惊变', color: 'border-amber-700/60 bg-amber-950/25 text-amber-300', icon: Scroll },
  death: { label: '生死绝唱', color: 'border-rose-800/60 bg-rose-950/30 text-rose-300', icon: Skull },
  coronation: { label: '王权更迭', color: 'border-purple-700/60 bg-purple-950/25 text-purple-300', icon: Crown },
  magic: { label: '奇幻神迹', color: 'border-cyan-700/60 bg-cyan-950/25 text-cyan-300', icon: Sparkles },
};

const REGION_MAP: Record<string, { label: string; color: string }> = {
  north: { label: '北境与绝境长城', color: 'border-blue-700/50 bg-blue-950/20 text-blue-300' },
  kings_landing: { label: '君临与王领', color: 'border-amber-700/50 bg-amber-950/20 text-amber-300' },
  essos: { label: '狭海对岸·厄斯索斯', color: 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300' },
  riverlands: { label: '河间地与三叉戟河', color: 'border-cyan-700/50 bg-cyan-950/20 text-cyan-300' },
  vale: { label: '艾林谷·鹰巢城', color: 'border-indigo-700/50 bg-indigo-950/20 text-indigo-300' },
  dorne: { label: '多恩领', color: 'border-orange-700/50 bg-orange-950/20 text-orange-300' },
  dragonstone: { label: '龙石岛', color: 'border-rose-700/50 bg-rose-950/20 text-rose-300' },
  stormlands: { label: '风暴地·风息堡', color: 'border-yellow-700/50 bg-yellow-950/20 text-yellow-300' },
};

type TimelineMode = 'actual' | 'canon';

const STATUS_LABELS: Record<string, string> = {
  historical: '开局前历史',
  scheduled: '原作预定',
  occurred: '如期发生',
  diverged: '已经偏离',
  suppressed: '已经取代',
  actual: '本世界事实',
};

function projectionToTimelineData(events: TimelineProjectionEvent[], mode: TimelineMode): PureTimelineData {
  const years = new Map<number, TimelineProjectionEvent[]>();
  for (const event of events) {
    const bucket = years.get(event.date.year) ?? [];
    bucket.push(event);
    years.set(event.date.year, bucket);
  }
  const orderedYears = [...years.entries()].sort(([left], [right]) => left - right);
  const firstYear = orderedYears[0]?.[0];
  const lastYear = orderedYears[orderedYears.length - 1]?.[0];
  const timelineSpan = firstYear === undefined
    ? '尚无已确认纪年'
    : firstYear === lastYear ? `${firstYear} AC` : `${firstYear} AC — ${lastYear} AC`;
  return {
    title: mode === 'actual' ? '本世界实际编年史' : '原作预定节点',
    calendar_system: '征服历',
    timeline_span: timelineSpan,
    total_events: events.length,
    years: orderedYears.map(([year, entries]) => ({
      year_ac: year,
      year_title: `${year} AC · ${mode === 'actual' ? '本世界实际历史' : '原作预定历史压力'}`,
      tagline: mode === 'actual' ? '这里只记录程序已经提交的事实。' : '未来节点会随人物、关系与局势变化而偏离。',
      overview: mode === 'actual'
        ? '开局前历史与本存档已经确认的事件共同组成这条时间线，正文不能单独改写这里的事实。'
        : '原作节点是带前置条件的预定压力；玩家改变关键条件后，节点可以偏离或被取代。',
      events: entries.map((event) => ({
        id: event.id,
        date_display: `${event.date.year} AC · ${event.date.month}月${event.date.day}日`,
        title: event.title,
        category: event.category,
        category_name: event.category,
        region: event.region,
        region_tag: event.regionTag ?? 'world',
        characters: event.participantNames.length ? event.participantNames : event.participantIds,
        summary: event.summary,
        full_narrative: event.reason && event.reason !== event.summary
          ? `${event.summary}

${event.status === 'diverged' ? '偏离原因' : '补充说明'}：${event.reason}`
          : event.summary,
        key_consequences: event.consequences,
        fatalities: event.fatalities,
        status: event.status,
        status_reason: event.reason,
      })),
    })),
  };
}

export const TvTimelineModal: React.FC<TvTimelineModalProps> = ({
  isOpen,
  onClose,
  onOpenCharacter = () => undefined,
  onOpenLocation = () => undefined,
  onOpenAsset = () => undefined,
}) => {
  const gameState = useGameStore((state) => state.gameState);
  const worldHistory = gameState.worldHistory;
  const worldEvents = useGameStore((state) => state.gameState.worldRuntime.events);
  const lord = useGameStore((state) => state.gameState.lord);
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters);
  const debugEnabled = useGameStore((state) => state.debugEnabled);
  const eventViewer = useMemo(() => playerWorldEventViewer({ lord, worldCharacters }), [lord.canonicalCharacterId, worldCharacters?.runId]);
  const visibleWorldEvents = useMemo(
    () => selectWorldEventsForView(worldEvents, eventViewer, debugEnabled),
    [debugEnabled, eventViewer, worldEvents],
  );
  const hiddenWorldEventIds = useMemo(
    () => debugEnabled ? hiddenWorldEventIdsForPlayer(worldEvents, eventViewer) : new Set<string>(),
    [debugEnabled, eventViewer, worldEvents],
  );
  const worldEventById = useMemo(() => new Map(visibleWorldEvents.map((event) => [event.id, event])), [visibleWorldEvents]);
  const worldEventDisplays = useWorldEventDisplays(visibleWorldEvents, gameState);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('actual');
  const timelineData = useMemo(() => projectionToTimelineData(
    timelineMode === 'actual'
      ? projectActualTimeline(worldHistory, visibleWorldEvents, CANONICAL_TIMELINE, worldEventDisplays)
      : projectCanonicalTimeline(worldHistory, CANONICAL_TIMELINE),
    timelineMode,
  ), [timelineMode, visibleWorldEvents, worldEventDisplays, worldHistory]);
  const loading = false;
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  // Filtered chronological timeline
  const filteredYears = useMemo(() => {
    if (!timelineData) return [];

    return timelineData.years
      .filter((y) => selectedYear === 'all' || y.year_ac === selectedYear)
      .map((y) => {
        const filteredEvents = y.events.filter((evt) => {
          if (selectedCategory !== 'all' && evt.category !== selectedCategory) {
            return false;
          }
          if (selectedRegion !== 'all' && evt.region_tag !== selectedRegion) {
            return false;
          }
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchTitle = evt.title.toLowerCase().includes(q);
            const matchSummary = evt.summary.toLowerCase().includes(q);
            const matchNarrative = evt.full_narrative.toLowerCase().includes(q);
            const matchCharacters = evt.characters.some((c) => c.toLowerCase().includes(q));
            const matchFatalities = evt.fatalities.some((f) => f.toLowerCase().includes(q));
            const matchQuote = evt.iconic_quote?.toLowerCase().includes(q) ?? false;
            return matchTitle || matchSummary || matchNarrative || matchCharacters || matchFatalities || matchQuote;
          }
          return true;
        });

        return {
          ...y,
          events: filteredEvents,
        };
      })
      .filter((y) => y.events.length > 0);
  }, [timelineData, selectedYear, selectedCategory, selectedRegion, searchQuery]);

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    filteredYears.forEach((y) => {
      y.events.forEach((evt) => {
        next[evt.id] = true;
      });
    });
    setExpandedEvents(next);
  };

  const collapseAll = () => {
    setExpandedEvents({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="modal-backdrop absolute inset-0 bg-ink-2/85 backdrop-blur-md" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative flex h-[94vh] w-[96vw] max-w-6xl flex-col rounded-sm border border-hairline-bright bg-ink shadow-2xl overflow-hidden animate-fade-in text-parchment">

        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline/80 bg-ink-2/95 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded border border-gold/40 bg-gold/10 font-serif text-sm font-bold text-gold shadow-inner">
              历
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-base font-bold tracking-wider text-parchment">
                  {timelineMode === 'actual' ? '本世界实际编年史' : '原作预定时间线'} ({timelineData.timeline_span})
                </h2>
                <span className="rounded bg-gold/15 px-2 py-0.5 text-[10px] font-mono text-gold border border-gold/30">
                  {timelineMode === 'actual' ? '已确认世界事实' : '条件化原作节点'}
                </span>
              </div>
              <p className="text-[11px] text-parchment-dim hidden sm:block">
                {timelineMode === 'actual' ? '正文、人物卷宗和这里共享同一批已提交事件' : '未来事件不是既定事实，前置条件改变后允许偏离'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1.5 text-parchment-dim hover:bg-ink-3 hover:text-parchment transition-colors"
            aria-label="关闭时间线"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="flex flex-col gap-2.5 border-b border-hairline/60 bg-ink-2/40 p-3 md:px-6">
          <div className="flex items-center gap-2" data-timeline-mode>
            <span className="eyebrow text-[11px] text-gold/80">时间线视图:</span>
            <button type="button" onClick={() => setTimelineMode('actual')} className={clsx('rounded border px-2.5 py-1 text-xs', timelineMode === 'actual' ? 'border-gold bg-gold/20 text-gold' : 'border-hairline text-parchment-dim')}>本世界</button>
            <button type="button" onClick={() => setTimelineMode('canon')} className={clsx('rounded border px-2.5 py-1 text-xs', timelineMode === 'canon' ? 'border-gold bg-gold/20 text-gold' : 'border-hairline text-parchment-dim')}>原作节点</button>
          </div>

          {/* Year Axis Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin text-xs">
            <span className="eyebrow shrink-0 mr-1 text-[11px] text-gold/80 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> 纪年年份:
            </span>
            <button
              onClick={() => setSelectedYear('all')}
              className={clsx(
                'shrink-0 rounded px-2.5 py-1 font-serif text-xs transition-all',
                selectedYear === 'all'
                  ? 'border border-gold bg-gold/20 text-gold font-bold shadow-sm'
                  : 'border border-hairline bg-ink text-parchment-dim hover:text-parchment hover:border-parchment-dim'
              )}
            >
              全部年份 ({timelineData.timeline_span})
            </button>
            {timelineData.years.map(({ year_ac: y }) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={clsx(
                  'shrink-0 rounded px-2.5 py-1 font-mono text-xs transition-all',
                  selectedYear === y
                    ? 'border border-gold bg-gold/20 text-gold font-bold shadow-sm'
                    : 'border border-hairline bg-ink text-parchment-dim hover:text-parchment hover:border-parchment-dim'
                )}
              >
                {y} AC
              </button>
            ))}
          </div>

          {/* Event Category Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin text-xs">
            <span className="eyebrow shrink-0 mr-1 text-[11px] text-gold/80 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> 事件分类:
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={clsx(
                'shrink-0 rounded px-2 py-0.5 font-serif text-xs transition-all',
                selectedCategory === 'all'
                  ? 'border border-gold/70 bg-gold/15 text-gold font-bold'
                  : 'border border-hairline bg-ink text-parchment-dim hover:text-parchment'
              )}
            >
              全部分类
            </button>
            {Object.entries(CATEGORY_MAP).map(([catKey, catInfo]) => {
              const IconComp = catInfo.icon;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={clsx(
                    'shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-all',
                    selectedCategory === catKey
                      ? 'border border-gold/70 bg-gold/15 text-gold font-bold'
                      : 'border border-hairline bg-ink text-parchment-dim hover:text-parchment'
                  )}
                >
                  <IconComp className="h-3 w-3" />
                  <span>{catInfo.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search, Region & Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs pt-1">

            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-parchment-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索时间线：人名（雪诺、詹姆）、战役（黑水河、私生子）、大事件..."
                className="w-full rounded border border-hairline-bright bg-ink py-1.5 pl-8 pr-3 text-xs text-parchment placeholder:text-parchment-dim/50 focus:border-gold/70 focus:outline-none focus:ring-1 focus:ring-gold/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-parchment-dim hover:text-parchment"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Region dropdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-parchment-dim flex items-center gap-1 text-[11px]">
                <MapPin className="h-3 w-3" /> 地域:
              </span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="rounded border border-hairline-bright bg-ink px-2 py-1 text-xs text-parchment focus:border-gold/70 focus:outline-none"
              >
                <option value="all">全大陆地域</option>
                {Object.entries(REGION_MAP).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Expand / Collapse All */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={expandAll}
                className="rounded border border-hairline/60 px-2 py-1 text-[11px] text-parchment-dim hover:text-parchment transition-colors"
              >
                全部展开
              </button>
              <button
                onClick={collapseAll}
                className="rounded border border-hairline/60 px-2 py-1 text-[11px] text-parchment-dim hover:text-parchment transition-colors"
              >
                全部收起
              </button>
            </div>

          </div>
        </div>

        {/* Timeline Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin space-y-10">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-parchment-dim text-sm">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                正在加载维斯特洛编年时间线...
              </div>
            </div>
          ) : filteredYears.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-parchment-dim text-center space-y-2">
              <p className="text-sm font-serif">未找到匹配的时间线事件</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedRegion('all');
                  setSelectedYear('all');
                }}
                className="btn-ghost !text-gold mt-2"
              >
                重置所有筛选
              </button>
            </div>
          ) : (
            filteredYears.map((yearBlock) => (
              <section key={yearBlock.year_ac} className="space-y-4">

                {/* Year Header Banner */}
                <div className="sticky top-0 z-20 flex flex-col md:flex-row md:items-center justify-between gap-2 border-y border-gold/40 bg-ink/95 px-4 py-2.5 backdrop-blur shadow-md">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-base md:text-lg font-bold text-gold tracking-wider">
                        {yearBlock.year_title}
                      </span>
                    </div>
                    <p className="font-serif text-xs italic text-rubric mt-0.5">
                      “{yearBlock.tagline}”
                    </p>
                  </div>
                  <div className="text-xs text-parchment-dim shrink-0">
                    本年度共 <strong className="text-gold font-mono">{yearBlock.events.length}</strong> 项重大历史时刻
                  </div>
                </div>

                {/* Year Overview Card */}
                <div className="rounded border border-hairline/70 bg-ink-2/40 p-3 text-xs text-parchment-dim leading-relaxed">
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 shrink-0 text-gold/80 mt-0.5" />
                    <p className="text-parchment">{yearBlock.overview}</p>
                  </div>
                </div>

                {/* Vertical Timeline Nodes */}
                <div className="relative pl-6 md:pl-8 space-y-4 border-l-2 border-gold/30 ml-3 md:ml-4">
                  {yearBlock.events.map((evt) => {
                    const isExpanded = expandedEvents[evt.id] ?? false;
                    const catInfo = CATEGORY_MAP[evt.category] || CATEGORY_MAP.intrigue;
                    const CatIcon = catInfo.icon;
                    const regionInfo = REGION_MAP[evt.region_tag] || { label: evt.region, color: 'border-hairline bg-ink text-parchment' };
                    const linkedWorldEvent = timelineMode === 'actual' ? worldEventById.get(evt.id) : undefined;
                    const linkedDisplay = linkedWorldEvent ? worldEventDisplays.get(linkedWorldEvent.id) : undefined;
                    const isDebugHidden = linkedWorldEvent ? hiddenWorldEventIds.has(linkedWorldEvent.id) : false;

                    return (
                      <article
                        key={evt.id}
                        className={clsx(
                          'relative rounded border transition-all duration-200',
                          isExpanded
                            ? 'border-gold/60 bg-ink-2/70 shadow-xl'
                            : 'border-hairline/80 bg-ink-2/30 hover:border-hairline-bright hover:bg-ink-2/50'
                        )}
                      >
                        {/* Timeline Node Dot */}
                        <div
                          className={clsx(
                            'absolute -left-[31px] md:-left-[39px] top-4.5 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all',
                            isExpanded
                              ? 'border-gold bg-gold text-ink shadow-[0_0_10px_rgba(212,175,55,0.7)]'
                              : 'border-gold/60 bg-ink text-gold/80'
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        </div>

                        {/* Event Card Header */}
                        <div
                          onClick={() => toggleEvent(evt.id)}
                          className="flex cursor-pointer flex-col md:flex-row md:items-center justify-between gap-2.5 p-3.5 select-none"
                        >
                          <div className="space-y-1.5">
                            {/* Date Badge + Category + Region */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="shrink-0 font-mono text-xs font-bold text-gold px-2 py-0.5 rounded bg-gold/15 border border-gold/40">
                                {evt.date_display}
                              </span>
                              {evt.status && (
                                <span data-timeline-status={evt.status} className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', evt.status === 'diverged' ? 'border-rubric/60 text-rubric-bright' : evt.status === 'scheduled' ? 'border-hairline text-parchment-dim' : 'border-gold-deep/60 text-gold-dim')}>
                                  {STATUS_LABELS[evt.status] ?? evt.status}
                                </span>
                              )}

                              <span className={clsx('flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium', catInfo.color)}>
                                <CatIcon className="h-3 w-3" />
                                {catInfo.label}
                              </span>

                              <span className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', regionInfo.color)}>
                                <MapPin className="h-2.5 w-2.5 inline mr-0.5" />
                                {evt.region}
                              </span>
                              {isDebugHidden && (
                                <span className="rounded border border-gold-deep/50 px-1.5 py-0.5 font-mono text-[10px] text-gold" data-debug-event-badge={linkedWorldEvent?.id}>debug</span>
                              )}
                            </div>

                            {/* Event Title & Summary */}
                            <div>
                              <h3 className="font-serif text-sm font-bold text-parchment hover:text-gold transition-colors">
                                {evt.title}
                              </h3>
                              <p className="text-xs text-parchment-dim mt-0.5 line-clamp-1">
                                {evt.summary}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-parchment-dim hover:text-gold transition-colors"
                              aria-label={isExpanded ? '收起详情' : '展开详情'}
                            >
                              <span className="text-[11px] hidden sm:inline">{isExpanded ? '收起纪事' : '查看详述'}</span>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Full Details */}
                        {isExpanded && (
                          <div className="border-t border-hairline/60 p-4 pt-3.5 space-y-4 text-xs animate-fade-in bg-ink/40">

                            {/* Characters involved */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] rounded bg-ink/70 p-2 border border-hairline/50">
                              <span className="flex items-center gap-1 font-semibold text-gold/90 shrink-0">
                                <Users className="h-3 w-3" /> 关键人物:
                              </span>
                              {evt.characters.map((charName, cIdx) => (
                                <span
                                  key={cIdx}
                                  className="rounded border border-hairline bg-ink-2 px-1.5 py-0.5 text-parchment"
                                >
                                  {charName}
                                </span>
                              ))}
                            </div>

                            {linkedDisplay && linkedDisplay.entities.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 rounded border border-hairline/50 bg-ink/70 p-2 text-[11px]" data-timeline-subject-links>
                                <span className="font-semibold text-gold/90">关联对象:</span>
                                {linkedDisplay.entities.map((entity, index) => entity.kind === 'character' ? (
                                  <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onOpenCharacter(entity.id)} className="rounded border border-gold/30 px-1.5 py-0.5 text-gold hover:border-gold/70">{entity.label}</button>
                                ) : entity.kind === 'location' ? (
                                  <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onOpenLocation(entity.location)} className="rounded border border-gold/30 px-1.5 py-0.5 text-gold hover:border-gold/70">{entity.label}</button>
                                ) : entity.kind === 'asset' ? (
                                  <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onOpenAsset(entity.id)} className="rounded border border-gold/30 px-1.5 py-0.5 text-gold hover:border-gold/70">{entity.label}</button>
                                ) : <span key={`${entity.kind}:${entity.id}:${index}`} className="rounded border border-hairline px-1.5 py-0.5 text-parchment-dim">{entity.label}</span>)}
                              </div>
                            )}
                            {linkedDisplay && (
                              <details className="text-[10px] text-parchment-faint/70">
                                <summary className="cursor-pointer select-none">技术记录</summary>
                                <p>{linkedDisplay.audit.eventType} · {linkedDisplay.audit.source} · {linkedDisplay.audit.transactionId}</p>
                              </details>
                            )}

                            {/* Full Narrative Text */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1 font-serif text-xs font-bold text-gold">
                                <Scroll className="h-3.5 w-3.5" /> 历史详实剧情纪事
                              </div>
                              <p className="text-xs text-parchment leading-relaxed pl-2 border-l border-gold/30">
                                {evt.full_narrative}
                              </p>
                            </div>

                            {/* Key Consequences & Deaths Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                              {evt.key_consequences.length > 0 && (
                                <div className="rounded border border-hairline/70 bg-ink/60 p-2.5 space-y-1.5">
                                  <div className="flex items-center gap-1.5 font-semibold text-gold text-[11px]">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-gold" /> 历史转折与影响
                                  </div>
                                  <ul className="space-y-1 text-[11px] text-parchment-faint pl-2">
                                    {evt.key_consequences.map((cons, cIdx) => (
                                      <li key={cIdx} className="list-disc list-inside">
                                        {cons}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {evt.fatalities.length > 0 && (
                                <div className="rounded border border-rubric/40 bg-rubric/10 p-2.5 space-y-1.5">
                                  <div className="flex items-center gap-1 font-semibold text-rubric-bright text-[11px]">
                                    <Skull className="h-3.5 w-3.5" /> 角色阵亡与牺牲名单
                                  </div>
                                  <div className="flex flex-wrap gap-1 text-[10.5px] text-parchment">
                                    {evt.fatalities.map((death, dIdx) => (
                                      <span key={dIdx} className="rounded bg-ink/80 px-1.5 py-0.5 border border-rubric/30">
                                        {death}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Iconic Quote */}
                            {evt.iconic_quote && (
                              <div className="rounded border border-gold/30 bg-gold/5 p-2.5 text-center font-serif text-xs italic text-gold">
                                “{evt.iconic_quote}”
                              </div>
                            )}

                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-hairline/80 bg-ink-2/95 px-4 md:px-6 text-xs text-parchment-dim">
          <div className="flex items-center gap-3">
            <span>维斯特洛编年史 · {timelineData.timeline_span}</span>
            <span className="hidden sm:inline">当前视图共 {timelineData.total_events} 个纪年节点</span>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-hairline bg-ink px-3 py-0.5 text-xs text-parchment hover:border-gold/50 hover:text-gold transition-colors"
          >
            关闭 (ESC)
          </button>
        </div>

      </div>
    </div>
  );
};
