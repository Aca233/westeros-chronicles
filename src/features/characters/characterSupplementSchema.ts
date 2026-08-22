import type { CharacterId } from './types';
import type { CharacterContentRecord } from '../world-content/types';
import type {
  CharacterDossierSupplement,
  CharacterExperience,
  NotableNonKinRelation,
} from './characterSupplementTypes';

const KNOWN_FIELDS = new Set([
  'schemaVersion',
  'characterId',
  'summary',
  'publicRoles',
  'aliases',
  'appearance',
  'personality',
  'reputation',
  'experiences',
  'notableRelations',
  'sources',
]);

const KNOWN_EXPERIENCE_FIELDS = new Set([
  'id',
  'date',
  'title',
  'description',
  'participantIds',
  'visibility',
  'sourceUrl',
]);

const KNOWN_RELATION_FIELDS = new Set([
  'targetId',
  'kind',
  'description',
  'sourceUrl',
]);

export function parseExperienceYear(dateStr: string): number | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const match = dateStr.trim().match(/^(\d{1,4})/);
  if (!match) return undefined;
  const rawYear = Number(match[1]);
  if (!Number.isFinite(rawYear)) return undefined;
  return rawYear >= 8000 ? rawYear - 8000 : rawYear;
}

const ALLOWED_SOURCE_HOSTS = new Set([
  'awoiaf.westeros.org',
  'asoiaf.fandom.com',
]);

