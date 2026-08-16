import React, { useEffect, useRef, useState } from 'react';
import { Dices, Hourglass, Send, X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { stripEmoji } from '../services/textSanitizer';
import type { DiceMode } from '../services/dicePolicy';
import { GameIcon, getGearIconId } from './GameIcon';

const DICE_MODES: ReadonlyArray<{ id: DiceMode; label: string; title: string }> = [
  { id: 'auto', label: '自动判断', title: '程序先判断行动是否可行、是否存在真实阻力与失败后果,再根据伤势、环境、准备和协助调整 DC' },
  { id: 'force', label: '强制检定', title: '为当前可行行动强制进行 D20 检定' },
  { id: 'narrative', label: '叙事行动', title: '不进行任何隐藏 D20,只按人物与局势叙事' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const ActionDock: React.FC = () => {
  const {
    gameState,
    isStreaming,
    submitAction,
    pendingEquipmentActions,
    cancelEquipmentAction,
  } = useGameStore();
  const [customInput, setCustomInput] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>('auto');
  const inputRef = useRef<HTMLInputElement>(null);
  const latestTurn = gameState.turns[gameState.turns.length - 1];
  const branches = latestTurn ? latestTurn.branches : [];

  // 回合落定后自动聚焦命令行,下一道御令即刻可书
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && !gameState.isGameOver) {
      inputRef.current?.focus();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, gameState.isGameOver]);

  // 数字键 1-6 直接落子决断分支(输入框聚焦时不劫持)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key < '1' || e.key > '6') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const idx = Number(e.key) - 1;
      const branch = branches[idx];
      if (!branch || isStreaming || gameState.isGameOver) return;
      e.preventDefault();
      void submitAction(branch, diceMode);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [branches, isStreaming, gameState.isGameOver, diceMode, submitAction]);

  const handleBranchClick = (branchText: string) => {
    if (isStreaming || gameState.isGameOver) return;
    void submitAction(branchText, diceMode);
  };

  const handleCustomSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customInput.trim() || isStreaming || gameState.isGameOver) return;
    void submitAction(customInput.trim(), diceMode);
    setCustomInput('');
  };

  if (gameState.isGameOver) {
    return (
      <footer className="relative z-20 shrink-0 select-none border-t-4 border-double border-rubric/50 bg-ink-3 px-6 py-8 text-center">
        <p className="eyebrow !text-rubric">传奇终结</p>
        <p className="mt-3 font-serif text-lg font-black tracking-[0.2em] text-parchment">领主陨落</p>
        <p className="mx-auto mt-2 max-w-md font-serif text-xs leading-relaxed text-parchment-dim">
          {gameState.deathReason || '生命终结,你的血脉与野心留在了维斯特洛的历史中。'}
        </p>
      </footer>
    );
  }

  const SubmitIcon = diceMode === 'narrative' ? Send : diceMode === 'force' ? Dices : Hourglass;
  const submitLabel = diceMode === 'narrative' ? '口述此行' : diceMode === 'force' ? '掷骰而行' : '下令';

  return (
    <footer className="relative z-20 shrink-0 border-t-4 border-double border-hairline-bright bg-gradient-to-b from-ink-3 to-ink-2 px-4 pb-3 pt-2.5 shadow-[0_-10px_30px_rgba(74,58,32,0.18)] md:px-8">
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
        {/* 决断纸条 */}
        {branches.length > 0 && !isStreaming && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-0.5 select-none">
              <span className="eyebrow">决断</span>
              <span className="hairline flex-1" />
              <span className="font-mono text-[9px] tracking-widest text-parchment-faint">
                {branches.length} 条道途
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {branches.map((branch, index) => (
                <button
                  key={index}
                  onClick={() => handleBranchClick(branch)}
                  disabled={isStreaming}
                  title={`按 ${index + 1} 快捷选择`}
                  className="choice-slab group flex items-center gap-3.5"
                >
                  <span className="choice-numeral shrink-0">{ROMAN[index] ?? `${index + 1}`}</span>
                  <span className="font-serif text-[13px] leading-relaxed md:text-[13.5px]">{branch}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 待披挂的装备 */}
        {pendingEquipmentActions.length > 0 && (
          <section
            data-equipment-queue
            className="border border-gold-deep/50 bg-ink-2/70 px-3 py-2.5"
            aria-label="待执行装备"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wide text-gold-bright">
                待披挂 <span className="font-mono text-[9px] text-parchment-faint">×{pendingEquipmentActions.length}</span>
              </span>
              <span className="text-[9px] leading-snug text-parchment-faint">下一次对话生成成功后生效</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {pendingEquipmentActions.map((action) => (
                <div
                  key={action.id}
                  className="flex min-w-0 items-center gap-2 border border-hairline bg-ink-3/40 px-2 py-1.5"
                >
                  <GameIcon icon={getGearIconId(action.icon, action.slot)} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1 font-serif">
                    <p className="truncate text-[10.5px] font-semibold text-parchment">{action.itemName}</p>
                    <p className="truncate text-[9px] text-parchment-faint">来自 {action.sourceLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelEquipmentAction(action.id)}
                    disabled={isStreaming}
                    title={isStreaming ? '本次对话完成后才能继续调整队列' : `取消穿上${action.itemName}`}
                    aria-label={`取消穿上${action.itemName}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center border border-hairline text-parchment-dim transition-colors hover:border-rubric/60 hover:text-rubric disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 写字台:检定规制、羽笔与火漆,一行收束 */}
        <form onSubmit={handleCustomSubmit} className="flex items-stretch gap-2">
          <div className="flex items-stretch border border-hairline-bright/70 bg-ink-2/50" role="group" aria-label="D20 检定模式">
            {DICE_MODES.map((mode) => {
              const ModeIcon = mode.id === 'auto' ? Hourglass : mode.id === 'force' ? Dices : Send;
              const active = diceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDiceMode(mode.id)}
                  title={`${mode.label}:${mode.title}`}
                  aria-pressed={active}
                  className={`flex w-9 items-center justify-center border-r border-hairline transition-colors last:border-r-0 ${
                    active
                      ? 'bg-gold-deep/20 text-gold-bright'
                      : 'text-parchment-faint hover:bg-ink-2/70 hover:text-parchment-dim'
                  }`}
                >
                  <ModeIcon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <input
            ref={inputRef}
            id="command-input"
            type="text"
            value={customInput}
            onChange={(event) => setCustomInput(stripEmoji(event.target.value))}
            disabled={isStreaming}
            placeholder={isStreaming ? '局势推演中,静候回音……' : '口述你的行动(按 / 聚焦,按 1-6 选分支)……'}
            className="command-input flex-1"
          />
          <button
            type="submit"
            disabled={!customInput.trim() || isStreaming}
            className="btn-decree shrink-0"
          >
            <SubmitIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{submitLabel}</span>
          </button>
        </form>
      </div>
    </footer>
  );
};
