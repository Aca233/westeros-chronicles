import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { resolveCharacterTraits } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import type { GameState } from '../../types/game';
import { getItemDefinition } from '../items/catalog';
import { buildCharacterPromptSlice, type CharacterPromptCandidate, type CharacterPromptSelection } from '../characters/characterPromptSlice';
import { characterAgeAtYear, characterDatasetYear } from '../characters/characterDossier';
import type { CharacterEventEnvelope, CharacterEventStore } from '../characters/characterEventTypes';
import { DexieCharacterEventStore } from '../characters/characterEventStore';
import { resolveCharacter } from '../characters/characterProjector';
import { selectSceneCharacters } from '../characters/sceneCharacterSelector';
import { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterId, CharacterSearchHit, ResolvedCharacter, StaticCharacterLoadoutProfile, StaticCharacterRecord } from '../characters/types';
import type { CharacterCommandBatchBaseContext } from '../../services/stateReducer';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import { advanceWorldDate, compareWorldDates, type WorldDate } from './worldHistory';
import { projectNpcAssets, projectNpcEquipment, worldEventParticipantIds, type NpcItemRelation } from './worldHistoryProjection';
import { mapRepository } from '../map/repository';
import { UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';
import { formatNarrativeLocationContext, resolveNarrativeLocationContext, type NarrativeLocationContext } from '../map/narrativeLocationContext';
import type { MapLocationSearchEntry, SemanticMembership, SemanticTitle } from '../map/types';
import type { PendingWorldTransaction, WorldEvent } from './worldRuntimeTypes';
import type { WorldCharacterStartRecord } from '../world-content/types';
import { worldContentRepository } from '../world-content/repository';
import { projectResolvedCharacterWorldFacts } from './characterWorldFacts';
import { playerWorldEventViewer, selectVisibleWorldEvents } from './worldEventVisibility';

export const WORLD_CONTEXT_LIMITS = {
  characters: 12,
  assets: 20,
  events: 12,
  neighboringLocations: 8,
} as const;

export interface WorldTurnContextRepository {
  loadManifest(): Promise<{ datasetHash: string }>;
  get(id: CharacterId): Promise<StaticCharacterRecord | undefined>;
  getMany(ids: readonly CharacterId[]): Promise<StaticCharacterRecord[]>;
  findMentioned(text: string, filters?: { alive?: boolean; canonTiers?: Array<'canon' | 'semicanon'>; limit?: number }): Promise<Array<CharacterSearchHit | StaticCharacterRecord>>;
  getLoadoutProfile(id: CharacterId): Promise<StaticCharacterLoadoutProfile | undefined>;
}

export interface WorldTurnContextEventStore {
  eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]>;
}

export interface BuildWorldTurnContextInput {
  gameState: GameState;
  actionText: string;
  repository?: WorldTurnContextRepository;
  eventStore?: WorldTurnContextEventStore;
  mapLocationRepository?: {
    loadSearchIndex(): Promise<MapLocationSearchEntry[]>;
    loadSemanticTitles(): Promise<SemanticTitle[]>;
    loadSemanticMembership(): Promise<SemanticMembership[]>;
  };
  startCharacters?: readonly WorldCharacterStartRecord[];
  timeline?: readonly CanonicalTimelineEvent[];
}

export interface VisibleWorldItem {
  instanceId: string;
  definitionId: string;
  name: string;
  characterId: CharacterId;
  characterName: string;
  relation: NpcItemRelation;
  source: string;
}

export interface WorldTurnContext {
  selection: CharacterPromptSelection;
  directlyNamedIds: CharacterId[];
  strongRelationshipIds: CharacterId[];
  recentInteractionIds: CharacterId[];
  eventParticipantIds: CharacterId[];
  timelinePressures: CanonicalTimelineEvent[];
  visibleWorldEquipment: VisibleWorldItem[];
  visibleWorldAssets: VisibleWorldItem[];
  characterCommandContext: CharacterCommandBatchBaseContext;
  currentDate: WorldDate;
  narrativeLocation: NarrativeLocationContext;
  neighboringLocations: MapLocationSearchEntry[];
  recentWorldEvents: WorldEvent[];
  mapAvailability: { status: 'available' | 'unavailable'; reason?: string };
  pendingTransactions: PendingWorldTransaction[];
}

const defaultRepository = new StaticCharacterRepository();
const defaultEventStore: CharacterEventStore = new DexieCharacterEventStore();

function uniqueIds(values: readonly (CharacterId | null | undefined)[]): CharacterId[] {
  return [...new Set(values.filter((value): value is CharacterId => typeof value === 'string' && value.startsWith('agot:')))].sort();
}

function relationIds(record: StaticCharacterRecord | undefined): CharacterId[] {
  if (!record) return [];
  return uniqueIds([
    record.fatherId,
    record.motherId,
    ...record.spouseIds,
    ...record.relations.map((relation) => relation.target_id as CharacterId),
  ]);
}

