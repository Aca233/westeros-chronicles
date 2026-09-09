import type { CharacterId } from '../characters/types';
import { SITE_TYPE_LABELS, type ItemStorageSiteType } from '../items/types';
import {
  createWorldLocationRef,
  resolveUniqueLocationEntry,
  type LocationLookupContext,
} from '../map/locationResolver';
import type { ActiveJourney } from '../map/travel/types';
import type { RoutePreference, TravelMode } from '../map/types';
import type { WorldDateAdvance } from './worldHistory';
import type { WorldIntent } from './worldRuntimeTypes';

export const LOCATION_WORLD_INTENT_KINDS = [
  'mention',
  'plan_travel',
  'start_travel',
  'pause_travel',
  'resume_travel',
  'reroute_travel',
  'return_travel',
  'advance_travel',
  'arrive',
  'cancel_travel',
  'move_inside_location',
] as const satisfies readonly WorldIntent['kind'][];

// 模型可直接发出的资产与据点意图：不需要地点检索，只做结构校验；
// 语义校验（在场、保管链、ID 唯一）在结算规划器里完成。
export const DIRECT_WORLD_INTENT_KINDS = [
  'gift_asset',
  'steal_asset',
  'inherit_asset',
  'create_site',
] as const satisfies readonly WorldIntent['kind'][];

// 头衔与法理意图：同样不需要地点检索，只做结构校验；
// 法理持有人匹配、授权资格等语义校验在 planTitleIntent 里完成。
export const TITLE_WORLD_INTENT_KINDS = [
  'grant_title',
  'inherit_title',
  'settle_title_war',
  'revoke_title',
  'occupy_title',
] as const satisfies readonly WorldIntent['kind'][];

export const LIVING_WORLD_INTENT_KINDS = [
  'investigate_situation',
  'negotiate_access',
  'escort_transport',
  'reroute_transport',
  'request_relief',
  'delegate_relief',
] as const satisfies readonly WorldIntent['kind'][];

export type LocationWorldIntentKind = (typeof LOCATION_WORLD_INTENT_KINDS)[number];
export type DirectWorldIntentKind = (typeof DIRECT_WORLD_INTENT_KINDS)[number];
export type TitleWorldIntentKind = (typeof TITLE_WORLD_INTENT_KINDS)[number];
export type LivingWorldIntentKind = (typeof LIVING_WORLD_INTENT_KINDS)[number];
export type ResolvedLocationWorldIntent = Extract<WorldIntent, { kind: LocationWorldIntentKind }>;
export type ResolvedDirectWorldIntent = Extract<WorldIntent, { kind: DirectWorldIntentKind }>;
export type ResolvedTitleWorldIntent = Extract<WorldIntent, { kind: TitleWorldIntentKind }>;
export type ResolvedLivingWorldIntent = Extract<WorldIntent, { kind: LivingWorldIntentKind }>;
export type ResolvedWorldIntent = ResolvedLocationWorldIntent | ResolvedDirectWorldIntent | ResolvedTitleWorldIntent | ResolvedLivingWorldIntent;

export interface UnresolvedWorldIntent {
  kind: WorldIntent['kind'];
  actorId?: CharacterId;
  targetText?: string;
  targetId?: string;
  sceneLocation?: string;
  elapsedTime?: WorldDateAdvance;
  routePreference?: RoutePreference;
  travelMode?: TravelMode;
  viaText?: string[];
  companionIds?: CharacterId[];
  vehicleIds?: string[];
  assetId?: string;
  recipientId?: CharacterId;
  siteType?: string;
  name?: string;
  titleId?: string;
  holderId?: CharacterId;
  situationId?: string;
  actionId?: string;
  assigneeId?: CharacterId;
  evidenceText: string;
}

export interface ResolveWorldIntentContext extends LocationLookupContext {
  defaultActorId: CharacterId;
  activeJourney?: ActiveJourney;
}

