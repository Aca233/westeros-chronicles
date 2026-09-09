import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lightbulb, Send, Square } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { stripEmoji } from '../services/textSanitizer';
import { normalizeBranchOptions } from '../services/branchOptions';
import { PendingConcerns } from './PendingConcerns';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const ActionDock: React.FC = () => {
  const {
    gameState,
    isStreaming,
    turnStage,
    submitAction,
    cancelCurrentTurn,
  } = useGameStore();
  const [customInput, setCustomInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestTurn = gameState.turns[gameState.turns.length - 1];
  const branches = normalizeBranchOptions(latestTurn?.branches ?? []);

  useEffect(() => {
    const handler = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (!text || isStreaming || gameState.isGameOver) return;
      setCustomInput(stripEmoji(text));
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('agot:prefill-action', handler);
    return () => window.removeEventListener('agot:prefill-action', handler);
  }, [gameState.isGameOver, isStreaming]);

  const handleBranchClick = (branchText: string) => {
    if (isStreaming || gameState.isGameOver) return;
    setCustomInput(branchText);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleCustomSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!customInput.trim() || isStreaming || gameState.isGameOver) return;
    const submittedText = customInput.trim();
    const previousTurn = gameState.turnCount;
    await submitAction(submittedText, 'auto');
    if (useGameStore.getState().gameState.turnCount > previousTurn) setCustomInput('');
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

  const stageLabel = {
    idle: '',
    resolving: '正在解析行动',
    settling: '正在结算世界',
    narrating: '正在书写正文',
  }[turnStage];

  return (
    <footer className="dock-enter relative z-20 shrink-0 px-5 pb-5 pt-2 md:px-6">
      <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-4">
        <div className="lg:hidden"><PendingConcerns /></div>
        {/* 建议默认退居幕后，只在玩家需要灵感时展开。 */}
        {branches.length > 0 && !isStreaming && (
          <div className="select-none">
            <button
              type="button"
              onClick={() => setShowSuggestions((value) => !value)}
              className="flex items-center gap-2 font-serif text-[11px] tracking-[0.08em] text-parchment-dim transition-colors hover:text-gold"
              aria-expanded={showSuggestions}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              需要灵感时查看 {branches.length} 个可能方向
              <ChevronDown className={`h-3.5 w-3.5 transition-transform${showSuggestions ? ' rotate-180' : ''}`} />
            </button>
            {showSuggestions && (
              <nav aria-label="行动灵感" className="mt-2">
                {branches.map((branch, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleBranchClick(branch)}
                    disabled={isStreaming}
                    className="branch-row"
                  >
                    <span className="branch-numeral">{ROMAN[index] ?? `${index + 1}`}</span>
                    <span className="font-serif text-[13.5px] leading-relaxed">{branch}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}

        {/* 行动草稿：建议只预填，玩家修改后明确执行。 */}
        <form onSubmit={handleCustomSubmit} className="flex items-end gap-3">
          <label htmlFor="command-input" className="shrink-0 pb-2.5 font-serif text-[13px] font-bold tracking-[0.12em] text-gold">你的行动</label>
          <div className={`command-line${isStreaming ? ' is-streaming' : ''}`}>
            <textarea
              ref={inputRef}
              id="command-input"
              rows={2}
              value={customInput}
              onChange={(event) => setCustomInput(stripEmoji(event.target.value))}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              readOnly={isStreaming}
              placeholder={isStreaming ? `${stageLabel}，原草稿已保留……` : '写下你要做什么、怎么做、对谁说什么。Ctrl/Cmd+Enter 执行。'}
              className="command-input min-h-[3.25rem] resize-y py-2 leading-relaxed"
            />
          </div>
          {isStreaming && turnStage !== 'settling' ? (
            <button
              type="button"
              onClick={cancelCurrentTurn}
              className="btn-decree shrink-0"
              title="取消当前回合，不提交任何变化"
              aria-label="取消当前回合"
            >
              <Square className="h-3.5 w-3.5" />
              <span className="sr-only">{stageLabel}</span>
            </button>
          ) : isStreaming ? (
            <span className="flex h-9 shrink-0 items-center px-3 font-serif text-[11px] text-parchment-dim" role="status">
              {stageLabel}
            </span>
          ) : (
            <button
              type="submit"
              disabled={!customInput.trim()}
              className="btn-decree shrink-0"
              title="执行行动（Ctrl/Cmd+Enter）"
              aria-label="执行行动"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </footer>
  );
};
