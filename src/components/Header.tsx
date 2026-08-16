import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Settings, RotateCcw, Feather, Moon, Sun } from 'lucide-react';

export const Header: React.FC = () => {
  const { gameState, isStreaming, openSettings, openCreator, undoTurn } = useGameStore();
  const { currentYear, currentMonth, currentDay, currentSeason, turnCount } = gameState;

  // 日间 = 羊皮海图;夜间 = 牛皮纸棕
  const [theme, setTheme] = useState<'day' | 'night'>(() =>
    document.documentElement.dataset.theme === 'night' ? 'night' : 'day'
  );
  const toggleTheme = () => {
    const next = theme === 'night' ? 'day' : 'night';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('westeros-theme', next); } catch { /* 忽略隐私模式 */ }
  };

  return (
    <>
      {/* 图例框:题名、印章与历法,钤在桌面左上角 */}
      <div className="absolute left-5 top-5 z-30 select-none">
        <div className="border border-hairline-bright bg-ink-2/90 px-4 py-3 shadow-[0_10px_26px_rgba(74,58,32,0.3),inset_0_0_0_3px_rgba(246,239,221,0.9),inset_0_0_0_4px_rgba(168,148,106,0.6)] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="seal-stamp h-9 w-9 shrink-0 text-[15px]" aria-hidden="true">史</span>
            <div className="leading-none">
              <h1 className="whitespace-nowrap font-serif text-[15px] font-black tracking-[0.18em] text-parchment">
                维斯特洛编年史
              </h1>
              <p className="eyebrow mt-1.5">A Game of Thrones · Roleplay</p>
            </div>
          </div>
          <hr className="hairline my-2.5" aria-hidden="true" />
          {/* 黄铜仪器读数 */}
          <div className="flex items-baseline gap-3 whitespace-nowrap">
            <span className="font-display text-[12.5px] font-bold tracking-[0.12em] text-gold">
              {currentYear} AC
            </span>
            <span className="text-[10.5px] text-parchment-dim">
              {currentMonth || 10}月{currentDay || 15}日
            </span>
            <span className="font-serif text-[11px] italic text-parchment-dim">{currentSeason}</span>
            <span className="font-mono text-[10px] text-parchment-faint">
              回合 <strong className="font-display text-[12px] text-gold">{turnCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 铜件:撤回 / 新局 / 设置,散在桌面右上角 */}
      <div className="absolute right-5 top-5 z-30 flex select-none items-center gap-2">
        <button
          onClick={undoTurn}
          disabled={isStreaming || turnCount <= 1}
          className="btn-ghost !bg-ink-2/90 shadow-[0_6px_16px_rgba(74,58,32,0.22)]"
          title="撤回上一回合的决断"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden md:inline">撤回</span>
        </button>
        <button
          onClick={openCreator}
          disabled={isStreaming}
          className="btn-ghost !border-rubric/50 !bg-ink-2/90 !text-rubric shadow-[0_6px_16px_rgba(74,58,32,0.22)] hover:!border-rubric hover:!text-rubric-bright"
          title="另起新局或重塑领主"
        >
          <Feather className="h-3.5 w-3.5" />
          <span className="hidden md:inline">新局</span>
        </button>
        <button
          onClick={toggleTheme}
          className="btn-ghost !bg-ink-2/90 !px-2 shadow-[0_6px_16px_rgba(74,58,32,0.22)]"
          title={theme === 'night' ? '切换为日间(羊皮海图)' : '切换为夜间(牛皮纸)'}
          aria-label="切换日夜间主题"
        >
          {theme === 'night' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={openSettings}
          className="btn-ghost !bg-ink-2/90 !px-2 shadow-[0_6px_16px_rgba(74,58,32,0.22)]"
          title="大模型 API 设置"
          aria-label="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </>
  );
};