export interface RejectedWorldIntent {
  intent: UnresolvedWorldIntent;
  reason: string;
}

export interface ResolveWorldIntentsResult {
  resolved: ResolvedWorldIntent[];
  rejected: RejectedWorldIntent[];
}

const LOCATION_KIND_SET = new Set<string>(LOCATION_WORLD_INTENT_KINDS);
const DIRECT_KIND_SET = new Set<string>(DIRECT_WORLD_INTENT_KINDS);
const TITLE_KIND_SET = new Set<string>(TITLE_WORLD_INTENT_KINDS);
const LIVING_KIND_SET = new Set<string>(LIVING_WORLD_INTENT_KINDS);
const INTENT_FIELDS = new Set([
  'kind',
  'actorId',
  'targetText',
  'targetId',
  'sceneLocation',
  'elapsedTime',
  'routePreference',
  'travelMode',
  'viaText',
  'companionIds',
  'vehicleIds',
  'assetId',
  'recipientId',
  'siteType',
  'name',
  'titleId',
  'holderId',
  'situationId',
  'actionId',
  'assigneeId',
  'evidenceText',
]);
const SITE_TYPE_SET = new Set<string>(Object.keys(SITE_TYPE_LABELS));
const DATE_ADVANCE_FIELDS = new Set(['days', 'months', 'years']);
const ROUTE_PREFERENCE_SET = new Set<RoutePreference>(['fastest', 'safest', 'cheapest']);
const TRAVEL_MODE_SET = new Set<TravelMode>(['walk', 'horse', 'carriage', 'ship']);
const TARGET_REQUIRED_KINDS = new Set<LocationWorldIntentKind>([
  'mention',
  'plan_travel',
  'start_travel',
  'reroute_travel',
  'return_travel',
  'arrive',
]);

function trimmedOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} 不能为空`);
  return normalized;
}

function parseOptionalCharacterId(value: unknown): CharacterId | undefined {
  const actorId = trimmedOptionalString(value, 'actorId');
  if (actorId === undefined) return undefined;
  if (!actorId.startsWith('agot:') && !/^save:[^:]+:.+/.test(actorId)) {
    throw new Error(`actorId 格式无效：${actorId}`);
  }
  return actorId as CharacterId;
}

function parseOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`);
  const values = value.map((entry, index) => trimmedOptionalString(entry, `${field}[${index}]`));
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function parseOptionalCharacterIdArray(value: unknown, field: string): CharacterId[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} 必须是人物 ID 数组`);
  const values = value.map((entry, index) => {
    const parsed = parseOptionalCharacterId(entry);
    if (!parsed) throw new Error(`${field}[${index}] 不能为空`);
    return parsed;
  });
  return [...new Set(values)];
}

function parseRoutePreference(value: unknown): RoutePreference | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !ROUTE_PREFERENCE_SET.has(value as RoutePreference)) {
    throw new Error(`routePreference 无效：${String(value)}`);
  }
  return value as RoutePreference;
}

function parseTravelMode(value: unknown): TravelMode | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !TRAVEL_MODE_SET.has(value as TravelMode)) {
    throw new Error(`travelMode 无效：${String(value)}`);
  }
  return value as TravelMode;
}

function parseWorldDateAdvance(value: unknown): WorldDateAdvance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('elapsedTime 必须是时间增量对象');
  }
  const record = value as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((field) => !DATE_ADVANCE_FIELDS.has(field));
  if (unknownFields.length) throw new Error(`elapsedTime 包含未知字段：${unknownFields.join('、')}`);
  const result: WorldDateAdvance = {};
  for (const field of DATE_ADVANCE_FIELDS) {
    const amount = record[field];
    if (amount === undefined) continue;
    if (!Number.isInteger(amount) || (amount as number) < 0) {
      throw new Error(`elapsedTime.${field} 必须是非负整数`);
    }
    result[field as keyof WorldDateAdvance] = amount as number;
  }
  return result;
}

function parseUnresolvedWorldIntent(value: unknown, index: number): UnresolvedWorldIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`世界意图第 ${index + 1} 项必须是对象`);
  }
  const record = value as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((field) => !INTENT_FIELDS.has(field));
  if (unknownFields.length) throw new Error(`世界意图包含未知字段：${unknownFields.join('、')}`);
  if (typeof record.kind !== 'string' || !(LOCATION_KIND_SET.has(record.kind) || DIRECT_KIND_SET.has(record.kind) || TITLE_KIND_SET.has(record.kind) || LIVING_KIND_SET.has(record.kind))) {
    throw new Error(`未知的世界意图类型：${String(record.kind ?? '')}`);
  }
  if (typeof record.evidenceText !== 'string' || !record.evidenceText.trim()) {
    throw new Error('世界意图证据文本不能为空');
  }
  if (record.siteType !== undefined && !SITE_TYPE_SET.has(String(record.siteType))) {
    throw new Error(`世界意图 siteType 无效：${String(record.siteType)}`);
  }

  return {
    kind: record.kind as UnresolvedWorldIntent['kind'],
    ...(record.actorId !== undefined ? { actorId: parseOptionalCharacterId(record.actorId) } : {}),
    ...(record.targetText !== undefined ? { targetText: trimmedOptionalString(record.targetText, 'targetText') } : {}),
    ...(record.targetId !== undefined ? { targetId: trimmedOptionalString(record.targetId, 'targetId') } : {}),
    ...(record.sceneLocation !== undefined ? { sceneLocation: trimmedOptionalString(record.sceneLocation, 'sceneLocation') } : {}),
    ...(record.elapsedTime !== undefined ? { elapsedTime: parseWorldDateAdvance(record.elapsedTime) } : {}),
    ...(record.routePreference !== undefined ? { routePreference: parseRoutePreference(record.routePreference) } : {}),
    ...(record.travelMode !== undefined ? { travelMode: parseTravelMode(record.travelMode) } : {}),
    ...(record.viaText !== undefined ? { viaText: parseOptionalStringArray(record.viaText, 'viaText') } : {}),
    ...(record.companionIds !== undefined ? { companionIds: parseOptionalCharacterIdArray(record.companionIds, 'companionIds') } : {}),
    ...(record.vehicleIds !== undefined ? { vehicleIds: parseOptionalStringArray(record.vehicleIds, 'vehicleIds') } : {}),
    ...(record.assetId !== undefined ? { assetId: trimmedOptionalString(record.assetId, 'assetId') } : {}),
    ...(record.recipientId !== undefined ? { recipientId: parseOptionalCharacterId(record.recipientId) } : {}),
    ...(record.siteType !== undefined ? { siteType: String(record.siteType) } : {}),
    ...(record.name !== undefined ? { name: trimmedOptionalString(record.name, 'name') } : {}),
    ...(record.titleId !== undefined ? { titleId: trimmedOptionalString(record.titleId, 'titleId') } : {}),
    ...(record.holderId !== undefined ? { holderId: parseOptionalCharacterId(record.holderId) } : {}),
    ...(record.situationId !== undefined ? { situationId: trimmedOptionalString(record.situationId, 'situationId') } : {}),
    ...(record.actionId !== undefined ? { actionId: trimmedOptionalString(record.actionId, 'actionId') } : {}),
    ...(record.assigneeId !== undefined ? { assigneeId: parseOptionalCharacterId(record.assigneeId) } : {}),
    evidenceText: record.evidenceText.trim(),
  };
}

export function parseUnresolvedWorldIntents(value: unknown): UnresolvedWorldIntent[] {
  if (!Array.isArray(value)) throw new Error('世界意图必须是 JSON 数组');
  return value.map(parseUnresolvedWorldIntent);
}

function hasPositiveElapsedTime(elapsedTime: WorldDateAdvance | undefined): boolean {
  return Boolean(elapsedTime && Object.values(elapsedTime).some((value) => typeof value === 'number' && value > 0));
}

function journeyCanVerifyArrival(journey: ActiveJourney | undefined, targetLocationId: string): boolean {
  return Boolean(
    journey
    && journey.routePlan.to === targetLocationId
    && journey.status === 'arrived',
  );
}

export function resolveWorldIntent(
  unresolved: UnresolvedWorldIntent,
  context: ResolveWorldIntentContext,
): ResolvedWorldIntent {
  if (DIRECT_KIND_SET.has(unresolved.kind)) {
    const kind = unresolved.kind as DirectWorldIntentKind;
    const actorId = unresolved.actorId || context.defaultActorId;
    if (!actorId.trim()) throw new Error('世界意图缺少行动人物');
    const evidenceText = unresolved.evidenceText?.trim();
    if (!evidenceText) throw new Error('世界意图证据文本不能为空');
    if (kind === 'gift_asset') {
      if (!unresolved.assetId) throw new Error('gift_asset 意图缺少 assetId');
      if (!unresolved.recipientId) throw new Error('gift_asset 意图缺少 recipientId');
      return { kind, actorId, assetId: unresolved.assetId, recipientId: unresolved.recipientId, evidenceText };
    }
    if (kind === 'steal_asset') {
      if (!unresolved.assetId) throw new Error('steal_asset 意图缺少 assetId');
      return { kind, actorId, assetId: unresolved.assetId, evidenceText };
    }
    if (kind === 'inherit_asset') {
      if (!unresolved.assetId) throw new Error('inherit_asset 意图缺少 assetId');
      if (!unresolved.recipientId) throw new Error('inherit_asset 意图缺少 recipientId');
      return { kind, actorId, assetId: unresolved.assetId, recipientId: unresolved.recipientId, evidenceText };
    }
    if (!unresolved.siteType) throw new Error('create_site 意图缺少 siteType');
    if (!context.currentLocation) throw new Error('缺少人物当前位置，不能创建据点');
    return {
      kind: 'create_site',
      actorId,
      siteType: unresolved.siteType as ItemStorageSiteType,
      ...(unresolved.name ? { name: unresolved.name } : {}),
      evidenceText,
    };
  }
  if (LIVING_KIND_SET.has(unresolved.kind)) {
    const kind = unresolved.kind as LivingWorldIntentKind;
    const actorId = unresolved.actorId || context.defaultActorId;
    const evidenceText = unresolved.evidenceText?.trim();
    if (!actorId.trim()) throw new Error('世界意图缺少行动人物');
    if (!evidenceText) throw new Error('世界意图证据文本不能为空');
    if ((kind === 'escort_transport' || kind === 'reroute_transport') && !unresolved.actionId) {
      throw new Error(`${kind} 意图缺少 actionId`);
    }
    if (kind === 'delegate_relief' && !unresolved.assigneeId) throw new Error('delegate_relief 意图缺少 assigneeId');
    return {
      kind,
      actorId,
      ...(unresolved.situationId ? { situationId: unresolved.situationId } : {}),
      ...(unresolved.actionId ? { actionId: unresolved.actionId } : {}),
      ...(unresolved.assigneeId ? { assigneeId: unresolved.assigneeId } : {}),
      evidenceText,
    } as ResolvedLivingWorldIntent;
  }
  if (TITLE_KIND_SET.has(unresolved.kind)) {
    const kind = unresolved.kind as TitleWorldIntentKind;
    const actorId = unresolved.actorId || context.defaultActorId;
    if (!actorId.trim()) throw new Error('世界意图缺少行动人物');
    const evidenceText = unresolved.evidenceText?.trim();
    if (!evidenceText) throw new Error('世界意图证据文本不能为空');
    if (!unresolved.titleId) throw new Error(`${kind} 意图缺少 titleId`);
    if (kind === 'revoke_title') {
      if (!unresolved.holderId) throw new Error('revoke_title 意图缺少 holderId');
      return { kind, actorId, titleId: unresolved.titleId, holderId: unresolved.holderId, evidenceText };
    }
    if (kind === 'occupy_title') {
      return { kind, actorId, titleId: unresolved.titleId, evidenceText };
    }
    if (!unresolved.recipientId) throw new Error(`${kind} 意图缺少 recipientId`);
    return { kind, actorId, titleId: unresolved.titleId, recipientId: unresolved.recipientId, evidenceText };
  }
  if (!LOCATION_KIND_SET.has(unresolved.kind)) {
    throw new Error(`未知的世界意图类型：${unresolved.kind}`);
  }
  const kind = unresolved.kind as LocationWorldIntentKind;
  const actorId = unresolved.actorId || context.defaultActorId;
  const evidenceText = unresolved.evidenceText?.trim();
  if (!actorId.trim()) throw new Error('世界意图缺少行动人物');
  if (!evidenceText) throw new Error('世界意图证据文本不能为空');

  let targetLocationId: string | undefined;
  if (unresolved.targetId || unresolved.targetText) {
    targetLocationId = resolveUniqueLocationEntry({
      targetId: unresolved.targetId,
      targetText: unresolved.targetText,
    }, context).id;
  } else if (kind === 'move_inside_location') {
    targetLocationId = context.currentLocation?.locationId;
  } else if (TARGET_REQUIRED_KINDS.has(kind)) {
    throw new Error(`${kind} 意图缺少目标地点`);
  }

  if (kind === 'move_inside_location') {
    if (!context.currentLocation) throw new Error('缺少人物当前位置，不能解析地点内部移动');
    if (!targetLocationId || targetLocationId !== context.currentLocation.locationId) {
      throw new Error('地点内部移动不能跨越地图地点');
    }
    if (!unresolved.sceneLocation?.trim()) throw new Error('地点内部移动缺少场景位置');
  }

  if (kind === 'arrive') {
    if (!targetLocationId) throw new Error('抵达意图缺少目标地点');
    if (!journeyCanVerifyArrival(context.activeJourney, targetLocationId)
      && !hasPositiveElapsedTime(unresolved.elapsedTime)) {
      throw new Error('没有可验证的旅程或时间流逝，不能确认抵达');
    }
  }

  const targetRef = targetLocationId
    ? {
        type: 'location' as const,
        location: createWorldLocationRef(targetLocationId, unresolved.sceneLocation),
      }
    : undefined;
  const via = unresolved.viaText?.map((targetText) => createWorldLocationRef(
    resolveUniqueLocationEntry({ targetText }, context).id,
  ));
  const base = {
    kind,
    actorId,
    ...(targetRef ? { targetRef } : {}),
    ...(unresolved.elapsedTime ? { elapsedTime: { ...unresolved.elapsedTime } } : {}),
    ...(unresolved.routePreference ? { routePreference: unresolved.routePreference } : {}),
    ...(unresolved.travelMode ? { travelMode: unresolved.travelMode } : {}),
    ...(via?.length ? { via } : {}),
    ...(unresolved.companionIds?.length ? { companionIds: [...unresolved.companionIds] } : {}),
    ...(unresolved.vehicleIds?.length ? { vehicleIds: [...unresolved.vehicleIds] } : {}),
    evidenceText,
  };
  return base as ResolvedLocationWorldIntent;
}

export function resolveWorldIntents(
  intents: readonly UnresolvedWorldIntent[],
  context: ResolveWorldIntentContext,
): ResolveWorldIntentsResult {
  const resolved: ResolvedWorldIntent[] = [];
  const rejected: RejectedWorldIntent[] = [];
  for (const intent of intents) {
    try {
      resolved.push(resolveWorldIntent(intent, context));
    } catch (error) {
      rejected.push({
        intent,
        reason: error instanceof Error ? error.message : '世界意图无法解析',
      });
    }
  }
  return { resolved, rejected };
}
