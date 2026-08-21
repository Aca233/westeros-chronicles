import type { CharacterId } from '../characters/types';
import { actionToCommand } from '../items/itemActionQueue';
import type {
  EquipmentPosition,
  ItemAction,
  ItemPlacement,
  ItemStateCommand,
} from '../items/types';
import type { TravelStateCommand } from '../map/travel/types';
import { worldAssetId } from './worldBaseline';
import type {
  AssetPlacement,
  PendingWorldTransaction,
  WorldIntent,
} from './worldRuntimeTypes';

export interface WorldIntentConversion {
  conflictKeys: string[];
  intents: WorldIntent[];
  itemCommands?: ItemStateCommand[];
  travelCommands?: TravelStateCommand[];
}


let pendingTransactionSequence = 0;

export function createPendingWorldTransaction(
  conversion: WorldIntentConversion,
  options: { id?: string; source?: PendingWorldTransaction['source'] } = {},
): PendingWorldTransaction {
  pendingTransactionSequence += 1;
  const id = options.id?.trim()
    || `world-tx:${Date.now().toString(36)}:${pendingTransactionSequence.toString(36)}`;
  return {
    id,
    status: 'pending',
    source: options.source ?? 'ui_action',
    conflictKeys: uniqueConflictKeys(conversion.conflictKeys),
    intents: structuredClone(conversion.intents),
    ...(conversion.itemCommands?.length ? { itemCommands: structuredClone(conversion.itemCommands) } : {}),
    ...(conversion.travelCommands?.length ? { travelCommands: structuredClone(conversion.travelCommands) } : {}),
  };
}

export function pendingTravelTransactionFor(
  queue: readonly PendingWorldTransaction[],
  actorId: CharacterId,
): PendingWorldTransaction | undefined {
  return [...queue].reverse().find((entry) => entry.status === 'pending'
    && entry.conflictKeys.includes(`journey:${actorId}`)
    && Boolean(entry.travelCommands?.length));
}

function cloneTransaction(transaction: PendingWorldTransaction): PendingWorldTransaction {
  return structuredClone(transaction);
}

function uniqueConflictKeys(keys: readonly string[]): string[] {
  const result = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (!result.length) throw new Error('待处理世界事务至少需要一个冲突键');
  return result;
}

export function serializeEquipmentPosition(position: EquipmentPosition): string {
  if (position.group === 'torso') return `torso:${position.layer}`;
  if (position.group === 'legs') return `legs:${position.layer}`;
  if (position.group === 'accessories') return `accessories:${position.index}`;
  return position.group;
}

export function enqueueWorldTransaction(
  queue: readonly PendingWorldTransaction[],
  transaction: PendingWorldTransaction,
): PendingWorldTransaction[] {
  if (transaction.status !== 'pending') throw new Error('只能将待处理事务加入队列');
  if (!transaction.id.trim()) throw new Error('待处理世界事务 ID 不能为空');
  const conflictKeys = uniqueConflictKeys(transaction.conflictKeys);
  const existing = queue.find((entry) => entry.id === transaction.id);
  if (existing && existing.status !== 'pending') throw new Error('已结算事务不可替换');

  const conflicts = new Set(conflictKeys);
  const retained = queue.filter((entry) => {
    if (entry.id === transaction.id) return false;
    if (entry.status !== 'pending') return true;
    return !entry.conflictKeys.some((key) => conflicts.has(key));
  });
  return [...retained.map(cloneTransaction), cloneTransaction({
    ...transaction,
    conflictKeys,
    rejectionReason: undefined,
  })];
}

export function cancelWorldTransaction(
  queue: readonly PendingWorldTransaction[],
  transactionId: string,
): PendingWorldTransaction[] {
  const target = queue.find((entry) => entry.id === transactionId);
  if (!target) throw new Error(`待处理事务不存在：${transactionId}`);
  if (target.status !== 'pending') throw new Error('只能取消待处理事务');
  return queue.map((entry) => entry.id === transactionId
    ? { ...cloneTransaction(entry), status: 'cancelled', rejectionReason: undefined }
    : cloneTransaction(entry));
}

export function settleWorldTransactionStatus(
  queue: readonly PendingWorldTransaction[],
  transactionId: string,
  status: 'committed' | 'rejected',
  rejectionReason?: string,
): PendingWorldTransaction[] {
  const target = queue.find((entry) => entry.id === transactionId);
  if (!target) throw new Error(`待处理事务不存在：${transactionId}`);
  if (target.status !== 'pending') throw new Error('只能结算待处理事务');
  if (status === 'rejected' && !rejectionReason?.trim()) throw new Error('拒绝事务必须说明原因');
  return queue.map((entry) => entry.id === transactionId
    ? {
        ...cloneTransaction(entry),
        status,
        ...(status === 'rejected' ? { rejectionReason: rejectionReason!.trim() } : { rejectionReason: undefined }),
      }
    : cloneTransaction(entry));
}

