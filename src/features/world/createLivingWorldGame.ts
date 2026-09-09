import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import type { LordProfile } from '../../types/game';
import { ITEM_CATALOG, preloadItemCatalog } from '../../data/itemDefinitions';
import { preloadNpcLoadoutContent } from '../items/npcLoadoutContent';
import { createEmptyItemSystem } from '../items/state';
import { createInitialAgotArtifactWorldState } from '../items/worldArtifacts';
import type { WorldArtifactState } from '../items/worldArtifactTypes';
import { resolveCharacter } from '../characters/characterProjector';
import { formatDynastyName } from '../characters/characterDossier';
import { createLordFromExistingCharacter } from '../characters/existingCharacterStart';
import { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterDatasetManifest, StaticCharacterLoadoutProfile, StaticCharacterRecord } from '../characters/types';
import { mapRepository } from '../map/repository';
import type { MapManifest } from '../map/types';
import { createLivingWorldBaseline, type WorldBaselineSnapshotInput } from './worldBaseline';
import { createInitialLivingWorldItems, projectStartCharacterFacts } from './worldStartState';
import { WorldContentRepository, assertWorldDatasetCompatibility } from '../world-content/repository.ts';
import type { LivingWorldManifest, LivingWorldStartState, PlayableCharacterEntry } from '../world-content/types.ts';

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
};

function displayHouse(record: StaticCharacterRecord): string {
  return formatDynastyName(record.dynastyId);
}


function openingFor(lord: LordProfile, playable: PlayableCharacterEntry, startDate: WorldDate): StoryOpening {
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

export async function createCustomLivingWorldGame(
  lord: LordProfile,
  opening: StoryOpening,
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<LivingWorldNewGame> {
  const [manifest, startState, characterManifest, mapManifest, artifacts] = await Promise.all([
    dependencies.loadManifest(), dependencies.loadStartState(), dependencies.loadCharacterManifest(),
    dependencies.loadMapManifest(), dependencies.loadArtifacts(),
  ]);
  assertWorldDatasetCompatibility(manifest, characterManifest, mapManifest, artifacts);
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
    legacyScenarioId: 'custom',
  };
}

export function createUnselectedLivingWorldState(): LivingWorldNewGame {
  const startDate = { year: 298, month: 5, day: 10 } as const;
  const lord: LordProfile = {
    name: '尚未选择人物', house: '尚未选择家族', houseWords: '—', houseSigil: 'unknown', title: '尚未开始', age: 18,
    gender: '未指定', location: { locationId: 'b_unknown_westeros' }, locationLabel: '所在地未查明',
    body: { head: { key: 'head', name: '头部与咽喉', level: 'intact', wounds: [], isFatalZone: true }, torso: { key: 'torso', name: '胸膛与躯干', level: 'intact', wounds: [], isFatalZone: true }, arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: [], isFatalZone: false }, legs: { key: 'legs', name: '双腿与下肢', level: 'intact', wounds: [], isFatalZone: false }, isBleeding: false, isPoisoned: false, isInfected: false },
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
