import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import { StoryTurn } from '../types/game';
import { WESTEROS_ENTITIES, EntityInfo } from '../data/entities';
import { ArrowDown } from 'lucide-react';
import { GameIcon, isGameIconId } from './GameIcon';
import { stripEmoji } from '../services/textSanitizer';
import { extractNarrativeContent, extractStreamingNarrativeContent } from '../services/modelProtocol';
import { OpeningCeremony } from './OpeningCeremony';
import type { CharacterId } from '../features/characters/types';
import type { WorldEvent } from '../features/world/worldRuntimeTypes';
import type { WorldLocationRef } from '../features/map/types';
import { findNextStoryEntity } from '../features/world/storyEntityMatch';
import { playerWorldEventViewer } from '../features/world/worldEventVisibility';
import { hiddenWorldEventIdsForPlayer, selectWorldEventsForView } from '../features/debug/worldEventDebug';
import { useWorldEventDisplays } from '../features/world/useWorldEventDisplays';
import type { WorldEventDisplay } from '../features/world/worldDisplayResolver';


export interface StoryFeedProps {
  onSelectCharacter?: (characterId: CharacterId) => void;
  onOpenLocation?: (location: WorldLocationRef) => void;
  onOpenAsset?: (assetId: string) => void;
}

/** 视口内揭示:元素进入视野一次后定格 */
function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return undefined;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -4% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return { ref, inView };
}

