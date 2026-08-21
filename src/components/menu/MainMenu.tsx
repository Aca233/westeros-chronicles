import React, { useEffect, useRef, useState } from 'react';
import { AmbientCanvas } from '../AmbientCanvas';
import { useGameStore } from '../../store/useGameStore';
import { NewGameScreen } from './NewGameScreen';
import { LoadGameScreen } from './LoadGameScreen';

const TITLE = '维斯特洛';
const CJK_DIGITS = '零一二三四五六七八九';

/** 年份转汉字竖读:298 → 二九八 */
function toCjkDigits(value: number): string {
  return String(value).split('').map((d) => CJK_DIGITS[Number(d)] ?? d).join('');
}

/**
 * 标题屏:游戏的正门。
 * 巨幅衬线题名逐字显影,毛笔「编年史」落款,朱印钤下;
 * 竖排铜件菜单依次浮出,方向键可巡行,回车落定;
 * 点击任意处可跳过开场动画,直接落定终态。
 */
const TitleView: React.FC = () => {
  const saveSlots = useGameStore((state) => state.saveSlots);
  const slotActionError = useGameStore((state) => state.slotActionError);
  const continueGame = useGameStore((state) => state.continueGame);
  const setMenuView = useGameStore((state) => state.setMenuView);
  const openSettings = useGameStore((state) => state.openSettings);
  const menuRef = useRef<HTMLDivElement>(null);
  const [skipped, setSkipped] = useState(false);

  const latest = saveSlots[0];

  // 方向键在菜单项之间巡行
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      e.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      buttons[index === -1 ? 0 : (index + step + buttons.length) % buttons.length].focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className={`hero-stage relative flex-1 select-none ${skipped ? 'menu-skip' : ''}`}
      role="presentation"
      onClick={() => setSkipped(true)}
    >
      <span className="hero-ghost" aria-hidden="true">CHRONICLE</span>

      <span className="hero-side hero-side--left hidden md:block" aria-hidden="true">
        征服历{toCjkDigits(298)}年 · 凛冬将至
      </span>
      <span className="hero-side hero-side--right hidden md:block" aria-hidden="true">
        A GAME OF THRONES · VOLUME I
      </span>

      <p className="hero-eyebrow eyebrow">A Game of Thrones · Roleplay Chronicle</p>

      <h1 className="hero-title font-serif" aria-label="维斯特洛">
        {TITLE.split('').map((char, index) => (
          <span
            key={char + index}
            className="hero-char"
            style={{ '--d': `${380 + index * 115}ms` } as React.CSSProperties}
            aria-hidden="true"
          >
            {char}
          </span>
        ))}
      </h1>

      <div className="hero-byline">
        <span className="hero-brush">编年史</span>
        <span className="seal-stamp hero-seal" aria-hidden="true">史</span>
      </div>

      <div className="hero-rule" aria-hidden="true" />

      <div ref={menuRef} className="menu-list relative z-10 mt-9 flex flex-col items-center gap-2.5">
        <button
          type="button"
          className="menu-entry font-serif text-[15px] font-bold tracking-[0.42em]"
          style={{ '--d': '1.8s' } as React.CSSProperties}
          disabled={!latest}
          onClick={() => void continueGame()}
        >
          <span>继续传奇</span>
          {latest && (
            <span className="menu-entry-note">
              {latest.name} · {latest.dateLabel} · 第 {latest.turnCount} 回合{latest.isGameOver ? ' · 已落幕' : ''}
            </span>
          )}
        </button>
        <button
          type="button"
          className="menu-entry font-serif text-[15px] font-bold tracking-[0.42em]"
          style={{ '--d': '1.9s' } as React.CSSProperties}
          onClick={() => setMenuView('new')}
        >
          <span>开创新局</span>
        </button>
        <button
          type="button"
          className="menu-entry font-serif text-[15px] font-bold tracking-[0.42em]"
          style={{ '--d': '2s' } as React.CSSProperties}
          onClick={() => setMenuView('load')}
        >
          <span>读取存档</span>
          {saveSlots.length > 1 && <span className="menu-entry-note">共 {saveSlots.length} 段传奇存续</span>}
        </button>
        <button
          type="button"
          className="menu-entry font-serif text-[15px] font-bold tracking-[0.42em]"
          style={{ '--d': '2.1s' } as React.CSSProperties}
          onClick={openSettings}
        >
          <span>设置</span>
          <span className="menu-entry-note">大模型 API · 渡鸦网络</span>
        </button>
        {slotActionError && (
          <p className="max-w-[78vw] pt-1 text-center font-serif text-[11px] leading-relaxed text-rubric-bright">
            {slotActionError}
          </p>
        )}
      </div>

      <p className="menu-footnote absolute bottom-5 left-0 right-0 text-center text-[10px] tracking-[0.34em] text-parchment-faint">
        凛冬将至 · WINTER IS COMING · 测试纪元
      </p>
    </div>
  );
};

/** 主菜单外壳:管理标题屏 / 开局界面 / 读取存档三幕。 */
export const MainMenu: React.FC = () => {
  const menuView = useGameStore((state) => state.menuView);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-ink text-parchment">
      <AmbientCanvas />
      <div className="grain" aria-hidden="true" />
      {menuView === 'title' && <TitleView />}
      {menuView === 'new' && <NewGameScreen />}
      {menuView === 'load' && <LoadGameScreen />}
    </div>
  );
};

export default MainMenu;
