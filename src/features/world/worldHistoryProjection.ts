import type { CharacterId, CharacterItemRecord } from '../characters/types';
import type { EquipmentPosition } from '../items/types';
import type { WorldArtifactRecord, WorldArtifactState } from '../items/worldArtifacts';
import { isWorldArtifactAsset } from '../items/worldArtifactClassification';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import { compareWorldDates, type CanonicalEventStatus, type WorldDate, type WorldHistoryState } from './worldHistory';
import { buildWorldEventIndex, eventsForCharacter, type WorldEventIndex } from './worldEventIndex';
import type { WorldEvent } from './worldRuntimeTypes';
import type { WorldEventDisplay } from './worldDisplayResolver';

export interface TimelineProjectionEvent {
  id: string;
  date: WorldDate;
  title: string;
  summary: string;
  source: WorldEvent['source'] | 'canon';
  status: CanonicalEventStatus | 'actual';
  category: CanonicalTimelineEvent['category'];
  region: string;
  regionTag?: string;
  participantIds: CharacterId[];
  participantNames: string[];
  fatalities: string[];
  consequences: string[];
  reason?: string;
  canonicalEventId?: string;
}

function eventOrder(left: TimelineProjectionEvent, right: TimelineProjectionEvent): number {
  const date = compareWorldDates(left.date, right.date);
  return date || left.id.localeCompare(right.id);
}

function canonicalProjection(
  history: WorldHistoryState,
  event: CanonicalTimelineEvent,
): TimelineProjectionEvent {
  const state = history.canonical[event.id] ?? { eventId: event.id, status: 'scheduled' as const };
  return {
    id: event.id,
    date: { ...event.date },
    title: event.title,
    summary: event.summary,
    source: 'canon',
    status: state.status,
    category: event.category,
    region: event.region,
    regionTag: event.regionTag,
    participantIds: event.participants.flatMap((person) => person.characterId ? [person.characterId] : []),
    participantNames: event.participants.map((person) => person.name),
    fatalities: event.fatalities.map((person) => person.name),
    consequences: [...event.consequences],
    reason: state.reason,
    canonicalEventId: event.id,
  };
}

const EVENT_TITLES: Readonly<Record<string, string>> = {
  'character.death': '人物死亡',
  'travel.progress': '旅程继续推进',
  'timeline.occurred': '原作节点发生',
  'timeline.diverged': '原作节点偏离',
};

export function worldEventDisplayTitle(event: WorldEvent): string {
  return EVENT_TITLES[event.type] ?? (event.reason.trim() || '已确认世界事件');
}

export function worldEventParticipantIds(event: WorldEvent): CharacterId[] {
  return [...new Set([
    ...event.actorIds,
    ...event.subjectRefs.flatMap((subject) => subject.type === 'character' ? [subject.characterId] : []),
  ])];
}

function eventProjection(event: WorldEvent, display?: WorldEventDisplay): TimelineProjectionEvent {
  const participantIds = worldEventParticipantIds(event);
  return {
    id: event.id,
    date: { ...event.date },
    title: display?.title ?? worldEventDisplayTitle(event),
    summary: display?.summary ?? event.reason,
    source: event.source,
    status: 'actual',
    category: event.type.includes('death') ? 'death' : event.type.includes('war') ? 'war' : 'intrigue',
    region: '本世界',
    participantIds,
    participantNames: display?.entities.flatMap((entity) => entity.kind === 'character' ? [entity.label] : []) ?? [],
    fatalities: event.type === 'character.death' ? [...participantIds] : [],
    consequences: [],
    canonicalEventId: event.canonicalEventId,
  };
}

export function projectCanonicalTimeline(
  history: WorldHistoryState,
  schedule: readonly CanonicalTimelineEvent[],
): TimelineProjectionEvent[] {
  return schedule.map((event) => canonicalProjection(history, event)).sort(eventOrder);
}

export function projectActualTimeline(
  history: WorldHistoryState,
  worldEvents: readonly WorldEvent[],
  schedule: readonly CanonicalTimelineEvent[] = [],
  displays: ReadonlyMap<string, WorldEventDisplay> = new Map(),
): TimelineProjectionEvent[] {
  const canonical = schedule
    .map((event) => canonicalProjection(history, event))
    .filter((event) => event.status === 'historical' || event.status === 'occurred');
  const canonicalEventIds = new Set(canonical.map((event) => event.canonicalEventId));
  const events = worldEvents
    .filter((event) => !event.canonicalEventId || !canonicalEventIds.has(event.canonicalEventId))
    .map((event) => eventProjection(event, displays.get(event.id)));
  return [...canonical, ...events].sort(eventOrder);
}

export function factsForCharacter(
  worldEvents: readonly WorldEvent[],
  characterId: CharacterId,
  index: WorldEventIndex = buildWorldEventIndex(worldEvents),
): WorldEvent[] {
  return eventsForCharacter(worldEvents, index, characterId)
    .sort((left, right) => compareWorldDates(left.date, right.date) || left.id.localeCompare(right.id));
}