function Reveal({
  as = 'div',
  className = '',
  delay = 0,
  children,
}: {
  as?: 'div' | 'p' | 'section' | 'span';
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const { ref, inView } = useInViewOnce<HTMLElement>();
  return React.createElement(
    as,
    {
      ref,
      className: `reveal${inView ? ' is-inview' : ''}${className ? ` ${className}` : ''}`,
      style: { '--reveal-delay': `${delay}ms` } as React.CSSProperties,
    },
    children,
  );
}

/** 罗马数字:场景幽灵序号 */
function toRoman(num: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = Math.max(1, Math.floor(num));
  let out = '';
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

export const StoryFeed: React.FC<StoryFeedProps> = ({
  onSelectCharacter = () => undefined,
  onOpenLocation = () => undefined,
  onOpenAsset = () => undefined,
}) => {
  const { gameState, isStreaming, streamingText, debugEnabled } = useGameStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [dynamicEntities, setDynamicEntities] = useState<EntityInfo[]>([]);
  const narrativeCorpus = useMemo(
    () => gameState.turns.map((turn) => `${turn.playerInput ?? ''}\n${extractNarrativeContent(turn.narrate ?? '')}`).join('\n'),
    [gameState.turns],
  );
  const storyEntities = useMemo(() => [...WESTEROS_ENTITIES, ...dynamicEntities], [dynamicEntities]);

  useEffect(() => {
    let cancelled = false;
    if (!narrativeCorpus.trim()) {
      setDynamicEntities([]);
      return () => { cancelled = true; };
    }
    Promise.all([
      import('../features/characters/staticCharacterRepository'),
      import('../features/map/repository'),
      import('../features/world/storyEntityLinks'),
      import('../features/world-content/repository'),
    ]).then(async ([{ StaticCharacterRepository }, { mapRepository }, { buildStoryMentionEntities, supplementMentionedCharacterIds }, { worldContentRepository }]) => {
      const storyCharacterRepository = new StaticCharacterRepository();
      const [locations, characterContents] = await Promise.all([
        mapRepository.loadGameplayLocations().catch(() => []),
        worldContentRepository.loadAllCharacterContent().catch(() => []),
      ]);
      const characters = await storyCharacterRepository.findMentioned(narrativeCorpus, { includeGenealogy: false, limit: 100 }).then(async (mentioned) => {
        const aliasIds = supplementMentionedCharacterIds(narrativeCorpus, characterContents) as CharacterId[];
        const aliases = await storyCharacterRepository.getSearchHits(aliasIds);
        return [...new Map([...mentioned, ...aliases].map((hit) => [hit.id, hit])).values()];
      });
      if (!cancelled) {
        const contentByCharacter = new Map(characterContents.map((record) => [record.characterId as string, record]));
        setDynamicEntities(buildStoryMentionEntities(narrativeCorpus, characters, locations, contentByCharacter));
      }
    }).catch(() => {
      if (!cancelled) setDynamicEntities([]);
    });
    return () => { cancelled = true; };
  }, [narrativeCorpus]);

  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  // 智能跟随:贴近底部才跟滚;翻读旧页时不打扰
  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowJump(true);
    }
  }, [gameState.turns.length, streamingText]);

  // 顶部金线:把阅读进度写到根变量,Header 拾取
  const publishProgress = useCallback(() => {
    const el = scrollRef.current;
    const max = el ? el.scrollHeight - el.clientHeight : 0;
    const p = el && max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
    document.documentElement.style.setProperty('--scroll-p', p.toFixed(4));
  }, []);

  // 幽灵序号视差:距视野中心越远,偏移越明显
  const parallaxRaf = useRef(0);
  const updateGhostParallax = useCallback(() => {
    cancelAnimationFrame(parallaxRaf.current);
    parallaxRaf.current = requestAnimationFrame(() => {
      const root = scrollRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const mid = rootRect.top + rootRect.height / 2;
      root.querySelectorAll<HTMLElement>('.ghost-numeral').forEach((el) => {
        const rect = el.getBoundingClientRect();
        const delta = rect.top + rect.height / 2 - mid;
        el.style.setProperty('--par', `${(-delta * 0.06).toFixed(1)}px`);
      });
    });
  }, []);

  const handleScroll = () => {
    if (isNearBottom()) setShowJump(false);
    publishProgress();
    updateGhostParallax();
  };

  useEffect(() => {
    publishProgress();
    updateGhostParallax();
    return () => cancelAnimationFrame(parallaxRaf.current);
  }, [gameState.turns.length, streamingText, publishProgress, updateGhostParallax]);

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJump(false);
  };

  const isEmptyStage = gameState.turns.length === 0 && !isStreaming;
  const eventViewer = useMemo(() => playerWorldEventViewer(gameState), [gameState.lord.canonicalCharacterId, gameState.worldCharacters?.runId]);
  const visibleWorldEvents = useMemo(
    () => selectWorldEventsForView(gameState.worldRuntime.events, eventViewer, debugEnabled),
    [debugEnabled, eventViewer, gameState.worldRuntime.events],
  );
  const hiddenWorldEventIds = useMemo(
    () => debugEnabled ? hiddenWorldEventIdsForPlayer(gameState.worldRuntime.events, eventViewer) : new Set<string>(),
    [debugEnabled, eventViewer, gameState.worldRuntime.events],
  );
  const worldEventsById = useMemo(
    () => new Map(visibleWorldEvents.map((event) => [event.id, event])),
    [visibleWorldEvents],
  );
  const worldEventDisplays = useWorldEventDisplays(visibleWorldEvents, gameState);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
        <div
          className={
            isEmptyStage
              ? 'mx-auto flex h-full w-full max-w-[46rem] flex-col px-5 md:px-6'
              : 'mx-auto w-full max-w-[42rem] px-5 pb-16 pt-10 md:px-6 md:pt-14'
          }
        >
          {/* 开场仪式:未落笔时,整幅舞台让给题名 */}
          {isEmptyStage && <OpeningCeremony />}

          {/* 场景流:文字即界面 */}
          {gameState.turns.map((turn, index) => (
            <SceneBlock
              key={turn.id}
              turn={turn}
              isFirst={index === 0}
              entities={storyEntities}
              worldEventDisplays={worldEventDisplays}
              hiddenWorldEventIds={hiddenWorldEventIds}
              facts={(gameState.worldHistory.turns.find((entry) => entry.turn === turn.turnNumber)?.eventIds ?? [])
                .flatMap((eventId) => worldEventsById.get(eventId) ?? [])}
              onSelectCharacter={onSelectCharacter}
              onOpenLocation={onOpenLocation}
              onOpenAsset={onOpenAsset}
            />
          ))}

          {/* 正在书写 */}
          {isStreaming && (
            <div className="scene-enter">
              <SceneDivider label="书写中" pulsing />
              <LiveStreamingRenderer rawText={streamingText} />
            </div>
          )}

          <div ref={bottomRef} className="h-2" />
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="jump-latest scene-enter absolute bottom-4 right-5 z-20"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          回到最新
        </button>
      )}
    </div>
  );
};

