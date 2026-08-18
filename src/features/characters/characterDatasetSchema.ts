import type { CharacterDatasetManifest, CharacterId, CharacterKinshipEntry, CharacterKinshipIndex, CharacterLoadoutShard, CharacterSearchHit, StaticCharacterLoadoutProfile, CharacterTitleHolders, StaticCharacterRecord, StaticCharacterTitle } from './types';

export function parseCharacterDatasetManifest(value: unknown): CharacterDatasetManifest {
  if (!value || typeof value !== 'object') throw new Error('人物数据清单格式无效');
  const manifest = value as Partial<CharacterDatasetManifest>;
  if (manifest.schemaVersion !== 2) throw new Error(`不支持的人物数据版本：${String(manifest.schemaVersion)}`);
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

const TITLE_TIERS = new Set<StaticCharacterTitle['tier']>([
  'hegemon', 'empire', 'kingdom', 'duchy', 'county', 'barony', 'other',
]);

export function parseCharacterTitleHolders(value: unknown): CharacterTitleHolders {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('人物头衔映射格式无效');
  }
  const parsed: CharacterTitleHolders = {};
  for (const [characterId, holdings] of Object.entries(value)) {
    if (!characterId.startsWith('agot:') || !Array.isArray(holdings)) {
      throw new Error(`人物头衔映射格式无效：${characterId}`);
    }
    const titles = holdings.map((holding): StaticCharacterTitle => {
      if (!holding || typeof holding !== 'object') {
        throw new Error(`人物头衔条目格式无效：${characterId}`);
      }
      const candidate = holding as Partial<StaticCharacterTitle>;
      if (
        typeof candidate.id !== 'string' || !candidate.id
        || typeof candidate.name !== 'string' || !candidate.name.trim()
        || !candidate.tier || !TITLE_TIERS.has(candidate.tier)
      ) {
        throw new Error(`人物头衔条目格式无效：${characterId}`);
      }
      return { id: candidate.id, name: candidate.name, tier: candidate.tier };
    });
    parsed[characterId as keyof CharacterTitleHolders] = titles;
  }
  return parsed;
}


function optionalAgotId(value: unknown, label: string): CharacterId | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || !value.startsWith('agot:')) throw new Error(`人物亲属${label}无效`);
  return value as CharacterId;
}

function agotIdArray(value: unknown, label: string): CharacterId[] {
  if (!Array.isArray(value)) throw new Error(`人物亲属${label}格式无效`);
  const ids = value.map((entry) => optionalAgotId(entry, label));
  if (ids.some((entry) => !entry)) throw new Error(`人物亲属${label}格式无效`);
  return [...new Set(ids as CharacterId[])];
}

export function parseCharacterKinshipIndex(value: unknown): CharacterKinshipIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('人物亲属索引格式无效');
  const parsed: CharacterKinshipIndex = {};
  for (const [rawId, rawEntry] of Object.entries(value)) {
    if (!rawId.startsWith('agot:') || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new Error(`人物亲属索引格式无效：${rawId}`);
    }
    const id = rawId as CharacterId;
    const candidate = rawEntry as Record<string, unknown>;
    const entry: CharacterKinshipEntry = {
      fatherId: optionalAgotId(candidate.fatherId, '父亲'),
      motherId: optionalAgotId(candidate.motherId, '母亲'),
      spouseIds: agotIdArray(candidate.spouseIds, '配偶'),
      childIds: agotIdArray(candidate.childIds, '子女'),
      siblingIds: agotIdArray(candidate.siblingIds, '兄弟姐妹'),
    };
    if (entry.fatherId === id || entry.motherId === id || entry.spouseIds.includes(id) || entry.childIds.includes(id) || entry.siblingIds.includes(id)) {
      throw new Error(`人物亲属索引不能指向自身：${id}`);
    }
    parsed[id] = entry;
  }
  return parsed;
}


export function parseCharacterLoadoutShard(value: unknown): CharacterLoadoutShard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('人物装束分片格式无效');
  const parsed: CharacterLoadoutShard = {};
  for (const [rawId, rawProfile] of Object.entries(value)) {
    if (!rawId.startsWith('agot:') || !rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
      throw new Error(`人物装束分片格式无效：${rawId}`);
    }
    const candidate = rawProfile as Partial<StaticCharacterLoadoutProfile>;
    if (candidate.characterId !== rawId || typeof candidate.templateId !== 'string' || !candidate.templateId.trim()
      || (candidate.overrideId !== undefined && (typeof candidate.overrideId !== 'string' || !candidate.overrideId.trim()))) {
      throw new Error(`人物装束条目格式无效：${rawId}`);
    }
    parsed[rawId as CharacterId] = {
      characterId: rawId as CharacterId,
      templateId: candidate.templateId,
      ...(candidate.overrideId ? { overrideId: candidate.overrideId } : {}),
    };
  }
  return parsed;
}
