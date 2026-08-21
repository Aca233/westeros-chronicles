import type { CharacterId } from '../characters/types';
import type { WorldEvent } from './worldRuntimeTypes';

export interface WorldEventIndex {
  byCharacterId: Map<CharacterId, string[]>;
  byLocationId: Map<string, string[]>;
  byAssetId: Map<string, string[]>;
  byTitleId: Map<string, string[]>;
}

function appendOnce<Key>(index: Map<Key, string[]>, key: Key, eventId: string): void {
  const ids = index.get(key);
  if (!ids) {
    index.set(key, [eventId]);
    return;
  }
  if (!ids.includes(eventId)) ids.push(eventId);
}

export function buildWorldEventIndex(events: readonly WorldEvent[]): WorldEventIndex {
  const index: WorldEventIndex = {
    byCharacterId: new Map(),
    byLocationId: new Map(),
    byAssetId: new Map(),
    byTitleId: new Map(),
  };
  const eventIds = new Set<string>();
  for (const event of events) {
    if (eventIds.has(event.id)) throw new Error(`世界事件 ID 重复：${event.id}`);
    eventIds.add(event.id);
    for (const characterId of event.actorIds) appendOnce(index.byCharacterId, characterId, event.id);
    if (event.location) appendOnce(index.byLocationId, event.location.locationId, event.id);
    for (const subject of event.subjectRefs) {
      if (subject.type === 'character') appendOnce(index.byCharacterId, subject.characterId, event.id);
      if (subject.type === 'location') appendOnce(index.byLocationId, subject.location.locationId, event.id);
      if (subject.type === 'asset') appendOnce(index.byAssetId, subject.assetId, event.id);
      if (subject.type === 'title') appendOnce(index.byTitleId, subject.titleId, event.id);
    }
  }
  validateWorldEventIndex(events, index);
  return index;
}

export function validateWorldEventIndex(events: readonly WorldEvent[], index: WorldEventIndex): void {
  const knownIds = new Set(events.map((event) => event.id));
  for (const entries of [index.byCharacterId, index.byLocationId, index.byAssetId, index.byTitleId]) {
    for (const ids of entries.values()) {
      const seen = new Set<string>();
      for (const id of ids) {
        if (!knownIds.has(id)) throw new Error(`索引引用的世界事件不存在：${id}`);
        if (seen.has(id)) throw new Error(`世界事件索引含重复引用：${id}`);
        seen.add(id);
      }
    }
  }
}

function indexedEvents<Key>(
  events: readonly WorldEvent[],
  index: Map<Key, string[]>,
  key: Key,
): WorldEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return (index.get(key) ?? []).map((id) => {
    const event = byId.get(id);
    if (!event) throw new Error(`索引引用的世界事件不存在：${id}`);
    return event;
  });
}

export function eventsForCharacter(
  events: readonly WorldEvent[],
  index: WorldEventIndex,
  characterId: CharacterId,
): WorldEvent[] {
  return indexedEvents(events, index.byCharacterId, characterId);
}

export function eventsForLocation(
  events: readonly WorldEvent[],
  index: WorldEventIndex,
  locationId: string,
): WorldEvent[] {
  return indexedEvents(events, index.byLocationId, locationId);
}

export function eventsForAsset(
  events: readonly WorldEvent[],
  index: WorldEventIndex,
  assetId: string,
): WorldEvent[] {
  return indexedEvents(events, index.byAssetId, assetId);
}

export function eventsForTitle(
  events: readonly WorldEvent[],
  index: WorldEventIndex,
  titleId: string,
): WorldEvent[] {
  return indexedEvents(events, index.byTitleId, titleId);
}
