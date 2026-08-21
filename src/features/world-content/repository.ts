import type { CharacterDatasetManifest, CharacterId } from '../characters/types';
import type { WorldArtifactState } from '../items/worldArtifactTypes';
import type { MapManifest } from '../map/types';
import {
  parseCharacterContentIndex,
  parseCharacterContentShard,
  parseGameplayLocationDataset,
  parseHolderSummaryDataset,
  parseLivingWorldManifest,
  parseLivingWorldStartState,
  parseOrdinaryItems,
  parsePlayableCharacters,
  parseWorldLoadouts,
  parseWorldTerminology,
} from './schemas.ts';
import type {
  CharacterContentIndex,
  CharacterContentRecord,
  GameplayLocationEntry,
  HolderSummary,
  LivingWorldManifest,
  LivingWorldStartState,
  OrdinaryItemContent,
  PlayableCharacterEntry,
  WorldLoadoutContent,
  WorldTerminology,
} from './types.ts';

export type FetchJson = (path: string) => Promise<unknown>;
const MANIFEST_PATH = '/data/world/manifest.json';

const defaultFetchJson: FetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`世界内容读取失败：${response.status} ${path}`);
  return response.json();
};

export function assertWorldDatasetCompatibility(
  world: LivingWorldManifest,
  characters: Pick<CharacterDatasetManifest, 'datasetHash'>,
  map: Pick<MapManifest, 'datasetHash'>,
  artifacts: Pick<WorldArtifactState, 'artifactDatasetHash' | 'datasetHash'>,
): void {
  if (world.characterDatasetHash !== characters.datasetHash) throw new Error('人物数据哈希不匹配');
  if (world.mapDatasetHash !== map.datasetHash) throw new Error('地图数据哈希不匹配');
  if (world.artifactDatasetHash !== artifacts.artifactDatasetHash) throw new Error('神器数据哈希不匹配');
  if (world.artifactWorldStateHash !== artifacts.datasetHash) throw new Error('神器世界状态哈希不匹配');
}

export class WorldContentRepository {
  private readonly fetchJson: FetchJson;
  private readonly cache = new Map<string, Promise<unknown>>();
  private indexPromise?: Promise<CharacterContentIndex>;
  private readonly contentShardPromises = new Map<string, Promise<Record<string, CharacterContentRecord>>>();

  constructor(fetchJson: FetchJson = defaultFetchJson) {
    this.fetchJson = fetchJson;
  }

  clear(): void {
    this.cache.clear();
    this.indexPromise = undefined;
    this.contentShardPromises.clear();
  }

  private load<T>(path: string, parser: (value: unknown) => T): Promise<T> {
    let pending = this.cache.get(path) as Promise<T> | undefined;
    if (!pending) {
      pending = this.fetchJson(path).then(parser);
      this.cache.set(path, pending);
    }
    return pending;
  }

  loadManifest(): Promise<LivingWorldManifest> {
    return this.load(MANIFEST_PATH, parseLivingWorldManifest);
  }

  async loadPlayableCharacters(): Promise<PlayableCharacterEntry[]> {
    const manifest = await this.loadManifest();
    return this.load(manifest.paths.playableCharacters, parsePlayableCharacters);
  }

  async loadStartState(): Promise<LivingWorldStartState> {
    const manifest = await this.loadManifest();
    return this.load(manifest.paths.startState, parseLivingWorldStartState);
  }

  async loadTerminology(): Promise<WorldTerminology> {
    const manifest = await this.loadManifest();
    return this.load(manifest.paths.terminology, parseWorldTerminology);
  }

  async loadGameplayLocations(): Promise<GameplayLocationEntry[]> {
    const manifest = await this.loadManifest();
    const dataset = await this.load(manifest.paths.gameplayLocations, parseGameplayLocationDataset);
    return dataset.entries;
  }

  async loadHolderSummaries(): Promise<HolderSummary[]> {
    const manifest = await this.loadManifest();
    const dataset = await this.load(manifest.paths.holderSummaries, parseHolderSummaryDataset);
    return dataset.holders;
  }

  async loadOrdinaryItems(): Promise<OrdinaryItemContent[]> {
    const manifest = await this.loadManifest();
    return this.load(manifest.paths.ordinaryItems, parseOrdinaryItems) as Promise<OrdinaryItemContent[]>;
  }

  async loadLoadouts(): Promise<WorldLoadoutContent> {
    const manifest = await this.loadManifest();
    return this.load(manifest.paths.loadouts, parseWorldLoadouts);
  }

  private async loadCharacterContentIndex(): Promise<CharacterContentIndex> {
    this.indexPromise ??= this.loadManifest().then((manifest) => this.load(manifest.paths.characterContentIndex, parseCharacterContentIndex));
    return this.indexPromise;
  }

  async loadCharacterContent(characterId: CharacterId): Promise<CharacterContentRecord | undefined> {
    const index = await this.loadCharacterContentIndex();
    const shardId = index.characters[characterId];
    if (!shardId) return undefined;
    const path = index.shards[shardId];
    if (!path) throw new Error(`人物内容索引缺少分片路径：${shardId}`);
    let pending = this.contentShardPromises.get(shardId);
    if (!pending) {
      pending = this.load(path, parseCharacterContentShard);
      this.contentShardPromises.set(shardId, pending);
    }
    return (await pending)[characterId];
  }
}

export const worldContentRepository = new WorldContentRepository();
