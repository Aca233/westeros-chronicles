import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { resolveCharacterTraits } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import type { GameState } from '../../types/game';
import { getItemDefinition } from '../items/catalog';
import { getUsedStorageUnits } from '../items/custody';
import { preloadNpcLoadoutContent } from '../items/npcLoadoutContent';
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
import type { WorldDate } from './worldHistory';
import { projectNpcAssets, projectNpcEquipment, worldEventParticipantIds, type NpcItemRelation } from './worldHistoryProjection';
import { mapRepository } from '../map/repository';
import { sameWorldLocation, UNKNOWN_WESTEROS_LOCATION_ID } from '../map/locationResolver';
import { worldAssetId } from './worldAssetId';
import { formatNarrativeLocationContext, resolveNarrativeLocationContext, type NarrativeLocationContext } from '../map/narrativeLocationContext';
import type { MapLocationSearchEntry, SemanticMembership, SemanticTitle } from '../map/types';
import type { PendingWorldTransaction, WorldEvent } from './worldRuntimeTypes';
import type { WorldCharacterStartRecord } from '../world-content/types';
import { worldContentRepository } from '../world-content/repository';
import { projectResolvedCharacterWorldFacts } from './characterWorldFacts';
import { playerWorldEventViewer, selectVisibleWorldEvents } from './worldEventVisibility';