function itemPlacementToAssetPlacement(
  placement: ItemPlacement,
  actorId: CharacterId,
): AssetPlacement | null {
  switch (placement.type) {
    case 'carried': return { type: 'character', characterId: actorId };
    case 'character': return { type: 'character', characterId: placement.characterId as CharacterId };
    case 'site': return { type: 'asset', assetId: worldAssetId.site(placement.siteId) };
    case 'vehicle': return { type: 'asset', assetId: worldAssetId.vehicle(placement.vehicleId) };
    case 'equipped': return { type: 'character', characterId: actorId };
    case 'lost': return null;
  }
}

function primaryItemInstanceId(action: ItemAction): string {
  if (action.kind === 'acquire') return action.instance.instanceId;
  if (action.kind === 'merge') return action.sourceInstanceId;
  return action.instanceId;
}

function relationTargetInstanceId(action: ItemAction): string {
  if ('newInstanceId' in action && action.newInstanceId) return action.newInstanceId;
  return primaryItemInstanceId(action);
}

export function itemActionToWorldIntent(
  action: ItemAction,
  actorId: CharacterId,
  evidenceText: string,
): WorldIntentConversion {
  const sourceAssetId = worldAssetId.item(primaryItemInstanceId(action));
  const targetAssetId = worldAssetId.item(relationTargetInstanceId(action));
  const conflictKeys = [`asset:${sourceAssetId}`];
  const intents: WorldIntent[] = [];

  switch (action.kind) {
    case 'equip':
      conflictKeys.push(`equipment:${actorId}:${serializeEquipmentPosition(action.position)}`);
      intents.push({ kind: 'equip_asset', actorId, assetId: sourceAssetId, position: { ...action.position }, evidenceText });
      break;
    case 'unequip': {
      const placement = itemPlacementToAssetPlacement(action.to, actorId);
      if (placement) intents.push({ kind: 'unequip_asset', actorId, assetId: sourceAssetId, placement, evidenceText });
      break;
    }
    case 'gift':
      intents.push({ kind: 'gift_asset', actorId, assetId: targetAssetId, recipientId: action.recipientId as CharacterId, evidenceText });
      break;
    case 'transfer':
    case 'split': {
      const placement = itemPlacementToAssetPlacement(action.to, actorId);
      if (placement) intents.push({ kind: 'transfer_asset', actorId, assetId: targetAssetId, placement, evidenceText });
      break;
    }
    case 'acquire': {
      const placement = itemPlacementToAssetPlacement(action.placement, actorId);
      if (action.placement.type === 'equipped') {
        conflictKeys.push(`equipment:${actorId}:${serializeEquipmentPosition(action.placement.position)}`);
        intents.push({ kind: 'equip_asset', actorId, assetId: targetAssetId, position: { ...action.placement.position }, evidenceText });
      } else if (placement) {
        intents.push({ kind: 'transfer_asset', actorId, assetId: targetAssetId, placement, evidenceText });
      }
      break;
    }
    case 'discard':
    case 'merge':
    case 'use':
    case 'repair':
    case 'damage':
    case 'mark_heirloom':
      break;
  }

  return {
    conflictKeys: uniqueConflictKeys(conflictKeys),
    intents,
    itemCommands: [actionToCommand(action)],
  };
}

function routeDestination(command: TravelStateCommand): string | undefined {
  if ('routePlan' in command) return command.routePlan?.to;
  return undefined;
}

type TravelIntentKind = 'plan_travel' | 'start_travel' | 'pause_travel' | 'resume_travel' | 'reroute_travel' | 'return_travel' | 'advance_travel' | 'cancel_travel';

function travelIntentKind(command: TravelStateCommand): TravelIntentKind {
  switch (command.type) {
    case 'PLAN_TRAVEL': return 'plan_travel';
    case 'START_TRAVEL': return 'start_travel';
    case 'PAUSE_TRAVEL': return 'pause_travel';
    case 'RESUME_TRAVEL': return 'resume_travel';
    case 'REROUTE_TRAVEL': return 'reroute_travel';
    case 'RETURN_TRAVEL': return 'return_travel';
    case 'ADVANCE_TRAVEL': return 'advance_travel';
    case 'CANCEL_PLANNED_TRAVEL': return 'cancel_travel';
  }
}

export function travelCommandToWorldIntent(
  command: TravelStateCommand,
  actorId: CharacterId,
  evidenceText: string,
): WorldIntentConversion {
  const destinationId = routeDestination(command);
  const elapsedTime = command.type === 'ADVANCE_TRAVEL' ? { days: command.days } : undefined;
  const intent: WorldIntent = {
    kind: travelIntentKind(command),
    actorId,
    ...(destinationId ? { targetRef: { type: 'location', location: { locationId: destinationId } } } : {}),
    ...(elapsedTime ? { elapsedTime } : {}),
    evidenceText,
  };
  return {
    conflictKeys: [`journey:${actorId}`],
    intents: [intent],
    travelCommands: [structuredClone(command)],
  };
}
