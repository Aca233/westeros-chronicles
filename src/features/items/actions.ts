import { getItemDefinition } from './catalog';
import { transferItem } from './custody';
import { equipItem, unequipItem } from './equipment';
import { validateItemSystem } from './state';
import type { WorldLocationRef } from '../map/types';
import type {
  ItemAction,
  ItemCatalog,
  ItemHistoryEntry,
  ItemInstance,
  ItemPlacement,
  ItemSystemState,
} from './types';

export interface ItemActionContext {
  actorId: string;
  actorLocation: WorldLocationRef;
  gameDate: string;
  accessibleSiteIds: ReadonlySet<string>;
  accessibleVehicleIds: ReadonlySet<string>;
}

export type ItemActionResult =
  | { ok: true; state: ItemSystemState; log: string[] }
  | { ok: false; state: ItemSystemState; error: string };

interface AppliedAction {
  state: ItemSystemState;
  log: string;
}

function cloneState(state: ItemSystemState): ItemSystemState {
  return {
    schemaVersion: 1,
    instances: Object.fromEntries(Object.entries(state.instances).map(([id, instance]) => [id, {
      ...instance,
      history: instance.history.map((entry) => ({ ...entry })),
    }])),
    placements: Object.fromEntries(Object.entries(state.placements).map(([id, placement]) => [id, placement.type === 'equipped'
      ? { type: 'equipped', position: { ...placement.position } }
      : { ...placement }])),
    sites: Object.fromEntries(Object.entries(state.sites).map(([id, site]) => [id, { ...site, location: { ...site.location } }])),
    vehicles: Object.fromEntries(Object.entries(state.vehicles).map(([id, vehicle]) => [id, { ...vehicle, location: { ...vehicle.location } }])),
  };
}

function assertContextCanReach(
  state: ItemSystemState,
  placement: ItemPlacement,
  context: ItemActionContext,
  role: '来源' | '目标',
): void {
  if (placement.type === 'site' && !context.accessibleSiteIds.has(placement.siteId)) {
    throw new Error(`${role}据点当前不可访问`);
  }
  if (placement.type === 'vehicle' && !context.accessibleVehicleIds.has(placement.vehicleId)) {
    throw new Error(`${role}运输工具当前不可访问`);
  }
  if (role === '来源' && placement.type === 'character' && placement.characterId !== context.actorId) {
    throw new Error('不能直接操作其他人物持有的物品');
  }
  if (role === '来源' && placement.type === 'lost') throw new Error('遗失物品必须先被找回');
  if (placement.type === 'site' && !state.sites[placement.siteId]) throw new Error(`${role}据点不存在`);
  if (placement.type === 'vehicle' && !state.vehicles[placement.vehicleId]) throw new Error(`${role}运输工具不存在`);
}


function assertOrdinaryDestination(placement: ItemPlacement): void {
  if (placement.type !== 'carried' && placement.type !== 'site' && placement.type !== 'vehicle') {
    throw new Error('普通转移只能前往随身、据点或运输工具');
  }
}

function requireInstance(state: ItemSystemState, instanceId: string): ItemInstance {
  const instance = state.instances[instanceId];
  if (!instance) throw new Error(`物品实例不存在：${instanceId}`);
  return instance;
}

function assertInstanceAccessible(state: ItemSystemState, instanceId: string, context: ItemActionContext): void {
  requireInstance(state, instanceId);
  const placement = state.placements[instanceId];
  if (!placement) throw new Error(`位置记录与实例不一致：${instanceId}`);
  assertContextCanReach(state, placement, context, '来源');
}

function historyEntry(
  instance: ItemInstance,
  type: ItemHistoryEntry['type'],
  context: ItemActionContext,
  summary: string,
  targetId?: string,
): ItemHistoryEntry {
  return {
    id: `${instance.instanceId}:${type}:${context.gameDate}:${instance.history.length + 1}`,
    type,
    date: context.gameDate,
    summary,
    actorId: context.actorId,
    ...(targetId ? { targetId } : {}),
  };
}

function appendHistory(
  state: ItemSystemState,
  instanceId: string,
  type: ItemHistoryEntry['type'],
  context: ItemActionContext,
  summary: string,
  targetId?: string,
): void {
  const instance = requireInstance(state, instanceId);
  instance.history.push(historyEntry(instance, type, context, summary, targetId));
}

function movedInstanceId(action: Extract<ItemAction, { kind: 'gift' | 'discard' }>): string {
  return action.quantity === undefined
    ? action.instanceId
    : action.newInstanceId ?? action.instanceId;
}

