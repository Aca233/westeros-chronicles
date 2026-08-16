import { db } from '../../services/db';
import type { BodyZoneKey, WoundLevel } from '../../types/game';
import type { CharacterEvent, CharacterId, CharacterRelationship, StaticCharacterRecord } from './types';

export interface CharacterEventInput {
  id: string;
  characterId: CharacterId;
  event: CharacterEvent;
  timestamp?: number;
}

export interface CharacterEventEnvelope extends CharacterEventInput {
  runId: string;
  turn: number;
  sequence: number;
  timestamp: number;
}

export interface CharacterEventProjection extends StaticCharacterRecord {
  locationId?: string;
  titles: string[];
  wounds: string[];
  woundLevels: Partial<Record<BodyZoneKey, WoundLevel>>;
  relationships: CharacterRelationship[];
}

export interface CharacterEventRowWriter {
  get(key: [string, string]): Promise<CharacterEventEnvelope | undefined>;
  add(row: CharacterEventEnvelope): Promise<void>;
}

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

export interface CharacterEventStore {
  append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void>;
  eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]>;
  truncateAfter(runId: string, turn: number): Promise<CharacterId[]>;
}

export function projectCharacterEvents(
  base: StaticCharacterRecord,
  envelopes: readonly CharacterEventEnvelope[],
): CharacterEventProjection {
  const dynamicBase = base as StaticCharacterRecord & {
    titles?: string[];
    wounds?: string[];
    woundLevels?: Partial<Record<BodyZoneKey, WoundLevel>>;
    relationships?: CharacterRelationship[];
  };
  let projected: CharacterEventProjection = {
    ...base,
    traits: [...base.traits],
    spouseIds: [...base.spouseIds],
    titles: [...(dynamicBase.titles ?? [])],
    wounds: [...(dynamicBase.wounds ?? [])],
    woundLevels: { ...(dynamicBase.woundLevels ?? {}) },
    relationships: [...(dynamicBase.relationships ?? [])],
  };
  for (const envelope of [...envelopes].sort((a, b) => a.turn - b.turn || a.sequence - b.sequence)) {
    const event = envelope.event;
    if (event.type === 'MOVE') projected = { ...projected, locationId: event.locationId };
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
    } else if (event.type === 'GRANT_TITLE' && !projected.titles.includes(event.titleId)) {
      projected = { ...projected, titles: [...projected.titles, event.titleId] };
    } else if (event.type === 'REVOKE_TITLE') {
      projected = { ...projected, titles: projected.titles.filter((titleId) => titleId !== event.titleId) };
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

export class InMemoryCharacterEventStore implements CharacterEventStore {
  private readonly events = new Map<string, CharacterEventEnvelope>();

  async append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void> {
    await appendCharacterEventRows({
      get: async ([storedRunId, id]) => this.events.get(`${storedRunId}:${id}`),
      add: async (row) => { this.events.set(`${row.runId}:${row.id}`, row); },
    }, runId, turn, events);
  }

  async eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]> {
    return [...this.events.values()]
      .filter((entry) => entry.runId === runId && entry.characterId === characterId)
      .sort((a, b) => a.turn - b.turn || a.sequence - b.sequence);
  }

  async truncateAfter(runId: string, turn: number): Promise<CharacterId[]> {
    const affected = new Set<CharacterId>();
    for (const [key, entry] of this.events) {
      if (entry.runId === runId && entry.turn > turn) {
        affected.add(entry.characterId);
        this.events.delete(key);
      }
    }
    return [...affected];
  }
}

export class DexieCharacterEventStore implements CharacterEventStore {
  async append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void> {
    await db.transaction('rw', db.characterEvents, async () => {
      await appendCharacterEventRows({
        get: async (key) => db.characterEvents.get(key),
        add: async (row) => { await db.characterEvents.add(row); },
      }, runId, turn, events);
    });
  }

  async eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]> {
    const rows = await db.characterEvents.where('[runId+characterId]').equals([runId, characterId]).toArray();
    return rows.sort((a, b) => a.turn - b.turn || a.sequence - b.sequence);
  }

  async truncateAfter(runId: string, turn: number): Promise<CharacterId[]> {
    const rows = await db.characterEvents.where('runId').equals(runId).and((row) => row.turn > turn).toArray();
    await db.characterEvents.bulkDelete(rows.map((row) => [row.runId, row.id]));
    return [...new Set(rows.map((row) => row.characterId))];
  }
}
