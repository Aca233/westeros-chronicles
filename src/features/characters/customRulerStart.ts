import { ITEM_CATALOG } from '../../data/itemDefinitions';
import type { WorldLocationRef } from '../../domain/worldLocation';
import { createItemInstance, createEmptyItemSystem, validateItemSystem } from '../items/state';
import type {
  ItemInstance,
  ItemPlacement,
  ItemStorageSite,
  ItemSystemState,
  ItemTransport,
} from '../items/types';
import type { CustomItemPackage, CustomSituationKind } from './customCharacterStart';

interface PresetEntry {
  instanceId: string;
  definitionId: string;
  placement: ItemPlacement;
  overrides?: Partial<ItemInstance>;
}

export interface CustomCharacterItemStateInput {
  itemPackage: CustomItemPackage;
  location: WorldLocationRef;
  locationLabel: string;
  situation: CustomSituationKind;
  hasHouse: boolean;
}

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
 * Custom-character equipment is derived from the resolved background and the
 * selected real location. It never allocates canon unique artifacts or a
 * placeholder "unknown Westeros" storage site.
 */
export function createCustomCharacterItemState(input: CustomCharacterItemStateInput): ItemSystemState {
  const lodgingSite: ItemStorageSite | undefined = input.situation === 'lodging'
    ? {
      id: 'custom_lodging_chest',
      name: '借住处的木箱',
      type: 'room',
      location: { ...input.location },
      locationLabel: input.locationLabel,
      description: '借住期间可使用的一只普通木箱，只能存放个人物品，不代表对房屋或土地拥有产权。',
      capacity: 8,
    }
    : undefined;
  const packhorse: ItemTransport | undefined = input.itemPackage === 'traveler'
    ? {
      id: 'custom_packhorse',
      name: '旧驮马',
      type: 'packhorse',
      location: { ...input.location },
      locationLabel: input.locationLabel,
      capacity: 8,
      description: '一匹用于驮运行李的普通旧马，没有血统或剧情唯一性。',
    }
    : undefined;

  const entries: PresetEntry[] = [
    { instanceId: 'custom.wool_tunic', definitionId: 'clothing.northern_wool_tunic', placement: { type: 'equipped', position: { group: 'torso', layer: 'garment' } } },
    { instanceId: 'custom.travel_trousers', definitionId: 'legwear.sturdy_travel_trousers', placement: { type: 'equipped', position: { group: 'legs', layer: 'legwear' } } },
    { instanceId: 'custom.travel_boots', definitionId: 'footwear.sturdy_travel_boots', placement: { type: 'equipped', position: { group: 'legs', layer: 'footwear' } } },
  ];

  if (input.hasHouse) entries.push({
    instanceId: 'custom.house_seal',
    definitionId: 'keepsake.house_seal',
    placement: { type: 'carried' },
    overrides: { customName: '私人家族印章' },
  });

  switch (input.itemPackage) {
    case 'knight':
      entries.push(
        { instanceId: 'custom.castle_sword', definitionId: 'weapon.castle_bastard_sword', placement: { type: 'equipped', position: { group: 'mainhand' } } },
        { instanceId: 'custom.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'carried' }, overrides: { charges: 2 } },
      );
      break;
    case 'scholar':
      entries.push(
        { instanceId: 'custom.history_book', definitionId: 'document.citadel_history_book', placement: { type: 'carried' } },
        { instanceId: 'custom.staunching_herbs', definitionId: 'medicine.maester_staunching_herbs', placement: { type: 'carried' }, overrides: { charges: 1 } },
      );
      break;
    case 'traveler':
      entries.push({
        instanceId: 'custom.repair_kit',
        definitionId: 'tool.field_repair_kit',
        placement: packhorse ? { type: 'vehicle', vehicleId: packhorse.id } : { type: 'carried' },
      });
      break;
    case 'retainer':
      entries.push(
        { instanceId: 'custom.silver_ring', definitionId: 'jewelry.simple_silver_ring', placement: { type: 'equipped', position: { group: 'accessories', index: 0 } } },
        { instanceId: 'custom.repair_kit', definitionId: 'tool.field_repair_kit', placement: lodgingSite ? { type: 'site', siteId: lodgingSite.id } : { type: 'carried' } },
      );
      break;
    case 'commoner':
      entries.push({ instanceId: 'custom.repair_kit', definitionId: 'tool.field_repair_kit', placement: { type: 'carried' } });
      break;
  }

  const state = createPreset(entries, lodgingSite ? [lodgingSite] : [], packhorse ? [packhorse] : []);
  validateItemSystem(state, ITEM_CATALOG);
  return state;
}
