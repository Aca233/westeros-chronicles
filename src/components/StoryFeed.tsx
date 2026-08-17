import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { StoryTurn } from '../types/game';
import { WESTEROS_ENTITIES, EntityInfo } from '../data/entities';
import { ArrowDown, ChevronDown, ChevronRight, Dices, Feather } from 'lucide-react';
import { GameIcon, isGameIconId } from './GameIcon';
import { stripEmoji } from '../services/textSanitizer';
import type { CharacterId } from '../features/characters/types';

// 每张纸页的搁置倾角:由 turn id 定角,稳定不闪动
function sheetTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const tilts = [-0.9, -0.45, 0.5, 0.95, -0.6, 0.3];
  return tilts[Math.abs(hash) % tilts.length];
}

export interface StoryFeedProps {
  onSelectCharacter?: (characterId: CharacterId) => void;
}

export const StoryFeed: React.FC<StoryFeedProps> = ({ onSelectCharacter = () => undefined }) => {
  const { gameState, isStreaming, streamingText } = useGameStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  // 贴近底部才算在阅读最新一页
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  // 智能跟随:只在读者位于底部时跟滚;翻读旧页时不打扰,改为浮钮提示
  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowJump(true);
    }
  }, [gameState.turns.length, streamingText]);

  const handleScroll = () => {
    if (isNearBottom()) setShowJump(false);
  };

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJump(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-10 px-5 pb-12 pt-24 md:px-8">
        {/* 开场引子 */}
        {gameState.turns.length === 0 && !isStreaming && (
          <div className="scene-enter flex flex-col items-center py-14 text-center">
            <div className="rule-diamond w-44">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-current" />
            </div>
            <p className="mt-8 max-w-sm font-serif text-[15px] leading-loose text-parchment-dim">
              七国静默,渡鸦未至。<br />
              你的第一道御令,将决定这段传奇从何写起。
            </p>
          </div>
        )}

        {/* 摊在桌上的纸页 */}
        {gameState.turns.map((turn, index) => (
          <DeedSheet
            key={turn.id}
            turn={turn}
            isLatest={index === gameState.turns.length - 1}
            tilt={sheetTilt(turn.id)}
            onSelectCharacter={onSelectCharacter}
          />
        ))}

        {/* 正在书写的一页 */}
        {isStreaming && (
          <article
            className="scene-enter relative border border-hairline-bright/70 bg-ink-2 px-7 py-7 md:px-10 md:py-8 shadow-[0_16px_36px_rgba(74,58,32,0.3)]"
            style={{ transform: 'rotate(-0.5deg)' }}
          >
            <span className="sheet-stamp !text-gold-deep !border-gold-deep/70" style={{ transform: 'rotate(3deg)' }}>
              书写中
            </span>
            <LiveStreamingRenderer rawText={streamingText} />
          </article>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>
    </div>

    {showJump && (
      <button
        type="button"
        onClick={jumpToLatest}
        className="btn-ghost scene-enter absolute bottom-4 right-5 z-20 !border-gold-deep/60 !bg-ink-2/95 !text-gold shadow-[0_8px_20px_rgba(74,58,32,0.3)]"
      >
        <ArrowDown className="h-3.5 w-3.5" />
        回到最新一页
      </button>
    )}
    </div>
  );
};

// 一页记载:一次决断与其掀起的波澜
function DeedSheet({
  turn,
  isLatest,
  tilt,
  onSelectCharacter,
}: {
  turn: StoryTurn;
  isLatest: boolean;
  tilt: number;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const [isThinkOpen, setIsThinkOpen] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<{ entity: EntityInfo; x: number; y: number } | null>(null);

  // 名词考据:海蓝点线 + 悬浮旁注
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
      const showEntityCard = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        setHoveredEntity({
          entity: entityToHover,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
        });
      };
      const sharedProps = {
        key: `entity_${keyCounter++}`,
        onMouseEnter: (event: React.MouseEvent<HTMLElement>) => showEntityCard(event.currentTarget),
        onMouseLeave: () => setHoveredEntity(null),
      };

      if (entityToHover.category === 'character' && entityToHover.characterId) {
        parts.push(
          <button
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
          </button>
        );
      } else {
        parts.push(<span {...sharedProps} className="lore-term">{matchedKeyword}</span>);
      }

      remaining = remaining.substring(earliestIndex + matchedKeyword.length);
    }

    return parts;
  };

  return (
    <article
      className={`scene-enter relative border bg-ink-2 px-7 py-7 md:px-10 md:py-8 ${
        isLatest
          ? 'border-hairline-bright shadow-[0_18px_44px_rgba(74,58,32,0.36)]'
          : 'border-hairline shadow-[0_12px_28px_rgba(74,58,32,0.24)]'
      }`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* 朱红日期章 */}
      <span className="sheet-stamp" style={{ transform: `rotate(${tilt > 0 ? -4 : 4}deg)` }}>
        {turn.gameDate || '征服历 298 AC · 10月15日'}
      </span>

      {/* 领主御令:页边的羽笔批注 */}
      {turn.turnNumber > 1 && turn.playerInput && (
        <p className="mb-6 flex items-start gap-2.5 border-l-2 border-rubric/60 pl-4 pr-2 pt-5 font-serif text-[13px] italic leading-relaxed text-parchment-dim">
          <Feather className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rubric/70" aria-hidden="true" />
          <span>{stripEmoji(turn.playerInput)}</span>
        </p>
      )}

      {/* 掷骰检定:一枚检验戳记 */}
      {turn.diceCheck && <DiceLedger check={turn.diceCheck} />}

      {/* 幕后暗线(可展开) */}
      {turn.think && (
        <div className="mb-5 border border-hairline bg-ink-3/40">
          <button
            onClick={() => setIsThinkOpen(!isThinkOpen)}
            className="flex w-full items-center justify-between px-3.5 py-2 text-left transition-colors hover:bg-ink-3/60"
          >
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gold">
              <span className="inline-block h-1 w-1 rotate-45 bg-current" aria-hidden="true" />
              幕后暗线 · 动机与局势演化
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-parchment-faint">
              {isThinkOpen ? '收起' : '展开'}
              {isThinkOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          </button>
          {isThinkOpen && (
            <div className="border-t border-hairline bg-ink-3/50 px-4 py-3 font-mono text-[11px] leading-relaxed text-parchment-dim whitespace-pre-wrap">
              {stripEmoji(turn.think)}
            </div>
          )}
        </div>
      )}

      {/* 正文 */}
      <div className="deed-prose font-serif">
        {turn.narrate.split(/\n+/).map((para, pIdx) => {
          const trimmed = stripEmoji(para);
          if (!trimmed) return null;
          return <p key={pIdx}>{renderHighlightedNarrate(trimmed)}</p>;
        })}
      </div>

      {/* 页脚时刻 */}
      <div className="mt-6 flex justify-end select-none">
        <span className="font-mono text-[9.5px] tracking-widest text-parchment-faint">
          录于 {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 名词旁注悬浮卡 */}
      {hoveredEntity && (
        <div
          className="panel-iron scene-enter pointer-events-none fixed z-50 w-64 -translate-x-1/2 p-3.5"
          style={{ left: `${hoveredEntity.x}px`, top: `${hoveredEntity.y}px` }}
        >
          <div className="mb-1.5 flex items-center gap-2 border-b border-hairline pb-1.5">
            {isGameIconId(hoveredEntity.entity.icon) && (
              <GameIcon icon={hoveredEntity.entity.icon} className="h-7 w-7 shrink-0" />
            )}
            <span className="font-serif text-[13px] font-bold text-gold-bright">{hoveredEntity.entity.name}</span>
            <span className="ml-auto border border-hairline bg-ink-3/60 px-1.5 py-0.5 text-[9px] tracking-wider text-parchment-faint">
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
          {hoveredEntity.entity.category === 'character' && hoveredEntity.entity.characterId && (
            <div className="mt-2 border-t border-hairline pt-2 text-[9px] tracking-wide text-gold-bright">点击姓名查看完整人物档案</div>
          )}
        </div>
      )}
    </article>
  );
}

