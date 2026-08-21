import type { EquipmentPosition } from '../features/items/types';

export type NpcLoadoutAgeGroup = 'infant' | 'child' | 'adult';

export interface NpcLoadoutSlot {
  id: string;
  definitionId: string;
  position: EquipmentPosition;
}

export interface NpcLoadoutTemplate {
  id: string;
  name: string;
  ageGroup: NpcLoadoutAgeGroup;
  slots: NpcLoadoutSlot[];
}

const garment = (definitionId: string): NpcLoadoutSlot => ({ id: 'garment', definitionId, position: { group: 'torso', layer: 'garment' } });
const armor = (definitionId: string): NpcLoadoutSlot => ({ id: 'armor', definitionId, position: { group: 'torso', layer: 'armor' } });
const outerwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'outerwear', definitionId, position: { group: 'torso', layer: 'outerwear' } });
const legwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'legwear', definitionId, position: { group: 'legs', layer: 'legwear' } });
const footwear = (definitionId: string): NpcLoadoutSlot => ({ id: 'footwear', definitionId, position: { group: 'legs', layer: 'footwear' } });
const head = (definitionId: string): NpcLoadoutSlot => ({ id: 'head', definitionId, position: { group: 'head' } });
const mainhand = (definitionId: string): NpcLoadoutSlot => ({ id: 'mainhand', definitionId, position: { group: 'mainhand' } });
const offhand = (definitionId: string): NpcLoadoutSlot => ({ id: 'offhand', definitionId, position: { group: 'offhand' } });
const accessory = (definitionId: string, index: 0 | 1 | 2 = 0): NpcLoadoutSlot => ({ id: `accessory_${index}`, definitionId, position: { group: 'accessories', index } });

export { garment, armor, outerwear, legwear, footwear, head, mainhand, offhand, accessory };

