import { ITEM_CATALOG } from '../../data/itemDefinitions';
import type { GameState } from '../../types/game';
import { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterId } from '../characters/types';
import { mapRepository } from '../map/repository';
import type { WorldLocationRef } from '../map/types';
import type { WorldEvent, WorldSubjectRef } from './worldRuntimeTypes';

export type WorldDisplayEntity =
  | { kind: 'character'; id: CharacterId; label: string }
  | { kind: 'location'; id: string; label: string; location: WorldLocationRef }
  | { kind: 'title'; id: string; label: string }
  | { kind: 'asset'; id: string; label: string }
  | { kind: 'dynasty'; id: string; label: string };

export interface WorldEventDisplay {
  eventId: string;
  title: string;
  summary: string;
  entities: WorldDisplayEntity[];
  audit: {
    eventType: string;
    transactionId: string;
    source: WorldEvent['source'];
  };
}

export interface WorldDisplayRepositories {
  characterNames(ids: readonly CharacterId[]): Promise<ReadonlyMap<CharacterId, string>>;
  locationNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  titleNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  assetNames(ids: readonly string[]): ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;
  dynastyNames?(ids: readonly string[]): ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function readableDynastyId(id: string): string {
  return id.replace(/^dynn_/i, '').replace(/[_-]+/g, ' ').trim();
}

const worldDisplayCharacterRepository = new StaticCharacterRepository();

function itemDefinitionName(definitionId: string): string | undefined {
  return ITEM_CATALOG.get(definitionId)?.name;
}

function assetDisplayNames(gameState: GameState, ids: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  const wanted = new Set(ids);
  for (const site of Object.values(gameState.lord.items.sites)) {
    if (wanted.has(`site:${site.id}`)) result.set(`site:${site.id}`, site.name);
  }
  for (const vehicle of Object.values(gameState.lord.items.vehicles)) {
    if (wanted.has(`vehicle:${vehicle.id}`)) result.set(`vehicle:${vehicle.id}`, vehicle.name);
  }
  for (const instance of Object.values(gameState.lord.items.instances)) {
    const assetId = `item:${instance.instanceId}`;
    if (wanted.has(assetId)) result.set(assetId, instance.customName ?? itemDefinitionName(instance.definitionId) ?? '未命名物品');
  }
  for (const artifact of Object.values(gameState.worldArtifacts.artifacts)) {
    const aliases = [
      `world-item:${artifact.instanceId}`,
      artifact.instanceId,
      artifact.definitionId,
    ];
    const name = itemDefinitionName(artifact.definitionId);
    if (!name) continue;
    for (const alias of aliases) if (wanted.has(alias)) result.set(alias, name);
  }
  return result;
}

export function createWorldDisplayRepositories(gameState: GameState): WorldDisplayRepositories {
  return {
    characterNames: async (ids) => {
      const names = new Map<CharacterId, string>();
      const playerId = gameState.lord.canonicalCharacterId
        ?? (`save:${gameState.worldCharacters?.runId ?? 'current'}:player` as CharacterId);
      names.set(playerId, gameState.lord.name);
      for (const hit of await worldDisplayCharacterRepository.getSearchHits(ids.filter((id) => id.startsWith('agot:')))) names.set(hit.id, hit.name);
      return names;
    },
    locationNames: async (ids) => {
      const wanted = new Set(ids);
      const names = new Map((await mapRepository.loadSearchIndex())
        .filter((location) => wanted.has(location.id))
        .map((location) => [location.id, location.name] as const));
      if (wanted.has(gameState.lord.location.locationId)) names.set(gameState.lord.location.locationId, gameState.lord.locationLabel);
      return names;
    },
    titleNames: async (ids) => {
      const wanted = new Set(ids);
      return new Map((await mapRepository.loadSemanticTitles())
        .filter((title) => wanted.has(title.titleId))
        .map((title) => [title.titleId, title.name] as const));
    },
    assetNames: (ids) => assetDisplayNames(gameState, ids),
    dynastyNames: (ids) => new Map(ids.map((id) => [id, readableDynastyId(id)])),
  };
}

function subjectKey(subject: WorldSubjectRef): string {
  if (subject.type === 'character') return `character:${subject.characterId}`;
  if (subject.type === 'location') return `location:${subject.location.locationId}`;
  if (subject.type === 'title') return `title:${subject.titleId}`;
  if (subject.type === 'dynasty') return `dynasty:${subject.dynastyId}`;
  return `asset:${subject.assetId}`;
}

export async function resolveWorldEventDisplay(
  event: WorldEvent,
  repositories: WorldDisplayRepositories,
): Promise<WorldEventDisplay> {
  const characterIds = unique([
    ...event.actorIds,
    ...event.subjectRefs.flatMap((subject) => subject.type === 'character' ? [subject.characterId] : []),
  ]);
  const locationIds = unique([
    ...(event.location ? [event.location.locationId] : []),
    ...event.subjectRefs.flatMap((subject) => subject.type === 'location' ? [subject.location.locationId] : []),
  ]);
  const titleIds = unique(event.subjectRefs.flatMap((subject) => subject.type === 'title' ? [subject.titleId] : []));
  const assetIds = unique(event.subjectRefs.flatMap((subject) => subject.type === 'asset' ? [subject.assetId] : []));
  const dynastyIds = unique(event.subjectRefs.flatMap((subject) => subject.type === 'dynasty' ? [subject.dynastyId] : []));
  const [characterNames, locationNames, titleNames, assetNames, dynastyNames] = await Promise.all([
    repositories.characterNames(characterIds).catch(() => new Map<CharacterId, string>()),
    repositories.locationNames(locationIds).catch(() => new Map<string, string>()),
    repositories.titleNames(titleIds).catch(() => new Map<string, string>()),
    Promise.resolve(repositories.assetNames(assetIds)).catch(() => new Map<string, string>()),
    Promise.resolve(repositories.dynastyNames?.(dynastyIds) ?? new Map<string, string>()).catch(() => new Map<string, string>()),
  ]);
  const fallback = event.reason.trim() || '已确认世界事件';
  const entities: WorldDisplayEntity[] = [];
  const seen = new Set<string>();
  for (const characterId of characterIds) {
    const key = `character:${characterId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ kind: 'character', id: characterId, label: characterNames.get(characterId) ?? fallback });
  }
  for (const subject of event.subjectRefs) {
    const key = subjectKey(subject);
    if (seen.has(key)) continue;
    seen.add(key);
    if (subject.type === 'character') {
      entities.push({ kind: 'character', id: subject.characterId, label: characterNames.get(subject.characterId) ?? fallback });
    } else if (subject.type === 'location') {
      entities.push({ kind: 'location', id: subject.location.locationId, location: { ...subject.location }, label: locationNames.get(subject.location.locationId) ?? fallback });
    } else if (subject.type === 'title') {
      entities.push({ kind: 'title', id: subject.titleId, label: titleNames.get(subject.titleId) ?? fallback });
    } else if (subject.type === 'dynasty') {
      entities.push({ kind: 'dynasty', id: subject.dynastyId, label: dynastyNames.get(subject.dynastyId) ?? fallback });
    } else {
      entities.push({ kind: 'asset', id: subject.assetId, label: assetNames.get(subject.assetId) ?? fallback });
    }
  }
  if (event.location) {
    const key = `location:${event.location.locationId}`;
    if (!seen.has(key)) {
      entities.push({
        kind: 'location',
        id: event.location.locationId,
        location: { ...event.location },
        label: locationNames.get(event.location.locationId) ?? fallback,
      });
    }
  }
  return {
    eventId: event.id,
    title: fallback,
    summary: fallback,
    entities,
    audit: { eventType: event.type, transactionId: event.transactionId, source: event.source },
  };
}

export async function resolveWorldEventDisplays(
  events: readonly WorldEvent[],
  repositories: WorldDisplayRepositories,
): Promise<Map<string, WorldEventDisplay>> {
  return new Map((await Promise.all(events.map(async (event) => [event.id, await resolveWorldEventDisplay(event, repositories)] as const))));
}
