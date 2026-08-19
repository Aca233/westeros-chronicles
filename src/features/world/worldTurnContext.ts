import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { resolveCharacterTraits } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import type { GameState } from '../../types/game';
import { getItemDefinition } from '../items/catalog';
import { buildCharacterPromptSlice, type CharacterPromptCandidate, type CharacterPromptSelection } from '../characters/characterPromptSlice';
import { characterAgeAtYear, characterDatasetYear } from '../characters/characterDossier';
import type { CharacterEventEnvelope, CharacterEventStore } from '../characters/characterEventStore';
import { DexieCharacterEventStore } from '../characters/characterEventStore';
import { resolveCharacter } from '../characters/characterProjector';
import { selectSceneCharacters } from '../characters/sceneCharacterSelector';
import { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterId, CharacterSearchHit, ResolvedCharacter, StaticCharacterLoadoutProfile, StaticCharacterRecord } from '../characters/types';
import type { CharacterCommandBatchBaseContext } from '../../services/stateReducer';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import { advanceWorldDate, compareWorldDates, type WorldDate } from './worldHistory';
import { projectNpcAssets, projectNpcEquipment, type NpcItemRelation } from './worldHistoryProjection';
import { mapRepository } from '../map/repository';
import { UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';

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
  mapLocationRepository?: { loadSearchIndex(): Promise<Array<{ id: string }>> };
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

function recentParticipantIds(gameState: GameState): CharacterId[] {
  return uniqueIds(gameState.worldHistory.turns.slice(-4).flatMap((turn) => turn.facts.flatMap((fact) => fact.participantIds)));
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
  const [manifest, playerRecord, mentioned, mapLocations] = await Promise.all([
    repository.loadManifest(),
    playerId ? repository.get(playerId) : Promise.resolve(undefined),
    repository.findMentioned(input.actionText, { alive: true, canonTiers: ['canon', 'semicanon'], limit: 24 }),
    locationRepository.loadSearchIndex(),
  ]);
  const directlyNamedIds = uniqueIds(mentioned.filter((hit) => hit.canonTier !== 'genealogy').map((hit) => hit.id));
  const strongRelationshipIds = relationIds(playerRecord);
  const recentInteractionIds = recentParticipantIds(gameState);
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
  const resolved = await Promise.all(records.map(async (record) => {
    const [events, loadoutProfile] = await Promise.all([
      runId ? eventStore.eventsForCharacter(runId, record.id) : Promise.resolve([]),
      repository.getLoadoutProfile(record.id),
    ]);
    return resolveCharacter(record, events, {
      datasetVersion: gameState.worldCharacters?.datasetHash ?? manifest.datasetHash,
      currentYear: characterDatasetYear(gameState.currentYear, record.birthDate),
      loadoutProfile,
    });
  }));
  const directSet = new Set(directlyNamedIds);
  const strongSet = new Set(strongRelationshipIds);
  const recentSet = new Set(recentInteractionIds);
  const eventSet = new Set(eventParticipantIds);
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
      locationName: character.locationId,
      relationToViewer: relationToPlayer(character, playerId, playerRecord),
      visibleTraits: resolveCharacterTraits(importedTraits.visibleTraitIds, []).map((trait) => trait.name),
      memories: character.memories,
      knowledge: character.knowledge,
    };
  });
  const selection = selectSceneCharacters({
    candidates,
    directlyNamedIds,
    eventParticipantIds,
    strongRelationshipIds,
    recentInteractionIds,
  }) as CharacterPromptSelection;
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

  return {
    selection,
    directlyNamedIds,
    strongRelationshipIds,
    recentInteractionIds,
    eventParticipantIds,
    timelinePressures,
    visibleWorldEquipment: visibleItems.equipment,
    visibleWorldAssets: visibleItems.assets,
    characterCommandContext: {
      characters: resolved,
      currentLocationId: gameState.lord.location.locationId,
      presentCharacterIds,
      knownLocationIds,
    },
    currentDate,
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
  return [
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
  ].join('\n');
}
