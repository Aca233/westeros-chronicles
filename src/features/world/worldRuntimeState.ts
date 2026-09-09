import { validateWorldLocationRef } from '../map/locationResolver.ts';
import type { EquipmentPosition } from '../items/types';
import type { LivingWorldState } from './livingWorldContracts';
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
  if (value.causeEventIds !== undefined) {
    if (!Array.isArray(value.causeEventIds)) throw new Error('世界事件真实前因不合法');
    value.causeEventIds.forEach((id) => assertStableId(id, '世界事件前因 ID'));
  }
  if (value.claimedCauseEventIds !== undefined) {
    if (!Array.isArray(value.claimedCauseEventIds)) throw new Error('世界事件声称前因不合法');
    value.claimedCauseEventIds.forEach((id) => assertStableId(id, '世界事件声称前因 ID'));
  }
  if (value.causeSource !== undefined) {
    if (!isRecord(value.causeSource) || !['rule', 'action', 'canonical', 'claim'].includes(String(value.causeSource.type))) throw new Error('世界事件因果来源不合法');
    assertStableId(value.causeSource.id, '世界事件因果来源 ID');
  }
  if (value.affectedRefs !== undefined) {
    if (!Array.isArray(value.affectedRefs)) throw new Error('世界事件受影响对象不合法');
    value.affectedRefs.forEach(assertSubjectRef);
  }
  if (value.occurredAt !== undefined) assertDate(value.occurredAt);
  if (value.knowledgeBasis !== undefined) {
    if (!Array.isArray(value.knowledgeBasis)) throw new Error('世界事件知情依据不合法');
    value.knowledgeBasis.forEach((basis) => {
      if (!isRecord(basis) || !['witness', 'message', 'public_record'].includes(String(basis.kind))) throw new Error('世界事件知情依据类型不合法');
      assertCharacterId(basis.characterId, '知情依据人物 ID');
      if (basis.sourceEventId !== undefined) assertStableId(basis.sourceEventId, '知情依据来源事件 ID');
    });
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

export interface CreateWorldRuntimeOptions {
  livingWorld?: LivingWorldState;
  initialEvents?: WorldEvent[];
}

export function createWorldRuntimeState(options: CreateWorldRuntimeOptions = {}): WorldRuntimeState {
  return {
    schemaVersion: 1,
    revision: 0,
    characters: {},
    titles: {},
    assets: {},
    events: structuredClone(options.initialEvents ?? []),
    pendingTransactions: [],
    ...(options.livingWorld ? { livingWorld: structuredClone(options.livingWorld) } : {}),
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

  if (value.livingWorld !== undefined) {
    if (!isRecord(value.livingWorld)
      || value.livingWorld.schemaVersion !== 1
      || typeof value.livingWorld.scenarioId !== 'string'
      || !value.livingWorld.scenarioId.trim()
      || !isRecord(value.livingWorld.connections)
      || !Array.isArray(value.livingWorld.situations)
      || !Array.isArray(value.livingWorld.actions)
      || !Array.isArray(value.livingWorld.stockpiles)
      || !Array.isArray(value.livingWorld.information)
      || !Array.isArray(value.livingWorld.causalLinks)
      || !Array.isArray(value.livingWorld.processedScheduleKeys)) {
      throw new Error('活世界运行时关系状态不合法');
    }
    const connections = value.livingWorld.connections;
    for (const key of ['roads', 'supplyLinks', 'authorityLinks', 'informationLinks']) {
      if (!Array.isArray(connections[key])) throw new Error(`世界连接网络 ${key} 不合法`);
    }
    for (const road of connections.roads as unknown[]) {
      if (!isRecord(road)) throw new Error('道路连接不合法');
      assertStableId(road.id, '道路连接 ID'); assertLocation(road.from); assertLocation(road.to); assertDate(road.updatedAt);
      if (typeof road.open !== 'boolean') throw new Error(`道路 ${road.id} 开放状态不合法`);
    }
    for (const situation of value.livingWorld.situations) {
      if (!isRecord(situation)) throw new Error('世界局势不合法');
      assertStableId(situation.id, '局势 ID'); assertLocation(situation.location); assertDate(situation.nextCheck);
      if (!Array.isArray(situation.participants) || !Array.isArray(situation.pressure) || !Array.isArray(situation.knownBy) || !Array.isArray(situation.sourceEventIds)) throw new Error(`局势 ${situation.id} 关系不合法`);
      situation.participants.forEach((id) => assertCharacterId(id, '局势参与人物 ID'));
      situation.knownBy.forEach((id) => assertCharacterId(id, '局势知情人物 ID'));
    }
    for (const action of value.livingWorld.actions) {
      if (!isRecord(action)) throw new Error('持续行动不合法');
      assertStableId(action.id, '持续行动 ID'); assertLocation(action.target); assertDate(action.nextEventAt);
      if (!Array.isArray(action.actorIds) || !Number.isFinite(action.progress)) throw new Error(`持续行动 ${action.id} 进度或执行者不合法`);
      action.actorIds.forEach((id) => assertCharacterId(id, '持续行动人物 ID'));
    }
    for (const stockpile of value.livingWorld.stockpiles) {
      if (!isRecord(stockpile)) throw new Error('供应储备不合法');
      assertStableId(stockpile.id, '供应储备 ID'); assertLocation(stockpile.location); assertDate(stockpile.updatedAt);
      for (const field of ['quantity', 'dailyConsumption', 'shortageThreshold', 'criticalThreshold']) if (!Number.isFinite(stockpile[field])) throw new Error(`供应储备 ${stockpile.id} 数值不合法`);
    }
    for (const message of value.livingWorld.information) {
      if (!isRecord(message)) throw new Error('传播消息不合法');
      assertStableId(message.id, '传播消息 ID'); assertStableId(message.sourceEventId, '传播来源事件 ID'); assertLocation(message.source); assertLocation(message.destination); assertDate(message.sentAt); assertDate(message.arrivesAt);
      if (!Array.isArray(message.recipientIds)) throw new Error(`传播消息 ${message.id} 接收者不合法`);
      message.recipientIds.forEach((id) => assertCharacterId(id, '传播消息接收者 ID'));
    }
    if (!value.livingWorld.processedScheduleKeys.every((key) => typeof key === 'string' && key.trim())) throw new Error('统一调度处理标识不合法');
  }
}
