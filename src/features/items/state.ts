import { getItemDefinition } from './catalog';
import { canContainerAccept } from './itemValidation';
import type {
  CraftQuality,
  ItemCatalog,
  ItemInstance,
  ItemPlacement,
  ItemSystemState,
} from './types';

const QUALITY_VALUES = new Set<CraftQuality>(['rough', 'common', 'fine', 'masterwork', 'legendary']);

export function createEmptyItemSystem(): ItemSystemState {
  return {
    schemaVersion: 1,
    instances: {},
    placements: {},
    sites: {},
    vehicles: {},
  };
}

export function createItemInstance(
  catalog: ItemCatalog,
  definitionId: string,
  instanceId: string,
  overrides: Partial<ItemInstance> = {},
): ItemInstance {
  const definition = getItemDefinition(catalog, definitionId);
  if (!instanceId.trim()) throw new Error('物品实例 ID 不能为空');
  const instance: ItemInstance = {
    quantity: 1,
    durability: 100,
    quality: definition.baseQuality,
    renown: 0,
    isHeirloom: false,
    history: [],
    ...overrides,
    instanceId,
    definitionId,
  };
  validateInstance(instance, definition.maxStack, definition.unique);
  return instance;
}

function validateInstance(instance: ItemInstance, maxStack: number, unique: boolean): void {
  if (!instance.instanceId.trim()) throw new Error('物品实例 ID 不能为空');
  if (!Number.isInteger(instance.quantity) || instance.quantity <= 0 || instance.quantity > maxStack) {
    throw new Error(`物品堆叠数量无效：${instance.instanceId}`);
  }
  if (unique && instance.quantity !== 1) throw new Error(`唯一物品数量必须为 1：${instance.instanceId}`);
  if (!Number.isFinite(instance.durability) || instance.durability < 0 || instance.durability > 100) {
    throw new Error(`物品耐久无效：${instance.instanceId}`);
  }
  if (instance.charges !== undefined && (!Number.isInteger(instance.charges) || instance.charges < 0)) {
    throw new Error(`物品使用次数无效：${instance.instanceId}`);
  }
  if (!QUALITY_VALUES.has(instance.quality)) throw new Error(`物品品质无效：${instance.instanceId}`);
  if (!Number.isFinite(instance.renown) || instance.renown < 0) throw new Error(`物品声望无效：${instance.instanceId}`);
  if (!Array.isArray(instance.history)) throw new Error(`物品历史无效：${instance.instanceId}`);
}

function validatePlacementReference(state: ItemSystemState, instanceId: string, placement: ItemPlacement): void {
  if (placement.type === 'site' && !state.sites[placement.siteId]) {
    throw new Error(`物品引用了不存在的据点：${instanceId}`);
  }
  if (placement.type === 'vehicle' && !state.vehicles[placement.vehicleId]) {
    throw new Error(`物品引用了不存在的运输工具：${instanceId}`);
  }
}

export function validateItemSystem(state: ItemSystemState, catalog: ItemCatalog): void {
  if (state.schemaVersion !== 1) throw new Error('不支持的物品系统版本');
  const instanceIds = Object.keys(state.instances).sort();
  const placementIds = Object.keys(state.placements).sort();
  if (instanceIds.length !== placementIds.length || instanceIds.some((id, index) => id !== placementIds[index])) {
    throw new Error('位置记录与实例不一致');
  }

  const uniqueDefinitions = new Set<string>();
  for (const [instanceId, instance] of Object.entries(state.instances)) {
    if (instance.instanceId !== instanceId) throw new Error(`实例键与实例 ID 不一致：${instanceId}`);
    const definition = getItemDefinition(catalog, instance.definitionId);
    validateInstance(instance, definition.maxStack, definition.unique);
    if (definition.unique) {
      if (uniqueDefinitions.has(instance.definitionId)) throw new Error(`唯一物品出现重复实例：${instance.definitionId}`);
      uniqueDefinitions.add(instance.definitionId);
    }
    validatePlacementReference(state, instanceId, state.placements[instanceId]);
  }

  for (const [siteId, site] of Object.entries(state.sites)) {
    if (site.id !== siteId) throw new Error(`据点键与 ID 不一致：${siteId}`);
    if (site.capacity !== undefined && (!Number.isFinite(site.capacity) || site.capacity < 0)) {
      throw new Error(`据点容量无效：${siteId}`);
    }
    if (!canContainerAccept(state, catalog, { type: 'site', siteId })) throw new Error(`据点容量不足：${siteId}`);
  }
  for (const [vehicleId, vehicle] of Object.entries(state.vehicles)) {
    if (vehicle.id !== vehicleId) throw new Error(`运输工具键与 ID 不一致：${vehicleId}`);
    if (!Number.isFinite(vehicle.capacity) || vehicle.capacity < 0) throw new Error(`运输工具容量无效：${vehicleId}`);
    if (!canContainerAccept(state, catalog, { type: 'vehicle', vehicleId })) throw new Error(`运输工具容量不足：${vehicleId}`);
  }

  const carriedLarge = Object.values(state.instances).some((instance) => {
    const placement = state.placements[instance.instanceId];
    return placement.type === 'carried' && getItemDefinition(catalog, instance.definitionId).bulk === 'large';
  });
  if (carriedLarge) throw new Error('大型物品不能普通随身携带');
  if (!canContainerAccept(state, catalog, { type: 'carried' })) throw new Error('随身容量不足');
}
