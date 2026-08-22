import {
  parseCharacterDatasetManifest,
  parseCharacterKinshipIndex,
  parseCharacterLoadoutShard,
  parseCharacterSearchIndex,
  parseCharacterShard,
  parseCharacterTitleHolders,
} from './characterDatasetSchema';
import type {
  CharacterCanonTier,
  CharacterDatasetManifest,
  CharacterId,
  CharacterKinshipEntry,
  CharacterKinshipIndex,
  CharacterLoadoutShard,
  CharacterSearchHit,
  CharacterTitleHolders,
  CharacterTitleHolderSummary,
  StaticCharacterLoadoutProfile,
  StaticCharacterRecord,
} from './types';

export type FetchJson = (path: string) => Promise<unknown>;

export interface CharacterSearchFilters {
  includeGenealogy?: boolean;
  includeSupporting?: boolean;
  materializedIds?: readonly CharacterId[];
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
  private titleHoldersPromise?: Promise<CharacterTitleHolders>;
  private readonly kinshipShardPromises = new Map<string, Promise<CharacterKinshipIndex>>();
  private readonly loadoutShardPromises = new Map<string, Promise<CharacterLoadoutShard>>();
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

  private loadLoadoutShard(shard: string): Promise<CharacterLoadoutShard> {
    let pending = this.loadoutShardPromises.get(shard);
    if (!pending) {
      pending = this.fetchJson(`${this.baseUrl}/loadouts/${shard}.json`).then(parseCharacterLoadoutShard);
      this.loadoutShardPromises.set(shard, pending);
    }
    return pending;
  }

  private loadKinshipShard(shard: string): Promise<CharacterKinshipIndex> {
    let pending = this.kinshipShardPromises.get(shard);
    if (!pending) {
      pending = this.fetchJson(`${this.baseUrl}/kinship/${shard}.json`).then(parseCharacterKinshipIndex);
      this.kinshipShardPromises.set(shard, pending);
    }
    return pending;
  }

  private loadTitleHolders(): Promise<CharacterTitleHolders> {
    this.titleHoldersPromise ??= Promise.all([
      this.loadManifest(),
      this.fetchJson(`${this.baseUrl}/title-holders.json`).then(parseCharacterTitleHolders),
    ]).then(([, titleHolders]) => titleHolders);
    return this.titleHoldersPromise;
  }

  async loadTitleHolderSummaries(): Promise<CharacterTitleHolderSummary[]> {
    const [index, titleHolders] = await Promise.all([this.loadIndex(), this.loadTitleHolders()]);
    return index.flatMap((hit) => {
      const holdings = titleHolders[hit.id];
      if (!holdings?.length) return [];
      return [{
        id: hit.id,
        name: hit.name,
        dynastyId: hit.dynastyId,
        alive: hit.alive,
        titleIds: holdings.map((title) => title.id),
      }];
    });
  }

