import { ITEM_CATALOG } from './itemDefinitions';
import { createItemInstance, createEmptyItemSystem, validateItemSystem } from '../features/items/state';
import type {
  ItemInstance,
  ItemPlacement,
  ItemStorageSite,
  ItemSystemState,
  ItemTransport,
} from '../features/items/types';

interface PresetEntry {
  instanceId: string;
  definitionId: string;
  placement: ItemPlacement;
  overrides?: Partial<ItemInstance>;
}

function createPreset(
  entries: readonly PresetEntry[],
  sites: readonly ItemStorageSite[],
  vehicles: readonly ItemTransport[] = [],
): ItemSystemState {
  const state = createEmptyItemSystem();
  for (const site of sites) state.sites[site.id] = { ...site };
  for (const vehicle of vehicles) state.vehicles[vehicle.id] = { ...vehicle };
  for (const entry of entries) {
    state.instances[entry.instanceId] = createItemInstance(
      ITEM_CATALOG,
      entry.definitionId,
      entry.instanceId,
      entry.overrides,
    );
    state.placements[entry.instanceId] = entry.placement.type === 'equipped'
      ? { type: 'equipped', position: { ...entry.placement.position } }
      : { ...entry.placement };
  }
  validateItemSystem(state, ITEM_CATALOG);
  return state;
}

export function createNedItemState(): ItemSystemState {
  return createPreset([
    { instanceId: 'ned.ice', definitionId: 'artifact.ice', placement: { type: 'equipped', position: { group: 'mainhand' } }, overrides: { isHeirloom: true, lawfulControllerId: 'house_stark', renown: 100 } },
    { instanceId: 'ned.wool_tunic', definitionId: 'clothing.northern_wool_tunic', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'ned.grey_cloak', definitionId: 'clothing.grey_wolf_cloak', placement: { type: 'equipped', position: { group: 'torso', layer: 'outerwear' } } },
    { instanceId: 'ned.house_seal', definitionId: 'keepsake.house_seal', placement: { type: 'equipped', position: { group: 'accessories', index: 0 } }, overrides: { customName: '临冬城公爵印章', lawfulControllerId: 'house_stark' } },
    { instanceId: 'ned.wolf_helm', definitionId: 'armor.stark_wolf_helm', placement: { type: 'site', siteId: 'winterfell_armory' } },
    { instanceId: 'ned.chainmail', definitionId: 'armor.castle_chainmail', placement: { type: 'site', siteId: 'winterfell_armory' } },
    { instanceId: 'ned.castle_sword', definitionId: 'weapon.castle_bastard_sword', placement: { type: 'site', siteId: 'winterfell_armory' } },
    { instanceId: 'ned.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'carried' }, overrides: { charges: 3 } },
    { instanceId: 'ned.poppy_milk', definitionId: 'medicine.milk_of_the_poppy', placement: { type: 'site', siteId: 'winterfell_room' }, overrides: { charges: 4 } },
  ], [
    { id: 'winterfell_armory', name: '临冬城军械库', type: 'armory', location: '临冬城', description: '由军械师和侍从共同看守的武器、防具储藏处。', capacity: 80 },
    { id: 'winterfell_room', name: '临冬城领主起居室', type: 'room', location: '临冬城', description: '存放日常衣物、文书和少量药品。', capacity: 30 },
  ]);
}

export function createJonItemState(): ItemSystemState {
  return createPreset([
    { instanceId: 'jon.uniform', definitionId: 'clothing.nights_watch_uniform', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'jon.black_cloak', definitionId: 'clothing.black_winter_cloak', placement: { type: 'equipped', position: { group: 'torso', layer: 'outerwear' } } },
    { instanceId: 'jon.leathers', definitionId: 'armor.nights_watch_leathers', placement: { type: 'equipped', position: { group: 'torso', layer: 'armor' } } },
    { instanceId: 'jon.castle_sword', definitionId: 'weapon.castle_bastard_sword', placement: { type: 'equipped', position: { group: 'mainhand' } }, overrides: { customName: '守夜人手半剑' } },
    { instanceId: 'jon.spirits', definitionId: 'supply.nights_watch_spirits', placement: { type: 'carried' }, overrides: { charges: 4 } },
    { instanceId: 'jon.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'site', siteId: 'castle_black_quarters' }, overrides: { charges: 2 } },
  ], [
    { id: 'castle_black_armory', name: '黑城堡军械库', type: 'armory', location: '黑城堡', description: '守夜人公共军械库，取用较大装备需要遵守值守规定。', capacity: 100 },
    { id: 'castle_black_quarters', name: '黑城堡住处', type: 'room', location: '黑城堡', description: '狭窄住处里的木箱、墙钩和铺位。', capacity: 16 },
  ]);
}

export function createDaenerysItemState(): ItemSystemState {
  return createPreset([
    { instanceId: 'daenerys.silk_robe', definitionId: 'clothing.pentos_silk_robe', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'daenerys.silver_ring', definitionId: 'jewelry.simple_silver_ring', placement: { type: 'equipped', position: { group: 'accessories', index: 0 } }, overrides: { customName: '坦格利安旧银戒' } },
    { instanceId: 'daenerys.black_red_egg', definitionId: 'artifact.petrified_dragon_egg_black_red', placement: { type: 'carried' }, overrides: { lawfulControllerId: 'char_daenerys', renown: 40 } },
    { instanceId: 'daenerys.green_bronze_egg', definitionId: 'artifact.petrified_dragon_egg_green_bronze', placement: { type: 'site', siteId: 'pentos_guest_room' }, overrides: { lawfulControllerId: 'char_daenerys', renown: 40 } },
    { instanceId: 'daenerys.cream_gold_egg', definitionId: 'artifact.petrified_dragon_egg_cream_gold', placement: { type: 'site', siteId: 'pentos_guest_room' }, overrides: { lawfulControllerId: 'char_daenerys', renown: 40 } },
    { instanceId: 'daenerys.house_seal', definitionId: 'keepsake.house_seal', placement: { type: 'site', siteId: 'pentos_guest_room' }, overrides: { customName: '三首龙旧印', lawfulControllerId: 'house_targaryen' } },
  ], [
    { id: 'pentos_guest_room', name: '潘托斯总督宅邸客房', type: 'room', location: '潘托斯总督宅邸', description: '客房内的衣箱、梳妆柜和有锁木匣。', capacity: 24 },
  ]);
}

export function createCustomRulerItemState(): ItemSystemState {
  return createPreset([
    { instanceId: 'custom.wool_tunic', definitionId: 'clothing.northern_wool_tunic', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'custom.silver_ring', definitionId: 'jewelry.simple_silver_ring', placement: { type: 'equipped', position: { group: 'accessories', index: 0 } } },
    { instanceId: 'custom.house_seal', definitionId: 'keepsake.house_seal', placement: { type: 'equipped', position: { group: 'accessories', index: 1 } }, overrides: { customName: '自建家族印章' } },
    { instanceId: 'custom.castle_sword', definitionId: 'weapon.castle_bastard_sword', placement: { type: 'carried' } },
    { instanceId: 'custom.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'carried' }, overrides: { charges: 2 } },
  ], [
    { id: 'custom_ruler_room', name: '领主起居室', type: 'room', location: '当前据点', description: '自建人物在当前据点可直接取用的私人储藏空间。', capacity: 24 },
  ], [
    { id: 'custom_packhorse', name: '驮马', type: 'packhorse', location: '当前据点', capacity: 12, description: '可随队移动并装载中型或大型行李。' },
  ]);
}
