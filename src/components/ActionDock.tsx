import React, { useEffect, useRef, useState } from 'react';
import { Dices, Hourglass, Send, X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { stripEmoji } from '../services/textSanitizer';
import type { DiceMode } from '../services/dicePolicy';
import { ItemImage } from './items/ItemImage';

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
    pendingItemActions,
    cancelItemAction,
  } = useGameStore();
  const [customInput, setCustomInput] = useState('');
  const [diceMode, setDiceMode] = useState<DiceMode>('auto');
  const inputRef = useRef<HTMLInputElement>(null);
  const latestTurn = gameState.turns[gameState.turns.length - 1];
  const branches = latestTurn ? latestTurn.branches : [];

  // 回合落定后自动聚焦命令行
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && !gameState.isGameOver) {
      inputRef.current?.focus();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, gameState.isGameOver]);

  // 数字键 1-6 直接落子决断分支
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
      <footer className="relative z-20 shrink-0 select-none border-t border-rubric/40 px-6 py-12 text-center">
        <p className="eyebrow !text-rubric">传奇终结</p>
        <p className="mt-4 font-brush text-5xl leading-tight text-rubric md:text-6xl">领主陨落</p>
        <div className="identity-rule mx-auto mt-5 max-w-[240px]" aria-hidden="true">
          <span className="divider-gem" />
        </div>
        <p className="mx-auto mt-5 max-w-md font-serif text-xs leading-relaxed text-parchment-dim">
          {gameState.deathReason || '生命终结,你的血脉与野心留在了维斯特洛的历史中。'}
        </p>
      </footer>
    );
  }

  const SubmitIcon = diceMode === 'narrative' ? Send : diceMode === 'force' ? Dices : Hourglass;

  return (
    <footer className="dock-enter relative z-20 shrink-0 px-5 pb-5 pt-2 md:px-6">
      <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-4">
        {/* 待执行物品动作:下一次成功对话后原子生效 */}
        {pendingItemActions.length > 0 && (
          <section data-item-action-queue aria-label="待执行物品动作" className="select-none">
            <p className="mb-1.5 text-[10px] tracking-[0.18em] text-gold">
              待执行 ×{pendingItemActions.length}
              <span className="ml-2 font-normal normal-case tracking-normal text-parchment-faint">下一次对话生成成功后生效</span>
            </p>
            <ul className="flex flex-col gap-1">
              {pendingItemActions.map((action) => (
                <li key={action.id} className="flex items-center gap-2 font-serif text-[11px] text-parchment-dim">
                  <ItemImage image={action.image} alt="" className="h-5 w-5 shrink-0" />
                  <span className="truncate">{action.itemName}</span>
                  <span className="truncate text-[9.5px] text-parchment-faint">{action.label}</span>
                  <button
                    type="button"
                    onClick={() => cancelItemAction(action.id)}
                    disabled={isStreaming}
                    title={isStreaming ? '本次对话完成后才能继续调整队列' : `取消${action.label}${action.itemName}`}
                    aria-label={`取消${action.label}${action.itemName}`}
                    className="ml-auto text-parchment-faint transition-colors hover:text-rubric disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 决断:无框列表,朱红序数,墨痕扫过 */}
        {branches.length > 0 && !isStreaming && (
          <nav aria-label="决断分支" className="select-none">
            {branches.map((branch, index) => (
              <button
                key={index}
                onClick={() => handleBranchClick(branch)}
                disabled={isStreaming}
                title={`按 ${index + 1} 快捷选择`}
                className="branch-row"
              >
                <span className="branch-numeral">{ROMAN[index] ?? `${index + 1}`}</span>
                <span className="font-serif text-[13.5px] leading-relaxed">{branch}</span>
              </button>
            ))}
          </nav>
        )}

        {/* 御令:墨线自画 + 火漆钤印 */}
        <form onSubmit={handleCustomSubmit} className="flex items-end gap-3">
          <span className="shrink-0 pb-2.5 font-serif text-[13px] font-bold tracking-[0.2em] text-gold">御令</span>
          <div className={`command-line${isStreaming ? ' is-streaming' : ''}`}>
            <input
              ref={inputRef}
              id="command-input"
              type="text"
              value={customInput}
              onChange={(event) => setCustomInput(stripEmoji(event.target.value))}
              disabled={isStreaming}
              placeholder={isStreaming ? '局势推演中,静候回音……' : '口述你的行动(按 / 聚焦,按 1-6 选分支)……'}
              className="command-input"
            />
          </div>
          <div className="flex items-center gap-1 pb-1" role="group" aria-label="D20 检定模式">
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
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 ${
                    active ? 'scale-110 text-gold' : 'text-parchment-faint hover:text-parchment-dim'
                  }`}
                >
                  <ModeIcon className="h-3.5 w-3.5" />
                  {active && (
                    <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rotate-45 bg-gold" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={!customInput.trim() || isStreaming}
            className="btn-decree shrink-0"
            title={diceMode === 'narrative' ? '口述此行' : diceMode === 'force' ? '掷骰而行' : '下令'}
            aria-label="提交御令"
          >
            <SubmitIcon className="h-4 w-4" />
          </button>
        </form>
      </div>
    </footer>
  );
};