  async getSearchHits(ids: readonly CharacterId[]): Promise<CharacterSearchHit[]> {
    const wanted = new Set(ids);
    if (wanted.size === 0) return [];
    return (await this.loadIndex()).filter((hit) => wanted.has(hit.id));
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

  private async directShardForCharacterId(id: CharacterId): Promise<string> {
    const bytes = new TextEncoder().encode(id);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    return [...digest.subarray(0, 1)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Reads only the deterministic character shards needed by the world projection.
   * It intentionally bypasses the full search index and title-holder expansion.
   */
  async getWorldBaselineRecords(
    ids: readonly CharacterId[],
  ): Promise<Array<Pick<StaticCharacterRecord, 'id' | 'alive'>>> {
    const grouped = new Map<string, CharacterId[]>();
    await Promise.all(ids.map(async (id) => {
      if (!id.startsWith('agot:')) return;
      const shard = await this.directShardForCharacterId(id);
      const entries = grouped.get(shard) ?? [];
      entries.push(id);
      grouped.set(shard, entries);
    }));
    const records = await Promise.all([...grouped.entries()].map(async ([shard, characterIds]) => {
      const shardRecords = await this.loadShard(shard);
      return characterIds.flatMap((id) => {
        const record = shardRecords.get(id);
        return record ? [{ id: record.id, alive: record.alive }] : [];
      });
    }));
    return records.flat();
  }

  async findTitleHoldersByTitleIds(
    titleIds: readonly string[],
  ): Promise<Map<string, CharacterId>> {
    const wanted = new Set(titleIds);
    const result = new Map<string, CharacterId>();
    if (wanted.size === 0) return result;
    const holders = await this.loadTitleHolders();
    for (const [characterId, titles] of Object.entries(holders) as Array<[CharacterId, NonNullable<CharacterTitleHolders[CharacterId]>]>) {
      for (const title of titles) {
        if (wanted.has(title.id) && !result.has(title.id)) result.set(title.id, characterId);
      }
    }
    return result;
  }

  async get(id: CharacterId): Promise<StaticCharacterRecord | undefined> {
    if (!id.startsWith('agot:')) return undefined;
    const hit = (await this.loadIndex()).find((entry) => entry.id === id);
    if (!hit) return undefined;
    const [record, titleHolders] = await Promise.all([
      this.loadShard(hit.shard).then((records) => records.get(id)),
      this.loadTitleHolders(),
    ]);
    if (!record) return undefined;
    const holdings = titleHolders[id] ?? [];
    return {
      ...record,
      titleIds: holdings.map((title) => title.id),
      titles: holdings.map((title) => title.name),
    };
  }

  async getLoadoutProfile(id: CharacterId): Promise<StaticCharacterLoadoutProfile | undefined> {
    const hit = (await this.loadIndex()).find((entry) => entry.id === id);
    if (!hit) return undefined;
    const profile = (await this.loadLoadoutShard(hit.shard))[id];
    return profile ? { ...profile } : undefined;
  }

  async getKinship(id: CharacterId): Promise<CharacterKinshipEntry> {
    const hit = (await this.loadIndex()).find((entry) => entry.id === id);
    if (!hit) return { spouseIds: [], childIds: [], siblingIds: [] };
    const entry = (await this.loadKinshipShard(hit.shard))[id];
    return entry
      ? { ...entry, spouseIds: [...entry.spouseIds], childIds: [...entry.childIds], siblingIds: [...entry.siblingIds] }
      : { spouseIds: [], childIds: [], siblingIds: [] };
  }

  async getChildren(id: CharacterId): Promise<StaticCharacterRecord[]> {
    const kinship = await this.getKinship(id);
    return this.getMany(kinship.childIds);
  }

  async getMany(ids: readonly CharacterId[]): Promise<StaticCharacterRecord[]> {
    const records = await Promise.all(ids.map((id) => this.get(id)));
    return records.filter((record): record is StaticCharacterRecord => record !== undefined);
  }

  async findMentioned(text: string, filters: CharacterSearchFilters = {}): Promise<CharacterSearchHit[]> {
    const normalized = text.toLocaleLowerCase('zh-CN');
    const tiers = new Set(filters.canonTiers ?? ['canon', 'semicanon']);
    const limit = Math.max(1, Math.min(filters.limit ?? 24, 100));
    const matches = (await this.loadIndex())
      .filter((hit) => tiers.has(hit.canonTier))
      .filter((hit) => filters.includeGenealogy || hit.canonTier !== 'genealogy')
      .filter((hit) => filters.alive === undefined || hit.alive === filters.alive)
      .filter((hit) => {
        const names = [hit.name, hit.nameKey].filter((value): value is string => typeof value === 'string' && value.trim().length >= 2);
        return names.some((name) => normalized.includes(name.toLocaleLowerCase('zh-CN')));
      })
      .sort((left, right) => {
        const leftLength = Math.max(left.name.length, left.nameKey?.length ?? 0);
        const rightLength = Math.max(right.name.length, right.nameKey?.length ?? 0);
        if (rightLength !== leftLength) return rightLength - leftLength;
        if (left.alive !== right.alive) return left.alive ? -1 : 1;
        if (left.canonTier !== right.canonTier) return left.canonTier === 'canon' ? -1 : 1;
        return left.id.localeCompare(right.id);
      });
    return matches.slice(0, limit);
  }

  async search(query: string, filters: CharacterSearchFilters = {}): Promise<CharacterSearchHit[]> {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    // Default search exposes canon/semicanon plus characters already
    // materialized in the save; supporting characters need an explicit opt-in.
    const tiers = new Set<CharacterCanonTier>(filters.canonTiers ?? ['canon', 'semicanon']);
    if (filters.includeSupporting && !filters.canonTiers) tiers.add('mod_supporting');
    if (filters.includeGenealogy && !filters.canonTiers) tiers.add('genealogy');
    const materialized = new Set(filters.materializedIds ?? []);
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
    const results: CharacterSearchHit[] = [];
    for (const hit of await this.loadIndex()) {
      if (!filters.includeGenealogy && hit.canonTier === 'genealogy') continue;
      if (filters.alive !== undefined && hit.alive !== filters.alive) continue;
      if (!tiers.has(hit.canonTier) && !materialized.has(hit.id)) continue;
      const haystack = [hit.name, hit.nameKey, hit.id, hit.dynastyId].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
      if (normalized && !haystack.includes(normalized)) continue;
      results.push(hit);
      if (results.length >= limit) break;
    }
    return results;
  }
}