function placementsEqual(left: ItemPlacement, right: ItemPlacement): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyAcquire(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'acquire' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  if (state.instances[action.instance.instanceId]) throw new Error(`物品实例 ID 已存在：${action.instance.instanceId}`);
  getItemDefinition(catalog, action.instance.definitionId);
  assertOrdinaryDestination(action.placement);
  assertContextCanReach(state, action.placement, context, '目标');
  const next = cloneState(state);
  next.instances[action.instance.instanceId] = {
    ...action.instance,
    history: action.instance.history.map((entry) => ({ ...entry })),
  };
  next.placements[action.instance.instanceId] = { ...action.placement } as ItemPlacement;
  const name = getItemDefinition(catalog, action.instance.definitionId).name;
  appendHistory(next, action.instance.instanceId, action.historyType, context, `${context.actorId}取得了${name}`);
  validateItemSystem(next, catalog);
  return { state: next, log: `取得【${name}】` };
}

function applyUse(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'use' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  assertInstanceAccessible(state, action.instanceId, context);
  const quantity = action.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('使用数量无效');
  const next = cloneState(state);
  const instance = requireInstance(next, action.instanceId);
  if (instance.charges !== undefined) {
    if (instance.charges < quantity) throw new Error('物品剩余次数不足');
    instance.charges -= quantity;
  } else {
    if (instance.quantity < quantity) throw new Error('物品数量不足');
    instance.quantity -= quantity;
    if (instance.quantity === 0) {
      delete next.instances[action.instanceId];
      delete next.placements[action.instanceId];
    }
  }
  validateItemSystem(next, catalog);
  return { state: next, log: `使用【${getItemDefinition(catalog, instance.definitionId).name}】` };
}

function applyGiftOrDiscard(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'gift' | 'discard' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  assertInstanceAccessible(state, action.instanceId, context);
  if (action.kind === 'gift' && !action.recipientId.trim()) throw new Error('受赠人物不能为空');
  const to: ItemPlacement = action.kind === 'gift'
    ? { type: 'character', characterId: action.recipientId }
    : { type: 'lost', reason: `${context.actorId}主动舍弃` };
  const moved = transferItem(state, catalog, action.instanceId, to, {
    currentLocation: context.actorLocation,
    quantity: action.quantity,
    newInstanceId: action.newInstanceId,
  });
  const targetInstanceId = movedInstanceId(action);
  const next = cloneState(moved);
  const definition = getItemDefinition(catalog, next.instances[targetInstanceId].definitionId);
  if (action.kind === 'gift') {
    appendHistory(next, targetInstanceId, 'gifted', context, `赠予${action.recipientId}`, action.recipientId);
    validateItemSystem(next, catalog);
    return { state: next, log: `将【${definition.name}】赠予${action.recipientId}` };
  }
  appendHistory(next, targetInstanceId, 'lost', context, `舍弃了${definition.name}`);
  validateItemSystem(next, catalog);
  return { state: next, log: `舍弃【${definition.name}】` };
}

function applyRepair(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'repair' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  assertInstanceAccessible(state, action.instanceId, context);
  if (!Number.isFinite(action.amount) || action.amount <= 0) throw new Error('修理量必须大于零');
  const next = cloneState(state);
  const instance = requireInstance(next, action.instanceId);
  const before = instance.durability;
  instance.durability = Math.min(100, instance.durability + action.amount);
  if (instance.durability === before) throw new Error('物品无需修理');
  const name = getItemDefinition(catalog, instance.definitionId).name;
  appendHistory(next, action.instanceId, 'repaired', context, `修理了${name}`);
  validateItemSystem(next, catalog);
  return { state: next, log: `修理【${name}】至耐久 ${instance.durability}` };
}

function applyDamage(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'damage' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  assertInstanceAccessible(state, action.instanceId, context);
  if (!Number.isFinite(action.amount) || action.amount <= 0) throw new Error('损耗量必须大于零');
  if (!action.reason.trim()) throw new Error('物品损耗必须说明原因');
  const next = cloneState(state);
  const instance = requireInstance(next, action.instanceId);
  instance.durability = Math.max(0, instance.durability - action.amount);
  validateItemSystem(next, catalog);
  return { state: next, log: `【${getItemDefinition(catalog, instance.definitionId).name}】因${action.reason}受损` };
}

function applyMerge(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'merge' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  const source = requireInstance(state, action.sourceInstanceId);
  const target = requireInstance(state, action.targetInstanceId);
  const definition = getItemDefinition(catalog, source.definitionId);
  if (definition.unique) throw new Error('唯一物品不能合并');
  if (source.instanceId === target.instanceId) throw new Error('不能将物品与自身合并');
  assertInstanceAccessible(state, source.instanceId, context);
  assertInstanceAccessible(state, target.instanceId, context);
  if (source.definitionId !== target.definitionId) throw new Error('只有相同定义的物品可以合并');
  if (!definition.stackable) throw new Error('该物品不可堆叠');
  if (!placementsEqual(state.placements[source.instanceId], state.placements[target.instanceId])) {
    throw new Error('只有位于同一位置的物品可以合并');
  }
  const sameState = source.durability === target.durability
    && source.quality === target.quality
    && source.charges === target.charges
    && source.customName === target.customName
    && source.renown === target.renown
    && source.isHeirloom === target.isHeirloom;
  if (!sameState || source.history.length > 0 || target.history.length > 0) {
    throw new Error('状态或独立历史不同的物品不能合并');
  }
  if (source.quantity + target.quantity > definition.maxStack) throw new Error('合并后超过最大堆叠数');
  const next = cloneState(state);
  next.instances[target.instanceId].quantity += source.quantity;
  delete next.instances[source.instanceId];
  delete next.placements[source.instanceId];
  validateItemSystem(next, catalog);
  return { state: next, log: `合并【${definition.name}】` };
}

