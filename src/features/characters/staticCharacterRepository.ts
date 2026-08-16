import {
  parseCharacterDatasetManifest,
  parseCharacterSearchIndex,
  parseCharacterShard,
} from './characterDatasetSchema';
import type {
  CharacterCanonTier,
  CharacterDatasetManifest,
  CharacterId,
  CharacterSearchHit,
  StaticCharacterRecord,
} from './types';

export type FetchJson = (path: string) => Promise<unknown>;

export interface CharacterSearchFilters {
  includeGenealogy?: boolean;
  alive?: boolean;
  canonTiers?: CharacterCanonTier[];
  limit?: number;
}

const defaultFetchJson: FetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`人物数据读取失败：${response.status} ${path}`);
  return response.json();
};

export class StaticCharacterRepository {
  private readonly baseUrl: string;
  private manifestPromise?: Promise<CharacterDatasetManifest>;
  private indexPromise?: Promise<CharacterSearchHit[]>;
  private readonly shardPromises = new Map<string, Promise<Map<CharacterId, StaticCharacterRecord>>>();

  constructor(baseUrl = '/data/agot-characters', private readonly fetchJson: FetchJson = defaultFetchJson) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  loadManifest(): Promise<CharacterDatasetManifest> {
    this.manifestPromise ??= this.fetchJson(`${this.baseUrl}/manifest.json`).then(parseCharacterDatasetManifest);
    return this.manifestPromise;
  }

  private loadIndex(): Promise<CharacterSearchHit[]> {
    this.indexPromise ??= Promise.all([
      this.loadManifest(),
      this.fetchJson(`${this.baseUrl}/search-index.json`).then(parseCharacterSearchIndex),
    ]).then(([, index]) => index);
    return this.indexPromise;
  }

  private loadShard(shard: string): Promise<Map<CharacterId, StaticCharacterRecord>> {
    let pending = this.shardPromises.get(shard);
    if (!pending) {
      pending = this.fetchJson(`${this.baseUrl}/shards/${shard}.json`)
        .then(parseCharacterShard)
        .then((records) => new Map(records.map((record) => [record.id, record])));
      this.shardPromises.set(shard, pending);
    }
    return pending;
  }

  async get(id: CharacterId): Promise<StaticCharacterRecord | undefined> {
    if (!id.startsWith('agot:')) return undefined;
    const hit = (await this.loadIndex()).find((entry) => entry.id === id);
    if (!hit) return undefined;
    return (await this.loadShard(hit.shard)).get(id);
  }

  async getMany(ids: readonly CharacterId[]): Promise<StaticCharacterRecord[]> {
    const records = await Promise.all(ids.map((id) => this.get(id)));
    return records.filter((record): record is StaticCharacterRecord => record !== undefined);
  }

  async search(query: string, filters: CharacterSearchFilters = {}): Promise<CharacterSearchHit[]> {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    const tiers = filters.canonTiers ? new Set(filters.canonTiers) : undefined;
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
    const results: CharacterSearchHit[] = [];
    for (const hit of await this.loadIndex()) {
      if (!filters.includeGenealogy && hit.canonTier === 'genealogy') continue;
      if (filters.alive !== undefined && hit.alive !== filters.alive) continue;
      if (tiers && !tiers.has(hit.canonTier)) continue;
      const haystack = [hit.name, hit.nameKey, hit.id, hit.dynastyId].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
      if (normalized && !haystack.includes(normalized)) continue;
      results.push(hit);
      if (results.length >= limit) break;
    }
    return results;
  }
}
