import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { applyItemActions, type ItemActionContext } from '../items/actions';
import type { ItemAction, ItemPlacement, ItemStateCommand, ItemSystemState } from '../items/types';
import { sameWorldLocation, UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';
import { advanceWorldDate } from './worldHistory';
import { advanceGameMoment } from '../time/gameClock';
import { worldAssetId } from './worldAssetId';
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
  resolvePrincipalCharacter,
} from './worldProjection';
import { cloneWorldRuntimeState, validateWorldRuntimeState } from './worldRuntimeState';
import { applyLivingWorldIntent } from './livingWorldEngine';
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
    ...(state.health ? { health: structuredClone(state.health) } : {}),
    ...(state.journey ? { journey: structuredClone(state.journey) } : {}),
    date: { ...state.date },
    minuteOfDay: state.minuteOfDay,
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
  const actorLocation = actor.location ?? { locationId: UNKNOWN_WESTEROS_LOCATION_ID };
  const context: ItemActionContext = {
    actorId,
    actorLocation,
    gameDate: `${state.date.year}.${state.date.month}.${state.date.day}`,
    accessibleSiteIds: new Set(
      Object.values(state.items.sites)
        .filter((site) => sameWorldLocation(site.location, actorLocation))
        .map((site) => site.id),
    ),
    accessibleVehicleIds: new Set(
      Object.values(state.items.vehicles)
        .filter((vehicle) => sameWorldLocation(vehicle.location, actorLocation))
        .map((vehicle) => vehicle.id),
    ),
    ...(state.health?.characters[actorId] ? { health: state.health.characters[actorId] } : {}),
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
  if (placement.type === 'site') return { placement: { type: 'asset', assetId: worldAssetId.site(placement.siteId) }, equippedPosition: null };
  if (placement.type === 'vehicle') return { placement: { type: 'asset', assetId: worldAssetId.vehicle(placement.vehicleId) }, equippedPosition: null };
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
    const id = worldAssetId.site(site.id);
    const previous = assets.get(id);
    assets.set(id, {
      id,
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
    const id = worldAssetId.vehicle(vehicle.id);
    const previous = assets.get(id);
    assets.set(id, {
      id,
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

export function siteAccessEventDrafts(
  captures: ReadonlyArray<{ instanceId: string; siteId: string }>,
  actorId: import('../characters/types').CharacterId | undefined,
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
): NonNullable<WorldTransaction['eventDrafts']> {
  if (!captures.length) return [];
  const drafts: WorldTransaction['eventDrafts'] = [];
  for (const capture of captures) {
    const siteAssetId = worldAssetId.site(capture.siteId);
    const site = projectWorldAsset(baseline, runtime, siteAssetId);
    if (!site) continue;
    const controllerCharacter = resolvePrincipalCharacter(baseline, runtime, site.controller, 'controllerId');
    // 无主据点或行动者本人控制：取用不产生代价事件；否则世界记得这次越权。
    if (!site.controller || controllerCharacter === actorId) continue;
    drafts.push({
      type: 'site.access',
      actorIds: actorId ? [actorId] : [],
      subjectRefs: [
        { type: 'asset', assetId: siteAssetId },
        { type: 'asset', assetId: capture.instanceId },
      ],
      ...(site.placement?.type === 'location' ? { location: { ...site.placement.location } } : {}),
      reason: '从不由其控制的据点取用了物品',
      visibility: 'public',
    });
  }
  return drafts;
}

function applySiteCreations(items: ItemSystemState, sites: readonly import('../items/types').ItemStorageSite[]): void {
  for (const site of sites) {
    if (items.sites[site.id]) throw new Error(`据点已存在：${site.id}`);
    items.sites[site.id] = structuredClone(site);
  }
}

function applyLivingIntents(
  state: WorldCommitSlice,
  baseline: WorldBaselineSnapshot,
  transaction: WorldTransaction,
): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const intent of transaction.intents) {
    if (!['investigate_situation', 'negotiate_access', 'escort_transport', 'reroute_transport', 'request_relief', 'delegate_relief'].includes(intent.kind)) continue;
    const actor = projectWorldCharacter(baseline, state.runtime, intent.actorId);
    if (!actor?.location) throw new Error(`地方事务行动者当前位置不可验证：${intent.actorId}`);
    const applied = applyLivingWorldIntent(state.runtime, intent as import('./worldRuntimeTypes').LivingWorldIntent, state.date, {
      turn: transaction.turn,
      actorId: intent.actorId,
      actorLocation: actor.location,
      transactionId: transaction.id,
      // 委派同意已在回合准备阶段依据 roleplay 账本验证；原子提交只重放已接受意图。
      hasDelegationConsent: () => true,
    });
    state.runtime = applied.runtime;
    events.push(...applied.events);
  }
  return events;
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
    if (transaction.dateAdvance && transaction.timeAdvanceMinutes !== undefined) throw new Error('同一世界事务不能同时使用日期推进和分钟推进');
    if (transaction.timeAdvanceMinutes !== undefined && (!Number.isInteger(transaction.timeAdvanceMinutes) || transaction.timeAdvanceMinutes < 0)) throw new Error('世界事务分钟耗时无效');
    const next = cloneCommitSlice(state);
    // 取物前先记录来源据点：结算后用于判定是否发生越权取用。
    const siteAccessCaptures = (transaction.itemCommands ?? []).flatMap((command) => {
      if (command.type !== 'ITEM_TRANSFER' && command.type !== 'ITEM_SPLIT') return [];
      const placement = next.items.placements[command.instanceId];
      if (placement?.type !== 'site') return [];
      return [{ instanceId: command.instanceId, siteId: placement.siteId }];
    });
    applySiteCreations(next.items, transaction.siteCreations ?? []);
    applyItemCommands(next, baseline, transaction);
    const rebuiltBaseline = rebuildBaseline(baseline, next.items, transaction);
    transaction.mutations.forEach((mutation) => applyMutation(next.runtime, rebuiltBaseline, mutation));
    const livingEvents = applyLivingIntents(next, rebuiltBaseline, transaction);
    if (transaction.timeAdvanceMinutes !== undefined) {
      const advanced = advanceGameMoment({ date: next.date, minuteOfDay: next.minuteOfDay }, transaction.timeAdvanceMinutes);
      next.date = advanced.date;
      next.minuteOfDay = advanced.minuteOfDay;
    } else if (transaction.dateAdvance) {
      next.date = advanceWorldDate(next.date, transaction.dateAdvance);
    }
    if (transaction.nextJourney === null) delete next.journey;
    else if (transaction.nextJourney !== undefined) next.journey = structuredClone(transaction.nextJourney);

    validateFinalState(rebuiltBaseline, next.runtime);
    const toEvent = (draft: NonNullable<WorldTransaction['eventDrafts']>[number], prefix: string, index: number): WorldEvent => ({
      ...structuredClone(draft),
      id: `${transaction.id}:${prefix}:${String(index + 1).padStart(3, '0')}`,
      transactionId: transaction.id,
      turn: transaction.turn,
      date: { ...next.date },
      source: transaction.source,
    });
    const events: WorldEvent[] = eventDrafts(transaction).map((draft, index) => toEvent(draft, 'event', index));
    next.runtime.events.push(...events);
    const accessEvents = siteAccessEventDrafts(siteAccessCaptures, actorIdFor(transaction), rebuiltBaseline, next.runtime)
      .map((draft, index) => toEvent(draft, 'site-access', index));
    next.runtime.events.push(...accessEvents);
    next.runtime.revision += 1;
    validateWorldRuntimeState(next.runtime);
    return { ok: true, state: next, transactionId: transaction.id, duplicate: false, events: [...livingEvents, ...events, ...accessEvents] };
  } catch (error) {
    return {
      ok: false,
      state,
      transactionId: transaction.id,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
