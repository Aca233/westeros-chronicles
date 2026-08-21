import type { CharacterId } from '../features/characters/types';
import type { EquipmentPosition } from '../features/items/types';
import {
  garment,
  outerwear,
  legwear,
  footwear,
  accessory,
  type NpcLoadoutSlot,
} from './npcLoadoutTemplates';

export interface NpcLoadoutOverride {
  id: string;
  templateId?: string;
  slots?: NpcLoadoutSlot[];
  clearedPositions?: EquipmentPosition[];
}

export const NPC_LOADOUT_OVERRIDES: Partial<Record<CharacterId, NpcLoadoutOverride>> = {
  // 史塔克家族与北境核心
  'agot:Stark_3': {
    id: 'eddard_stark_daily',
    templateId: 'northern_noble',
    slots: [
      garment('clothing.northern_wool_tunic'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_riding_boots'),
      outerwear('clothing.northern_fur_cloak'),
    ],
  },
  'agot:Tully_4': {
    id: 'catelyn_stark_daily',
    templateId: 'northern_lady',
    slots: [
      garment('clothing.northern_thick_dress'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_wool_lined_boots'),
      outerwear('clothing.northern_wolf_collar_cloak'),
    ],
  },
  'agot:Stark_6': {
    id: 'robb_stark_daily',
    templateId: 'young_northern_noble',
    slots: [
      garment('clothing.northern_wool_tunic'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_riding_boots'),
      outerwear('clothing.northern_fur_cloak'),
    ],
  },
  'agot:Stark_7': {
    id: 'jon_snow_daily',
    templateId: 'young_northern_noble',
    slots: [
      garment('clothing.northern_wool_tunic'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_riding_boots'),
      outerwear('clothing.plain_wool_cloak'),
    ],
  },
  'agot:Stark_8': { id: 'sansa_stark_daily', templateId: 'child_noble' },
  'agot:Stark_9': { id: 'arya_stark_daily', templateId: 'child_noble' },
  'agot:Stark_10': { id: 'bran_stark_daily', templateId: 'child_noble' },
  'agot:Stark_11': { id: 'rickon_stark_daily', templateId: 'child_noble' },
  'agot:Stark_4': {
    id: 'benjen_stark_daily',
    templateId: 'nights_watch_ranger',
    slots: [
      garment('clothing.nights_watch_thick_uniform'),
      legwear('legwear.nights_watch_wool_trousers'),
      footwear('footwear.nights_watch_patrol_boots'),
      outerwear('clothing.black_winter_cloak'),
    ],
  },
  'agot:Stark_hh_1': {
    id: 'maester_luwin_daily',
    templateId: 'maester',
    slots: [
      garment('clothing.maester_robe'),
      legwear('legwear.plain_wool_breeches'),
      footwear('footwear.leather_turnshoes'),
      accessory('jewelry.maester_metal_collar', 0),
    ],
  },
  'agot:Cassel_3': {
    id: 'rodrik_cassel_daily',
    templateId: 'northern_hunter',
    slots: [
      garment('clothing.northern_leather_hunting_jerkin'),
      legwear('legwear.tight_coarse_trousers'),
      footwear('footwear.woodland_durable_boots'),
      outerwear('clothing.plain_wool_cloak'),
    ],
  },
  'agot:Cassel_4': {
    id: 'jory_cassel_daily',
    templateId: 'northern_noble',
    slots: [
      garment('clothing.northern_wool_tunic'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_riding_boots'),
      outerwear('clothing.plain_wool_cloak'),
    ],
  },

  // 拜拉席恩王室与风暴地
  'agot:Baratheon_2': {
    id: 'robert_baratheon_daily',
    templateId: 'stormlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.stormlands_heavy_wool_breeches'),
      footwear('footwear.stormlands_all_weather_boots'),
      outerwear('clothing.stormlands_rainproof_wool_cloak'),
    ],
  },
  'agot:Baratheon_3': {
    id: 'stannis_baratheon_daily',
    templateId: 'stormlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.stormlands_heavy_wool_breeches'),
      footwear('footwear.stormlands_all_weather_boots'),
      outerwear('clothing.plain_wool_cloak'),
    ],
  },
  'agot:Baratheon_4': {
    id: 'renly_baratheon_daily',
    templateId: 'stormlands_noble',
    slots: [
      garment('clothing.reach_silk_doublet'),
      legwear('legwear.reach_fine_wool_breeches'),
      footwear('footwear.reach_embroidered_soft_boots'),
      outerwear('clothing.reach_emerald_satin_cloak'),
    ],
  },
  'agot:Baratheon_5': { id: 'joffrey_baratheon_daily', templateId: 'child_noble' },
  'agot:Baratheon_6': { id: 'myrcella_baratheon_daily', templateId: 'child_noble' },
  'agot:Baratheon_7': { id: 'tommen_baratheon_daily', templateId: 'child_noble' },
  'agot:Seaworth_1': {
    id: 'davos_seaworth_daily',
    templateId: 'stormlands_common',
    slots: [
      garment('clothing.stormlands_sturdy_wool_tunic'),
      legwear('legwear.stormlands_rough_wool_trousers'),
      footwear('footwear.stormlands_thick_short_boots'),
    ],
  },
  'agot:Melisandre_1': {
    id: 'melisandre_daily',
    templateId: 'generic',
    slots: [
      garment('clothing.dornish_flowing_silk_robe'),
      legwear('legwear.light_linen_trousers'),
      footwear('footwear.leather_turnshoes'),
    ],
  },
  'agot:Dondarrion_2': {
    id: 'beric_dondarrion_daily',
    templateId: 'stormlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.stormlands_heavy_wool_breeches'),
      footwear('footwear.stormlands_all_weather_boots'),
      outerwear('clothing.stormlands_rainproof_wool_cloak'),
    ],
  },
  'agot:Tarth_6': {
    id: 'brienne_tarth_daily',
    templateId: 'stormlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.stormlands_heavy_wool_breeches'),
      footwear('footwear.stormlands_all_weather_boots'),
    ],
  },

  // 兰尼斯特家族与西境
  'agot:Lannister_1': {
    id: 'tywin_lannister_daily',
    templateId: 'westerlands_noble',
    slots: [
      garment('clothing.westerlands_crimson_doublet'),
      legwear('legwear.westerlands_tailored_trousers'),
      footwear('footwear.westerlands_gilded_boots'),
      outerwear('clothing.westerlands_crimson_gold_cloak'),
    ],
  },
  'agot:Lannister_6': {
    id: 'cersei_lannister_daily',
    templateId: 'westerlands_noble',
    slots: [
      garment('clothing.westerlands_crimson_doublet'),
      legwear('legwear.westerlands_tailored_trousers'),
      footwear('footwear.westerlands_gilded_boots'),
      outerwear('clothing.westerlands_crimson_gold_cloak'),
    ],
  },
  'agot:Lannister_7': {
    id: 'jaime_lannister_daily',
    templateId: 'kingsguard_daily',
    slots: [
      garment('clothing.kingsguard_white_tunic'),
      legwear('legwear.kingsguard_white_breeches'),
      footwear('footwear.kingsguard_polished_white_boots'),
      outerwear('clothing.kingsguard_white_cloak'),
    ],
  },
  'agot:Lannister_8': {
    id: 'tyrion_lannister_daily',
    templateId: 'westerlands_noble',
    slots: [
      garment('clothing.westerlands_crimson_doublet'),
      legwear('legwear.westerlands_tailored_trousers'),
      footwear('footwear.westerlands_gilded_boots'),
      accessory('jewelry.tyrion_golden_ring', 0),
    ],
  },
  'agot:Clegane_3': {
    id: 'gregor_clegane_daily',
    templateId: 'westerlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.sturdy_travel_trousers'),
      footwear('footwear.sturdy_travel_boots'),
    ],
  },
  'agot:Clegane_4': {
    id: 'sandor_clegane_daily',
    templateId: 'westerlands_noble',
    slots: [
      garment('clothing.stormlands_leather_vest_tunic'),
      legwear('legwear.sturdy_travel_trousers'),
      footwear('footwear.sturdy_travel_boots'),
    ],
  },

  // 谷地与御前
  'agot:Arryn_3': {
    id: 'jon_arryn_daily',
    templateId: 'vale_noble',
    slots: [
      garment('clothing.vale_embroidered_falcon_tunic'),
      legwear('legwear.vale_tight_wool_trousers'),
      footwear('footwear.vale_falcon_buckle_boots'),
      outerwear('clothing.vale_light_blue_wool_cloak'),
      accessory('jewelry.hand_of_the_king_badge', 0),
    ],
  },
  'agot:Baelish_2': {
    id: 'petyr_baelish_daily',
    templateId: 'crownlands_courtier',
    slots: [
      garment('clothing.crownlands_velvet_doublet'),
      legwear('legwear.crownlands_fine_wool_trousers'),
      footwear('footwear.crownlands_court_soft_boots'),
      outerwear('clothing.crownlands_satin_trimmed_cloak'),
      accessory('jewelry.baelish_silver_mockingbird', 0),
    ],
  },
  'agot:Eunuch_1': {
    id: 'varys_daily',
    templateId: 'crownlands_courtier',
    slots: [
      garment('clothing.crownlands_velvet_doublet'),
      legwear('legwear.crownlands_fine_wool_trousers'),
      footwear('footwear.crownlands_court_soft_boots'),
      outerwear('clothing.crownlands_satin_trimmed_cloak'),
    ],
  },
  'agot:Pycelle_1': {
    id: 'pycelle_daily',
    templateId: 'maester',
    slots: [
      garment('clothing.maester_robe'),
      legwear('legwear.plain_wool_breeches'),
      footwear('footwear.leather_turnshoes'),
      accessory('jewelry.maester_metal_collar', 0),
    ],
  },
  'agot:Selmy_3': {
    id: 'barristan_selmy_daily',
    templateId: 'kingsguard_daily',
    slots: [
      garment('clothing.kingsguard_white_tunic'),
      legwear('legwear.kingsguard_white_breeches'),
      footwear('footwear.kingsguard_polished_white_boots'),
      outerwear('clothing.kingsguard_white_cloak'),
    ],
  },

  // 坦格利安
  'agot:Targaryen_9': {
    id: 'daenerys_targaryen_daily',
    templateId: 'young_pentos_noble',
    slots: [
      garment('clothing.pentos_silk_robe'),
      legwear('legwear.light_linen_trousers'),
      footwear('footwear.pentos_soft_shoes'),
    ],
  },
  'agot:Targaryen_8': {
    id: 'viserys_targaryen_daily',
    templateId: 'generic',
    slots: [
      garment('clothing.crownlands_velvet_doublet'),
      legwear('legwear.crownlands_fine_wool_trousers'),
      footwear('footwear.crownlands_court_soft_boots'),
    ],
  },

  // 多恩
  'agot:Martell_4': {
    id: 'doran_martell_daily',
    templateId: 'dornish_noble',
    slots: [
      garment('clothing.dornish_flowing_silk_robe'),
      legwear('legwear.light_linen_trousers'),
      footwear('footwear.dornish_sandals'),
      outerwear('clothing.dornish_sun_veil_sash'),
    ],
  },
  'agot:Martell_8': {
    id: 'oberyn_martell_daily',
    templateId: 'dornish_noble',
    slots: [
      garment('clothing.dornish_flowing_silk_robe'),
      legwear('legwear.light_linen_trousers'),
      footwear('footwear.dornish_sandals'),
    ],
  },

  // 铁群岛
  'agot:Greyjoy_5': {
    id: 'balon_greyjoy_daily',
    templateId: 'ironborn_noble',
    slots: [
      garment('clothing.ironborn_seal_skin_coat'),
      legwear('legwear.ironborn_sturdy_wool_pants'),
      footwear('footwear.ironborn_sea_boots'),
      outerwear('clothing.ironborn_thick_wool_cloak'),
    ],
  },
  'agot:Greyjoy_14': {
    id: 'theon_greyjoy_daily',
    templateId: 'northern_noble',
    slots: [
      garment('clothing.northern_wool_tunic'),
      legwear('legwear.northern_wool_breeches'),
      footwear('footwear.northern_riding_boots'),
      outerwear('clothing.plain_wool_cloak'),
    ],
  },
  'agot:Greyjoy_13': {
    id: 'asha_greyjoy_daily',
    templateId: 'ironborn_raider',
    slots: [
      garment('clothing.ironborn_oiled_cloth_tunic'),
      legwear('legwear.ironborn_loose_sailor_pants'),
      footwear('footwear.ironborn_sea_boots'),
    ],
  },

  // 长城与塞外
  'agot:Mormont_2': {
    id: 'jeor_mormont_daily',
    templateId: 'nights_watch_ranger',
    slots: [
      garment('clothing.nights_watch_thick_uniform'),
      legwear('legwear.nights_watch_wool_trousers'),
      footwear('footwear.nights_watch_patrol_boots'),
      outerwear('clothing.black_winter_cloak'),
    ],
  },
  'agot:Targaryen_120': {
    id: 'maester_aemon_daily',
    templateId: 'maester',
    slots: [
      garment('clothing.maester_robe'),
      legwear('legwear.plain_wool_breeches'),
      footwear('footwear.leather_turnshoes'),
      accessory('jewelry.maester_metal_collar', 0),
    ],
  },
  'agot:Tarly_2': {
    id: 'samwell_tarly_daily',
    templateId: 'young_nights_watch',
    slots: [
      garment('clothing.nights_watch_steward_robe'),
      legwear('legwear.nights_watch_steward_pants'),
      footwear('footwear.nights_watch_thick_steward_boots'),
    ],
  },
  'agot:Shadow_Tower_1': {
    id: 'qhorin_halfhand_daily',
    templateId: 'nights_watch_ranger',
    slots: [
      garment('clothing.nights_watch_thick_uniform'),
      legwear('legwear.nights_watch_wool_trousers'),
      footwear('footwear.nights_watch_patrol_boots'),
      outerwear('clothing.black_winter_cloak'),
    ],
  },
  'agot:Rayder_1': {
    id: 'mance_rayder_daily',
    templateId: 'beyond_the_wall_freefolk',
    slots: [
      garment('clothing.beyond_the_wall_fur_garment'),
      legwear('legwear.beyond_the_wall_fur_leggings'),
      footwear('footwear.beyond_the_wall_snow_boots'),
      outerwear('clothing.black_winter_cloak'),
    ],
  },
  'agot:Lowborn_Wildling_1': {
    id: 'ygritte_daily',
    templateId: 'beyond_the_wall_freefolk',
    slots: [
      garment('clothing.beyond_the_wall_fur_garment'),
      legwear('legwear.beyond_the_wall_fur_leggings'),
      footwear('footwear.beyond_the_wall_snow_boots'),
    ],
  },

  // 厄索斯与河湾地
  'agot:Mopatis_1': {
    id: 'illyrio_mopatis_daily',
    templateId: 'merchant_wealthy',
    slots: [
      garment('clothing.merchant_velvet_damask_robe'),
      legwear('legwear.merchant_jacquard_trousers'),
      footwear('footwear.merchant_gemmed_slippers'),
      outerwear('clothing.merchant_luxurious_fur_cloak'),
      accessory('jewelry.illyrio_gemmed_rings', 0),
    ],
  },
  'agot:Redwyne_2': {
    id: 'olenna_redwyne_daily',
    templateId: 'reach_lady',
    slots: [
      garment('clothing.reach_floral_embroidered_gown'),
      legwear('legwear.reach_silk_underskirt'),
      footwear('footwear.reach_velvet_slippers'),
      outerwear('clothing.reach_gauze_shawl'),
    ],
  },
  'agot:Tyrell_14': {
    id: 'margaery_tyrell_daily',
    templateId: 'young_reach_noble',
    slots: [
      garment('clothing.reach_floral_embroidered_gown'),
      legwear('legwear.reach_silk_underskirt'),
      footwear('footwear.reach_velvet_slippers'),
      outerwear('clothing.reach_gauze_shawl'),
    ],
  },
  'agot:Tyrell_13': {
    id: 'loras_tyrell_daily',
    templateId: 'reach_noble',
    slots: [
      garment('clothing.reach_silk_doublet'),
      legwear('legwear.reach_fine_wool_breeches'),
      footwear('footwear.reach_embroidered_soft_boots'),
      outerwear('clothing.reach_emerald_satin_cloak'),
    ],
  },
  'agot:Blackwater_1': {
    id: 'bronn_daily',
    templateId: 'generic',
    slots: [
      garment('clothing.common_linen_tunic'),
      legwear('legwear.plain_wool_breeches'),
      footwear('footwear.leather_turnshoes'),
    ],
  },
};