function upcomingPressures(
  history: GameState['worldHistory'],
  timeline: readonly CanonicalTimelineEvent[],
  currentDate: WorldDate,
): CanonicalTimelineEvent[] {
  const horizon = advanceWorldDate(currentDate, { days: 30 });
  return timeline.filter((event) => history.canonical[event.id]?.status === 'scheduled'
    && compareWorldDates(event.date, currentDate) >= 0
    && compareWorldDates(event.date, horizon) <= 0).slice(0, 8);
}

function recentParticipantIds(gameState: GameState, visibleWorldEvents: readonly WorldEvent[]): CharacterId[] {
  const eventsById = new Map(visibleWorldEvents.map((event) => [event.id, event]));
  return uniqueIds(gameState.worldHistory.turns.slice(-4)
    .flatMap((turn) => turn.eventIds)
    .flatMap((eventId) => {
      const event = eventsById.get(eventId);
      return event ? worldEventParticipantIds(event) : [];
    }));
}

function relationToPlayer(character: ResolvedCharacter, playerId: CharacterId | undefined, playerRecord: StaticCharacterRecord | undefined): string | undefined {
  if (!playerId) return undefined;
  if (playerRecord?.fatherId === character.id) return '父亲';
  if (playerRecord?.motherId === character.id) return '母亲';
  if (playerRecord?.spouseIds.includes(character.id)) return '配偶';
  if (character.fatherId === playerId || character.motherId === playerId) return '子女';
  if (character.spouseIds.includes(playerId)) return '配偶';
  return character.relationships.find((relation) => relation.targetId === playerId)?.kind;
}

function visibleCharacterItems(
  characters: readonly ResolvedCharacter[],
  selectedIds: ReadonlySet<CharacterId>,
  gameState: GameState,
): { equipment: VisibleWorldItem[]; assets: VisibleWorldItem[] } {
  const equipment: VisibleWorldItem[] = [];
  const assets: VisibleWorldItem[] = [];
  for (const character of characters) {
    if (!selectedIds.has(character.id)) continue;
    const toVisible = (item: ReturnType<typeof projectNpcAssets>[number]): VisibleWorldItem => ({
      instanceId: item.instanceId,
      definitionId: item.definitionId,
      name: getItemDefinition(ITEM_CATALOG, item.definitionId).name,
      characterId: character.id,
      characterName: character.name,
      relation: item.relation,
      source: item.source,
    });
    equipment.push(...projectNpcEquipment(character.items, gameState.worldArtifacts, character.id).map(toVisible));
    assets.push(...projectNpcAssets(character.items, gameState.worldArtifacts, {
      characterId: character.id,
      titleIds: character.titleIds,
      dynastyId: character.dynastyId,
    }).filter((item) => item.relation !== '当前穿戴').map(toVisible));
  }
  const order = (left: VisibleWorldItem, right: VisibleWorldItem) => left.characterName.localeCompare(right.characterName, 'zh-CN')
    || left.name.localeCompare(right.name, 'zh-CN')
    || left.instanceId.localeCompare(right.instanceId);
  return { equipment: equipment.sort(order), assets: assets.sort(order) };
}

