import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Settings, RotateCcw, Feather, Moon, Sun, Calendar } from 'lucide-react';

export const Header: React.FC = () => {
  const { gameState, isStreaming, openSettings, openCreator, openTvTimeline, undoTurn } = useGameStore();
  const { currentYear, currentMonth, currentDay, currentSeason, turnCount } = gameState;

  // 日间 = 羊皮纸;夜间 = 烛下牛皮卷
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
    <header className="header-enter relative z-30 flex h-12 shrink-0 select-none items-center justify-between border-b border-hairline/60 px-4 md:px-6">
      {/* 阅读进度:一缕金线 */}
      <div className="scroll-progress" aria-hidden="true" />

      {/* 左:印章与题名 */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="seal-stamp h-7 w-7 shrink-0 text-[12px]" aria-hidden="true">史</span>
        <h1 className="whitespace-nowrap font-serif text-[14px] font-black tracking-[0.16em] text-parchment">
          维斯特洛编年史
        </h1>
        <span className="eyebrow hidden !text-[9px] lg:inline">A Game of Thrones · Roleplay</span>
      </div>

      {/* 中:纪年(小字,黄铜,菱花相隔) */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-3 md:flex">
        <span className="font-display text-[12px] font-bold tracking-[0.12em] text-gold">
          {currentYear} AC
        </span>
        <span className="h-1 w-1 rotate-45 bg-hairline-bright/70" aria-hidden="true" />
        <span className="text-[10.5px] text-parchment-faint">
          {currentMonth || 10}月{currentDay || 15}日
        </span>
        <span className="h-1 w-1 rotate-45 bg-hairline-bright/70" aria-hidden="true" />
        <span className="font-serif text-[11px] italic text-parchment-dim">{currentSeason}</span>
        <span className="h-1 w-1 rotate-45 bg-hairline-bright/70" aria-hidden="true" />
        <span className="font-mono text-[10px] text-parchment-faint">
          回合 <strong className="font-display text-[11.5px] text-gold">{turnCount}</strong>
        </span>
      </div>

      {/* 右:铜件(无痕) */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={undoTurn}
          disabled={isStreaming || turnCount <= 1}
          className="btn-ghost"
          title="撤回上一回合的决断"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden md:inline">撤回</span>
        </button>
        <button
          onClick={openCreator}
          disabled={isStreaming}
          className="btn-ghost !text-rubric hover:!text-rubric-bright"
          title="另起新局或重塑领主"
        >
          <Feather className="h-3.5 w-3.5" />
          <span className="hidden md:inline">新局</span>
        </button>
        <button
          onClick={openTvTimeline}
          className="btn-ghost !text-gold hover:!text-gold-bright flex items-center gap-1"
          title="查看维斯特洛编年史精确时间线 (298 AC - 305 AC)"
          aria-label="编年时间线"
        >
          <Calendar className="h-3.5 w-3.5" />
          <span className="hidden lg:inline font-serif text-[11px] font-bold">编年时间线</span>
        </button>
        <button
          onClick={toggleTheme}
          className="btn-ghost !px-2"
          title={theme === 'night' ? '切换为日间(羊皮纸)' : '切换为夜间(烛光)'}
          aria-label="切换日夜间主题"
        >
          {theme === 'night' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={openSettings}
          className="btn-ghost !px-2"
          title="大模型 API 设置"
          aria-label="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
