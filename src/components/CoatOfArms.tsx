import React from 'react';
import { getGameIconPath } from './GameIcon';
import {
  CoatOfArmsDesign,
  HERALDRY_EMBLEMS,
  HeraldryPattern,
  HeraldryShield,
} from '../data/heraldry';

const SHIELD_CLIPS: Record<HeraldryShield, string> = {
  heater: 'polygon(8% 3%, 92% 3%, 92% 58%, 82% 76%, 50% 98%, 18% 76%, 8% 58%)',
  kite: 'polygon(10% 3%, 90% 3%, 88% 56%, 72% 78%, 50% 100%, 28% 78%, 12% 56%)',
  round: 'polygon(8% 3%, 92% 3%, 94% 58%, 84% 78%, 64% 94%, 50% 100%, 36% 94%, 16% 78%, 6% 58%)',
  spanish: 'polygon(5% 3%, 95% 3%, 95% 68%, 82% 84%, 50% 100%, 18% 84%, 5% 68%)',
};

function getFieldBackground(pattern: HeraldryPattern, primary: string, secondary: string): string {
  switch (pattern) {
    case 'perPale': return `linear-gradient(90deg, ${primary} 0 50%, ${secondary} 50% 100%)`;
    case 'perFess': return `linear-gradient(180deg, ${primary} 0 50%, ${secondary} 50% 100%)`;
    case 'quarterly': return `conic-gradient(${primary} 0 25%, ${secondary} 0 50%, ${primary} 0 75%, ${secondary} 0)`;
    case 'bend': return `linear-gradient(135deg, ${primary} 0 38%, ${secondary} 38% 62%, ${primary} 62% 100%)`;
    case 'chevron': return `linear-gradient(145deg, transparent 0 42%, ${secondary} 42% 58%, transparent 58%), linear-gradient(215deg, transparent 0 42%, ${secondary} 42% 58%, transparent 58%), ${primary}`;
    default: return primary;
  }
}

interface CoatOfArmsProps {
  design: CoatOfArmsDesign;
  className?: string;
  muted?: boolean;
}

export const CoatOfArms: React.FC<CoatOfArmsProps> = ({ design, className = '', muted = false }) => {
  const emblem = HERALDRY_EMBLEMS.find((entry) => entry.id === design.emblem) ?? HERALDRY_EMBLEMS[0];
  const emblemUrl = getGameIconPath(emblem.icon);
  const clipPath = SHIELD_CLIPS[design.shield];

  return (
    <div
      className={`relative aspect-[0.82] bg-[#b88b45] drop-shadow-[0_5px_9px_rgba(0,0,0,0.65)] ${className}`}
      style={{ clipPath, opacity: muted ? 0.16 : 1 }}
      role="img"
      aria-label={`${emblem.label}家族纹章`}
    >
      <div
        className="absolute inset-[4%] overflow-hidden"
        style={{ clipPath, background: getFieldBackground(design.pattern, design.primaryColor, design.secondaryColor) }}
      >
        <span
          className="absolute inset-[19%] block"
          style={{
            backgroundColor: design.emblemColor,
            WebkitMaskImage: `url(${emblemUrl})`,
            maskImage: `url(${emblemUrl})`,
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.65))',
          }}
        />
        <span className="absolute inset-0 border border-white/10 pointer-events-none" />
      </div>
    </div>
  );
};