export async function buildWorldTurnContext(input: BuildWorldTurnContextInput): Promise<WorldTurnContext> {
  const repository = input.repository ?? defaultRepository;
  const eventStore = input.eventStore ?? defaultEventStore;
  const locationRepository = input.mapLocationRepository ?? mapRepository;
  const timeline = input.timeline ?? CANONICAL_TIMELINE;
  const { gameState } = input;
  const currentDate = { year: gameState.currentYear, month: gameState.currentMonth, day: gameState.currentDay };
  const playerId = gameState.lord.canonicalCharacterId;
  const visibleWorldEvents = selectVisibleWorldEvents(
    gameState.worldRuntime.events,
    playerWorldEventViewer(gameState),
  );
  const [manifest, playerRecord, mentioned, mapResult, startCharacters] = await Promise.all([
    repository.loadManifest(),
    playerId ? repository.get(playerId) : Promise.resolve(undefined),
    repository.findMentioned(input.actionText, { alive: true, canonTiers: ['canon', 'semicanon'], limit: 24 }),
    Promise.all([
      locationRepository.loadSearchIndex(),
      locationRepository.loadSemanticTitles().catch(() => [] as SemanticTitle[]),
      locationRepository.loadSemanticMembership().catch(() => [] as SemanticMembership[]),
    ]).then(([locations, titles, memberships]) => ({ status: 'available' as const, locations, titles, memberships }))
      .catch((error: unknown) => ({
        status: 'unavailable' as const,
        locations: [] as MapLocationSearchEntry[],
        titles: [] as SemanticTitle[],
        memberships: [] as SemanticMembership[],
        reason: error instanceof Error ? error.message : String(error),
      })),
    input.startCharacters !== undefined
      ? Promise.resolve(input.startCharacters)
      : worldContentRepository.loadStartState()
        .then((startState) => startState.characters)
        .catch(() => [] as WorldCharacterStartRecord[]),
  ]);
  const mapLocations = mapResult.locations;
  const semanticTitles = mapResult.titles;
  const semanticMemberships = mapResult.memberships;
  const directlyNamedIds = uniqueIds(mentioned.filter((hit) => hit.canonTier !== 'genealogy').map((hit) => hit.id));
  const strongRelationshipIds = relationIds(playerRecord);
  const recentInteractionIds = recentParticipantIds(gameState, visibleWorldEvents);
  const timelinePressures = upcomingPressures(gameState.worldHistory, timeline, currentDate);
  const eventParticipantIds = uniqueIds(timelinePressures.flatMap((event) => event.participants.map((person) => person.characterId)));
  const candidateIds = uniqueIds([
    ...directlyNamedIds,
    ...strongRelationshipIds,
    ...recentInteractionIds,
    ...eventParticipantIds,
  ]);
  const records = (await repository.getMany(candidateIds)).filter((record) => record.canonTier !== 'genealogy');
  const runId = gameState.worldCharacters?.runId;
  const resolved = (await Promise.all(records.map(async (record) => {
    const [events, loadoutProfile] = await Promise.all([
      runId ? eventStore.eventsForCharacter(runId, record.id) : Promise.resolve([]),
      repository.getLoadoutProfile(record.id),
    ]);
    return resolveCharacter(record, events, {
      datasetVersion: gameState.worldCharacters?.datasetHash ?? manifest.datasetHash,
      currentYear: characterDatasetYear(gameState.currentYear, record.birthDate),
      loadoutProfile,
    });
  }))).map((character) => projectResolvedCharacterWorldFacts(character, {
    history: gameState.worldHistory,
    runtime: gameState.worldRuntime,
    timeline,
    mapLocations,
    startCharacters,
  }));
  const directSet = new Set(directlyNamedIds);
  const strongSet = new Set(strongRelationshipIds);
  const recentSet = new Set(recentInteractionIds);
  const eventSet = new Set(eventParticipantIds);
  const locationNameById = new Map(mapLocations.map((location) => [location.id, location.name]));
  const candidates: CharacterPromptCandidate[] = resolved.map((character) => {
    const age = characterAgeAtYear(character.birthDate, gameState.currentYear, character.deathDate, character.alive);
    const importedTraits = filterImportedCharacterTraits(character.traits, age);
    return {
      id: character.id,
      name: character.name,
      canonTier: character.canonTier,
      directlyNamed: directSet.has(character.id),
      hasStrongRelationship: strongSet.has(character.id),
      recentlyInteracted: recentSet.has(character.id),
      isEventParticipant: eventSet.has(character.id),
      publicIdentity: character.titles[0],
      role: character.titles[0],
      locationName: character.locationId ? locationNameById.get(character.locationId) : undefined,
      relationToViewer: relationToPlayer(character, playerId, playerRecord),
      visibleTraits: resolveCharacterTraits(importedTraits.visibleTraitIds, []).map((trait) => trait.name),
      memories: character.memories,
      knowledge: character.knowledge,
    };
  });
  const rawSelection = selectSceneCharacters({
    candidates,
    directlyNamedIds,
    eventParticipantIds,
    strongRelationshipIds,
    recentInteractionIds,
  });
  const full = rawSelection.full.slice(0, WORLD_CONTEXT_LIMITS.characters);
  const compactBudget = Math.max(0, WORLD_CONTEXT_LIMITS.characters - full.length);
  const compact = rawSelection.compact.slice(0, compactBudget);
  const selection: CharacterPromptSelection = {
    full,
    compact,
    omittedCount: Math.max(0, rawSelection.full.length + rawSelection.compact.length - full.length - compact.length),
  };
  const selectedIds = new Set<CharacterId>([...selection.full, ...selection.compact].map((entry) => entry.id));
  const presentCharacterIds = uniqueIds([
    ...directlyNamedIds,
    ...recentInteractionIds,
    ...resolved.filter((character) => character.locationId === gameState.lord.location.locationId).map((character) => character.id),
  ]).filter((id) => selectedIds.has(id));
  const knownLocationIds = [...new Set([
    ...mapLocations.map((location) => location.id),
    UNKNOWN_WESTEROS_LOCATION_ID,
  ])];
  const visibleItems = visibleCharacterItems(resolved, selectedIds, gameState);
  const narrativeLocation = resolveNarrativeLocationContext({
    location: gameState.lord.location,
    locations: mapLocations,
    memberships: semanticMemberships,
    titles: semanticTitles,
  });
  const currentMembership = semanticMemberships.find((entry) => entry.locationId === gameState.lord.location.locationId);
  const membershipByLocationId = new Map(semanticMemberships.map((entry) => [entry.locationId, entry]));
  const neighboringLocations = mapLocations
    .filter((location) => location.id !== gameState.lord.location.locationId)
    .filter((location) => {
      const membership = membershipByLocationId.get(location.id);
      return Boolean(currentMembership?.countyId && membership?.countyId === currentMembership.countyId)
        || Boolean(currentMembership?.duchyId && membership?.duchyId === currentMembership.duchyId);
    })
    .sort((left, right) => right.importance - left.importance || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, WORLD_CONTEXT_LIMITS.neighboringLocations);
  const recentWorldEvents = visibleWorldEvents
    .filter((event) => event.location?.locationId === gameState.lord.location.locationId
      || event.actorIds.some((id) => selectedIds.has(id)))
    .slice(-WORLD_CONTEXT_LIMITS.events);

  return {
    selection,
    directlyNamedIds,
    strongRelationshipIds,
    recentInteractionIds,
    eventParticipantIds,
    timelinePressures,
    visibleWorldEquipment: visibleItems.equipment.slice(0, WORLD_CONTEXT_LIMITS.assets),
    visibleWorldAssets: visibleItems.assets.slice(0, WORLD_CONTEXT_LIMITS.assets),
    characterCommandContext: {
      characters: resolved,
      currentLocationId: gameState.lord.location.locationId,
      presentCharacterIds,
      knownLocationIds,
    },
    currentDate,
    narrativeLocation,
    neighboringLocations,
    recentWorldEvents,
    mapAvailability: mapResult.status === 'available'
      ? { status: 'available' }
      : { status: 'unavailable', reason: mapResult.reason },
    pendingTransactions: gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending').slice(0, 12),
  };
}

