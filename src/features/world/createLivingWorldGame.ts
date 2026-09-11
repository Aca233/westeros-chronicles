import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import { CHARACTER_TRAITS } from '../../data/characterTraits';
import { ITEM_CATALOG, preloadItemCatalog } from '../../data/itemDefinitions';
import { createDefaultBody, type LordProfile } from '../../types/game';
import { preloadNpcLoadoutContent } from '../items/npcLoadoutContent';
import { createEmptyItemSystem } from '../items/state';
import { createInitialAgotArtifactWorldState } from '../items/worldArtifacts';
import type { WorldArtifactState } from '../items/worldArtifactTypes';
import { resolveCharacter } from '../characters/characterProjector';
import { formatDynastyName } from '../characters/characterDossier';
import {
  type CharacterCreationDraft,
  type CustomCharacterOverlayState,
  type OpeningFacts,
  type ResolvedCustomStart,
} from '../characters/customCharacterStart';
import { createCustomCharacterItemState } from '../characters/customRulerStart';
import { createLordFromExistingCharacter } from '../characters/existingCharacterStart';
import { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterDatasetManifest, StaticCharacterLoadoutProfile, StaticCharacterRecord } from '../characters/types';
import { mapRepository } from '../map/repository';
import type { MapManifest } from '../map/types';
import { createRoleplayState } from '../roleplay/state';
import type { RoleplayState } from '../roleplay/types';
import { WorldContentRepository, assertWorldDatasetCompatibility } from '../world-content/repository.ts';
import type { GameplayLocationEntry, LivingWorldManifest, LivingWorldStartState, PlayableCharacterEntry } from '../world-content/types.ts';
import { createLivingWorldBaseline, type WorldBaselineSnapshotInput } from './worldBaseline';
import { createActiveScene, type ActiveSceneState } from './sceneState';
import { createInitialLivingWorldItems, projectStartCharacterFacts } from './worldStartState';

export interface StoryOpening {
  think?: string;
  narrate: string;
  speak?: Array<{ speaker: string; text: string }>;
  branches: string[];
}

export interface PlayableCharacterCard extends PlayableCharacterEntry {
  characterName: string;
  houseName: string;
  subtitle: string;
}

export interface LivingWorldNewGame {
  lord: LordProfile;
  opening: StoryOpening;
  worldId: 'agot-298';
  startDate: WorldDate;
  season: string;
  worldStartState: LivingWorldStartState;
  worldBaseline: WorldBaselineSnapshotInput;
  worldArtifacts: WorldArtifactState;
  characterDatasetHash: string;
  startMinute?: number;
  runId?: string;
  initialScene?: ActiveSceneState;
  initialRoleplay?: RoleplayState;
  characterCreationDraft?: CharacterCreationDraft;
  customCharacters?: CustomCharacterOverlayState;
  openingFacts?: OpeningFacts;
  legacyScenarioId?: string;
}

export interface LivingWorldStartDependencies {
  loadManifest(): Promise<LivingWorldManifest>;
  loadPlayableCharacters(): Promise<PlayableCharacterEntry[]>;
  loadStartState(): Promise<LivingWorldStartState>;
  loadTerminology(): Promise<import('../world-content/types').WorldTerminology>;
  loadCharacterManifest(): Promise<CharacterDatasetManifest>;
  loadMapManifest(): Promise<MapManifest>;
  loadCharacter(characterId: CharacterId): Promise<StaticCharacterRecord | undefined>;
  loadLoadout(characterId: CharacterId): Promise<StaticCharacterLoadoutProfile | undefined>;
  loadArtifacts(): Promise<WorldArtifactState>;
  loadGameplayLocations?(): Promise<GameplayLocationEntry[]>;
}

const worldRepository = new WorldContentRepository();
const characterRepository = new StaticCharacterRepository();

