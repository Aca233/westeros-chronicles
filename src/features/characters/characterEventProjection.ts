import type { BodyZoneKey, WoundLevel } from '../../domain/body';
import type { CharacterRelationship, StaticCharacterRecord } from './types';
import type {
  CharacterEventEnvelope,
  CharacterEventInput,
  CharacterEventProjection,
  CharacterEventRowWriter,
} from './characterEventTypes';

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]));
  }
  return false;
}

/** Compare only append identity and immutable event content; first timestamp/sequence win. */
export function sameCharacterEventContent(left: CharacterEventEnvelope, right: CharacterEventEnvelope): boolean {
  return left.runId === right.runId
    && left.id === right.id
    && left.turn === right.turn
    && left.characterId === right.characterId
    && sameValue(left.event, right.event);
}

function eventKey(runId: string, id: string): [string, string] {
  return [runId, id];
}

/**
 * Shared append-only writer used by both InMemory and Dexie stores.
 * Same immutable row is idempotent; same ID with changed identity/content is a conflict.
 */
export async function appendCharacterEventRows(
  writer: CharacterEventRowWriter,
  runId: string,
  turn: number,
  events: readonly CharacterEventInput[],
): Promise<void> {
  const pending: CharacterEventEnvelope[] = [];
  const seenInBatch = new Map<string, CharacterEventEnvelope>();
  for (const [sequence, input] of events.entries()) {
    const row: CharacterEventEnvelope = {
      ...input,
      runId,
      turn,
      sequence,
      timestamp: input.timestamp ?? Date.now(),
    };
    const batchKey = `${runId}:${input.id}`;
    const existing = seenInBatch.get(batchKey) ?? await writer.get(eventKey(runId, input.id));
    if (existing) {
      if (sameCharacterEventContent(existing, row)) continue;
      throw new Error(`人物事件 ID 冲突：${runId}/${input.id} 已存在不同 turn、人物或事件内容`);
    }
    seenInBatch.set(batchKey, row);
    pending.push(row);
  }
  // All conflicts are checked before the first write, so the in-memory adapter
  // cannot partially append a batch. Dexie additionally wraps this in a transaction.
  for (const row of pending) await writer.add(row);
}

export function projectCharacterEvents(
  base: StaticCharacterRecord,
  envelopes: readonly CharacterEventEnvelope[],
): CharacterEventProjection {
  const dynamicBase = base as StaticCharacterRecord & {
    titleIds?: string[];
    titles?: string[];
    wounds?: string[];
    woundLevels?: Partial<Record<BodyZoneKey, WoundLevel>>;
    relationships?: CharacterRelationship[];
  };
  const initialTitles = [...(dynamicBase.titles ?? [])];
  const initialTitleIds = [...(dynamicBase.titleIds ?? initialTitles)];
  let projected: CharacterEventProjection = {
    ...base,
    traits: [...base.traits],
    spouseIds: [...base.spouseIds],
    titleIds: initialTitleIds,
    titles: initialTitles,
    wounds: [...(dynamicBase.wounds ?? [])],
    woundLevels: { ...(dynamicBase.woundLevels ?? {}) },
    relationships: [...(dynamicBase.relationships ?? [])],
  };
  for (const envelope of [...envelopes].sort((a, b) => a.turn - b.turn || a.sequence - b.sequence)) {
    const event = envelope.event;
    if (event.type === 'MOVE') projected = {
      ...projected,
      locationId: event.locationId,
      sceneLocation: event.sceneLocation,
    };
    else if (event.type === 'DIE') projected = { ...projected, alive: false, deathReason: event.cause, killerId: event.killerId };
    else if (event.type === 'ADD_TRAIT' && !projected.traits.includes(event.traitId)) {
      projected = { ...projected, traits: [...projected.traits, event.traitId] };
    } else if (event.type === 'REMOVE_TRAIT') {
      projected = { ...projected, traits: projected.traits.filter((trait) => trait !== event.traitId) };
    } else if (event.type === 'SET_RELATIONSHIP') {
      const index = projected.relationships.findIndex((relationship) => relationship.targetId === event.relationship.targetId);
      const relationships = [...projected.relationships];
      if (index < 0) relationships.push(event.relationship);
      else relationships[index] = event.relationship;
      projected = { ...projected, relationships };
    } else if (event.type === 'MARRY' && !projected.spouseIds.includes(event.spouseId)) {
      projected = { ...projected, spouseIds: [...projected.spouseIds, event.spouseId] };
    } else if (event.type === 'DIVORCE') {
      projected = { ...projected, spouseIds: projected.spouseIds.filter((spouseId) => spouseId !== event.spouseId) };
    } else if (event.type === 'GRANT_TITLE'
      && !projected.titleIds.includes(event.titleId)
      && !projected.titles.includes(event.titleId)) {
      projected = {
        ...projected,
        titleIds: [...projected.titleIds, event.titleId],
        titles: [...projected.titles, event.titleId],
      };
    } else if (event.type === 'REVOKE_TITLE') {
      const idIndex = projected.titleIds.indexOf(event.titleId);
      const titleIndex = projected.titles.indexOf(event.titleId);
      const removeIndex = idIndex >= 0 ? idIndex : titleIndex;
      if (removeIndex >= 0) {
        projected = {
          ...projected,
          titleIds: projected.titleIds.filter((_, index) => index !== removeIndex),
          titles: projected.titles.filter((_, index) => index !== removeIndex),
        };
      }
    } else if (event.type === 'INJURE') {
      projected = {
        ...projected,
        wounds: projected.wounds.includes(event.woundText) ? projected.wounds : [...projected.wounds, event.woundText],
        woundLevels: { ...projected.woundLevels, [event.zone]: event.level },
      };
    } else if (event.type === 'HEAL') {
      const zones: Array<BodyZoneKey> = event.zone === 'all' ? ['head', 'torso', 'arms', 'legs'] : [event.zone];
      const woundLevels = { ...projected.woundLevels };
      zones.forEach((zone) => { woundLevels[zone] = event.level ?? 'intact'; });
      const wounds = event.zone === 'all' && !event.clearWound
        ? []
        : event.clearWound
          ? projected.wounds.filter((wound) => wound !== event.clearWound)
          : projected.wounds;
      projected = { ...projected, wounds, woundLevels };
    }
  }
  return projected;
}