// 回合分隔:一行纪年,两枚菱花
function SceneDivider({ label, pulsing = false }: { label: string; pulsing?: boolean }) {
  return (
    <div className="scene-divider select-none">
      <span className="divider-gem" aria-hidden="true" />
      <span className="flex items-center gap-3 whitespace-nowrap font-display text-[11px] font-bold tracking-[0.22em]">
        {label}
        {pulsing && (
          <span className="quill-dots" aria-hidden="true"><i /><i /><i /></span>
        )}
      </span>
      <span className="divider-gem" aria-hidden="true" />
    </div>
  );
}

// 一个场景:幽灵序号、御令、检验、暗线与正文
function SceneBlock({
  turn,
  isFirst,
  facts,
  worldEventDisplays,
  hiddenWorldEventIds,
  entities,
  onSelectCharacter,
  onOpenLocation,
  onOpenAsset,
}: {
  turn: StoryTurn;
  isFirst: boolean;
  facts: readonly WorldEvent[];
  worldEventDisplays: ReadonlyMap<string, WorldEventDisplay>;
  hiddenWorldEventIds: ReadonlySet<string>;
  entities: readonly EntityInfo[];
  onSelectCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (location: WorldLocationRef) => void;
  onOpenAsset: (assetId: string) => void;
}) {
  const [hoveredEntity, setHoveredEntity] = useState<{ entity: EntityInfo; x: number; y: number; above: boolean } | null>(null);

  // 名词考据:墨字黄铜点线 + 悬浮旁注
  const renderHighlightedNarrate = (text: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyCounter = 0;

    while (remaining.length > 0) {
      const match = findNextStoryEntity(remaining, entities);
      const earliestIndex = match?.index ?? -1;
      const matchedEntity = match?.entity ?? null;
      const matchedKeyword = match?.keyword ?? '';

      if (earliestIndex === -1 || !matchedEntity) {
        parts.push(remaining);
        break;
      }

      if (earliestIndex > 0) {
        parts.push(remaining.substring(0, earliestIndex));
      }

      const entityToHover = matchedEntity;
      const sharedProps = {
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140);
          const above = rect.bottom + 210 > window.innerHeight;
          setHoveredEntity({
            entity: entityToHover,
            x,
            y: above ? rect.top - 10 : rect.bottom + 10,
            above,
          });
        },
        onMouseLeave: () => setHoveredEntity(null),
      };
      const key = `entity_${keyCounter++}`;

      if (entityToHover.category === 'character' && entityToHover.characterId) {
        parts.push(
          <button
            key={key}
            {...sharedProps}
            type="button"
            data-story-character-link={entityToHover.characterId}
            className="lore-term lore-term--character"
            aria-label={`查看${matchedKeyword}的人物档案`}
            title={`打开${entityToHover.name}的人物档案`}
            onClick={() => {
              setHoveredEntity(null);
              onSelectCharacter(entityToHover.characterId!);
            }}
          >
            {matchedKeyword}
          </button>,
        );
      } else if (entityToHover.category === 'location' && entityToHover.location) {
        parts.push(
          <button
            key={key}
            {...sharedProps}
            type="button"
            data-story-location-link={entityToHover.location.locationId}
            className="lore-term lore-term--location"
            aria-label={`在地图中查看${matchedKeyword}`}
            title={`打开${entityToHover.name}的地图位置`}
            onClick={() => {
              setHoveredEntity(null);
              onOpenLocation(entityToHover.location!);
            }}
          >
            {matchedKeyword}
          </button>,
        );
      } else {
        parts.push(
          <span key={key} {...sharedProps} className="lore-term">
            {matchedKeyword}
          </span>,
        );
      }

      remaining = remaining.substring(earliestIndex + matchedKeyword.length);
    }

    return parts;
  };

  return (
    <section className="relative">
      {/* 场景首行:幽灵序号伏于纪年之后 */}
      <div className={`scene-head ${isFirst ? '!mt-2' : ''}`}>
        <span className="ghost-numeral" aria-hidden="true">{toRoman(turn.turnNumber)}</span>
        <Reveal>
          <SceneDivider label={turn.gameDate || '征服历 298 AC · 10月15日'} />
        </Reveal>
      </div>

      {/* 御令:这场戏的因,领主亲笔行书 */}
      {turn.turnNumber > 1 && turn.playerInput && (
        <Reveal as="p" className="decree-quote mb-9 px-2 md:px-6" delay={90}>
          「{stripEmoji(turn.playerInput)}」
        </Reveal>
      )}

      {/* 掷骰检验:一行小字账目 */}
      {turn.diceCheck && (
        <Reveal delay={140}>
          <DiceLedger check={turn.diceCheck} />
        </Reveal>
      )}

      {facts.length > 0 && (
        <Reveal delay={160}>
          <aside className="mb-7 border-l border-gold-deep/60 pl-3" data-story-world-facts>
            <p className="eyebrow mb-1.5">本回合已确认事实</p>
            {facts.map((fact) => {
              const display = worldEventDisplays.get(fact.id);
              return (
                <div key={fact.id} className="mb-1 text-[10.5px] leading-relaxed text-parchment-faint last:mb-0">
                  <span className="text-parchment-dim">{display?.title ?? fact.reason}</span>
                  {hiddenWorldEventIds.has(fact.id) && (
                    <span className="ml-2 border border-gold-deep/50 px-1 py-px font-mono text-[9px] text-gold" data-debug-event-badge={fact.id}>debug</span>
                  )}
                  {display?.entities.map((entity, index) => entity.kind === 'character' ? (
                    <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onSelectCharacter(entity.id)} className="ml-2 text-gold-dim underline decoration-gold-deep/50 underline-offset-2 hover:text-gold" data-story-fact-character={entity.id}>{entity.label}</button>
                  ) : entity.kind === 'location' ? (
                    <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onOpenLocation(entity.location)} className="ml-2 text-gold-dim underline decoration-gold-deep/50 underline-offset-2 hover:text-gold" data-story-fact-location={entity.id}>{entity.label}</button>
                  ) : entity.kind === 'asset' ? (
                    <button key={`${entity.kind}:${entity.id}:${index}`} type="button" onClick={() => onOpenAsset(entity.id)} className="ml-2 text-gold-dim underline decoration-gold-deep/50 underline-offset-2 hover:text-gold" data-story-fact-asset={entity.id}>{entity.label}</button>
                  ) : (
                    <span key={`${entity.kind}:${entity.id}:${index}`} className="ml-2 text-gold-dim">{entity.label}</span>
                  ))}
                  {display && (
                    <details className="mt-1 text-[9px] text-parchment-faint/70">
                      <summary className="cursor-pointer select-none">技术记录</summary>
                      <p>{display.audit.eventType} · {display.audit.source} · {display.audit.transactionId}</p>
                    </details>
                  )}
                </div>
              );
            })}
          </aside>
        </Reveal>
      )}

      {/* 正文:泥金首字起笔 */}
      <div className="deed-prose deed-prose--illuminated font-serif">
        {extractNarrativeContent(turn.narrate).split(/\n+/).map((para, pIdx) => {
          const trimmed = stripEmoji(para);
          if (!trimmed) return null;
          return (
            <Reveal as="p" key={pIdx} delay={180 + Math.min(pIdx, 6) * 85}>
              {renderHighlightedNarrate(trimmed)}
            </Reveal>
          );
        })}
      </div>

      {/* 名词旁注悬浮卡 */}
      {hoveredEntity && (
        <div
          className={`entity-popover panel-iron p-3.5${hoveredEntity.above ? ' entity-popover--above' : ''}`}
          style={{ left: `${hoveredEntity.x}px`, top: `${hoveredEntity.y}px` }}
          role="tooltip"
        >
          <div className="mb-1.5 flex items-center gap-2 border-b border-hairline pb-1.5">
            {isGameIconId(hoveredEntity.entity.icon) && (
              <GameIcon icon={hoveredEntity.entity.icon} className="h-7 w-7 shrink-0" />
            )}
            <span className="font-serif text-[13px] font-bold text-gold-bright">{hoveredEntity.entity.name}</span>
            <span className="ml-auto text-[9px] tracking-wider text-parchment-faint">
              {hoveredEntity.entity.tag}
            </span>
          </div>
          <p className="font-serif text-[11px] leading-relaxed text-parchment">
            {hoveredEntity.entity.description}
          </p>
          {hoveredEntity.entity.extraStats && (
            <div className="mt-1.5 border-t border-hairline pt-1.5 font-mono text-[10px] font-semibold text-gold">
              {hoveredEntity.entity.extraStats}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// D20 检验账目
function DiceLedger({ check }: { check: NonNullable<StoryTurn['diceCheck']> }) {
  const equipmentModifier = check.equipmentModifier;
  const equipmentModifierBreakdown = check.equipmentModifierBreakdown;
  const traitModifier = check.traitModifier;
  const traitModifierBreakdown = check.traitModifierBreakdown;
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
  const outcome = check.outcome ?? (check.success ? 'success' : 'failure');
  const failed = outcome === 'failure';
  const outcomeLabel = outcome === 'strong_success' ? '占得先机' : outcome === 'success' ? '得手' : outcome === 'partial' ? '险中有得' : '落空';
  const methodLabel = check.secondaryAttributeName
    ? `${check.attributeName} 70% + ${check.secondaryAttributeName} 30%`
    : check.attributeName;

  return (
    <div className="mb-9 select-none text-center">
      <p className="font-mono text-[11px] leading-relaxed text-parchment-faint">
        {methodLabel} · DC {check.dc}
        {' '}· 出目 {check.roll}
        {' '}能力 {check.effectiveAttribute ?? check.primaryAttributeValue ?? '旧制'} → {signed(check.attributeModifier)}
        {equipmentModifier !== 0 && <> 物品 {signed(equipmentModifier)}</>}
        {traitModifier !== 0 && <span className="text-gold"> 特质 {signed(traitModifier)}</span>}
        {' '}总计 <strong className="text-parchment">{check.total}</strong>
        {' '}·{' '}
        <strong className={`font-serif text-[12px] tracking-[0.3em] ${failed ? 'text-rubric' : 'text-parchment'}`}>
          {outcomeLabel}
        </strong>
      </p>
      {equipmentModifierBreakdown.length > 0 && (
        <p className="mt-1.5 font-mono text-[9.5px] text-parchment-faint">
          {equipmentModifierBreakdown.map((item) => `${item.name} ${signed(item.value)}`).join(' · ')}
        </p>
      )}
      {traitModifierBreakdown.length > 0 && (
        <p className="mt-1.5 font-mono text-[9.5px] text-parchment-faint">
          {traitModifierBreakdown.map((item) => `${item.name} ${signed(item.value)}`).join(' · ')}
        </p>
      )}
      {check.methodReason && (
        <p className="mt-1.5 font-serif text-[10px] leading-relaxed text-parchment-faint">{check.methodReason}</p>
      )}
      {check.methodEdge && (
        <p className="mt-1.5 font-serif text-[10px] leading-relaxed text-gold">
          {check.methodEdge.traitName} · {check.methodEdge.label}：{check.methodEdge.directive}
        </p>
      )}
    </div>
  );
}

// 实时流式渲染器
function LiveStreamingRenderer({ rawText }: { rawText: string }) {
  const safeRawText = stripEmoji(rawText);
  const cleanNarrate = extractStreamingNarrativeContent(safeRawText);
  if (!cleanNarrate) {
    return (
      <div className="typing-cursor font-serif text-[14px] italic text-parchment-faint">
        羽笔蘸墨,正要落纸……
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="deed-prose typing-cursor whitespace-pre-wrap font-serif">
        {cleanNarrate || '正在措辞……'}
      </div>
    </div>
  );
}
