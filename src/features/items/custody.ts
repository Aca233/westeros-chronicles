import { getItemDefinition } from './catalog';
import { sameWorldLocation } from '../map/locationResolver';
import type { WorldLocationRef } from '../map/types';
import type {
  ItemCatalog,
  ItemInstance,
  ItemPlacement,
  ItemSystemState,
} from './types';
import { canContainerAccept } from './itemValidation';
import { validateItemSystem } from './state';
export {
  DEFAULT_CARRIED_CAPACITY,
  canContainerAccept,
  getCarryUnits,
  getStorageUnits,
  getUsedCarryUnits,
  getUsedStorageUnits,
  listItemsAt,
} from './itemValidation';

export function assertPlacementAccessible(
  state: ItemSystemState,
  placement: ItemPlacement,
  currentLocation: WorldLocationRef,
  role: '来源' | '目标',
): void {
  switch (placement.type) {
    case 'carried':
      return;
    case 'site': {
      const site = state.sites[placement.siteId];
      if (!site) throw new Error(`${role}据点不存在：${placement.siteId}`);
      if (!sameWorldLocation(site.location, currentLocation)) {
        throw new Error(`${role}据点不在当前地点`);
      }
      return;
    }
    case 'vehicle': {
      const vehicle = state.vehicles[placement.vehicleId];
      if (!vehicle) throw new Error(`${role}运输工具不存在：${placement.vehicleId}`);
      if (!sameWorldLocation(vehicle.location, currentLocation)) {
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
  currentLocation: WorldLocationRef;
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
    sites: Object.fromEntries(Object.entries(state.sites).map(([id, site]) => [id, { ...site, location: { ...site.location } }])),
    vehicles: Object.fromEntries(Object.entries(state.vehicles).map(([id, vehicle]) => [id, { ...vehicle, location: { ...vehicle.location } }])),
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
