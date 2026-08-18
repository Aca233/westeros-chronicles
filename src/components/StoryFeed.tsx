import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';
import { StoryTurn } from '../types/game';
import { WESTEROS_ENTITIES, EntityInfo } from '../data/entities';
import { ArrowDown } from 'lucide-react';
import { GameIcon, isGameIconId } from './GameIcon';
import { stripEmoji } from '../services/textSanitizer';
import { OpeningCeremony } from './OpeningCeremony';
import type { CharacterId } from '../features/characters/types';
import type { WorldEventFact } from '../features/world/worldHistory';

export interface StoryFeedProps {
  onSelectCharacter?: (characterId: CharacterId) => void;
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

export const StoryFeed: React.FC<StoryFeedProps> = ({ onSelectCharacter = () => undefined }) => {
  const { gameState, isStreaming, streamingText } = useGameStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

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
              facts={gameState.worldHistory.turns.find((entry) => entry.turn === turn.turnNumber)?.facts ?? []}
              onSelectCharacter={onSelectCharacter}
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
  onSelectCharacter,
}: {
  turn: StoryTurn;
  isFirst: boolean;
  facts: readonly WorldEventFact[];
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const [isThinkOpen, setIsThinkOpen] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<{ entity: EntityInfo; x: number; y: number; above: boolean } | null>(null);

  // 名词考据:墨字黄铜点线 + 悬浮旁注
  const renderHighlightedNarrate = (text: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyCounter = 0;

    while (remaining.length > 0) {
      let earliestIndex = -1;
      let matchedEntity: EntityInfo | null = null;
      let matchedKeyword = '';

      for (const entity of WESTEROS_ENTITIES) {
        for (const kw of entity.keywords) {
          const idx = remaining.indexOf(kw);
          if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
            earliestIndex = idx;
            matchedEntity = entity;
            matchedKeyword = kw;
          }
        }
      }

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
            {facts.map((fact) => (
              <div key={fact.id} className="mb-1 text-[10.5px] leading-relaxed text-parchment-faint last:mb-0">
                <span className="text-parchment-dim">{fact.title}</span>
                {fact.participantIds.map((characterId) => (
                  <button key={characterId} type="button" onClick={() => onSelectCharacter(characterId)} className="ml-2 text-gold-dim underline decoration-gold-deep/50 underline-offset-2 hover:text-gold" data-story-fact-character={characterId}>
                    查看人物
                  </button>
                ))}
              </div>
            ))}
          </aside>
        </Reveal>
      )}

      {/* 正文:泥金首字起笔 */}
      <div className="deed-prose deed-prose--illuminated font-serif">
        {turn.narrate.split(/\n+/).map((para, pIdx) => {
          const trimmed = stripEmoji(para);
          if (!trimmed) return null;
          return (
            <Reveal as="p" key={pIdx} delay={180 + Math.min(pIdx, 6) * 85}>
              {renderHighlightedNarrate(trimmed)}
            </Reveal>
          );
        })}
      </div>

      {/* 幕后暗线:一个安静的文字开关 */}
      {turn.think && (
        <div className="mt-9 select-none">
          <button
            onClick={() => setIsThinkOpen(!isThinkOpen)}
            className="mx-auto flex items-center gap-2 text-[11px] tracking-[0.2em] text-parchment-faint transition-colors hover:text-gold"
          >
            <span className="inline-block h-1 w-1 rotate-45 bg-current" aria-hidden="true" />
            {isThinkOpen ? '收起幕后暗线' : '展开幕后暗线'}
          </button>
          {isThinkOpen && (
            <div className="panel-pop mt-4 whitespace-pre-wrap border-l border-hairline-bright/60 pl-4 font-mono text-[11px] leading-relaxed text-parchment-dim">
              {stripEmoji(turn.think)}
            </div>
          )}
        </div>
      )}

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
  const failed = check.isNatural1 || !check.success;

  return (
    <div className="mb-9 select-none text-center">
      <p className="font-mono text-[11px] leading-relaxed text-parchment-faint">
        {check.attributeName}检定 · DC {check.dc}
        {' '}· 出目 {check.roll}
        {' '}属性 {signed(check.attributeModifier)}
        {equipmentModifier !== 0 && <> 物品 {signed(equipmentModifier)}</>}
        {traitModifier !== 0 && <span className="text-gold"> 特质 {signed(traitModifier)}</span>}
        {' '}总计 <strong className="text-parchment">{check.total}</strong>
        {' '}·{' '}
        <strong className={`font-serif text-[12px] tracking-[0.3em] ${failed ? 'text-rubric' : 'text-parchment'}`}>
          {check.isNatural20 ? '天成' : check.isNatural1 ? '溃败' : check.success ? '得手' : '落空'}
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
    </div>
  );
}

// 实时流式渲染器
function LiveStreamingRenderer({ rawText }: { rawText: string }) {
  const safeRawText = stripEmoji(rawText);
  if (!safeRawText) {
    return (
      <div className="typing-cursor font-serif text-[14px] italic text-parchment-faint">
        羽笔蘸墨,正要落纸……
      </div>
    );
  }

  let liveThink = '';
  const thinkMatch = safeRawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    liveThink = thinkMatch[1].trim();
  }

  const cleanNarrate = safeRawText
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/<\/?(?:narrate|speak|branch|state_cmd)[^>]*>/gi, '')
    .trim();

  return (
    <div className="flex flex-col gap-5">
      {liveThink && (
        <p className="whitespace-pre-wrap border-l border-hairline-bright/60 pl-4 font-mono text-[10.5px] leading-relaxed text-parchment-faint">
          {liveThink}
        </p>
      )}
      <div className="deed-prose typing-cursor whitespace-pre-wrap font-serif">
        {cleanNarrate || (liveThink ? '正在措辞……' : safeRawText)}
      </div>
    </div>
  );
}