function isValidHttpUrl(str: unknown): boolean {
  if (typeof str !== 'string' || !str.trim()) return false;
  try {
    const url = new URL(str.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isValidAgotId(id: unknown): id is CharacterId {
  return typeof id === 'string' && id.startsWith('agot:') && id.length > 5;
}

export function deduplicateExperiences(experiences: readonly CharacterExperience[]): CharacterExperience[] {
  const seen = new Set<string>();
  const result: CharacterExperience[] = [];
  for (const exp of experiences) {
    const key = exp.id ? `id:${exp.id}` : `dt:${exp.date}:${exp.title.trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...exp });
    }
  }
  return result;
}

export function filterVisibleExperiences(
  experiences: readonly CharacterExperience[] | undefined,
  maxYear = 298,
  includeSecret = false,
): CharacterExperience[] {
  if (!experiences || experiences.length === 0) return [];
  const deduped = deduplicateExperiences(experiences);
  return deduped
    .filter((exp) => {
      if (!includeSecret && exp.visibility === 'secret') return false;
      const year = parseExperienceYear(exp.date);
      if (year !== undefined && year > maxYear) return false;
      return true;
    })
    .sort((a, b) => {
      const yearA = parseExperienceYear(a.date) ?? 0;
      const yearB = parseExperienceYear(b.date) ?? 0;
      if (yearA !== yearB) return yearA - yearB;
      return a.date.localeCompare(b.date);
    });
}

export function validateCharacterExperience(candidate: unknown, characterId: CharacterId): CharacterExperience {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`经历条目格式无效 (人物: ${characterId})`);
  }
  const raw = candidate as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!KNOWN_EXPERIENCE_FIELDS.has(key)) {
      throw new Error(`经历条目包含未知字段 '${key}' (人物: ${characterId})`);
    }
  }

  if (typeof raw.date !== 'string' || !raw.date.trim()) {
    throw new Error(`经历条目缺少有效日期 (人物: ${characterId})`);
  }
  const year = parseExperienceYear(raw.date);
  if (year === undefined || year > 298) {
    throw new Error(`经历条目日期超过 298 AC 或格式无效: ${raw.date} (人物: ${characterId})`);
  }

  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    throw new Error(`经历条目缺少有效标题 (人物: ${characterId})`);
  }

  if (typeof raw.description !== 'string' || !raw.description.trim()) {
    throw new Error(`经历条目缺少有效描述 (人物: ${characterId})`);
  }

  if (raw.visibility !== 'public' && raw.visibility !== 'secret') {
    throw new Error(`经历条目可见性必须为 'public' 或 'secret' (人物: ${characterId})`);
  }

  if (!isValidHttpUrl(raw.sourceUrl)) {
    throw new Error(`经历条目来源 URL 无效 (人物: ${characterId})`);
  }

  let participantIds: CharacterId[] | undefined;
  if (raw.participantIds !== undefined) {
    if (!Array.isArray(raw.participantIds)) {
      throw new Error(`经历条目参与者列表格式无效 (人物: ${characterId})`);
    }
    for (const pId of raw.participantIds) {
      if (!isValidAgotId(pId)) {
        throw new Error(`经历条目参与者 ID 无效: ${String(pId)} (人物: ${characterId})`);
      }
    }
    participantIds = [...new Set(raw.participantIds as CharacterId[])];
  }

  return {
    ...(raw.id && typeof raw.id === 'string' ? { id: raw.id.trim() } : {}),
    date: raw.date.trim(),
    title: raw.title.trim(),
    description: raw.description.trim(),
    visibility: raw.visibility,
    sourceUrl: (raw.sourceUrl as string).trim(),
    ...(participantIds ? { participantIds } : {}),
  };
}

export function validateNotableRelation(candidate: unknown, characterId: CharacterId): NotableNonKinRelation {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`重要关系条目格式无效 (人物: ${characterId})`);
  }
  const raw = candidate as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!KNOWN_RELATION_FIELDS.has(key)) {
      throw new Error(`重要关系包含未知字段 '${key}' (人物: ${characterId})`);
    }
  }

  if (!isValidAgotId(raw.targetId)) {
    throw new Error(`重要关系目标 ID 无效: ${String(raw.targetId)} (人物: ${characterId})`);
  }
  if (raw.targetId === characterId) {
    throw new Error(`重要关系不能指向人物自身: ${characterId}`);
  }

  if (typeof raw.kind !== 'string' || !raw.kind.trim()) {
    throw new Error(`重要关系缺少关系类型 (人物: ${characterId})`);
  }
  if (raw.sourceUrl !== undefined && !isValidHttpUrl(raw.sourceUrl)) {
    throw new Error(`重要关系来源 URL 无效 (人物: ${characterId})`);
  }

  return {
    targetId: raw.targetId,
    kind: raw.kind.trim(),
    ...(typeof raw.description === 'string' && raw.description.trim() ? { description: raw.description.trim() } : {}),
    ...(isValidHttpUrl(raw.sourceUrl) ? { sourceUrl: (raw.sourceUrl as string).trim() } : {}),
  };
}

export function validateCharacterSupplement(candidate: unknown): CharacterContentRecord {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('人物卷宗补充资料必须为非空对象');
  }
  const raw = candidate as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) {
      throw new Error(`人物卷宗补充资料包含未知字段 '${key}'`);
    }
  }

  if (raw.schemaVersion !== 1) {
    throw new Error('人物内容版本必须为 1');
  }

  if (!isValidAgotId(raw.characterId)) {
    throw new Error(`人物卷宗缺少有效 characterId: ${String(raw.characterId)}`);
  }
  const characterId = raw.characterId;

  if (raw.summary !== undefined && (typeof raw.summary !== 'string' || !raw.summary.trim())) {
    throw new Error(`人物简介 summary 无效 (人物: ${characterId})`);
  }

  if (raw.appearance !== undefined && (typeof raw.appearance !== 'string' || !raw.appearance.trim())) {
    throw new Error(`外貌描述 appearance 无效 (人物: ${characterId})`);
  }

  if (raw.personality !== undefined && (typeof raw.personality !== 'string' || !raw.personality.trim())) {
    throw new Error(`性格描述 personality 无效 (人物: ${characterId})`);
  }

  if (raw.reputation !== undefined && (typeof raw.reputation !== 'string' || !raw.reputation.trim())) {
    throw new Error(`声誉描述 reputation 无效 (人物: ${characterId})`);
  }

  let publicRoles: string[] | undefined;
  if (raw.publicRoles !== undefined) {
    if (!Array.isArray(raw.publicRoles)) {
      throw new Error(`公开身份 publicRoles 必须为数组 (人物: ${characterId})`);
    }
    publicRoles = raw.publicRoles.map((r) => {
      if (typeof r !== 'string' || !r.trim()) throw new Error(`公开身份条目无效 (人物: ${characterId})`);
      return r.trim();
    });
  }

  let aliases: string[] | undefined;
  if (raw.aliases !== undefined) {
    if (!Array.isArray(raw.aliases)) {
      throw new Error(`别名 aliases 必须为数组 (人物: ${characterId})`);
    }
    aliases = raw.aliases.map((a) => {
      if (typeof a !== 'string' || !a.trim()) throw new Error(`别名条目无效 (人物: ${characterId})`);
      return a.trim();
    });
  }

  let experiences: CharacterExperience[] | undefined;
  if (raw.experiences !== undefined) {
    if (!Array.isArray(raw.experiences)) {
      throw new Error(`重要经历 experiences 必须为数组 (人物: ${characterId})`);
    }
    const validated = raw.experiences.map((exp) => validateCharacterExperience(exp, characterId));
    experiences = deduplicateExperiences(validated);
  }

  let notableRelations: NotableNonKinRelation[] | undefined;
  if (raw.notableRelations !== undefined) {
    if (!Array.isArray(raw.notableRelations)) {
      throw new Error(`重要关系 notableRelations 必须为数组 (人物: ${characterId})`);
    }
    notableRelations = raw.notableRelations.map((rel) => validateNotableRelation(rel, characterId));
    const seenRelationTargets = new Set<CharacterId>();
    for (const relation of notableRelations) {
      if (seenRelationTargets.has(relation.targetId)) {
        throw new Error(`重要关系包含重复目标 ${relation.targetId} (人物: ${characterId})`);
      }
      seenRelationTargets.add(relation.targetId);
    }
  }

  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new Error(`人物卷宗缺少来源 sources (人物: ${characterId})`);
  }
  const sources = raw.sources.map((url) => {
    if (!isValidHttpUrl(url)) {
      throw new Error(`人物卷宗包含无效来源 URL: ${String(url)} (人物: ${characterId})`);
    }
    return (url as string).trim();
  });

  return {
    schemaVersion: 1,
    characterId,
    ...(typeof raw.summary === 'string' && raw.summary.trim() ? { summary: raw.summary.trim() } : {}),
    ...(publicRoles && publicRoles.length > 0 ? { publicRoles } : {}),
    ...(aliases && aliases.length > 0 ? { aliases } : {}),
    ...(typeof raw.appearance === 'string' && raw.appearance.trim() ? { appearance: raw.appearance.trim() } : {}),
    ...(typeof raw.personality === 'string' && raw.personality.trim() ? { personality: raw.personality.trim() } : {}),
    ...(typeof raw.reputation === 'string' && raw.reputation.trim() ? { reputation: raw.reputation.trim() } : {}),
    ...(experiences && experiences.length > 0 ? { experiences } : {}),
    ...(notableRelations && notableRelations.length > 0 ? { notableRelations } : {}),
    sources,
  };
}

export function parseCharacterSupplementIndex(value: unknown): Record<CharacterId, CharacterContentRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('人物卷宗补充数据集必须为以 characterId 为键的对象');
  }
  const raw = value as Record<string, unknown>;
  const result: Record<CharacterId, CharacterContentRecord> = {};

  for (const [key, entry] of Object.entries(raw)) {
    if (!isValidAgotId(key)) {
      throw new Error(`补充数据集键名必须为有效 characterId: ${key}`);
    }
    const validated = validateCharacterSupplement(entry);
    if (validated.characterId !== key) {
      throw new Error(`补充数据集键名与条目 characterId 不一致: ${key} vs ${validated.characterId}`);
    }
    result[key as CharacterId] = validated;
  }

  return result;
}