export function visibleEquipmentForCharacter(
  state: WorldArtifactState,
  characterId: CharacterId,
): WorldArtifactRecord[] {
  return Object.values(state.artifacts)
    .filter(isWorldArtifactAsset)
    .filter((record) => record.equipped
      && Boolean(record.equippedPosition)
      && record.placement.type === 'character'
      && record.placement.characterId === characterId)
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}

export function visibleAssetsForCharacter(
  state: WorldArtifactState,
  characterId: CharacterId,
): WorldArtifactRecord[] {
  return Object.values(state.artifacts)
    .filter(isWorldArtifactAsset)
    .filter((record) => record.lawfulControllerId === characterId
      || (record.placement.type === 'character' && record.placement.characterId === characterId)
      || (record.placement.type === 'title' && record.placement.controllerId === characterId))
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}


export type NpcItemRelation = '当前穿戴' | '本人保管' | '代为保管' | '名下资产' | '领地资产' | '家族资产';

export interface NpcItemViewModel {
  instanceId: string;
  definitionId: string;
  relation: NpcItemRelation;
  equippedPosition?: EquipmentPosition;
  source: CharacterItemRecord['source'] | 'world_artifact';
}

export interface NpcAssetScope {
  characterId: CharacterId;
  titleIds?: readonly string[];
  dynastyId?: string | null;
}

function ordinaryItemRelation(item: CharacterItemRecord, characterId: CharacterId): NpcItemRelation {
  if (item.equippedPosition
    && item.custody.type === 'character'
    && item.custody.characterId === characterId) return '当前穿戴';
  if (item.custody.type === 'character' && item.custody.characterId === characterId) {
    return item.ownerId === characterId ? '本人保管' : '代为保管';
  }
  return '名下资产';
}

function artifactRelation(record: WorldArtifactRecord, characterId: CharacterId): NpcItemRelation {
  const personallyHeld = record.placement.type === 'character' && record.placement.characterId === characterId;
  if (personallyHeld && record.equipped) return '当前穿戴';
  if (personallyHeld) return record.lawfulControllerId === characterId ? '本人保管' : '代为保管';
  if (record.placement.type === 'title') return '领地资产';
  if (record.placement.type === 'dynasty') return '家族资产';
  return '名下资产';
}

function relatedArtifact(record: WorldArtifactRecord, scope: NpcAssetScope): boolean {
  if (record.lawfulControllerId === scope.characterId) return true;
  if (record.placement.type === 'character') return record.placement.characterId === scope.characterId;
  if (record.placement.type === 'title') {
    return record.placement.controllerId === scope.characterId || Boolean(scope.titleIds?.includes(record.placement.titleId));
  }
  return Boolean(scope.dynastyId && record.placement.dynastyId === scope.dynastyId);
}

function sortNpcItems(items: Iterable<NpcItemViewModel>): NpcItemViewModel[] {
  return [...items].sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}

/** Merges ordinary projected items with the canonical artifact ledger. Artifact records win only on an impossible instance-ID collision. */
export function projectNpcEquipment(
  ordinaryItems: readonly CharacterItemRecord[],
  state: WorldArtifactState,
  characterId: CharacterId,
): NpcItemViewModel[] {
  const merged = new Map<string, NpcItemViewModel>();
  for (const item of ordinaryItems) {
    if (!item.equippedPosition || item.custody.type !== 'character' || item.custody.characterId !== characterId) continue;
    merged.set(item.instanceId, {
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      relation: '当前穿戴',
      equippedPosition: { ...item.equippedPosition },
      source: item.source,
    });
  }
  for (const record of visibleEquipmentForCharacter(state, characterId)) {
    merged.set(record.instanceId, {
      instanceId: record.instanceId,
      definitionId: record.definitionId,
      relation: '当前穿戴',
      equippedPosition: record.equippedPosition ? { ...record.equippedPosition } : undefined,
      source: 'world_artifact',
    });
  }
  return sortNpcItems(merged.values());
}

export function projectNpcAssets(
  ordinaryItems: readonly CharacterItemRecord[],
  state: WorldArtifactState,
  scope: NpcAssetScope,
): NpcItemViewModel[] {
  const merged = new Map<string, NpcItemViewModel>();
  for (const item of ordinaryItems) {
    const connected = item.ownerId === scope.characterId
      || (item.custody.type === 'character' && item.custody.characterId === scope.characterId);
    if (!connected) continue;
    merged.set(item.instanceId, {
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      relation: ordinaryItemRelation(item, scope.characterId),
      ...(item.equippedPosition ? { equippedPosition: { ...item.equippedPosition } } : {}),
      source: item.source,
    });
  }
  for (const record of Object.values(state.artifacts).filter(isWorldArtifactAsset).filter((item) => relatedArtifact(item, scope))) {
    merged.set(record.instanceId, {
      instanceId: record.instanceId,
      definitionId: record.definitionId,
      relation: artifactRelation(record, scope.characterId),
      source: 'world_artifact',
    });
  }
  return sortNpcItems(merged.values());
}
