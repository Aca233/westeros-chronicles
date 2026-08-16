import type { GameIconId } from '../components/GameIcon';

export type HeraldryShield = 'heater' | 'kite' | 'round' | 'spanish';
export type HeraldryPattern = 'solid' | 'perPale' | 'perFess' | 'quarterly' | 'bend' | 'chevron';
export type HeraldryEmblem = 'wolf' | 'lion' | 'dragon' | 'stag' | 'rose' | 'sun' | 'falcon' | 'kraken' | 'trout';

export interface CoatOfArmsDesign {
  shield: HeraldryShield;
  pattern: HeraldryPattern;
  primaryColor: string;
  secondaryColor: string;
  emblem: HeraldryEmblem;
  emblemColor: string;
}

export const HERALDRY_SHIELDS: ReadonlyArray<{ id: HeraldryShield; label: string }> = [
  { id: 'heater', label: '骑士盾' },
  { id: 'kite', label: '鸢形盾' },
  { id: 'round', label: '圆底盾' },
  { id: 'spanish', label: '方首盾' },
];

export const HERALDRY_PATTERNS: ReadonlyArray<{ id: HeraldryPattern; label: string }> = [
  { id: 'solid', label: '纯色' },
  { id: 'perPale', label: '左右分割' },
  { id: 'perFess', label: '上下分割' },
  { id: 'quarterly', label: '四分区' },
  { id: 'bend', label: '斜带' },
  { id: 'chevron', label: '人字纹' },
];

export const HERALDRY_EMBLEMS: ReadonlyArray<{ id: HeraldryEmblem; label: string; icon: GameIconId }> = [
  { id: 'wolf', label: '冰原狼', icon: 'house-stark' },
  { id: 'lion', label: '雄狮', icon: 'house-lannister' },
  { id: 'dragon', label: '巨龙', icon: 'house-targaryen' },
  { id: 'stag', label: '雄鹿', icon: 'house-baratheon' },
  { id: 'rose', label: '玫瑰', icon: 'house-tyrell' },
  { id: 'sun', label: '贯日长枪', icon: 'house-martell' },
  { id: 'falcon', label: '猎鹰', icon: 'house-arryn' },
  { id: 'kraken', label: '海怪', icon: 'house-greyjoy' },
  { id: 'trout', label: '跃鳟', icon: 'house-tully' },
];

export const HERALDRY_COLORS = [
  '#121820', '#31201c', '#5f1822', '#8b1f2d', '#a95d22', '#c39a39',
  '#d8c38b', '#e1ded3', '#315c3a', '#426f77', '#315a8a', '#553a70',
] as const;

export const DEFAULT_COAT_OF_ARMS: CoatOfArmsDesign = {
  shield: 'heater',
  pattern: 'perPale',
  primaryColor: '#5f1822',
  secondaryColor: '#121820',
  emblem: 'wolf',
  emblemColor: '#d8c38b',
};