const defaultDependencies: LivingWorldStartDependencies = {
  loadManifest: () => worldRepository.loadManifest(),
  loadPlayableCharacters: () => worldRepository.loadPlayableCharacters(),
  loadStartState: () => worldRepository.loadStartState(),
  loadTerminology: () => worldRepository.loadTerminology(),
  loadCharacterManifest: () => characterRepository.loadManifest(),
  loadMapManifest: () => mapRepository.loadManifest(),
  loadCharacter: (characterId) => characterRepository.get(characterId),
  loadLoadout: (characterId) => characterRepository.getLoadoutProfile(characterId),
  loadArtifacts: async () => createInitialAgotArtifactWorldState(),
  loadGameplayLocations: () => worldRepository.loadGameplayLocations(),
};

function displayHouse(record: StaticCharacterRecord): string {
  return formatDynastyName(record.dynastyId);
}

function openingFor(lord: LordProfile, playable: PlayableCharacterEntry, startDate: WorldDate): StoryOpening {
  void playable;
  return {
    narrate: `征服历${startDate.year}年${startDate.month}月${startDate.day}日，${lord.name}身处${lord.locationLabel}。世界既有的人物、关系、头衔与资产都已存在；从这一刻起，接下来的变化由行动与世界规则共同产生。`,
    branches: ['查看当前处境与身边人物', '处理眼前最紧迫的事务', '了解自己的关系、装备与资产'],
  };
}

