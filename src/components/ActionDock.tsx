import React, { useState } from 'react';
import { AlertCircle, Clock3, Dices, Send, Sparkles, Swords, X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { stripEmoji } from '../services/textSanitizer';
import type { DiceMode } from '../services/dicePolicy';
import { GameIcon, getGearIconId } from './GameIcon';

const DICE_MODES: ReadonlyArray<{ id: DiceMode; label: string; title: string }> = [
  { id: 'auto', label: '自动判断', title: '程序先判断行动是否可行、是否存在真实阻力与失败后果，再根据伤势、环境、准备和协助调整 DC' },
  { id: 'force', label: '强制检定', title: '为当前可行行动强制进行 D20 检定' },
  { id: 'narrative', label: '叙事行动', title: '不进行任何隐藏 D20，只按人物与局势叙事' },
];

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
  const latestTurn = gameState.turns[gameState.turns.length - 1];
  const branches = latestTurn ? latestTurn.branches : [];

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
      <div className="bg-[#1a0f0e] border-t border-red-900/60 p-4 flex flex-col items-center justify-center gap-2 text-center select-none shrink-0">
        <div className="flex items-center gap-2 text-red-400 font-serif font-bold text-base">
          <AlertCircle className="w-5 h-5" />
          <span>【传奇终结 · 领主陨落】</span>
        </div>
        <p className="text-xs text-[#a89f91] max-w-md">
          {gameState.deathReason || '生命终结，您的血脉与野心留在维斯特洛的历史中。'}
        </p>
      </div>
    );
  }

  const SubmitIcon = diceMode === 'narrative' ? Send : diceMode === 'force' ? Dices : Sparkles;
  const submitLabel = diceMode === 'narrative' ? '叙事执行' : diceMode === 'force' ? '检定并执行' : '判断并执行';

  return (
    <footer className="bg-[#0e0c0a]/95 border-t border-[#33271d] px-4 md:px-8 py-3.5 flex flex-col items-center z-20 backdrop-blur-md shrink-0">
      <div className="w-full max-w-3xl flex flex-col gap-3">
        {branches.length > 0 && !isStreaming && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center text-[11px] text-[#8a652a] font-serif px-1 select-none">
              <span className="flex items-center gap-1 font-bold">
                <Swords className="w-3 h-3 text-[#c89d54]" />
                领主道途决断分支
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {branches.map((branch, index) => (
                <button
                  key={index}
                  onClick={() => handleBranchClick(branch)}
                  disabled={isStreaming}
                  className="w-full text-left text-xs md:text-sm font-serif px-3.5 py-2.5 rounded-lg bg-[#17130f] hover:bg-[#261f18] text-[#e6ded1] hover:text-[#fff1ba] border border-[#33271d] hover:border-[#c89d54]/60 transition-all duration-150 flex items-start gap-2.5 shadow-sm group active:scale-[0.99]"
                >
                  <span className="w-5 h-5 rounded bg-[#2b221a] text-[#c89d54] flex items-center justify-center font-mono text-xs font-bold shrink-0 border border-[#33271d] group-hover:border-[#c89d54]">
                    {index + 1}
                  </span>
                  <span className="leading-snug">{branch}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {pendingEquipmentActions.length > 0 && (
          <section
            data-equipment-queue
            className="rounded-lg border border-[#8a652a]/70 bg-gradient-to-r from-[#1a140e] to-[#120f0c] p-2.5 shadow-inner"
            aria-label="待执行装备"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-serif font-bold text-[#e5be6c]">
                  <Clock3 className="w-3.5 h-3.5 shrink-0" />
                  待执行装备
                  <span className="font-mono text-[9px] text-[#9c7a45]">{pendingEquipmentActions.length}</span>
                </div>
                <p className="mt-0.5 text-[9.5px] leading-snug text-[#8f8273]">
                  不会立刻改变当前穿着；下一次对话生成成功后生效，生成失败则保留。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {pendingEquipmentActions.map((action) => (
                <div
                  key={action.id}
                  className="min-w-0 flex items-center gap-2 rounded-md border border-[#3b2e20] bg-black/25 px-2 py-1.5"
                >
                  <GameIcon
                    icon={getGearIconId(action.icon, action.slot)}
                    className="w-7 h-7 shrink-0"
                  />
                  <div className="min-w-0 flex-1 font-serif">
                    <p className="truncate text-[10.5px] font-semibold text-[#e6ded1]">{action.itemName}</p>
                    <p className="truncate text-[9px] text-[#7f7162]">来自 {action.sourceLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelEquipmentAction(action.id)}
                    disabled={isStreaming}
                    title={isStreaming ? '本次对话完成后才能继续调整队列' : `取消穿上${action.itemName}`}
                    aria-label={`取消穿上${action.itemName}`}
                    className="w-6 h-6 shrink-0 rounded border border-[#493626] text-[#9b8977] hover:text-[#f0d18e] hover:border-[#8a652a] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-3 border border-[#33271d] rounded-md overflow-hidden" aria-label="D20 检定模式">
          {DICE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDiceMode(mode.id)}
              title={mode.title}
              className={`px-2 py-1.5 text-[10px] border-r last:border-r-0 border-[#33271d] transition-colors ${
                diceMode === mode.id
                  ? 'bg-[#49351f] text-[#f0d18e]'
                  : 'bg-[#15110d] text-[#887a69] hover:text-[#c9bba8]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 px-1 text-[9px] leading-snug text-[#74695c] font-serif" aria-live="polite">
          {DICE_MODES.find((mode) => mode.id === diceMode)?.title}
        </p>

        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customInput}
              onChange={(event) => setCustomInput(stripEmoji(event.target.value))}
              disabled={isStreaming}
              placeholder={isStreaming ? '正在推演剧情，请稍候……' : '自定义领主行动（简单行动不会掷骰）……'}
              className="w-full bg-[#17130f] border border-[#33271d] focus:border-[#c89d54] rounded-lg px-3.5 py-2.5 text-xs md:text-sm text-[#e6ded1] placeholder-[#665c52] font-serif outline-none shadow-inner transition-colors disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!customInput.trim() || isStreaming}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#8a652a] to-[#c89d54] hover:from-[#9c7432] hover:to-[#e5be6c] text-[#0e0c0a] font-serif font-bold text-xs md:text-sm rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <SubmitIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{submitLabel}</span>
          </button>
        </form>
      </div>
    </footer>
  );
};
