import { validateWorldLocationRef } from '../map/locationResolver.ts';
import type { EquipmentPosition } from '../items/types';
import type {
  AssetPlacement,
  AssetWorldPatch,
  PendingWorldTransaction,
  WorldEvent,
  WorldPrincipalRef,
  WorldRuntimeState,
  WorldSubjectRef,
} from './worldRuntimeTypes.ts';

const CHARACTER_ID_PATTERN = /^(?:agot:[^\s:]+|save:[^\s:]+:[^\s:]+)$/;
const STABLE_ID_PATTERN = /^\S+$/;
const EVENT_SOURCES = new Set(['player_input', 'ui_action', 'ai_resolution', 'system_rule']);
const EVENT_VISIBILITIES = new Set(['public', 'secret']);
const TRANSACTION_STATUSES = new Set(['pending', 'committed', 'rejected', 'cancelled']);
const TRANSACTION_SOURCES = new Set(['ui_action', 'player_input']);
const ACTIVITIES = new Set(['idle', 'travelling', 'imprisoned', 'missing']);
const ASSET_KINDS = new Set(['item', 'site', 'vehicle']);
const ASSET_STATUSES = new Set(['normal', 'stolen', 'inheritance_pending']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || !STABLE_ID_PATTERN.test(value)) {
    throw new Error(`${label}不合法`);
  }
}

function assertCharacterId(value: unknown, label = '人物 ID'): void {
  if (typeof value !== 'string' || !CHARACTER_ID_PATTERN.test(value)) {
    throw new Error(`${label}不合法`);
  }
}

function assertLocation(value: unknown, label = '地点引用'): void {
  if (!validateWorldLocationRef(value)) throw new Error(`${label}不合法`);
}

function assertEquipmentPosition(value: unknown): asserts value is EquipmentPosition {
  if (!isRecord(value) || typeof value.group !== 'string') throw new Error('装备位置不合法');
  if (value.group === 'head' || value.group === 'mainhand' || value.group === 'offhand') {
    if (Object.keys(value).some((key) => key !== 'group')) throw new Error('装备位置不合法');
    return;
  }
  if (value.group === 'torso' && ['garment', 'armor', 'outerwear'].includes(String(value.layer))) return;
  if (value.group === 'legs' && ['legwear', 'footwear'].includes(String(value.layer))) return;
  if (value.group === 'accessories' && [0, 1, 2].includes(Number(value.index))) return;
  throw new Error('装备位置不合法');
}

function assertPrincipalRef(value: unknown, label = '权利主体'): asserts value is WorldPrincipalRef {
  if (!isRecord(value)) throw new Error(`${label}不合法`);
  if (value.type === 'character') return assertCharacterId(value.characterId, `${label}人物 ID`);
  if (value.type === 'dynasty') return assertStableId(value.dynastyId, `${label}家族 ID`);
  if (value.type === 'title') return assertStableId(value.titleId, `${label}头衔 ID`);
  throw new Error(`${label}不合法`);
}

function assertPlacement(value: unknown, assetId?: string): asserts value is AssetPlacement {
  if (!isRecord(value)) throw new Error('资产位置不合法');
  if (value.type === 'character') return assertCharacterId(value.characterId, '资产位置人物 ID');
  if (value.type === 'location') return assertLocation(value.location, '资产位置地点引用');
  if (value.type === 'asset') {
    assertStableId(value.assetId, '容器资产 ID');
    if (assetId !== undefined && value.assetId === assetId) throw new Error(`资产不能直接放入自身：${assetId}`);
    return;
  }
  throw new Error('资产位置不合法');
}

function assertSubjectRef(value: unknown): asserts value is WorldSubjectRef {
  if (!isRecord(value)) throw new Error('世界事件主体引用不合法');
  if (value.type === 'asset') return assertStableId(value.assetId, '世界事件资产 ID');
  if (value.type === 'location') return assertLocation(value.location, '世界事件地点引用');
  assertPrincipalRef(value, '世界事件主体引用');
}