const templates: NpcLoadoutTemplate[] = [
  // 年龄段专用模板
  { id: 'infant', name: '婴儿襁褓装束', ageGroup: 'infant', slots: [garment('clothing.infant_swaddling_wrap')] },
  { id: 'child_noble', name: '贵族儿童日常装束', ageGroup: 'child', slots: [garment('clothing.child_noble_wool_robe'), legwear('legwear.child_wool_leggings'), footwear('footwear.child_soft_shoes')] },
  { id: 'child_common', name: '平民儿童日常装束', ageGroup: 'child', slots: [garment('clothing.child_common_linen_shirt'), legwear('legwear.child_common_rough_pants'), footwear('footwear.child_straw_shoes')] },
  { id: 'child', name: '儿童常规装束', ageGroup: 'child', slots: [garment('clothing.child_wool_tunic'), legwear('legwear.child_wool_leggings'), footwear('footwear.child_soft_shoes')] },
  { id: 'common_woman', name: '寻常女性日常装束', ageGroup: 'adult', slots: [garment('clothing.common_wool_dress'), legwear('legwear.common_linen_petticoat'), footwear('footwear.leather_turnshoes')] },
  { id: 'southern_lady', name: '南方贵族女性日常装束', ageGroup: 'adult', slots: [garment('clothing.southern_noble_gown'), legwear('legwear.common_linen_petticoat'), footwear('footwear.crownlands_court_soft_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'young_northern_noble', name: '北境少年贵族日常装束', ageGroup: 'child', slots: [garment('clothing.northern_wool_tunic'), legwear('legwear.northern_wool_breeches'), footwear('footwear.northern_riding_boots'), outerwear('clothing.northern_fur_cloak')] },
  { id: 'young_reach_noble', name: '河湾少女贵族日常装束', ageGroup: 'child', slots: [garment('clothing.reach_floral_embroidered_gown'), legwear('legwear.reach_silk_underskirt'), footwear('footwear.reach_velvet_slippers'), outerwear('clothing.reach_gauze_shawl')] },
  { id: 'young_pentos_noble', name: '潘托斯少年贵族日常装束', ageGroup: 'child', slots: [garment('clothing.pentos_silk_robe'), legwear('legwear.light_linen_trousers'), footwear('footwear.pentos_soft_shoes')] },
  { id: 'young_nights_watch', name: '守夜人少年事务官装束', ageGroup: 'child', slots: [garment('clothing.nights_watch_steward_robe'), legwear('legwear.nights_watch_steward_pants'), footwear('footwear.nights_watch_thick_steward_boots')] },

  // 北境
  { id: 'northern_noble', name: '北境贵族日常装束', ageGroup: 'adult', slots: [garment('clothing.northern_wool_tunic'), legwear('legwear.northern_wool_breeches'), footwear('footwear.northern_riding_boots'), outerwear('clothing.northern_fur_cloak')] },
  { id: 'northern_lady', name: '北境贵妇日常裙装', ageGroup: 'adult', slots: [garment('clothing.northern_thick_dress'), legwear('legwear.northern_wool_breeches'), footwear('footwear.northern_wool_lined_boots'), outerwear('clothing.northern_wolf_collar_cloak')] },
  { id: 'northern_common', name: '北境平民日常装束', ageGroup: 'adult', slots: [garment('clothing.northern_coarse_tunic'), legwear('legwear.northern_coarse_trousers'), footwear('footwear.northern_thick_leather_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'northern_hunter', name: '北境猎手与斥候装束', ageGroup: 'adult', slots: [garment('clothing.northern_leather_hunting_jerkin'), legwear('legwear.tight_coarse_trousers'), footwear('footwear.woodland_durable_boots'), outerwear('clothing.windproof_oilcloth_cloak')] },

  // 河间地
  { id: 'riverlands_noble', name: '河间地贵族日常装束', ageGroup: 'adult', slots: [garment('clothing.riverlands_two_tone_doublet'), legwear('legwear.sturdy_travel_trousers'), footwear('footwear.riverlands_riding_boots'), outerwear('clothing.riverlands_trimmed_wool_cloak')] },
  { id: 'riverlands_common', name: '河间地平民日常装束', ageGroup: 'adult', slots: [garment('clothing.riverlands_coarse_linen_shirt'), legwear('legwear.plain_linen_trousers'), footwear('footwear.leather_turnshoes')] },

  // 谷地
  { id: 'vale_noble', name: '谷地贵族日常装束', ageGroup: 'adult', slots: [garment('clothing.vale_embroidered_falcon_tunic'), legwear('legwear.vale_tight_wool_trousers'), footwear('footwear.vale_falcon_buckle_boots'), outerwear('clothing.vale_light_blue_wool_cloak')] },
  { id: 'vale_common', name: '谷地平民与山民装束', ageGroup: 'adult', slots: [garment('clothing.vale_mountain_clan_tunic'), legwear('legwear.vale_thick_wrapped_trousers'), footwear('footwear.vale_mountain_climbing_boots')] },

  // 西境
  { id: 'westerlands_noble', name: '西境贵族华美织锦服', ageGroup: 'adult', slots: [garment('clothing.westerlands_crimson_doublet'), legwear('legwear.westerlands_tailored_trousers'), footwear('footwear.westerlands_gilded_boots'), outerwear('clothing.westerlands_crimson_gold_cloak')] },
  { id: 'westerlands_common', name: '西境平民与工匠装束', ageGroup: 'adult', slots: [garment('clothing.westerlands_miner_tunic'), legwear('legwear.westerlands_thick_work_pants'), footwear('footwear.westerlands_miner_boots')] },

  // 河湾地
  { id: 'reach_noble', name: '河湾地贵族丝绸锦服', ageGroup: 'adult', slots: [garment('clothing.reach_silk_doublet'), legwear('legwear.reach_fine_wool_breeches'), footwear('footwear.reach_embroidered_soft_boots'), outerwear('clothing.reach_emerald_satin_cloak')] },
  { id: 'reach_lady', name: '河湾地贵妇繁花长裙', ageGroup: 'adult', slots: [garment('clothing.reach_floral_embroidered_gown'), legwear('legwear.reach_silk_underskirt'), footwear('footwear.reach_velvet_slippers'), outerwear('clothing.reach_gauze_shawl')] },
  { id: 'reach_common', name: '河湾地平民轻便装束', ageGroup: 'adult', slots: [garment('clothing.reach_light_linen_tunic'), legwear('legwear.reach_pale_linen_trousers'), footwear('footwear.leather_turnshoes')] },

  // 风暴地
  { id: 'stormlands_noble', name: '风暴地贵族皮革长衫', ageGroup: 'adult', slots: [garment('clothing.stormlands_leather_vest_tunic'), legwear('legwear.stormlands_heavy_wool_breeches'), footwear('footwear.stormlands_all_weather_boots'), outerwear('clothing.stormlands_rainproof_wool_cloak')] },
  { id: 'stormlands_common', name: '风暴地平民防雨装束', ageGroup: 'adult', slots: [garment('clothing.stormlands_sturdy_wool_tunic'), legwear('legwear.stormlands_rough_wool_trousers'), footwear('footwear.stormlands_thick_short_boots')] },

  // 王领与宫廷
  { id: 'crownlands_courtier', name: '君临廷臣天鹅绒华服', ageGroup: 'adult', slots: [garment('clothing.crownlands_velvet_doublet'), legwear('legwear.crownlands_fine_wool_trousers'), footwear('footwear.crownlands_court_soft_boots'), outerwear('clothing.crownlands_satin_trimmed_cloak')] },
  { id: 'crownlands_common', name: '王领寻常平民装束', ageGroup: 'adult', slots: [garment('clothing.crownlands_common_tunic'), legwear('legwear.crownlands_common_pants'), footwear('footwear.leather_turnshoes')] },
  { id: 'southern_noble', name: '南方通用贵族装束', ageGroup: 'adult', slots: [garment('clothing.southern_noble_doublet'), legwear('legwear.sturdy_travel_trousers'), footwear('footwear.sturdy_travel_boots'), outerwear('clothing.plain_wool_cloak')] },
  { id: 'southern_common', name: '南方通用平民装束', ageGroup: 'adult', slots: [garment('clothing.common_linen_tunic'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },

  // 御林铁卫
  { id: 'kingsguard_daily', name: '御林铁卫白袍日常装束', ageGroup: 'adult', slots: [garment('clothing.kingsguard_white_tunic'), legwear('legwear.kingsguard_white_breeches'), footwear('footwear.kingsguard_polished_white_boots'), outerwear('clothing.kingsguard_white_cloak')] },
  { id: 'kingsguard_duty', name: '御林铁卫值勤装束', ageGroup: 'adult', slots: [garment('clothing.kingsguard_white_tunic'), armor('armor.kingsguard_white_scale'), legwear('legwear.kingsguard_white_breeches'), footwear('footwear.kingsguard_polished_white_boots'), outerwear('clothing.kingsguard_white_cloak'), mainhand('weapon.castle_steel_longsword')] },

  // 多恩
  { id: 'dornish_noble', name: '多恩贵族流金丝袍', ageGroup: 'adult', slots: [garment('clothing.dornish_flowing_silk_robe'), legwear('legwear.light_linen_trousers'), footwear('footwear.dornish_sandals'), outerwear('clothing.dornish_sun_veil_sash')] },
  { id: 'dornish_common', name: '多恩平民透气装束', ageGroup: 'adult', slots: [garment('clothing.dornish_breathable_linen_shirt'), legwear('legwear.dornish_sand_trousers'), footwear('footwear.dornish_woven_straw_sandals')] },
  { id: 'dornish', name: '多恩沙地旅行装束', ageGroup: 'adult', slots: [garment('clothing.dornish_desert_wraps'), legwear('legwear.light_linen_trousers'), footwear('footwear.dornish_sandals')] },

  // 铁群岛
  { id: 'ironborn_noble', name: '铁群岛领主海豹皮装', ageGroup: 'adult', slots: [garment('clothing.ironborn_seal_skin_coat'), legwear('legwear.ironborn_sturdy_wool_pants'), footwear('footwear.ironborn_sea_boots'), outerwear('clothing.ironborn_thick_wool_cloak')] },
  { id: 'ironborn_raider', name: '铁民水手装束', ageGroup: 'adult', slots: [garment('clothing.ironborn_oiled_cloth_tunic'), legwear('legwear.ironborn_loose_sailor_pants'), footwear('footwear.ironborn_sea_boots')] },
  { id: 'ironborn', name: '铁民厚羊毛装束', ageGroup: 'adult', slots: [garment('clothing.ironborn_wool_coat'), legwear('legwear.sturdy_travel_trousers'), footwear('footwear.ironborn_sea_boots'), outerwear('clothing.plain_wool_cloak')] },

  // 长城与守夜人
  { id: 'nights_watch_ranger', name: '守夜人游骑兵加厚黑衣', ageGroup: 'adult', slots: [garment('clothing.nights_watch_thick_uniform'), legwear('legwear.nights_watch_wool_trousers'), footwear('footwear.nights_watch_patrol_boots'), outerwear('clothing.black_winter_cloak')] },
  { id: 'nights_watch_steward', name: '守夜人事务官黑长衫', ageGroup: 'adult', slots: [garment('clothing.nights_watch_steward_robe'), legwear('legwear.nights_watch_steward_pants'), footwear('footwear.nights_watch_thick_steward_boots')] },
  { id: 'nights_watch', name: '守夜人常规值勤装束', ageGroup: 'adult', slots: [garment('clothing.nights_watch_uniform'), legwear('legwear.nights_watch_wool_trousers'), footwear('footwear.nights_watch_patrol_boots'), outerwear('clothing.black_winter_cloak')] },

  // 塞外
  { id: 'beyond_the_wall_freefolk', name: '塞外自由民毛皮装束', ageGroup: 'adult', slots: [garment('clothing.beyond_the_wall_fur_garment'), legwear('legwear.beyond_the_wall_fur_leggings'), footwear('footwear.beyond_the_wall_snow_boots')] },

  // 职业与特殊身份
  { id: 'maester', name: '学士灰袍与项圈', ageGroup: 'adult', slots: [garment('clothing.maester_robe'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes'), accessory('jewelry.maester_metal_collar', 0)] },
  { id: 'septon', name: '七神教士素袍与圣牌', ageGroup: 'adult', slots: [garment('clothing.septon_robe'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes'), accessory('keepsake.septon_wooden_seven_star', 0)] },
  { id: 'silent_sister', name: '静默姐妹灰袍与蒙面巾', ageGroup: 'adult', slots: [garment('clothing.silent_sister_robe'), legwear('legwear.silent_sister_grey_breeches'), footwear('footwear.silent_sister_simple_shoes'), head('headwear.silent_sister_hood')] },
  { id: 'knight_daily', name: '骑士日常骑乘便装', ageGroup: 'adult', slots: [garment('clothing.knight_riding_shirt'), legwear('legwear.knight_riding_breeches'), footwear('footwear.knight_riding_leather_boots')] },
  { id: 'city_watch_duty', name: '都城守卫金袍与轻甲', ageGroup: 'adult', slots: [garment('clothing.city_watch_mail_shirt'), armor('armor.city_watch_breastplate'), legwear('legwear.city_watch_thick_pants'), footwear('footwear.city_watch_steel_capped_boots'), outerwear('clothing.city_watch_gold_cloak'), mainhand('weapon.castle_steel_longsword')] },
  { id: 'merchant_wealthy', name: '富商与总督华美锦袍', ageGroup: 'adult', slots: [garment('clothing.merchant_velvet_damask_robe'), legwear('legwear.merchant_jacquard_trousers'), footwear('footwear.merchant_gemmed_slippers'), outerwear('clothing.merchant_luxurious_fur_cloak')] },
  { id: 'generic', name: '通用日常装束', ageGroup: 'adult', slots: [garment('clothing.common_linen_tunic'), legwear('legwear.plain_wool_breeches'), footwear('footwear.leather_turnshoes')] },
];

export const NPC_LOADOUT_TEMPLATES: Readonly<Record<string, NpcLoadoutTemplate>> = Object.fromEntries(
  templates.map((template) => [template.id, template]),
);