export async function loadPlayableCharacterCards(
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<PlayableCharacterCard[]> {
  const [manifest, entries, characterManifest, mapManifest, artifacts] = await Promise.all([
    dependencies.loadManifest(),
    dependencies.loadPlayableCharacters(),
    dependencies.loadCharacterManifest(),
    dependencies.loadMapManifest(),
    dependencies.loadArtifacts(),
  ]);
  assertWorldDatasetCompatibility(manifest, characterManifest, mapManifest, artifacts);
  return Promise.all(entries.filter((entry) => entry.enabled).map(async (entry) => {
    const record = await dependencies.loadCharacter(entry.characterId);
    if (!record?.born) throw new Error(`可玩人物不存在或尚未出生：${entry.characterId}`);
    return {
      ...entry,
      characterName: record.name,
      houseName: displayHouse(record),
      subtitle: `征服历 ${manifest.startDate.year} AC · 统一世界`,
    };
  }));
}

export async function createLivingWorldGame(
  characterId: CharacterId,
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<LivingWorldNewGame> {
  const [manifest, playableEntries, startState, terminology, characterManifest, mapManifest, record, loadout, artifacts] = await Promise.all([
    dependencies.loadManifest(),
    dependencies.loadPlayableCharacters(),
    dependencies.loadStartState(),
    dependencies.loadTerminology(),
    dependencies.loadCharacterManifest(),
    dependencies.loadMapManifest(),
    dependencies.loadCharacter(characterId),
    dependencies.loadLoadout(characterId),
    dependencies.loadArtifacts(),
  ]);
  const playable = playableEntries.find((entry) => entry.characterId === characterId);
  if (!playable?.enabled || !record?.born || !record.alive) throw new Error('该人物不能用于当前开局');
  assertWorldDatasetCompatibility(manifest, characterManifest, mapManifest, artifacts);
  await Promise.all([preloadItemCatalog(), preloadNpcLoadoutContent()]);
  const resolved = projectStartCharacterFacts(resolveCharacter(record, [], {
    datasetVersion: manifest.characterDatasetHash,
    currentYear: manifest.startDate.year + 8000,
    ...(loadout ? { loadoutProfile: loadout } : {}),
  }), startState, { characters: {} });
  const lord = createLordFromExistingCharacter(
    resolved,
    artifacts,
    manifest.startDate.year,
    createInitialLivingWorldItems(characterId, startState, ITEM_CATALOG),
    terminology,
  );
  return {
    lord,
    opening: openingFor(lord, playable, manifest.startDate),
    worldId: manifest.worldId,
    startDate: { ...manifest.startDate },
    season: '暮春',
    worldStartState: structuredClone(startState),
    worldBaseline: createLivingWorldBaseline(startState, artifacts),
    worldArtifacts: structuredClone(artifacts),
    characterDatasetHash: manifest.characterDatasetHash,
  };
}

export async function prepareCustomOpeningFacts(
  resolved: ResolvedCustomStart,
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<OpeningFacts> {
  const [manifest, startState, characterManifest, mapManifest, artifacts, gameplayLocations] = await Promise.all([
    dependencies.loadManifest(),
    dependencies.loadStartState(),
    dependencies.loadCharacterManifest(),
    dependencies.loadMapManifest(),
    dependencies.loadArtifacts(),
    dependencies.loadGameplayLocations ? dependencies.loadGameplayLocations() : worldRepository.loadGameplayLocations(),
  ]);
  assertWorldDatasetCompatibility(manifest, characterManifest, mapManifest, artifacts);
  const selectedLocation = gameplayLocations.find((entry) => entry.id === resolved.location.locationId);
  if (!selectedLocation) throw new Error(`开局地点无效或不属于可玩地点：${resolved.location.locationId}`);
  if (manifest.startDate.year !== resolved.openingFacts.date.year
    || manifest.startDate.month !== resolved.openingFacts.date.month
    || manifest.startDate.day !== resolved.openingFacts.date.day) {
    throw new Error('自创人物开局日期与当前世界内容版本不一致');
  }

  const localCharacterIds = startState.characters
    .filter((entry) => entry.location.locationId === resolved.location.locationId && entry.currentActivity !== 'missing')
    .map((entry) => entry.characterId)
    .filter((id) => id !== resolved.playerId)
    .slice(0, 5);
  const localRecords = (await Promise.all(localCharacterIds.map((id) => dependencies.loadCharacter(id))))
    .filter((record): record is StaticCharacterRecord => Boolean(record?.born && record.alive));
  const generatedLocalRecords = Object.values(resolved.characterOverlay.records)
    .filter((record) => record.id !== resolved.playerId
      && String(record.id).includes(':local:')
      && record.location.locationId === resolved.location.locationId);

  return {
    ...structuredClone(resolved.openingFacts),
    location: { ...resolved.location },
    locationLabel: `${selectedLocation.name} · ${resolved.openingFacts.situationLabel}`,
    presentCharacters: [
      { id: resolved.playerId, name: resolved.draft.name, role: 'player' },
      ...generatedLocalRecords.map((record) => ({ id: record.id, name: record.name, role: 'present_npc' as const })),
      ...localRecords.map((record) => ({ id: record.id, name: record.name, role: 'present_npc' as const })),
    ],
  };
}

/**
 * Resolve a validated custom-character start against the current compiled world.
 * The creator no longer assembles LordProfile/scene/items itself. A relationship
 * only places a person in the opening when that person is independently present
 * at the selected start location in the canonical start state.
 */
export async function createCustomLivingWorldGame(
  resolved: ResolvedCustomStart,
  opening: StoryOpening,
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<LivingWorldNewGame> {
  const [manifest, startState, characterManifest, mapManifest, artifacts, gameplayLocations] = await Promise.all([
    dependencies.loadManifest(),
    dependencies.loadStartState(),
    dependencies.loadCharacterManifest(),
    dependencies.loadMapManifest(),
    dependencies.loadArtifacts(),
    dependencies.loadGameplayLocations ? dependencies.loadGameplayLocations() : worldRepository.loadGameplayLocations(),
  ]);
  assertWorldDatasetCompatibility(manifest, characterManifest, mapManifest, artifacts);
  const selectedLocation = gameplayLocations.find((entry) => entry.id === resolved.location.locationId);
  if (!selectedLocation) throw new Error(`开局地点无效或不属于可玩地点：${resolved.location.locationId}`);
  if (manifest.startDate.year !== resolved.openingFacts.date.year
    || manifest.startDate.month !== resolved.openingFacts.date.month
    || manifest.startDate.day !== resolved.openingFacts.date.day) {
    throw new Error('自创人物开局日期与当前世界内容版本不一致');
  }
  if (opening.branches.length < 2 || opening.branches.length > 3 || !opening.narrate.trim()) {
    throw new Error('第一幕结构无效：必须包含正文与 2—3 条行动提示');
  }
  await preloadItemCatalog();
  const openingFacts = await prepareCustomOpeningFacts(resolved, dependencies);
  const presentCharacterIds = openingFacts.presentCharacters.map((entry) => entry.id);

  const roleplay = createRoleplayState();
  roleplay.relationshipEvidence = resolved.relationshipFacts.map((fact) => ({
    id: `relationship:${fact.id}`,
    turn: 0,
    participantIds: [...fact.participantIds],
    sourceEventId: fact.id,
    summary: fact.summary,
    impact: fact.kind === 'employer' || fact.kind === 'fealty' ? 'obligation' : 'neutral',
    heardByIds: [...fact.heardByIds],
  }));
  roleplay.knowledge = resolved.relationshipFacts.flatMap((fact) => fact.heardByIds.map((characterId) => ({
    id: `knowledge:${fact.id}:${characterId}`,
    characterId,
    claim: fact.summary,
    sourceEventId: fact.id,
    learnedTurn: 0,
  })));

  const traitNames = resolved.traitIds.map((id) => CHARACTER_TRAITS.find((trait) => trait.id === id)?.name ?? id);
  const lord: LordProfile = {
    canonicalCharacterId: resolved.playerId,
    name: resolved.draft.name,
    house: resolved.houseName,
    houseWords: resolved.houseWords,
    houseSigil: resolved.houseSigil,
    ...(resolved.coatOfArms ? { coatOfArms: structuredClone(resolved.coatOfArms) } : {}),
    dynastyName: resolved.dynastyName,
    title: resolved.title,
    age: resolved.draft.age,
    gender: resolved.draft.gender,
    culture: resolved.draft.culture,
    faith: resolved.draft.faith,
    location: { ...resolved.location },
    locationLabel: openingFacts.locationLabel,
    body: createDefaultBody(),
    overallStatus: '强健',
    items: createCustomCharacterItemState({
      itemPackage: resolved.itemPackage,
      location: resolved.location,
      locationLabel: openingFacts.locationLabel,
      situation: resolved.draft.situation,
      hasHouse: Boolean(resolved.draft.house),
    }),
    goldDragons: resolved.goldDragons,
    silverStags: resolved.silverStags,
    attributes: { ...resolved.attributes },
    baseAttributes: { ...resolved.baseAttributes },
    traits: traitNames,
    traitIds: [...resolved.traitIds],
  };

  return {
    lord,
    opening,
    worldId: manifest.worldId,
    startDate: { ...manifest.startDate },
    season: '暮春',
    worldStartState: structuredClone(startState),
    worldBaseline: createLivingWorldBaseline(startState, artifacts),
    worldArtifacts: structuredClone(artifacts),
    characterDatasetHash: manifest.characterDatasetHash,
    startMinute: resolved.openingFacts.minuteOfDay,
    runId: resolved.runId,
    initialScene: createActiveScene(resolved.location, 1, presentCharacterIds),
    initialRoleplay: roleplay,
    characterCreationDraft: structuredClone(resolved.draft),
    customCharacters: structuredClone(resolved.characterOverlay),
    openingFacts,
    legacyScenarioId: 'custom',
  };
}

export function createUnselectedLivingWorldState(): LivingWorldNewGame {
  const startDate = { year: 298, month: 5, day: 10 } as const;
  const lord: LordProfile = {
    name: '尚未选择人物', house: '尚未选择家族', houseWords: '—', houseSigil: 'unknown', title: '尚未开始', age: 18,
    gender: '未指定', location: { locationId: 'b_unknown_westeros' }, locationLabel: '所在地未查明',
    body: createDefaultBody(),
    overallStatus: '强健', items: createEmptyItemSystem(), goldDragons: 0, silverStags: 0,
    attributes: { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0, prowess: 0 }, traits: [], traitIds: [],
  };
  return {
    lord,
    opening: { narrate: '请选择人物以开始统一世界。', branches: [] },
    worldId: 'agot-298', startDate, season: '暮春',
    worldStartState: { schemaVersion: 1, characters: [], titles: [], assets: [], sites: [], vehicles: [] },
    worldBaseline: { characters: [], titles: [], assets: [], knownLocationIds: [] },
    worldArtifacts: createInitialAgotArtifactWorldState(), characterDatasetHash: '',
  };
}
