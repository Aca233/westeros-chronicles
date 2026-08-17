import React from 'react';

/** 侧面轮廓:朝左的贵族胸像(中性,适用于所有人物) */
const BUST_PATH = [
  'M 100 28',
  'C 122 28 136 40 140 54',   // 颅顶至后脑
  'C 143 70 138 86 128 96',   // 后颅收向颈窝
  'C 126 99 126 102 128 106', // 颈窝
  'C 136 116 152 128 164 138',// 斜方肌
  'C 170 143 173 146 174 150',// 肩外缘
  'L 174 200',
  'L 28 200',
  'L 28 164',
  'C 36 148 56 130 74 116',   // 胸前上行
  'C 79 111 81 106 79 100',   // 喉部内凹
  'C 77 96 74 95 71 94',      // 颌下
  'C 66 92 64 90 65 86',      // 颏
  'C 66 83 68 82 67 79',      // 下唇
  'C 65 77 66 75 68 73',      // 上唇
  'C 69 70 61 69 59 66',      // 鼻底内收
  'C 56 62 56 60 59 57',      // 鼻尖(最左点)
  'C 62 53 66 51 70 50',      // 鼻梁上行
  'C 74 44 84 32 100 28',     // 眉弓至前额
  'Z',
].join(' ');

/**
 * 铸币肖像:串珠币缘 + 侧面胸像 + 雕版刻线。
 * 颜色全部由 CSS 变量驱动,昼夜双主题自适应。
 */
export const CameoPortrait: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 200 200" className={`cameo ${className}`} aria-hidden="true">
    <defs>
      <linearGradient id="cameo-ink" x1="0" y1="0" x2="0.9" y2="1">
        <stop offset="0%" className="cameo-bust-stop-1" />
        <stop offset="100%" className="cameo-bust-stop-2" />
      </linearGradient>
      <pattern id="cameo-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="5" className="cameo-hatch-line" />
      </pattern>
      <clipPath id="cameo-clip">
        <path d={BUST_PATH} />
      </clipPath>
      <filter id="cameo-emboss" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.35" />
      </filter>
    </defs>

    {/* 币缘:外环、串珠、内场 */}
    <circle cx="100" cy="100" r="95" className="cameo-rim-outer" />
    <circle cx="100" cy="100" r="89" className="cameo-rim-bead" />
    <circle cx="100" cy="100" r="84" className="cameo-field" />

    {/* 胸像浮雕 + 刻线 + 烛光 */}
    <g clipPath="url(#cameo-clip)">
      <path d={BUST_PATH} className="cameo-bust" filter="url(#cameo-emboss)" />
      <path d={BUST_PATH} className="cameo-bust-hatch" />
      {/* 雕版细节:发纹与披风褶皱 */}
      <g className="cameo-engrave">
        <path d="M 104 40 C 116 48 122 60 121 74" />
        <path d="M 112 36 C 126 46 132 60 131 78" />
        <path d="M 120 34 C 134 44 140 58 139 74" />
        <path d="M 58 200 C 66 172 84 156 110 148" />
        <path d="M 76 200 C 82 178 96 164 118 156" />
      </g>
      <ellipse cx="86" cy="58" rx="34" ry="26" className="cameo-sheen" />
    </g>

    {/* 内场发丝线 */}
    <circle cx="100" cy="100" r="84" className="cameo-field-line" />
  </svg>
);

export default CameoPortrait;
