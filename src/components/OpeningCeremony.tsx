import React from 'react';
import { useGameStore } from '../store/useGameStore';

const TITLE = '维斯特洛';
const CJK_DIGITS = '零一二三四五六七八九';

/** 年份转汉字竖读:298 → 二九八 */
function toCjkDigits(value: number): string {
  return String(value).split('').map((d) => CJK_DIGITS[Number(d)] ?? d).join('');
}

/**
 * 开场仪式:卷宗尚未落笔时,整幅舞台让给题名。
 * 巨幅衬线活字逐字显影,毛笔「编年史」落款,朱印随后钤下。
 */
export const OpeningCeremony: React.FC = () => {
  const { currentYear, currentSeason } = useGameStore((state) => state.gameState);

  return (
    <div className="hero-stage select-none" role="presentation">
      <span className="hero-ghost" aria-hidden="true">CHRONICLE</span>

      <span className="hero-side hero-side--left hidden md:block" aria-hidden="true">
        征服历{toCjkDigits(currentYear)}年 · {currentSeason || '秋季'}
      </span>
      <span className="hero-side hero-side--right hidden md:block" aria-hidden="true">
        A GAME OF THRONES · VOLUME I
      </span>

      <p className="hero-eyebrow eyebrow">A Game of Thrones · Roleplay Chronicle</p>

      <h2 className="hero-title font-serif" aria-label="维斯特洛">
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
      </h2>

      <div className="hero-byline">
        <span className="hero-brush">编年史</span>
        <span className="seal-stamp hero-seal" aria-hidden="true">史</span>
      </div>

      <div className="hero-rule" aria-hidden="true" />

      <p className="hero-poem font-serif">
        七国静默,渡鸦未至。
        <br />
        你的第一道御令,将决定这段传奇从何写起。
      </p>

      <div className="hero-hint">
        <span className="hero-hint-line" aria-hidden="true" />
        <span className="eyebrow !text-rubric">于下方御令栏落笔</span>
      </div>
    </div>
  );
};

export default OpeningCeremony;
