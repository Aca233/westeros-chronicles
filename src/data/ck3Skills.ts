import type { GameIconId } from '../components/GameIcon';
import type { LordAttributes } from '../types/game';

export interface Ck3SkillDefinition {
  key: keyof LordAttributes;
  label: string;
  englishLabel: string;
  icon: GameIconId;
}

export const CK3_SKILLS: readonly Ck3SkillDefinition[] = [
  { key: 'diplomacy', label: '外交', englishLabel: 'Diplomacy', icon: 'skill-diplomacy' },
  { key: 'martial', label: '军事', englishLabel: 'Martial', icon: 'skill-martial' },
  { key: 'stewardship', label: '管理', englishLabel: 'Stewardship', icon: 'skill-stewardship' },
  { key: 'intrigue', label: '谋略', englishLabel: 'Intrigue', icon: 'skill-intrigue' },
  { key: 'learning', label: '学识', englishLabel: 'Learning', icon: 'skill-learning' },
  { key: 'prowess', label: '勇武', englishLabel: 'Prowess', icon: 'skill-prowess' },
];

export function getCk3SkillRank(value: number): string {
  if (value <= 4) return '糟糕';
  if (value <= 7) return '较差';
  if (value <= 11) return '平庸';
  if (value <= 15) return '良好';
  if (value <= 19) return '优秀';
  if (value <= 24) return '卓越';
  return '传奇';
}

export function normalizeCk3Attributes(attributes: Partial<LordAttributes>): LordAttributes {
  const isLegacyFiveSkillSave = typeof attributes.prowess !== 'number';
  const normalize = (value: number | undefined) => {
    const safeValue = Number.isFinite(value) ? Number(value) : 0;
    return isLegacyFiveSkillSave ? Math.max(0, Math.round(safeValue / 4)) : Math.max(0, Math.round(safeValue));
  };

  const martial = normalize(attributes.martial);
  return {
    diplomacy: normalize(attributes.diplomacy),
    martial,
    stewardship: normalize(attributes.stewardship),
    intrigue: normalize(attributes.intrigue),
    learning: normalize(attributes.learning),
    prowess: isLegacyFiveSkillSave ? martial : normalize(attributes.prowess),
  };
}