export function formatWorldTurnContext(context: WorldTurnContext): string {
  const characterSlice = buildCharacterPromptSlice(
    context.selection,
    { viewerId: 'player', knownFactIds: new Set() },
    `${context.currentDate.year}.${context.currentDate.month}.${context.currentDate.day}`,
  );
  const timelineLines = context.timelinePressures.length
    ? context.timelinePressures.map((event) => `- ${event.dateDisplay ?? `${event.date.year}.${event.date.month}.${event.date.day}`} · ${event.title}: ${event.summary}`)
    : ['- 当前三十日内没有原作预定节点。'];
  const equipmentLines = context.visibleWorldEquipment.length
    ? context.visibleWorldEquipment.map((item) => `- ${item.characterName} [${item.characterId}]：${item.name} (${item.definitionId}) · 当前穿戴。`)
    : ['- 当前场景人物没有记录中的实际穿戴。'];
  const assetLines = context.visibleWorldAssets.length
    ? context.visibleWorldAssets.map((item) => `- ${item.characterName} [${item.characterId}]：${item.name} (${item.definitionId}) · ${item.relation}；不代表当前随身携带。`)
    : ['- 当前场景人物没有可确认的未穿戴资产或保管物。'];
  const narrativeLocation = formatNarrativeLocationContext(context.narrativeLocation) || '未确认地点';
  const neighborLines = context.neighboringLocations.length
    ? context.neighboringLocations.map((location) => `- ${location.name}`)
    : ['- 当前没有需要提供给模型的邻近地点。'];
  const eventLines = context.recentWorldEvents.length
    ? context.recentWorldEvents.map((event) => `- ${event.reason}`)
    : ['- 当前地点和在场人物没有近期已提交事件。'];
  const pendingLines = context.pendingTransactions.length
    ? context.pendingTransactions.map((entry) => `- ${entry.id}：等待下一次成功回合结算。`)
    : ['- 当前没有待处理世界事务。'];
  return [
    '### 【当前权威地点】',
    `- 位置：${narrativeLocation}`,
    ...(context.mapAvailability.status === 'unavailable' ? ['- 地图资料暂不可用；不要推断新的地点、路线或抵达事实。'] : []),
    '- 地图位置、人物移动与旅程进度只由地图旅行系统和统一回合结算。',
    '### 【邻近地点】',
    ...neighborLines,
    '',
    characterSlice,
    '',
    '### 【原作预定压力】',
    '- 这些是可能发生的未来压力，不是已经发生的事实；前置条件改变时允许偏离。',
    ...timelineLines,
    '',
    '### 【人物当前实际穿戴】',
    ...equipmentLines,
    '',
    '### 【人物名下或保管资产】',
    '- 本段只说明所有权、领地/家族关联或保管关系，不代表当前随身携带。',
    ...assetLines,
    '',
    '### 【近期已提交世界事件】',
    ...eventLines,
    '',
    '### 【待处理世界事务】',
    ...pendingLines,
  ].join('\n');
}