function assertDate(value: unknown): void {
  if (!isRecord(value)
    || !Number.isInteger(value.year)
    || !Number.isInteger(value.month)
    || !Number.isInteger(value.day)
    || Number(value.month) < 1
    || Number(value.month) > 12
    || Number(value.day) < 1
    || Number(value.day) > 30) {
    throw new Error('世界事件日期不合法');
  }
}

function assertEvent(value: unknown): asserts value is WorldEvent {
  if (!isRecord(value)) throw new Error('世界事件不合法');
  assertStableId(value.id, '世界事件 ID');
  assertStableId(value.transactionId, '世界事务 ID');
  if (!Number.isInteger(value.turn) || Number(value.turn) < 0) throw new Error('世界事件回合不合法');
  assertDate(value.date);
  assertStableId(value.type, '世界事件类型');
  if (!Array.isArray(value.actorIds)) throw new Error('世界事件行动人物不合法');
  value.actorIds.forEach((id) => assertCharacterId(id, '世界事件行动人物 ID'));
  if (!Array.isArray(value.subjectRefs)) throw new Error('世界事件主体列表不合法');
  value.subjectRefs.forEach(assertSubjectRef);
  if (value.location !== undefined) assertLocation(value.location, '世界事件地点引用');
  if (typeof value.reason !== 'string' || !value.reason.trim()) throw new Error('世界事件原因不能为空');
  if (!EVENT_SOURCES.has(String(value.source))) throw new Error('世界事件来源不合法');
  if (value.canonicalEventId !== undefined) assertStableId(value.canonicalEventId, '原作事件 ID');
  if (!EVENT_VISIBILITIES.has(String(value.visibility))) throw new Error('世界事件可见性不合法');
  if (value.knownBy !== undefined) {
    if (!Array.isArray(value.knownBy)) throw new Error('世界事件知情人物不合法');
    value.knownBy.forEach((id) => assertCharacterId(id, '世界事件知情人物 ID'));
  }
}

function assertAssetPatch(assetId: string, value: unknown): asserts value is AssetWorldPatch {
  if (!isRecord(value) || !ASSET_KINDS.has(String(value.kind))) throw new Error(`资产 ${assetId} 类型不合法`);
  if (value.lawfulOwner !== undefined && value.lawfulOwner !== null) assertPrincipalRef(value.lawfulOwner, '资产法理所有者');
  if (value.controller !== undefined && value.controller !== null) assertPrincipalRef(value.controller, '资产控制者');
  if (value.custodian !== undefined && value.custodian !== null) {
    if (!isRecord(value.custodian)) throw new Error('资产保管者不合法');
    if (value.custodian.type === 'character') assertCharacterId(value.custodian.characterId, '资产保管人物 ID');
    else if (value.custodian.type === 'asset') assertStableId(value.custodian.assetId, '资产保管容器 ID');
    else throw new Error('资产保管者不合法');
  }
  if (value.placement !== undefined && value.placement !== null) assertPlacement(value.placement, assetId);
  if (value.equippedPosition !== undefined && value.equippedPosition !== null) assertEquipmentPosition(value.equippedPosition);
  if (value.status !== undefined && !ASSET_STATUSES.has(String(value.status))) throw new Error('资产状态不合法');

  if (value.equippedPosition !== undefined && value.equippedPosition !== null) {
    if (!isRecord(value.placement) || value.placement.type !== 'character') {
      throw new Error(`已装备资产必须直接位于人物身上：${assetId}`);
    }
    if (value.custodian !== undefined && value.custodian !== null
      && (!isRecord(value.custodian)
        || value.custodian.type !== 'character'
        || value.custodian.characterId !== value.placement.characterId)) {
      throw new Error(`已装备资产的保管人与穿戴者不一致：${assetId}`);
    }
  }
}

