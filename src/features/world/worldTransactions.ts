import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { applyItemActions, type ItemActionContext } from '../items/actions';
import type { ItemAction, ItemPlacement, ItemStateCommand, ItemSystemState } from '../items/types';
import { UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';
import { advanceWorldDate } from './worldHistory';
import {
  createWorldBaselineSnapshot,
  type WorldAssetBaseline,
  type WorldBaselineSnapshot,
} from './worldBaseline';
import {
  projectWorldAsset,
  projectWorldCharacter,
  projectWorldTitle,
  resolveAssetMapLocation,
} from './worldProjection';
import { cloneWorldRuntimeState, validateWorldRuntimeState } from './worldRuntimeState';
import type {
  AssetPlacement,
  AssetWorldPatch,
  WorldCommitSlice,
  WorldEvent,
  WorldMutation,
  WorldPrincipalRef,
  WorldRuntimeState,
  WorldTransaction,
  WorldTransactionResult,
} from './worldRuntimeTypes';

function itemCommandToAction(command: ItemStateCommand): ItemAction {
  switch (command.type) {
    case 'ITEM_CREATE': return { kind: 'acquire', instance: command.instance, placement: command.placement, historyType: command.historyType };
    case 'ITEM_EQUIP': return { kind: 'equip', instanceId: command.instanceId, position: command.position, displacedTo: command.displacedTo };
    case 'ITEM_UNEQUIP': return { kind: 'unequip', instanceId: command.instanceId, to: command.to };
    case 'ITEM_USE': return { kind: 'use', instanceId: command.instanceId, quantity: command.quantity };
    case 'ITEM_TRANSFER': return { kind: 'transfer', instanceId: command.instanceId, to: command.to, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_GIFT': return { kind: 'gift', instanceId: command.instanceId, recipientId: command.recipientId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_DISCARD': return { kind: 'discard', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_REPAIR': return { kind: 'repair', instanceId: command.instanceId, amount: command.amount };
    case 'ITEM_DAMAGE': return { kind: 'damage', instanceId: command.instanceId, amount: command.amount, reason: command.reason };
    case 'ITEM_SPLIT': return { kind: 'split', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId, to: command.to };
    case 'ITEM_MERGE': return { kind: 'merge', sourceInstanceId: command.sourceInstanceId, targetInstanceId: command.targetInstanceId };
    case 'ITEM_MARK_HEIRLOOM': return { kind: 'mark_heirloom', instanceId: command.instanceId, houseId: command.houseId };
  }
}

function cloneCommitSlice(state: WorldCommitSlice): WorldCommitSlice {
  return {
    runtime: cloneWorldRuntimeState(state.runtime),
    items: structuredClone(state.items),
    ...(state.journey ? { journey: structuredClone(state.journey) } : {}),
    date: { ...state.date },
  };
}

function actorIdFor(transaction: WorldTransaction): import('../characters/types').CharacterId | undefined {
  return transaction.intents[0]?.actorId ?? transaction.eventDrafts.flatMap((draft) => draft.actorIds)[0];
}

function applyItemCommands(
  state: WorldCommitSlice,
  baseline: WorldBaselineSnapshot,
  transaction: WorldTransaction,
): void {
  if (!transaction.itemCommands?.length) return;
  const actorId = actorIdFor(transaction);
  if (!actorId) throw new Error('物品命令缺少行动人物');
  const actor = projectWorldCharacter(baseline, state.runtime, actorId);
  if (!actor) throw new Error(`人物不存在：${actorId}`);
  const context: ItemActionContext = {
    actorId,
    actorLocation: actor.location ?? { locationId: UNKNOWN_WESTEROS_LOCATION_ID },
    gameDate: `${state.date.year}.${state.date.month}.${state.date.day}`,
    accessibleSiteIds: new Set(Object.keys(state.items.sites)),
    accessibleVehicleIds: new Set(Object.keys(state.items.vehicles)),
  };
  const applied = applyItemActions(
    state.items,
    transaction.itemCommands.map(itemCommandToAction),
    context,
    ITEM_CATALOG,
  );
  if (!applied.ok) throw new Error(applied.error);
  state.items = applied.state;
}

function placementFromItem(
  placement: ItemPlacement,
  actorId: import('../characters/types').CharacterId | undefined,
): { placement: AssetPlacement | null; equippedPosition: WorldAssetBaseline['equippedPosition'] } {
  if (placement.type === 'site') return { placement: { type: 'asset', assetId: placement.siteId }, equippedPosition: null };
  if (placement.type === 'vehicle') return { placement: { type: 'asset', assetId: placement.vehicleId }, equippedPosition: null };
  if (placement.type === 'character') return { placement: { type: 'character', characterId: placement.characterId as import('../characters/types').CharacterId }, equippedPosition: null };
  if (placement.type === 'equipped') return { placement: actorId ? { type: 'character', characterId: actorId } : null, equippedPosition: placement.position };
  if (placement.type === 'carried') return { placement: actorId ? { type: 'character', characterId: actorId } : null, equippedPosition: null };
  return { placement: null, equippedPosition: null };
}

function itemDerivedAssets(
  items: ItemSystemState,
  baseline: WorldBaselineSnapshot,
  actorId: import('../characters/types').CharacterId | undefined,
): WorldAssetBaseline[] {
  const assets = new Map(baseline.assets);
  for (const site of Object.values(items.sites)) {
    const previous = assets.get(site.id);
    assets.set(site.id, {
      id: site.id,
      kind: 'site',
      lawfulOwner: previous?.lawfulOwner ?? null,
      controller: previous?.controller ?? null,
      custodian: null,
      placement: { type: 'location', location: { ...site.location } },
      equippedPosition: null,
      status: previous?.status ?? 'normal',
    });
  }
  for (const vehicle of Object.values(items.vehicles)) {
    const previous = assets.get(vehicle.id);
    assets.set(vehicle.id, {
      id: vehicle.id,
      kind: 'vehicle',
      lawfulOwner: previous?.lawfulOwner ?? null,
      controller: previous?.controller ?? null,
      custodian: null,
      placement: { type: 'location', location: { ...vehicle.location } },
      equippedPosition: null,
      status: previous?.status ?? 'normal',
    });
  }
  for (const instance of Object.values(items.instances)) {
    const placement = placementFromItem(items.placements[instance.instanceId] ?? { type: 'lost', reason: '位置未记录' }, actorId);
    const previous = assets.get(instance.instanceId);
    const custodian = placement.placement?.type === 'character'
      ? { type: 'character' as const, characterId: placement.placement.characterId }
      : placement.placement?.type === 'asset'
        ? { type: 'asset' as const, assetId: placement.placement.assetId }
        : null;
    assets.set(instance.instanceId, {
      id: instance.instanceId,
      kind: 'item',
      definitionId: instance.definitionId,
      lawfulOwner: previous?.lawfulOwner ?? (actorId ? { type: 'character', characterId: actorId } : null),
      controller: previous?.controller ?? (actorId ? { type: 'character', characterId: actorId } : null),
      custodian,
      placement: placement.placement,
      equippedPosition: placement.equippedPosition,
      status: previous?.status ?? 'normal',
    });
  }
  return [...assets.values()];
}

function rebuildBaseline(
  baseline: WorldBaselineSnapshot,
  items: ItemSystemState,
  transaction: WorldTransaction,
): WorldBaselineSnapshot {
  return createWorldBaselineSnapshot({
    characters: [...baseline.characters.values()],
    titles: [...baseline.titles.values()],
    assets: itemDerivedAssets(items, baseline, actorIdFor(transaction)),
    knownLocationIds: [...baseline.knownLocationIds],
  });
}

function requireCharacter(baseline: WorldBaselineSnapshot, runtime: WorldRuntimeState, characterId: import('../characters/types').CharacterId): void {
  if (!projectWorldCharacter(baseline, runtime, characterId)) throw new Error(`人物不存在：${characterId}`);
}

function requireTitle(baseline: WorldBaselineSnapshot, runtime: WorldRuntimeState, titleId: string): void {
  if (!projectWorldTitle(baseline, runtime, titleId)) throw new Error(`头衔不存在：${titleId}`);
}

function requireAsset(baseline: WorldBaselineSnapshot, runtime: WorldRuntimeState, assetId: string): WorldAssetBaseline {
  const asset = projectWorldAsset(baseline, runtime, assetId);
  if (!asset) throw new Error(`资产不存在：${assetId}`);
  return asset;
}

function patchForAsset(baseline: WorldBaselineSnapshot, runtime: WorldRuntimeState, assetId: string): AssetWorldPatch {
  const asset = requireAsset(baseline, runtime, assetId);
  const existing = runtime.assets[assetId];
  return existing ? { ...existing } : { kind: asset.kind };
}

function applyMutation(runtime: WorldRuntimeState, baseline: WorldBaselineSnapshot, mutation: WorldMutation): void {
  switch (mutation.type) {
    case 'character.move':
      requireCharacter(baseline, runtime, mutation.characterId);
      runtime.characters[mutation.characterId] = {
        ...(runtime.characters[mutation.characterId] ?? {}),
        location: { ...mutation.location },
        ...(mutation.activity ? { currentActivity: mutation.activity } : {}),
      };
      return;
    case 'character.set-alive':
      requireCharacter(baseline, runtime, mutation.characterId);
      runtime.characters[mutation.characterId] = { ...(runtime.characters[mutation.characterId] ?? {}), alive: mutation.alive };
      return;
    case 'title.set-holder':
      requireTitle(baseline, runtime, mutation.titleId);
      if (mutation.holderId) requireCharacter(baseline, runtime, mutation.holderId);
      runtime.titles[mutation.titleId] = { ...(runtime.titles[mutation.titleId] ?? {}), lawfulHolderId: mutation.holderId };
      return;
    case 'title.set-controller':
      requireTitle(baseline, runtime, mutation.titleId);
      if (mutation.controllerId) requireCharacter(baseline, runtime, mutation.controllerId);
      mutation.contestedByIds?.forEach((id) => requireCharacter(baseline, runtime, id));
      runtime.titles[mutation.titleId] = {
        ...(runtime.titles[mutation.titleId] ?? {}),
        controllerId: mutation.controllerId,
        ...(mutation.contestedByIds ? { contestedByIds: [...mutation.contestedByIds] } : {}),
      };
      return;
    case 'asset.delete-runtime-patch':
      requireAsset(baseline, runtime, mutation.assetId);
      delete runtime.assets[mutation.assetId];
      return;
    case 'asset.set-lawful-owner':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), lawfulOwner: mutation.owner };
      return;
    case 'asset.set-controller':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), controller: mutation.controller };
      return;
    case 'asset.set-custodian':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), custodian: mutation.custodian };
      return;
    case 'asset.place':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), placement: mutation.placement };
      return;
    case 'asset.equip':
      requireCharacter(baseline, runtime, mutation.characterId);
      runtime.assets[mutation.assetId] = {
        ...patchForAsset(baseline, runtime, mutation.assetId),
        placement: { type: 'character', characterId: mutation.characterId },
        custodian: { type: 'character', characterId: mutation.characterId },
        equippedPosition: { ...mutation.position },
      };
      return;
    case 'asset.unequip':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), equippedPosition: null };
      return;
    case 'asset.set-status':
      runtime.assets[mutation.assetId] = { ...patchForAsset(baseline, runtime, mutation.assetId), status: mutation.status };
      return;
  }
}

