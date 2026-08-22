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
  GameplayLocationDataset,
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
  if (world.artifactDatasetHash !== artifacts.artifactDatasetHash) throw new Error('唯一物品数据哈希不匹配');
  if (world.artifactWorldStateHash !== artifacts.datasetHash) throw new Error('唯一物品世界状态哈希不匹配');
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
    this.gameplayDatasetPromise = undefined;
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

  private gameplayDatasetPromise?: Promise<GameplayLocationDataset>;

  async loadGameplayLocations(): Promise<GameplayLocationEntry[]> {
    const manifest = await this.loadManifest();
    this.gameplayDatasetPromise ??= this.load(manifest.paths.gameplayLocations, parseGameplayLocationDataset);
    const dataset = await this.gameplayDatasetPromise;
    return dataset.entries;
  }

  async searchGameplayLocations(query: string, limit = 20): Promise<GameplayLocationEntry[]> {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    if (!needle || limit <= 0) return [];
    const entries = await this.loadGameplayLocations();
    return entries
      .map((entry) => {
        const values = [entry.id, entry.name, entry.englishName ?? ''].map((value) => value.toLocaleLowerCase('zh-CN'));
        const score = values.some((value) => value === needle) ? 3
          : values.some((value) => value.startsWith(needle)) ? 2
            : values.some((value) => value.includes(needle)) ? 1 : 0;
        return { entry, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || right.entry.importance - left.entry.importance
        || left.entry.name.localeCompare(right.entry.name, 'zh-CN'))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map(({ entry }) => entry);
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

  async loadAllCharacterContent(): Promise<CharacterContentRecord[]> {
    const index = await this.loadCharacterContentIndex();
    const shardIds = Object.keys(index.shards).sort();
    const shards = await Promise.all(shardIds.map(async (shardId) => {
      let pending = this.contentShardPromises.get(shardId);
      if (!pending) {
        const path = index.shards[shardId];
        pending = this.load(path, parseCharacterContentShard);
        this.contentShardPromises.set(shardId, pending);
      }
      return pending;
    }));
    return shards
      .flatMap((shard) => Object.values(shard))
      .sort((left, right) => left.characterId.localeCompare(right.characterId));
  }
}

export const worldContentRepository = new WorldContentRepository();