function assertPendingTransaction(value: unknown): asserts value is PendingWorldTransaction {
  if (!isRecord(value)) throw new Error('待处理世界事务不合法');
  assertStableId(value.id, '待处理世界事务 ID');
  if (!TRANSACTION_STATUSES.has(String(value.status))) throw new Error('待处理世界事务状态不合法');
  if (!TRANSACTION_SOURCES.has(String(value.source))) throw new Error('待处理世界事务来源不合法');
  if (!Array.isArray(value.conflictKeys) || !value.conflictKeys.every((key) => typeof key === 'string' && key.trim())) {
    throw new Error('待处理世界事务冲突键不合法');
  }
  if (!Array.isArray(value.intents)) throw new Error('待处理世界事务意图不合法');
  if (value.itemCommands !== undefined && !Array.isArray(value.itemCommands)) throw new Error('待处理物品命令不合法');
  if (value.travelCommands !== undefined && !Array.isArray(value.travelCommands)) throw new Error('待处理旅行命令不合法');
  if (value.rejectionReason !== undefined && (typeof value.rejectionReason !== 'string' || !value.rejectionReason.trim())) {
    throw new Error('待处理世界事务拒绝原因不合法');
  }
}

export function createWorldRuntimeState(): WorldRuntimeState {
  return {
    schemaVersion: 1,
    revision: 0,
    characters: {},
    titles: {},
    assets: {},
    events: [],
    pendingTransactions: [],
  };
}

export function cloneWorldRuntimeState(state: WorldRuntimeState): WorldRuntimeState {
  return structuredClone(state);
}

export function validateWorldRuntimeState(value: unknown): asserts value is WorldRuntimeState {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('世界运行时状态版本不合法');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0) throw new Error('世界状态修订号必须是非负整数');
  if (!isRecord(value.characters) || !isRecord(value.titles) || !isRecord(value.assets)) {
    throw new Error('世界运行时稀疏覆盖不合法');
  }

  for (const [characterId, patch] of Object.entries(value.characters)) {
    assertCharacterId(characterId);
    if (!isRecord(patch)) throw new Error(`人物动态状态不合法：${characterId}`);
    if (patch.alive !== undefined && typeof patch.alive !== 'boolean') throw new Error(`人物存活状态不合法：${characterId}`);
    if (patch.location !== undefined && patch.location !== null) assertLocation(patch.location, '人物地点引用');
    if (patch.currentActivity !== undefined && !ACTIVITIES.has(String(patch.currentActivity))) {
      throw new Error(`人物活动状态不合法：${characterId}`);
    }
  }

  for (const [titleId, patch] of Object.entries(value.titles)) {
    assertStableId(titleId, '头衔 ID');
    if (!isRecord(patch)) throw new Error(`头衔动态状态不合法：${titleId}`);
    if (patch.lawfulHolderId !== undefined && patch.lawfulHolderId !== null) assertCharacterId(patch.lawfulHolderId, '头衔持有人 ID');
    if (patch.controllerId !== undefined && patch.controllerId !== null) assertCharacterId(patch.controllerId, '头衔控制者 ID');
    if (patch.contestedByIds !== undefined) {
      if (!Array.isArray(patch.contestedByIds)) throw new Error(`头衔争夺者不合法：${titleId}`);
      patch.contestedByIds.forEach((id) => assertCharacterId(id, '头衔争夺者 ID'));
    }
  }

  for (const [assetId, patch] of Object.entries(value.assets)) {
    assertStableId(assetId, '资产 ID');
    assertAssetPatch(assetId, patch);
  }

  if (!Array.isArray(value.events)) throw new Error('世界事件列表不合法');
  const eventIds = new Set<string>();
  value.events.forEach((event) => {
    assertEvent(event);
    if (eventIds.has(event.id)) throw new Error(`世界事件 ID 重复：${event.id}`);
    eventIds.add(event.id);
  });

  if (!Array.isArray(value.pendingTransactions)) throw new Error('待处理世界事务列表不合法');
  const transactionIds = new Set<string>();
  value.pendingTransactions.forEach((transaction) => {
    assertPendingTransaction(transaction);
    if (transactionIds.has(transaction.id)) throw new Error(`待处理世界事务 ID 重复：${transaction.id}`);
    transactionIds.add(transaction.id);
  });
}