function validatePrincipal(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  principal: WorldPrincipalRef | null,
): void {
  if (!principal) return;
  if (principal.type === 'character') requireCharacter(baseline, runtime, principal.characterId);
  if (principal.type === 'title') requireTitle(baseline, runtime, principal.titleId);
}

function validateFinalState(baseline: WorldBaselineSnapshot, runtime: WorldRuntimeState): void {
  validateWorldRuntimeState(runtime);
  for (const characterId of Object.keys(runtime.characters) as Array<import('../characters/types').CharacterId>) {
    const character = projectWorldCharacter(baseline, runtime, characterId);
    if (character?.location && !baseline.knownLocationIds.has(character.location.locationId)) {
      throw new Error(`地点不存在：${character.location.locationId}`);
    }
  }
  for (const titleId of new Set([...baseline.titles.keys(), ...Object.keys(runtime.titles)])) {
    const title = projectWorldTitle(baseline, runtime, titleId);
    if (!title) continue;
    if (title.lawfulHolderId) requireCharacter(baseline, runtime, title.lawfulHolderId);
    if (title.controllerId) requireCharacter(baseline, runtime, title.controllerId);
    title.contestedByIds.forEach((id) => requireCharacter(baseline, runtime, id));
  }
  for (const assetId of new Set([...baseline.assets.keys(), ...Object.keys(runtime.assets)])) {
    const asset = projectWorldAsset(baseline, runtime, assetId);
    if (!asset) continue;
    validatePrincipal(baseline, runtime, asset.lawfulOwner);
    validatePrincipal(baseline, runtime, asset.controller);
    if (asset.custodian?.type === 'character') requireCharacter(baseline, runtime, asset.custodian.characterId);
    if (asset.custodian?.type === 'asset') requireAsset(baseline, runtime, asset.custodian.assetId);
    if (asset.placement?.type === 'character') requireCharacter(baseline, runtime, asset.placement.characterId);
    if (asset.placement?.type === 'location' && !baseline.knownLocationIds.has(asset.placement.location.locationId)) {
      throw new Error(`地点不存在：${asset.placement.location.locationId}`);
    }
    if (asset.placement?.type === 'asset') requireAsset(baseline, runtime, asset.placement.assetId);
    resolveAssetMapLocation(baseline, runtime, assetId);
  }
}

