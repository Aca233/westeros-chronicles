import React from 'react';

export const GAME_ICON_PATHS = {
  'house-stark': '/assets/game-icons/house-stark.webp',
  'house-lannister': '/assets/game-icons/house-lannister.webp',
  'house-targaryen': '/assets/game-icons/house-targaryen.webp',
  'house-baratheon': '/assets/game-icons/house-baratheon.webp',
  'house-tyrell': '/assets/game-icons/house-tyrell.webp',
  'house-martell': '/assets/game-icons/house-martell.webp',
  'house-arryn': '/assets/game-icons/house-arryn.webp',
  'house-greyjoy': '/assets/game-icons/house-greyjoy.webp',
  'house-tully': '/assets/game-icons/house-tully.webp',
  'gear-helmet': '/assets/game-icons/gear-helmet.webp',
  'gear-armor': '/assets/game-icons/gear-armor.webp',
  'gear-sword': '/assets/game-icons/gear-sword.webp',
  'gear-cloak': '/assets/game-icons/gear-cloak.webp',
  'gear-chainmail': '/assets/game-icons/gear-chainmail.webp',
  'artifact-dragon-egg': '/assets/game-icons/artifact-dragon-egg.webp',
  'artifact-dragonglass': '/assets/game-icons/artifact-dragonglass.webp',
  'artifact-crown': '/assets/game-icons/artifact-crown.webp',
  'artifact-goblet': '/assets/game-icons/artifact-goblet.webp',
  'artifact-winter-rose': '/assets/game-icons/artifact-winter-rose.webp',
  'artifact-white-book': '/assets/game-icons/artifact-white-book.webp',
  'artifact-ruby': '/assets/game-icons/artifact-ruby.webp',
  'artifact-glass-candle': '/assets/game-icons/artifact-glass-candle.webp',
  'artifact-dragon-skull': '/assets/game-icons/artifact-dragon-skull.webp',
  'artifact-krakenhorn': '/assets/game-icons/artifact-krakenhorn.webp',
  'trait-dragon': '/assets/game-icons/trait-dragon.webp',
  'companion-wolf': '/assets/game-icons/companion-wolf.webp',
  'location-winterfell': '/assets/game-icons/location-winterfell.webp',
  'location-sunspear': '/assets/game-icons/location-sunspear.webp',
  'location-hightower': '/assets/game-icons/location-hightower.webp',
  'skill-diplomacy': '/assets/game-icons/skill-diplomacy.webp',
  'skill-martial': '/assets/game-icons/skill-martial.webp',
  'skill-stewardship': '/assets/game-icons/skill-stewardship.webp',
  'skill-intrigue': '/assets/game-icons/skill-intrigue.webp',
  'skill-learning': '/assets/game-icons/skill-learning.webp',
  'skill-prowess': '/assets/game-icons/skill-prowess.webp',
  'trait-brave': '/assets/game-icons/trait-brave.webp',
  'trait-craven': '/assets/game-icons/trait-craven.webp',
  'trait-honest': '/assets/game-icons/trait-honest.webp',
  'trait-deceitful': '/assets/game-icons/trait-deceitful.webp',
  'trait-ambitious': '/assets/game-icons/trait-ambitious.webp',
  'trait-content': '/assets/game-icons/trait-content.webp',
  'trait-gregarious': '/assets/game-icons/trait-gregarious.webp',
  'trait-shy': '/assets/game-icons/trait-shy.webp',
  'trait-education-diplomacy': '/assets/game-icons/trait-education-diplomacy.webp',
  'trait-education-martial': '/assets/game-icons/trait-education-martial.webp',
  'trait-education-stewardship': '/assets/game-icons/trait-education-stewardship.webp',
  'trait-education-intrigue': '/assets/game-icons/trait-education-intrigue.webp',
  'trait-education-learning': '/assets/game-icons/trait-education-learning.webp',
  'trait-education-prowess': '/assets/game-icons/trait-education-prowess.webp',
  'trait-intellect': '/assets/game-icons/trait-intellect.webp',
  'trait-physique': '/assets/game-icons/trait-physique.webp',
  'trait-beauty': '/assets/game-icons/trait-beauty.webp',
  'trait-frail': '/assets/game-icons/trait-frail.webp',
  'trait-wounded': '/assets/game-icons/trait-wounded.webp',
  'trait-infirm': '/assets/game-icons/trait-infirm.webp',
} as const;

export type TraitGameIconId = `trait-${string}`;
export type GameIconId = keyof typeof GAME_ICON_PATHS | TraitGameIconId;

const SLOT_DEFAULTS: Record<string, GameIconId> = {
  head: 'gear-helmet',
  torso: 'gear-armor',
  mainhand: 'gear-sword',
  offhand: 'gear-sword',
  legs: 'gear-chainmail',
  cloak: 'gear-cloak',
  accessory: 'artifact-ruby',
};

const HOUSE_NAME_TO_ICON: Record<string, GameIconId> = {
  stark: 'house-stark',
  lannister: 'house-lannister',
  targaryen: 'house-targaryen',
  baratheon: 'house-baratheon',
  tyrell: 'house-tyrell',
  martell: 'house-martell',
  arryn: 'house-arryn',
  greyjoy: 'house-greyjoy',
  tully: 'house-tully',
  史塔克家族: 'house-stark',
  兰尼斯特家族: 'house-lannister',
  坦格利安家族: 'house-targaryen',
  拜拉席恩家族: 'house-baratheon',
  提利尔家族: 'house-tyrell',
  马泰尔家族: 'house-martell',
  艾林家族: 'house-arryn',
  葛雷乔伊家族: 'house-greyjoy',
  徒利家族: 'house-tully',
};

export function isGameIconId(value: unknown): value is GameIconId {
  return typeof value === 'string' && (value in GAME_ICON_PATHS || value.startsWith('trait-'));
}

export function getGameIconPath(icon: GameIconId): string {
  return icon in GAME_ICON_PATHS
    ? GAME_ICON_PATHS[icon as keyof typeof GAME_ICON_PATHS]
    : `/assets/game-icons/${icon}.webp`;
}

export function getHouseIconId(value: string): GameIconId {
  if (isGameIconId(value) && value.startsWith('house-')) return value;
  return HOUSE_NAME_TO_ICON[value] ?? HOUSE_NAME_TO_ICON[value.toLowerCase()] ?? 'artifact-crown';
}

export function getGearIconId(icon: unknown, slot: string): GameIconId {
  return isGameIconId(icon) ? icon : SLOT_DEFAULTS[slot] ?? 'gear-armor';
}

export function getInventoryIconId(category: string, name = ''): GameIconId | null {
  if (name.includes('龙蛋')) return 'artifact-dragon-egg';
  if (name.includes('龙晶') || name.includes('黑曜石')) return 'artifact-dragonglass';
  if (name.includes('红宝石') || name.includes('宝石')) return 'artifact-ruby';
  if (category === '文书') return 'artifact-white-book';
  if (category === '奇物') return 'artifact-glass-candle';
  return null;
}

export interface GameIconProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  icon: GameIconId;
  decorative?: boolean;
}

export const GameIcon: React.FC<GameIconProps> = ({
  icon,
  decorative = true,
  alt = '',
  className = '',
  ...props
}) => (
  <img
    src={getGameIconPath(icon)}
    alt={decorative ? '' : alt}
    aria-hidden={decorative || undefined}
    draggable={false}
    className={`object-contain select-none ${className}`}
    {...props}
  />
);
