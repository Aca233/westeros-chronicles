import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { CHARACTER_TRAITS } from './src/data/characterTraits.ts';
      export { IMPORTED_CHARACTER_TRAIT_DEFINITIONS } from './src/data/importedCharacterTraitDefinitions.ts';
      export { IMPORTED_CHARACTER_TRAIT_POLICIES, filterImportedCharacterTraits } from './src/data/importedCharacterTraitPolicy.ts';
    `,
    resolveDir: process.cwd(),
    sourcefile: 'imported-character-trait-audit.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { CHARACTER_TRAITS, IMPORTED_CHARACTER_TRAIT_DEFINITIONS, IMPORTED_CHARACTER_TRAIT_POLICIES, filterImportedCharacterTraits } = await import(moduleUrl);

const definitionsById = new Map(CHARACTER_TRAITS.map((trait) => [trait.id, trait]));
const policiesById = new Map(IMPORTED_CHARACTER_TRAIT_POLICIES.map((policy) => [policy.id, policy]));
const failures = [];
const importedIconSources = JSON.parse(await readFile(path.resolve('scripts/imported-character-trait-icons.json'), 'utf8'));
const gameIconManifest = JSON.parse(await readFile(path.resolve('public/assets/game-icons/manifest.json'), 'utf8'));
if (definitionsById.size !== CHARACTER_TRAITS.length) failures.push('正式特质目录含有重复 ID。');
if (policiesById.size !== IMPORTED_CHARACTER_TRAIT_POLICIES.length) failures.push('导入特质策略含有重复 ID。');
const activeTraitIds = new Set();
let activeCharacters = 0;
let traitAssignments = 0;

const shardDirectory = path.resolve('public/data/agot-characters/shards');
const shardFiles = (await readdir(shardDirectory)).filter((file) => file.endsWith('.json')).sort();
for (const shardFile of shardFiles) {
  const characters = JSON.parse(await readFile(path.join(shardDirectory, shardFile), 'utf8'));
  for (const character of characters) {
    if (!character.born || !character.alive) continue;
    activeCharacters += 1;
    const rawTraitIds = Array.isArray(character.traits) ? character.traits : [];
    traitAssignments += rawTraitIds.length;
    for (const traitId of rawTraitIds) activeTraitIds.add(traitId);
  }
}

for (const traitId of activeTraitIds) {
  const definition = definitionsById.get(traitId);
  const policy = policiesById.get(traitId);
  if (!definition && !policy) {
    failures.push(`开局人物特质 ${traitId} 既无正式定义，也无导入呈现策略。`);
    continue;
  }
  if (policy?.presentation === 'hidden_modifier') continue;
  const visibleId = policy?.replacementId ?? traitId;
  if (!definitionsById.has(visibleId)) failures.push(`开局人物特质 ${traitId} 的可见输出 ${visibleId} 缺少正式定义。`);
}

for (const policy of IMPORTED_CHARACTER_TRAIT_POLICIES) {
  if (policy.presentation === 'hidden_modifier') continue;
  const visibleId = policy.replacementId ?? policy.id;
  if (!definitionsById.has(visibleId)) failures.push(`策略 ${policy.id} 的可见输出 ${visibleId} 无法解析。`);
}

for (const trait of IMPORTED_CHARACTER_TRAIT_DEFINITIONS) {
  const source = importedIconSources[trait.id];
  if (!source) {
    failures.push(`导入特质 ${trait.id} 缺少正式游戏图标来源。`);
    continue;
  }
  if (trait.icon !== source.iconId) failures.push(`导入特质 ${trait.id} 未使用登记图标 ${source.iconId}。`);
  const expectedManifestSource = source.source === 'agot'
    ? `AGOT/gfx/interface/icons/traits/${source.file}`
    : `CK3/gfx/interface/icons/traits/${source.file}`;
  if (gameIconManifest[source.iconId] !== expectedManifestSource) {
    failures.push(`导入特质 ${trait.id} 的图标清单来源不正确。`);
  }
}

for (const trait of CHARACTER_TRAITS) {
  if (!/\p{Script=Han}/u.test(trait.name)) failures.push(`特质 ${trait.id} 缺少中文名称。`);
  if (!/\p{Script=Han}/u.test(trait.description)) failures.push(`特质 ${trait.id} 缺少中文描述。`);
  const iconPath = path.resolve('public/assets/game-icons', `${trait.icon}.webp`);
  if (!existsSync(iconPath)) failures.push(`特质 ${trait.id} 的图标不存在：${trait.icon}.webp`);
}

const childProjection = filterImportedCharacterTraits(['rowdy'], 15);
const adultProjection = filterImportedCharacterTraits(['rowdy'], 16);
if (!childProjection.visibleTraitIds.includes('rowdy') || adultProjection.visibleTraitIds.includes('rowdy')) {
  failures.push('童年特质的 16 岁显示边界失效。');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Imported character traits covered: ${activeCharacters} active characters, ${activeTraitIds.size} unique traits, ${traitAssignments} assignments.`);
