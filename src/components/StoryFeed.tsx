import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { StoryTurn } from '../types/game';
import { WESTEROS_ENTITIES, EntityInfo } from '../data/entities';
import { CalendarDays, ChevronDown, ChevronRight, CircleCheckBig, CircleX, Dices, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import { GameIcon, isGameIconId } from './GameIcon';
import { stripEmoji } from '../services/textSanitizer';

export const StoryFeed: React.FC = () => {
  const { gameState, isStreaming, streamingText } = useGameStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新文本
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.turns.length, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        {/* 回合列表 */}
        {gameState.turns.map((turn, index) => (
          <StoryTurnCard
            key={turn.id}
            turn={turn}
            isLatest={index === gameState.turns.length - 1}
          />
        ))}

        {/* 正在流式生成中的动态打字机预览卡片 */}
        {isStreaming && (
          <div className="bg-[#14110e] border border-[#c89d54] rounded-xl p-5 md:p-6 shadow-2xl got-card-texture animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#33271d]/60 text-xs select-none">
              <div className="flex items-center gap-2 text-[#e5be6c] font-serif font-bold">
                <Sparkles className="w-4 h-4 animate-spin text-[#c89d54]" />
                <span>大模型正在实时流式推演维斯特洛剧情……</span>
              </div>
              <span className="text-[10px] text-[#8a652a] font-mono animate-pulse">STREAMING</span>
            </div>

            <LiveStreamingRenderer rawText={streamingText} />
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
};

// 单个回合叙事卡片
function StoryTurnCard({ turn, isLatest }: { turn: StoryTurn; isLatest: boolean }) {
  const [isThinkOpen, setIsThinkOpen] = useState(false);
  const [hoveredEntity, setHoveredEntity] = useState<{ entity: EntityInfo; x: number; y: number } | null>(null);

  // 实体高亮与 Tooltip 渲染（纯净小说排版，不在正文中插入图形符号，仅保留典雅金色下划线交互）
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

      // 添加前缀纯文本
      if (earliestIndex > 0) {
        parts.push(remaining.substring(0, earliestIndex));
      }

      // 添加高亮实体（不插入破坏句意和版面的 图形符号，仅使用典雅原木金色与点状下划线）
      const entityToHover = matchedEntity;
      parts.push(
        <span
          key={`entity_${keyCounter++}`}
          className="text-[#f5d796] hover:text-[#fff1ba] border-b border-[#c89d54]/40 hover:border-[#f5d796] cursor-pointer transition-colors duration-150 font-medium pb-[1px]"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredEntity({
              entity: entityToHover,
              x: rect.left + rect.width / 2,
              y: rect.bottom + 8,
            });
          }}
          onMouseLeave={() => setHoveredEntity(null)}
        >
          {matchedKeyword}
        </span>
      );

      remaining = remaining.substring(earliestIndex + matchedKeyword.length);
    }

    return parts;
  };

  return (
    <article
      className={`bg-[#14110e] border ${
        isLatest ? 'border-[#c89d54]/40 shadow-xl' : 'border-[#33271d]'
      } rounded-xl p-5 md:p-6 transition-all duration-300 got-card-texture relative`}
    >
      {/* 回合编号与玩家行动条 */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#33271d]/60 text-xs select-none">
        <div className="flex items-center gap-2">
          <span className="bg-[#241e17] text-[#c89d54] px-2 py-0.5 rounded font-mono font-bold border border-[#33271d]">
            Turn {turn.turnNumber}
          </span>
          <span className="text-[#a89f91] font-serif">
            {turn.turnNumber === 1 ? '开局纪事' : `【领主决断】: ${stripEmoji(turn.playerInput)}`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-serif text-[#8a652a]">
          <span className="text-[#c89d54] font-medium font-serif flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            {turn.gameDate || '征服历 298 AC · 10月15日'}
          </span>
          <span className="text-[#665c52] font-mono text-[10px]">
            {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* D20 掷骰检定记录 (若本回合触发) */}
      {turn.diceCheck && (() => {
        const check = turn.diceCheck;
        const traitModifier = check.traitModifier ?? 0;
        const traitModifierBreakdown = check.traitModifierBreakdown ?? [];
        const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

        return (
          <div
            className={`mb-4 rounded-lg border p-2.5 text-xs font-serif ${
              check.success
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                : 'bg-red-950/30 border-red-800/50 text-red-200'
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <Dices className="mt-0.5 h-4 w-4 shrink-0 text-[#c89d54]" />
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono">
                  <strong className="font-serif">{check.attributeName}检定</strong>
                  <span>DC {check.dc}</span>
                  <span>出目 {check.roll}</span>
                  <span>属性 {signed(check.attributeModifier)}</span>
                  {check.equipmentBonus !== 0 && <span>武器 {signed(check.equipmentBonus)}</span>}
                  {traitModifier !== 0 && (
                    <span className="font-bold text-[#f5d796]">特质 {signed(traitModifier)}</span>
                  )}
                  <span>总点数 <strong>{check.total}</strong></span>
                </div>
              </div>
              <span
                className={`w-fit shrink-0 rounded px-2 py-0.5 text-[11px] font-bold inline-flex items-center gap-1 ${
                  check.success ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                }`}
              >
                {check.isNatural20 ? (
                  <><Sparkles className="w-3 h-3" /> 大成功</>
                ) : check.isNatural1 ? (
                  <><ShieldAlert className="w-3 h-3" /> 大失败</>
                ) : check.success ? (
                  <><CircleCheckBig className="w-3 h-3" /> 成功</>
                ) : (
                  <><CircleX className="w-3 h-3" /> 失败</>
                )}
              </span>
            </div>
            {traitModifierBreakdown.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-current/15 pt-2 text-[10px]">
                <span className="mr-1 text-[#a89f91]">特质明细</span>
                {traitModifierBreakdown.map((item) => (
                  <span key={`${item.traitId}-${item.value}`} className="rounded bg-black/25 px-1.5 py-0.5">
                    {item.name} {signed(item.value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 思考推演抽屉 */}
      {turn.think && (
        <div className="mb-4 bg-[#0e0c0a]/90 rounded-lg border border-[#c89d54]/30 overflow-hidden text-xs shadow-inner">
          <button
            onClick={() => setIsThinkOpen(!isThinkOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[#c89d54] hover:text-[#fff1ba] hover:bg-[#1a1612] transition-colors"
          >
            <div className="flex items-center gap-1.5 font-serif font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#c89d54]" />
              <span>幕后推演过程 (暗线动机与局势演化)</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#8a7b6c] font-mono">
              <span>{isThinkOpen ? '点击收起' : '点击展开'}</span>
              {isThinkOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
          </button>
          {isThinkOpen && (
            <div className="px-3.5 py-3 text-[#b3a898] font-mono leading-relaxed bg-[#070605]/90 whitespace-pre-wrap border-t border-[#241e17]">
              {stripEmoji(turn.think)}
            </div>
          )}
        </div>
      )}

      {/* 长篇史诗小说叙事流 */}
      <div className="text-[#e6ded1] font-serif space-y-3.5 text-[15px] md:text-base leading-7 md:leading-8 text-left">
        {turn.narrate.split(/\n+/).map((para, pIdx) => {
          const trimmed = stripEmoji(para);
          if (!trimmed) return null;
          return (
            <p key={pIdx} className="tracking-normal text-left">
              {renderHighlightedNarrate(trimmed)}
            </p>
          );
        })}
      </div>

      {/* Hover Entity Tooltip 悬浮卡片 */}
      {hoveredEntity && (
        <div
          className="fixed z-50 bg-[#1c1813] border border-[#c89d54] rounded-lg p-3 shadow-2xl text-xs w-64 pointer-events-none transform -translate-x-1/2 got-card-texture animate-in fade-in zoom-in-95 duration-150"
          style={{ left: `${hoveredEntity.x}px`, top: `${hoveredEntity.y}px` }}
        >
          <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-[#33271d]">
            {isGameIconId(hoveredEntity.entity.icon) && (
              <GameIcon icon={hoveredEntity.entity.icon} className="w-7 h-7 shrink-0 drop-shadow-md" />
            )}
            <span className="font-bold text-[#e5be6c] font-serif">{hoveredEntity.entity.name}</span>
            <span className="text-[10px] text-[#a89f91] ml-auto bg-black/40 px-1.5 py-0.5 rounded border border-[#33271d]">
              {hoveredEntity.entity.tag}
            </span>
          </div>
          <p className="text-[#e6ded1] text-[11px] font-serif leading-relaxed mb-1.5">
            {hoveredEntity.entity.description}
          </p>
          {hoveredEntity.entity.extraStats && (
            <div className="text-[10px] text-[#c89d54] font-mono font-semibold pt-1 border-t border-[#33271d]/50">
              <Zap className="w-3 h-3 inline mr-1" />{hoveredEntity.entity.extraStats}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// 实时流式输出渲染器 (隐藏生硬的 XML 标签，优雅呈现长篇小说打字机内容)
function LiveStreamingRenderer({ rawText }: { rawText: string }) {
  const safeRawText = stripEmoji(rawText);
  if (!safeRawText) {
    return (
      <div className="text-xs text-[#a89f91] font-serif italic typing-cursor">
        正在与远端模型建立流式通道……
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
    <div className="flex flex-col gap-3 font-serif">
      {/* 实时推演思考框 */}
      {liveThink && (
        <div className="bg-black/40 rounded-lg p-2.5 border border-[#33271d] text-xs text-[#a89f91] font-mono leading-relaxed">
          <div className="flex items-center gap-1 text-[#c89d54] font-bold text-[10px] uppercase mb-1">
            <Sparkles className="w-3 h-3 text-[#c89d54]" />
            <span>AI 实时推演脉络:</span>
          </div>
          <p className="whitespace-pre-wrap">{liveThink}</p>
        </div>
      )}

      {/* 实时正文 */}
      <div className="text-sm md:text-[15px] leading-relaxed text-[#e6ded1] whitespace-pre-wrap typing-cursor">
        {cleanNarrate || (liveThink ? '正在组织正文词句……' : safeRawText)}
      </div>
    </div>
  );
}

