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
import { validateItemSystem } from './state';

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

function getUsedStorageUnits(
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

function locationRoot(location: string): string {
  return location.split('·', 1)[0].trim();
}

function isAtCurrentLocation(containerLocation: string, currentLocation: string): boolean {
  return locationRoot(containerLocation) === locationRoot(currentLocation);
}

export function assertPlacementAccessible(
  state: ItemSystemState,
  placement: ItemPlacement,
  currentLocation: string,
  role: '来源' | '目标',
): void {
  switch (placement.type) {
    case 'carried':
      return;
    case 'site': {
      const site = state.sites[placement.siteId];
      if (!site) throw new Error(`${role}据点不存在：${placement.siteId}`);
      if (!isAtCurrentLocation(site.location, currentLocation)) {
        throw new Error(`${role}据点不在当前地点`);
      }
      return;
    }
    case 'vehicle': {
      const vehicle = state.vehicles[placement.vehicleId];
      if (!vehicle) throw new Error(`${role}运输工具不存在：${placement.vehicleId}`);
      if (!isAtCurrentLocation(vehicle.location, currentLocation)) {
        throw new Error(`${role}运输工具不在当前地点`);
      }
      return;
    }
    case 'equipped':
      throw new Error('装备位置只能通过装备规则写入');
    case 'character':
      if (role === '来源') throw new Error('不能直接取用其他人物持有的物品');
      return;
    case 'lost':
      if (role === '来源') throw new Error('遗失物品必须先被找回');
      return;
  }
}

export interface TransferOptions {
  currentLocation: string;
  quantity?: number;
  newInstanceId?: string;
}

function cloneState(state: ItemSystemState): ItemSystemState {
  return {
    schemaVersion: 1,
    instances: Object.fromEntries(Object.entries(state.instances).map(([id, instance]) => [id, {
      ...instance,
      history: instance.history.map((entry) => ({ ...entry })),
    }])),
    placements: Object.fromEntries(Object.entries(state.placements).map(([id, placement]) => [id, {
      ...placement,
      ...(placement.type === 'equipped' ? { position: { ...placement.position } } : {}),
    }] as [string, ItemPlacement])),
    sites: Object.fromEntries(Object.entries(state.sites).map(([id, site]) => [id, { ...site }])),
    vehicles: Object.fromEntries(Object.entries(state.vehicles).map(([id, vehicle]) => [id, { ...vehicle }])),
  };
}

export function canTransferItem(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  to: ItemPlacement,
  options: TransferOptions,
): boolean {
  try {
    transferItem(state, catalog, instanceId, to, options);
    return true;
  } catch {
    return false;
  }
}

export function transferItem(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  to: ItemPlacement,
  options: TransferOptions,
): ItemSystemState {
  validateItemSystem(state, catalog);
  const instance = state.instances[instanceId];
  if (!instance) throw new Error(`物品实例不存在：${instanceId}`);
  const from = state.placements[instanceId];
  if (!from) throw new Error(`位置记录与实例不一致：${instanceId}`);
  assertPlacementAccessible(state, from, options.currentLocation, '来源');
  assertPlacementAccessible(state, to, options.currentLocation, '目标');

  const quantity = options.quantity ?? instance.quantity;
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > instance.quantity) {
    throw new Error('转移数量无效');
  }
  const isSplit = quantity < instance.quantity;
  if (isSplit && !options.newInstanceId) throw new Error('拆分堆叠必须提供新实例 ID');
  if (!isSplit && options.newInstanceId) throw new Error('完整转移不能指定新实例 ID');
  if (options.newInstanceId && state.instances[options.newInstanceId]) throw new Error('新实例 ID 已存在');

  const definition = getItemDefinition(catalog, instance.definitionId);
  if (to.type === 'carried' && definition.bulk === 'large') {
    throw new Error('大型物品不能普通随身携带');
  }

  const next = cloneState(state);
  if (isSplit) {
    const childId = options.newInstanceId as string;
    next.instances[instanceId].quantity -= quantity;
    next.instances[childId] = {
      ...next.instances[instanceId],
      instanceId: childId,
      quantity,
      history: next.instances[instanceId].history.map((entry) => ({ ...entry })),
    };
    next.placements[childId] = { ...to } as ItemPlacement;
  } else {
    next.placements[instanceId] = { ...to } as ItemPlacement;
  }

  if (!canContainerAccept(next, catalog, to)) {
    if (to.type === 'carried') throw new Error('随身容量不足');
    throw new Error('目标容器容量不足');
  }
  validateItemSystem(next, catalog);
  return next;
}
