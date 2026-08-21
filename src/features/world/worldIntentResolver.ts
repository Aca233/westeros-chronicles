import type { CharacterId } from '../characters/types';
import {
  createWorldLocationRef,
  resolveUniqueLocationEntry,
  type LocationLookupContext,
} from '../map/locationResolver';
import type { ActiveJourney } from '../map/travel/types';
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

export type LocationWorldIntentKind = (typeof LOCATION_WORLD_INTENT_KINDS)[number];
export type ResolvedLocationWorldIntent = Extract<WorldIntent, { kind: LocationWorldIntentKind }>;

export interface UnresolvedWorldIntent {
  kind: WorldIntent['kind'];
  actorId?: CharacterId;
  targetText?: string;
  targetId?: string;
  sceneLocation?: string;
  elapsedTime?: WorldDateAdvance;
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
  resolved: ResolvedLocationWorldIntent[];
  rejected: RejectedWorldIntent[];
}

const LOCATION_KIND_SET = new Set<string>(LOCATION_WORLD_INTENT_KINDS);
const INTENT_FIELDS = new Set([
  'kind',
  'actorId',
  'targetText',
  'targetId',
  'sceneLocation',
  'elapsedTime',
  'evidenceText',
]);
const DATE_ADVANCE_FIELDS = new Set(['days', 'months', 'years']);
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
  if (typeof record.kind !== 'string' || !LOCATION_KIND_SET.has(record.kind)) {
    throw new Error(`未知的世界意图类型：${String(record.kind ?? '')}`);
  }
  if (typeof record.evidenceText !== 'string' || !record.evidenceText.trim()) {
    throw new Error('世界意图证据文本不能为空');
  }

  return {
    kind: record.kind as LocationWorldIntentKind,
    ...(record.actorId !== undefined ? { actorId: parseOptionalCharacterId(record.actorId) } : {}),
    ...(record.targetText !== undefined ? { targetText: trimmedOptionalString(record.targetText, 'targetText') } : {}),
    ...(record.targetId !== undefined ? { targetId: trimmedOptionalString(record.targetId, 'targetId') } : {}),
    ...(record.sceneLocation !== undefined ? { sceneLocation: trimmedOptionalString(record.sceneLocation, 'sceneLocation') } : {}),
    ...(record.elapsedTime !== undefined ? { elapsedTime: parseWorldDateAdvance(record.elapsedTime) } : {}),
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
): ResolvedLocationWorldIntent {
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
  const base = {
    kind,
    actorId,
    ...(targetRef ? { targetRef } : {}),
    ...(unresolved.elapsedTime ? { elapsedTime: { ...unresolved.elapsedTime } } : {}),
    evidenceText,
  };
  return base as ResolvedLocationWorldIntent;
}

export function resolveWorldIntents(
  intents: readonly UnresolvedWorldIntent[],
  context: ResolveWorldIntentContext,
): ResolveWorldIntentsResult {
  const resolved: ResolvedLocationWorldIntent[] = [];
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
