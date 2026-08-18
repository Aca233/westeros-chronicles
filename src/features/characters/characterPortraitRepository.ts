import { parseCharacterPortraitShard } from './characterPortraitSchema';
import type { CharacterId, CharacterPortraitRef, CharacterPortraitShard } from './types';

export type PortraitFetchJson = (path: string) => Promise<unknown>;

const defaultFetchJson: PortraitFetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`人物头像数据读取失败：${response.status} ${path}`);
  return response.json();
};

export async function portraitShardForId(characterId: CharacterId): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(characterId));
  return [...new Uint8Array(digest).slice(0, 1)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export class CharacterPortraitRepository {
  private readonly shardPromises = new Map<string, Promise<CharacterPortraitShard>>();

  constructor(
    private readonly baseUrl = '/data/agot-character-portraits',
    private readonly fetchJson: PortraitFetchJson = defaultFetchJson,
  ) {}

  private loadShard(shard: string): Promise<CharacterPortraitShard> {
    let pending = this.shardPromises.get(shard);
    if (!pending) {
      pending = this.fetchJson(`${this.baseUrl.replace(/\/$/, '')}/shards/${shard}.json`)
        .then(parseCharacterPortraitShard);
      this.shardPromises.set(shard, pending);
    }
    return pending;
  }

  async get(characterId: CharacterId): Promise<CharacterPortraitRef | undefined> {
    if (!characterId.startsWith('agot:')) return undefined;
    const shard = await portraitShardForId(characterId);
    const ref = (await this.loadShard(shard))[characterId];
    return ref ? { ...ref } : undefined;
  }

  async getMany(characterIds: readonly CharacterId[]): Promise<CharacterPortraitRef[]> {
    const refs = await Promise.all(characterIds.map((characterId) => this.get(characterId)));
    return refs.filter((ref): ref is CharacterPortraitRef => Boolean(ref));
  }
}