// D20 检验戳记
function DiceLedger({ check }: { check: NonNullable<StoryTurn['diceCheck']> }) {
  const traitModifier = check.traitModifier ?? 0;
  const traitModifierBreakdown = check.traitModifierBreakdown ?? [];
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

  return (
    <div className="mb-6 select-none border border-dashed border-gold-deep/70 bg-ink-3/30 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gold">
          <Dices className="h-3.5 w-3.5" />
          {check.attributeName}检定 · DC {check.dc}
        </span>
        <span className="font-mono text-[11px] text-parchment-dim">
          出目 {check.roll}
          {' '}属性 {signed(check.attributeModifier)}
          {check.equipmentBonus !== 0 && <> 武器 {signed(check.equipmentBonus)}</>}
          {traitModifier !== 0 && <span className="text-gold-bright"> 特质 {signed(traitModifier)}</span>}
          {' '}总计 <strong className="text-parchment">{check.total}</strong>
        </span>
        <span
          className={`ml-auto font-serif text-[12px] font-black tracking-[0.3em] ${
            check.isNatural20
              ? 'text-rubric'
              : check.isNatural1
                ? 'text-rubric-deep'
                : check.success
                  ? 'text-emerald-700'
                  : 'text-rubric'
          }`}
        >
          {check.isNatural20 ? '天成' : check.isNatural1 ? '溃败' : check.success ? '得手' : '落空'}
        </span>
      </div>
      {traitModifierBreakdown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-hairline pt-2 font-mono text-[9.5px] text-parchment-faint">
          {traitModifierBreakdown.map((item) => (
            <span key={`${item.traitId}-${item.value}`} className="border border-hairline px-1.5 py-0.5">
              {item.name} {signed(item.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 实时流式渲染器:隐藏 XML 标签,呈现现场书写的文字
function LiveStreamingRenderer({ rawText }: { rawText: string }) {
  const safeRawText = stripEmoji(rawText);
  if (!safeRawText) {
    return (
      <div className="typing-cursor font-serif text-[13px] italic text-parchment-faint">
        羽笔蘸墨,正要落纸……
      </div>
    );
  }

  // 提取正在输出的 think 片段
  let liveThink = '';
  const thinkMatch = safeRawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    liveThink = thinkMatch[1].trim();
  }

  // 清洗标签用于即时正文阅读
  let cleanNarrate = safeRawText
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/<\/?(?:narrate|speak|branch|state_cmd)[^>]*>/gi, '')
    .trim();

  return (
    <div className="flex flex-col gap-4">
      {liveThink && (
        <div className="border border-hairline bg-ink-3/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-gold">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-current" />
            暗线推演中
          </div>
          <p className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-parchment-dim">{liveThink}</p>
        </div>
      )}
      <div className="deed-prose typing-cursor whitespace-pre-wrap font-serif">
        {cleanNarrate || (liveThink ? '正在措辞……' : safeRawText)}
      </div>
    </div>
  );
}
