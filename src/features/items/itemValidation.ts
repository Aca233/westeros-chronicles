import { getItemDefinition } from './catalog';
import type {
  ItemBulk,
  ItemCatalog,
  ItemCategory,
  ItemEffect,
  ItemInstance,
  ItemPlacement,
  ItemSystemState,
} from './types';

export const DEFAULT_CARRIED_CAPACITY = 8;

const CARRY_UNITS: Record<ItemBulk, number> = {
  tiny: 0.25,
  small: 1,
  medium: 2,
  large: Number.POSITIVE_INFINITY,
};

const STORAGE_UNITS: Record<ItemBulk, number> = {
  tiny: 0.25,
  small: 1,
  medium: 2,
  large: 4,
};

export function getCarryUnits(bulk: ItemBulk): number {
  return CARRY_UNITS[bulk];
}

export function getStorageUnits(bulk: ItemBulk): number {
  return STORAGE_UNITS[bulk];
}

function placementsEqual(left: ItemPlacement, right: ItemPlacement): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case 'carried':
      return true;
    case 'site':
      return right.type === 'site' && left.siteId === right.siteId;
    case 'vehicle':
      return right.type === 'vehicle' && left.vehicleId === right.vehicleId;
    case 'equipped':
      return right.type === 'equipped' && JSON.stringify(left.position) === JSON.stringify(right.position);
    case 'character':
      return right.type === 'character' && left.characterId === right.characterId;
    case 'lost':
      return right.type === 'lost' && left.reason === right.reason;
  }
}

export function listItemsAt(state: ItemSystemState, placement: ItemPlacement): ItemInstance[] {
  return Object.values(state.instances).filter((instance) => {
    const current = state.placements[instance.instanceId];
    return current !== undefined && placementsEqual(current, placement);
  });
}

export function getUsedCarryUnits(state: ItemSystemState, catalog: ItemCatalog): number {
  return listItemsAt(state, { type: 'carried' }).reduce((total, instance) => {
    const definition = getItemDefinition(catalog, instance.definitionId);
    return total + getCarryUnits(definition.bulk) * instance.quantity;
  }, 0);
}

export function getUsedStorageUnits(
  state: ItemSystemState,
  catalog: ItemCatalog,
  placement: Extract<ItemPlacement, { type: 'site' | 'vehicle' }>,
): number {
  return listItemsAt(state, placement).reduce((total, instance) => {
    const definition = getItemDefinition(catalog, instance.definitionId);
    return total + getStorageUnits(definition.bulk) * instance.quantity;
  }, 0);
}

interface CapacityPool {
  categories: ItemCategory[];
  units: number;
}

function capacityEffects(state: ItemSystemState, catalog: ItemCatalog): ItemEffect[] {
  return Object.values(state.instances).flatMap((instance) => {
    const placement = state.placements[instance.instanceId];
    if (placement?.type !== 'carried' && placement?.type !== 'equipped') return [];
    return getItemDefinition(catalog, instance.definitionId).effects.filter((effect) => effect.kind === 'capacity');
  });
}

function getCapacityPools(state: ItemSystemState, catalog: ItemCatalog): CapacityPool[] {
  const groups = new Map<string, { categories: Set<ItemCategory>; units: number; cap?: number }>();
  for (const effect of capacityEffects(state, catalog)) {
    if (effect.kind !== 'capacity') continue;
    const group = groups.get(effect.stackGroup) ?? {
      categories: new Set<ItemCategory>(),
      units: 0,
      cap: effect.cap,
    };
    effect.categories.forEach((category) => group.categories.add(category));
    group.units += effect.units;
    group.cap = group.cap === undefined
      ? effect.cap
      : effect.cap === undefined
        ? group.cap
        : Math.min(group.cap, effect.cap);
    groups.set(effect.stackGroup, group);
  }
  return [...groups.values()].map((group) => ({
    categories: [...group.categories],
    units: Math.min(group.units, group.cap ?? Number.POSITIVE_INFINITY),
  }));
}

function getEffectiveCarryUnits(state: ItemSystemState, catalog: ItemCatalog): number {
  const usage = new Map<ItemCategory, number>();
  for (const instance of listItemsAt(state, { type: 'carried' })) {
    const definition = getItemDefinition(catalog, instance.definitionId);
    const units = getCarryUnits(definition.bulk) * instance.quantity;
    usage.set(definition.category, (usage.get(definition.category) ?? 0) + units);
  }

  let discounted = 0;
  for (const pool of getCapacityPools(state, catalog)) {
    let remaining = pool.units;
    for (const category of pool.categories) {
      if (remaining <= 0) break;
      const available = usage.get(category) ?? 0;
      const applied = Math.min(available, remaining);
      usage.set(category, available - applied);
      discounted += applied;
      remaining -= applied;
    }
  }
  return getUsedCarryUnits(state, catalog) - discounted;
}

export function canContainerAccept(
  state: ItemSystemState,
  catalog: ItemCatalog,
  placement: ItemPlacement,
): boolean {
  switch (placement.type) {
    case 'carried':
      return Number.isFinite(getUsedCarryUnits(state, catalog))
        && getEffectiveCarryUnits(state, catalog) <= DEFAULT_CARRIED_CAPACITY;
    case 'site': {
      const site = state.sites[placement.siteId];
      if (!site) return false;
      return site.capacity === undefined
        || getUsedStorageUnits(state, catalog, placement) <= site.capacity;
    }
    case 'vehicle': {
      const vehicle = state.vehicles[placement.vehicleId];
      if (!vehicle) return false;
      return getUsedStorageUnits(state, catalog, placement) <= vehicle.capacity;
    }
    default:
      return true;
  }
}