function eventDrafts(transaction: WorldTransaction): WorldTransaction['eventDrafts'] {
  if (transaction.eventDrafts.length) return transaction.eventDrafts;
  return [{
    type: 'transaction.committed',
    actorIds: [...new Set(transaction.intents.map((intent) => intent.actorId))],
    subjectRefs: [],
    reason: transaction.reason,
    visibility: 'public',
  }];
}

export function commitWorldTransaction(
  state: WorldCommitSlice,
  baseline: WorldBaselineSnapshot,
  transaction: WorldTransaction,
): WorldTransactionResult {
  const committed = state.runtime.events.filter((event) => event.transactionId === transaction.id);
  if (committed.length) {
    return { ok: true, state, transactionId: transaction.id, duplicate: true, events: committed };
  }

  try {
    if (!transaction.id.trim()) throw new Error('世界事务 ID 不能为空');
    if (!Number.isInteger(transaction.turn) || transaction.turn < 0) throw new Error('世界事务回合不合法');
    if (!transaction.reason.trim()) throw new Error('世界事务原因不能为空');
    const next = cloneCommitSlice(state);
    applyItemCommands(next, baseline, transaction);
    const rebuiltBaseline = rebuildBaseline(baseline, next.items, transaction);
    transaction.mutations.forEach((mutation) => applyMutation(next.runtime, rebuiltBaseline, mutation));
    if (transaction.dateAdvance) next.date = advanceWorldDate(next.date, transaction.dateAdvance);
    if (transaction.nextJourney === null) delete next.journey;
    else if (transaction.nextJourney !== undefined) next.journey = structuredClone(transaction.nextJourney);

    validateFinalState(rebuiltBaseline, next.runtime);
    const events: WorldEvent[] = eventDrafts(transaction).map((draft, index) => ({
      ...structuredClone(draft),
      id: `${transaction.id}:event:${String(index + 1).padStart(3, '0')}`,
      transactionId: transaction.id,
      turn: transaction.turn,
      date: { ...next.date },
      source: transaction.source,
    }));
    next.runtime.events.push(...events);
    next.runtime.revision += 1;
    validateWorldRuntimeState(next.runtime);
    return { ok: true, state: next, transactionId: transaction.id, duplicate: false, events };
  } catch (error) {
    return {
      ok: false,
      state,
      transactionId: transaction.id,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
