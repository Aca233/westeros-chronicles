import type { EquipmentPosition } from '../features/items/types';

export type NpcLoadoutAgeGroup = 'infant' | 'child' | 'adult';

export interface NpcLoadoutSlot {
  id: string;
  definitionId: string;
  position: EquipmentPosition;
}

export interface NpcLoadoutTemplate {
  id: string;
  ageGroup: NpcLoadoutAgeGroup;
  slots: NpcLoadoutSlot[];
}

const garment = (definitionId: string): NpcLoadoutSlot => ({ id: 'garment', definitionId, position: { group: 'torso', layer: 'garment' } });
const outerwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'outerwear', definitionId, position: { group: 'torso', layer: 'outerwear' } });
const legwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'legwear', definitionId, position: { group: 'legs', layer: 'legwear' } });
const footwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'footwear', definitionId, position: { group: 'legs', layer: 'footwear' } });

const templates: NpcLoadoutTemplate[] = [
  { id: 'infant', ageGroup: 'infant', slots: [garment('clothing.infant_swaddling_wrap')] },
  { id: 'child', ageGroup: 'child', slots: [garment('clothing.child_wool_tunic'), legwear('legwear.child_wool_leggings'), footwear('footwear.child_soft_shoes')] },
  { id: 'northern_common', ageGroup: 'adult', slots: [garment('clothing.northern_wool_tunic'), legwear('legwear.northern_wool_breeches'), footwear('footwear.northern_riding_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'northern_noble', ageGroup: 'adult', slots: [garment('clothing.northern_wool_tunic'), legwear('legwear.northern_wool_breeches'), footwear('footwear.northern_riding_boots'), outerwear('clothing.northern_fur_cloak')] },
  { id: 'southern_common', ageGroup: 'adult', slots: [garment('clothing.common_linen_tunic'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },
  { id: 'southern_noble', ageGroup: 'adult', slots: [garment('clothing.southern_noble_doublet'), legwear('legwear.sturdy_travel_trousers'), footwear('footwear.sturdy_travel_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'dornish', ageGroup: 'adult', slots: [garment('clothing.dornish_desert_wraps'), legwear('legwear.light_linen_trousers'), footwear('footwear.dornish_sandals')] },
  { id: 'ironborn', ageGroup: 'adult', slots: [garment('clothing.ironborn_wool_coat'), legwear('legwear.sturdy_travel_trousers'), footwear('footwear.ironborn_sea_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'nights_watch', ageGroup: 'adult', slots: [garment('clothing.nights_watch_uniform'), legwear('legwear.nights_watch_wool_trousers'), footwear('footwear.nights_watch_patrol_boots'), outerwear('clothing.black_winter_cloak')] },
  { id: 'maester', ageGroup: 'adult', slots: [garment('clothing.maester_robe'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },
  { id: 'septon', ageGroup: 'adult', slots: [garment('clothing.septon_robe'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },
  { id: 'generic', ageGroup: 'adult', slots: [garment('clothing.common_linen_tunic'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },
];

export const NPC_LOADOUT_TEMPLATES: Readonly<Record<string, NpcLoadoutTemplate>> = Object.fromEntries(
  templates.map((template) => [template.id, template]),
);
