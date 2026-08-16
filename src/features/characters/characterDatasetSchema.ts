import type { CharacterDatasetManifest, CharacterSearchHit, StaticCharacterRecord } from './types';

export function parseCharacterDatasetManifest(value: unknown): CharacterDatasetManifest {
  if (!value || typeof value !== 'object') throw new Error('人物数据清单格式无效');
  const manifest = value as Partial<CharacterDatasetManifest>;
  if (manifest.schemaVersion !== 1) throw new Error(`不支持的人物数据版本：${String(manifest.schemaVersion)}`);
  if (!manifest.datasetHash || !Array.isArray(manifest.shards) || manifest.source?.sourceId !== '2962333032') {
    throw new Error('人物数据清单缺少 AGOT 来源或校验信息');
  }
  return manifest as CharacterDatasetManifest;
}

export function parseCharacterSearchIndex(value: unknown): CharacterSearchHit[] {
  if (!Array.isArray(value)) throw new Error('人物搜索索引格式无效');
  return value.filter((entry): entry is CharacterSearchHit => Boolean(
    entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.startsWith('agot:') && typeof entry.shard === 'string'
  ));
}

export function parseCharacterShard(value: unknown): StaticCharacterRecord[] {
  if (!Array.isArray(value)) throw new Error('人物数据分片格式无效');
  return value.filter((entry): entry is StaticCharacterRecord => Boolean(
    entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.startsWith('agot:') && entry.canonTier !== 'technical'
  ));
}
