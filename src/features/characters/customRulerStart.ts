import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { createItemInstance, createEmptyItemSystem, validateItemSystem } from '../items/state';
import type {
  ItemInstance,
  ItemPlacement,
  ItemStorageSite,
  ItemSystemState,
  ItemTransport,
} from '../items/types';
import { UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';

interface PresetEntry {
  instanceId: string;
  definitionId: string;
  placement: ItemPlacement;
  overrides?: Partial<ItemInstance>;
}

export type CustomStartStatus = 'landed' | 'household' | 'wanderer';

function createPreset(
  entries: readonly PresetEntry[],
  sites: readonly ItemStorageSite[],
  vehicles: readonly ItemTransport[] = [],
): ItemSystemState {
  const state = createEmptyItemSystem();
  for (const site of sites) state.sites[site.id] = { ...site, location: { ...site.location } };
  for (const vehicle of vehicles) state.vehicles[vehicle.id] = { ...vehicle, location: { ...vehicle.location } };
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

/**
 * The custom ruler's immediate kit is a player-creation rule, not a 298 AC
 * historical fact, so it stays in code instead of the world start content.
 */
export function createCustomRulerItemState(status: CustomStartStatus = 'landed'): ItemSystemState {
  const state = createPreset([
    { instanceId: 'custom.wool_tunic', definitionId: 'clothing.northern_wool_tunic', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'custom.travel_trousers', definitionId: 'legwear.sturdy_travel_trousers', placement: { type: 'equipped', position: { group: 'legs', layer: 'legwear' } } },
    { instanceId: 'custom.travel_boots', definitionId: 'footwear.sturdy_travel_boots', placement: { type: 'equipped', position: { group: 'legs', layer: 'footwear' } } },
    { instanceId: 'custom.silver_ring', definitionId: 'jewelry.simple_silver_ring', placement: { type: 'equipped', position: { group: 'accessories', index: 0 } } },
    { instanceId: 'custom.house_seal', definitionId: 'keepsake.house_seal', placement: { type: 'equipped', position: { group: 'accessories', index: 1 } }, overrides: { customName: '自建家族印章' } },
    { instanceId: 'custom.castle_sword', definitionId: 'weapon.castle_bastard_sword', placement: { type: 'carried' } },
    { instanceId: 'custom.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'carried' }, overrides: { charges: 2 } },
    { instanceId: 'custom.repair_kit', definitionId: 'tool.field_repair_kit', placement: { type: 'site', siteId: 'custom_ruler_room' } },
  ], [
    { id: 'custom_ruler_room', name: '领主起居室', type: 'room', location: { locationId: UNKNOWN_WESTEROS_LOCATION_ID, sceneLocation: '当前据点' }, locationLabel: '所在地未查明 · 当前据点', description: '自建人物在当前据点可直接取用的私人储藏空间。', capacity: 24 },
  ], [
    { id: 'custom_packhorse', name: '驮马', type: 'packhorse', location: { locationId: UNKNOWN_WESTEROS_LOCATION_ID, sceneLocation: '当前据点' }, locationLabel: '所在地未查明 · 当前据点', capacity: 12, description: '可随队移动并装载中型或大型行李。' },
  ]);
  if (status !== 'landed') {
    delete state.instances['custom.house_seal'];
    delete state.placements['custom.house_seal'];
  }
  if (status === 'household') {
    delete state.vehicles.custom_packhorse;
    state.sites.custom_ruler_room = { ...state.sites.custom_ruler_room, name: '借住处的木箱', capacity: 8, description: '由主人家暂借的一只上锁木箱，只能存放个人物品。' };
    state.placements['custom.castle_sword'] = { type: 'site', siteId: 'custom_ruler_room' };
  }
  if (status === 'wanderer') {
    delete state.sites.custom_ruler_room;
    state.placements['custom.repair_kit'] = { type: 'carried' };
    state.vehicles.custom_packhorse = { ...state.vehicles.custom_packhorse, name: '瘦驮马', capacity: 8, description: '一匹能驮行李的旧马，也是旅途中最贵重的家当。' };
  }
  validateItemSystem(state, ITEM_CATALOG);
  return state;
}