function applyMarkHeirloom(
  state: ItemSystemState,
  action: Extract<ItemAction, { kind: 'mark_heirloom' }>,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  assertInstanceAccessible(state, action.instanceId, context);
  if (!action.houseId.trim()) throw new Error('家族 ID 不能为空');
  const next = cloneState(state);
  const instance = requireInstance(next, action.instanceId);
  if (instance.isHeirloom) throw new Error('物品已经是传家宝');
  instance.isHeirloom = true;
  const name = getItemDefinition(catalog, instance.definitionId).name;
  appendHistory(next, action.instanceId, 'heirloom', context, `${name}被定为${action.houseId}的传家宝`);
  validateItemSystem(next, catalog);
  return { state: next, log: `将【${name}】立为家族传家宝` };
}

function applyOne(
  state: ItemSystemState,
  action: ItemAction,
  context: ItemActionContext,
  catalog: ItemCatalog,
): AppliedAction {
  switch (action.kind) {
    case 'acquire':
      return applyAcquire(state, action, context, catalog);
    case 'equip': {
      assertInstanceAccessible(state, action.instanceId, context);
      assertContextCanReach(state, action.displacedTo, context, '目标');
      const next = equipItem(state, catalog, action.instanceId, action.position, {
        currentLocation: context.actorLocation,
        displacedTo: action.displacedTo,
      });
      return { state: next, log: `装备【${getItemDefinition(catalog, next.instances[action.instanceId].definitionId).name}】` };
    }
    case 'unequip': {
      assertInstanceAccessible(state, action.instanceId, context);
      assertContextCanReach(state, action.to, context, '目标');
      const next = unequipItem(state, catalog, action.instanceId, action.to, { currentLocation: context.actorLocation });
      return { state: next, log: `卸下【${getItemDefinition(catalog, next.instances[action.instanceId].definitionId).name}】` };
    }
    case 'use':
      return applyUse(state, action, context, catalog);
    case 'transfer': {
      assertOrdinaryDestination(action.to);
      assertInstanceAccessible(state, action.instanceId, context);
      assertContextCanReach(state, action.to, context, '目标');
      const next = transferItem(state, catalog, action.instanceId, action.to, {
        currentLocation: context.actorLocation,
        quantity: action.quantity,
        newInstanceId: action.newInstanceId,
      });
      return { state: next, log: `转移【${getItemDefinition(catalog, state.instances[action.instanceId].definitionId).name}】` };
    }
    case 'gift':
    case 'discard':
      return applyGiftOrDiscard(state, action, context, catalog);
    case 'repair':
      return applyRepair(state, action, context, catalog);
    case 'damage':
      return applyDamage(state, action, context, catalog);
    case 'split': {
      assertOrdinaryDestination(action.to);
      assertInstanceAccessible(state, action.instanceId, context);
      assertContextCanReach(state, action.to, context, '目标');
      const next = transferItem(state, catalog, action.instanceId, action.to, {
        currentLocation: context.actorLocation,
        quantity: action.quantity,
        newInstanceId: action.newInstanceId,
      });
      return { state: next, log: `拆分【${getItemDefinition(catalog, state.instances[action.instanceId].definitionId).name}】` };
    }
    case 'merge':
      return applyMerge(state, action, context, catalog);
    case 'mark_heirloom':
      return applyMarkHeirloom(state, action, context, catalog);
  }
}

export function validateItemAction(
  state: ItemSystemState,
  action: ItemAction,
  context: ItemActionContext,
  catalog: ItemCatalog,
): void {
  validateItemSystem(state, catalog);
  const result = applyOne(state, action, context, catalog);
  validateItemSystem(result.state, catalog);
}

export function applyItemActions(
  state: ItemSystemState,
  actions: readonly ItemAction[],
  context: ItemActionContext,
  catalog: ItemCatalog,
): ItemActionResult {
  try {
    validateItemSystem(state, catalog);
    let next = state;
    const log: string[] = [];
    for (const action of actions) {
      const applied = applyOne(next, action, context, catalog);
      next = applied.state;
      log.push(applied.log);
    }
    validateItemSystem(next, catalog);
    return { ok: true, state: next, log };
  } catch (error) {
    return {
      ok: false,
      state,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
