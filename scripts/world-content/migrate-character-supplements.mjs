import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { stableJson } from './hash.mjs';
import { validateCharacterContents } from './schemas.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const LEGACY_PARTS = [
  ['raw_supplements_part1.mjs', 'RAW_SUPPLEMENTS'],
  ['raw_supplements_part2.mjs', 'RAW_SUPPLEMENTS_PART2'],
  ['raw_supplements_part3.mjs', 'RAW_SUPPLEMENTS_PART3'],
  ['raw_supplements_part4.mjs', 'RAW_SUPPLEMENTS_PART4'],
  ['raw_supplements_part5.mjs', 'RAW_SUPPLEMENTS_PART5'],
];

async function loadLegacySupplements() {
  const directory = join(root, 'scripts', 'data', 'character-dossier');
  let names = [];
  try { names = await readdir(directory); } catch { return null; }
  if (!LEGACY_PARTS.every(([name]) => names.includes(name))) return null;
  const parts = await Promise.all(LEGACY_PARTS.map(async ([name, key]) => {
    const module = await import(pathToFileURL(join(directory, name)).href);
    return module[key];
  }));
  return parts.flat();
}

function transformRecord(raw, searchIndex) {
  const { subjectNameKey, ...rest } = raw;
  const subject = searchIndex.get(rest.characterId);
  if (!subject) throw new Error(`补充人物不存在于基础数据：${rest.characterId}`);
  if (subjectNameKey !== subject.nameKey) {
    throw new Error(`补充人物身份不一致：${rest.characterId} 期望 ${subject.nameKey}，实际 ${subjectNameKey}`);
  }
  const experiences = rest.experiences?.map(({ participantNameKeys, ...experience }) => {
    const participantIds = experience.participantIds ?? [];
    if (!Array.isArray(participantNameKeys) || participantNameKeys.length !== participantIds.length) {
      throw new Error(`经历参与者身份列表不完整：${rest.characterId} ${experience.title}`);
    }
    participantIds.forEach((participantId, index) => {
      const participant = searchIndex.get(participantId);
      if (!participant || participant.nameKey !== participantNameKeys[index]) {
        throw new Error(`经历参与者身份不一致：${rest.characterId} -> ${participantId}`);
      }
    });
    return experience;
  });
  const notableRelations = rest.notableRelations?.map(({ targetNameKey, ...relation }) => {
    const target = searchIndex.get(relation.targetId);
    if (!target || target.nameKey !== targetNameKey) {
      throw new Error(`关系目标身份不一致：${rest.characterId} -> ${relation.targetId}`);
    }
    return relation;
  });
  const { sourceUrls, ...withoutSources } = {
    ...rest,
    ...(experiences ? { experiences } : {}),
    ...(notableRelations ? { notableRelations } : {}),
  };
  if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
    throw new Error(`补充人物缺少来源：${rest.characterId}`);
  }
  // Allowed-field deep equality: dropping identity-check fields must not alter
  // any surviving value.
  const allowedOriginal = {
    ...rest,
    ...(rest.experiences ? { experiences: rest.experiences.map(({ participantNameKeys: _p, ...experience }) => experience) } : {}),
    ...(rest.notableRelations ? { notableRelations: rest.notableRelations.map(({ targetNameKey: _t, ...relation }) => relation) } : {}),
  };
  const { sourceUrls: _originalSources, ...allowedOriginalWithoutSources } = allowedOriginal;
  const allowedTransformed = { ...withoutSources };
  if (JSON.stringify(allowedOriginalWithoutSources) !== JSON.stringify(allowedTransformed)) {
    throw new Error(`迁移改变了允许字段的值：${rest.characterId}`);
  }
  return { schemaVersion: 1, ...withoutSources, sources: sourceUrls };
}

function safeCharacterFileName(characterId) {
  return `${characterId.replace(/[^a-z0-9_-]/gi, '_')}.json`;
}

async function main() {
  const legacy = await loadLegacySupplements();
  if (!legacy) {
    console.error('旧补充资料模块已删除；迁移已完成，无需再次执行。');
    process.exitCode = 1;
    return;
  }
  const searchIndex = await readFile(join(root, 'public', 'data', 'agot-characters', 'search-index.json'), 'utf8')
    .then((text) => JSON.parse(text));
  const searchIndexMap = new Map(searchIndex.map((entry) => [entry.id, entry]));

  const records = new Map();
  for (const raw of legacy) {
    if (records.has(raw.characterId)) throw new Error(`补充人物 ID 重复：${raw.characterId}`);
    records.set(raw.characterId, transformRecord(raw, searchIndexMap));
  }
  validateCharacterContents([...records.values()]);

  const outputDir = join(root, 'content', 'world', 'characters');
  await mkdir(outputDir, { recursive: true });
  const existing = new Set((await readdir(outputDir)).filter((name) => name.endsWith('.json')));
  for (const [characterId, record] of [...records.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const fileName = safeCharacterFileName(characterId);
    const path = join(outputDir, fileName);
    if (existing.has(fileName)) {
      const previous = JSON.parse(await readFile(path, 'utf8'));
      if (JSON.stringify(previous) !== JSON.stringify(record)) {
        throw new Error(`目标文件已存在且内容不同：${fileName}`);
      }
      continue;
    }
    await writeFile(path, stableJson(record), 'utf8');
  }
  const finalCount = (await readdir(outputDir)).filter((name) => name.endsWith('.json')).length;
  if (finalCount !== records.size) {
    throw new Error(`人物内容文件数 ${finalCount} 与记录数 ${records.size} 不一致`);
  }
  console.log(`已迁移 ${records.size} 条人物叙事补充到 content/world/characters/。`);
}

main().catch((error) => {
  console.error(error instanceof Error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