export const WORLD_CONTEXT_LIMITS = {
  characters: 12,
  assets: 12,
  events: 6,
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
  gameplayLocations?: readonly MapLocationSearchEntry[];
  timeline?: readonly CanonicalTimelineEvent[];
  /** 由场景系统明确登记的在场人物；点名和近期互动不能代替在场证据。 */
  presentCharacterIds?: readonly CharacterId[];
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

export interface VisibleWorldSite {
  siteId: string;
  name: string;
  type: string;
  capacity?: number;
  itemCount: number;
  usedUnits: number;
  locationTitle?: string;
}

export interface WorldTurnContext {
  manifest: {
    schemaVersion: 1;
    fullCharacterIds: CharacterId[];
    compactCharacterIds: CharacterId[];
    omittedCharacterCount: number;
    visibleAssetCount: number;
    visibleEventCount: number;
    neighboringLocationCount: number;
    pendingTransactionCount: number;
    mapStatus: 'available' | 'unavailable';
  };
  selection: CharacterPromptSelection;
  directlyNamedIds: CharacterId[];
  strongRelationshipIds: CharacterId[];
  recentInteractionIds: CharacterId[];
  eventParticipantIds: CharacterId[];
  timelinePressures: CanonicalTimelineEvent[];
  visibleWorldEquipment: VisibleWorldItem[];
  visibleWorldAssets: VisibleWorldItem[];
  currentLocationSites: VisibleWorldSite[];
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

function recentParticipantIds(gameState: GameState, visibleWorldEvents: readonly WorldEvent[]): CharacterId[] {
  const eventsById = new Map(visibleWorldEvents.map((event) => [event.id, event]));
  return uniqueIds(gameState.worldHistory.turns.slice(-2)
    .flatMap((turn) => turn.eventIds)
    .flatMap((eventId) => {
      const event = eventsById.get(eventId);
      return event ? worldEventParticipantIds(event) : [];
    }));
}

type MentionCandidate = CharacterSearchHit | StaticCharacterRecord;

function mentionName(hit: MentionCandidate): string {
  return hit.name.trim();
}

function mentionId(hit: MentionCandidate): CharacterId {
  return hit.id;
}

/**
 * Deduplicates mention hits by display name. When several characters share
 * the same name (e.g. nine unrelated "劳勃" from different houses), only the
 * first-ranked one is kept as a direct mention. `findMentioned` already sorts
 * by canon tier, liveness, and stable id, so the survivor is the most
 * prominent living canon character with that name. Characters with unique
 * names are always retained.
 */
function disambiguateByName(hits: readonly MentionCandidate[]): MentionCandidate[] {
  const seenNames = new Map<string, MentionCandidate>();
  for (const hit of hits) {
    const key = mentionName(hit);
    if (!key) continue;
    if (!seenNames.has(key)) seenNames.set(key, hit);
  }
  return hits.filter((hit) => seenNames.get(mentionName(hit)) === hit);
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

function sharesExplicitScene(character: ResolvedCharacter, location: GameState['lord']['location']): boolean {
  return character.locationId === location.locationId
    && typeof character.sceneLocation === 'string'
    && character.sceneLocation.trim().length > 0
    && typeof location.sceneLocation === 'string'
    && character.sceneLocation.trim() === location.sceneLocation.trim();
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
  const [, manifest, playerRecord, mentioned, mapResult, startCharacters, gameplayLocations] = await Promise.all([
    preloadNpcLoadoutContent(),
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
    input.gameplayLocations !== undefined
      ? Promise.resolve(input.gameplayLocations)
      : worldContentRepository.loadGameplayLocations()
        .catch(() => [] as MapLocationSearchEntry[]),
  ]);
  const mapLocations = mapResult.locations;
  const semanticTitles = mapResult.titles;
  const semanticMemberships = mapResult.memberships;
  const mentionedNonGenealogy = mentioned.filter((hit) => hit.canonTier !== 'genealogy');
  const directlyNamedIds = uniqueIds(disambiguateByName(mentionedNonGenealogy).map(mentionId));
  const strongRelationshipIds = relationIds(playerRecord);
  const recentInteractionIds = recentParticipantIds(gameState, visibleWorldEvents);
  // 未来原作节点只供程序推进世界，不进入模型上下文，也不把未来参与者提前拉入场景。
  const timelinePressures: CanonicalTimelineEvent[] = [];
  const eventParticipantIds = [...recentInteractionIds];
  const storedSceneIds = gameState.activeScene
    && gameState.activeScene.location.locationId === gameState.lord.location.locationId
    && (gameState.activeScene.location.sceneLocation?.trim() ?? '') === (gameState.lord.location.sceneLocation?.trim() ?? '')
    ? gameState.activeScene.presentCharacterIds
    : [];
  const explicitPresentIds = uniqueIds(input.presentCharacterIds ?? storedSceneIds);
  const candidateIds = uniqueIds([
    ...directlyNamedIds,
    ...strongRelationshipIds,
    ...recentInteractionIds,
    ...eventParticipantIds,
    ...explicitPresentIds,
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
  const explicitPresentSet = new Set(explicitPresentIds);
  const locationNameById = new Map(mapLocations.map((location) => [location.id, location.name]));
  const candidates: CharacterPromptCandidate[] = resolved.map((character) => {
    const age = characterAgeAtYear(character.birthDate, gameState.currentYear, character.deathDate, character.alive);
    const importedTraits = filterImportedCharacterTraits(character.traits, age);
    const isPresent = explicitPresentSet.has(character.id) || sharesExplicitScene(character, gameState.lord.location);
    return {
      id: character.id,
      name: character.name,
      canonTier: character.canonTier,
      directlyNamed: directSet.has(character.id),
      hasStrongRelationship: strongSet.has(character.id),
      recentlyInteracted: recentSet.has(character.id),
      isEventParticipant: eventSet.has(character.id),
      isPresent,
      publicIdentity: character.titles[0],
      role: character.titles[0],
      locationName: isPresent && character.locationId ? locationNameById.get(character.locationId) : undefined,
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
    presentCharacterIds: explicitPresentIds,
    strongRelationshipIds,
    recentInteractionIds,
  });
  // 直接点名与当前说话人允许突破常规上限；不要在这里再次截断 selector 的强制保留结果。
  const full = rawSelection.full;
  const compactBudget = Math.max(0, WORLD_CONTEXT_LIMITS.characters - full.length);
  const compact = rawSelection.compact.slice(0, compactBudget);
  const selection: CharacterPromptSelection = {
    full,
    compact,
    omittedCount: Math.max(0, rawSelection.full.length + rawSelection.compact.length - full.length - compact.length),
  };
  const selectedIds = new Set<CharacterId>([...selection.full, ...selection.compact].map((entry) => entry.id));
  const presentCharacterIds = uniqueIds([
    ...explicitPresentIds,
    ...resolved.filter((character) => sharesExplicitScene(character, gameState.lord.location)).map((character) => character.id),
  ]);
  // New MOVE/TRANSFER targets must be gameplay locations; the current
  // location stays valid so pre-existing saves on hidden locations can
  // still be referenced and left.
  const knownLocationIds = [...new Set([
    ...gameplayLocations.map((location) => location.id),
    gameState.lord.location.locationId,
    UNKNOWN_WESTEROS_LOCATION_ID,
  ])];
  const visibleItems = visibleCharacterItems(resolved, new Set(presentCharacterIds), gameState);
  // 当前地点据点：容器的在场可见性——名称、类型、容量与现存件数直接进入解析上下文。
  const titlesByTitleId = new Map(semanticTitles.map((title) => [title.titleId, title.name]));
  const itemSystem = gameState.lord.items;
  const currentLocationSites: VisibleWorldSite[] = Object.values(itemSystem.sites)
    .filter((site) => sameWorldLocation(site.location, gameState.lord.location))
    .map((site) => ({
      siteId: worldAssetId.site(site.id),
      name: site.name,
      type: site.type,
      ...(site.capacity !== undefined ? { capacity: site.capacity } : {}),
      itemCount: Object.values(itemSystem.placements)
        .filter((placement) => placement.type === 'site' && placement.siteId === site.id)
        .length,
      usedUnits: getUsedStorageUnits(itemSystem, ITEM_CATALOG, { type: 'site', siteId: site.id }),
      ...(titlesByTitleId.has(site.location.locationId)
        ? { locationTitle: titlesByTitleId.get(site.location.locationId) }
        : {}),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 8);
  const narrativeLocation = resolveNarrativeLocationContext({
    location: gameState.lord.location,
    locations: mapLocations,
    memberships: semanticMemberships,
    titles: semanticTitles,
  });
  const currentMembership = semanticMemberships.find((entry) => entry.locationId === gameState.lord.location.locationId);
  const membershipByLocationId = new Map(semanticMemberships.map((entry) => [entry.locationId, entry]));
  // LLM location candidates only accept gameplay locations; hidden map
  // provinces and transit nodes stay out of the prompt context.
  const neighboringLocations = gameplayLocations
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
    manifest: {
      schemaVersion: 1,
      fullCharacterIds: selection.full.map((entry) => entry.id),
      compactCharacterIds: selection.compact.map((entry) => entry.id),
      omittedCharacterCount: selection.omittedCount ?? 0,
      visibleAssetCount: Math.min(WORLD_CONTEXT_LIMITS.assets, visibleItems.equipment.length + visibleItems.assets.length),
      visibleEventCount: recentWorldEvents.length,
      neighboringLocationCount: neighboringLocations.length,
      pendingTransactionCount: Math.min(6, gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending').length),
      mapStatus: mapResult.status,
    },
    selection,
    directlyNamedIds,
    strongRelationshipIds,
    recentInteractionIds,
    eventParticipantIds,
    timelinePressures,
    visibleWorldEquipment: visibleItems.equipment.slice(0, WORLD_CONTEXT_LIMITS.assets),
    visibleWorldAssets: visibleItems.assets.slice(0, WORLD_CONTEXT_LIMITS.assets),
    currentLocationSites,
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
    pendingTransactions: gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending').slice(0, 6),
  };
}

function groupVisibleItemsByCharacter(
  items: readonly VisibleWorldItem[],
  formatItem: (item: VisibleWorldItem) => string,
): string[] {
  const groups = new Map<CharacterId, { id: CharacterId; name: string; entries: string[] }>();
  for (const item of items) {
    let group = groups.get(item.characterId);
    if (!group) {
      group = { id: item.characterId, name: item.characterName, entries: [] };
      groups.set(item.characterId, group);
    }
    group.entries.push(formatItem(item));
  }
  return [...groups.values()].map((group) => `- ${group.name} [${group.id}]：${group.entries.join('、')}`);
}

export function formatWorldTurnContext(context: WorldTurnContext): string {
  const characterSlice = buildCharacterPromptSlice(
    context.selection,
    { viewerId: 'player', knownFactIds: new Set() },
    `${context.currentDate.year}.${context.currentDate.month}.${context.currentDate.day}`,
  );
  const equipmentLines = context.visibleWorldEquipment.length
    ? groupVisibleItemsByCharacter(context.visibleWorldEquipment, (item) => `${item.name} (${item.definitionId})`)
    : ['- 当前场景人物没有记录中的实际穿戴。'];
  const assetLines = context.visibleWorldAssets.length
    ? groupVisibleItemsByCharacter(context.visibleWorldAssets, (item) => `${item.name} (${item.definitionId}) · ${item.relation}`)
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
  const siteLines = context.currentLocationSites.length
    ? context.currentLocationSites.map((site) => {
        const usage = site.capacity !== undefined ? `${site.usedUnits}/${site.capacity}` : `${site.usedUnits}`;
        const title = site.locationTitle ? `，隶属领地：${site.locationTitle}` : '';
        return `- ${site.name} [${site.siteId}]：${site.type}，${site.itemCount} 个物品条目，占用 ${usage} 容量${title}`;
      })
    : ['- 当前地点没有已知据点或储藏处。'];
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
    '### 【人物当前实际穿戴】',
    ...equipmentLines,
    '',
    '### 【人物名下或保管资产】',
    '- 本段只说明所有权、领地/家族关联或保管关系，不代表当前随身携带。',
    ...assetLines,
    '',
    '### 【当前地点据点】',
    '- 据点是当前地点的储藏容器；取用其中的物品必须通过物品命令，归属由所在领地的控制权决定。',
    ...siteLines,
    '',
    '### 【近期已提交世界事件】',
    ...eventLines,
    '',
    '### 【待处理世界事务】',
    ...pendingLines,
  ].join('\n');
}
