import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { stableJson } from './hash.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

const bundle = await build({
  entryPoints: [join(root, 'src', 'data', 'itemDefinitions.ts')],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { ITEM_DEFINITIONS } = await import(moduleUrl);

const ordinary = ITEM_DEFINITIONS
  .filter((definition) => !definition.id.startsWith('artifact.'))
  .sort((left, right) => left.id.localeCompare(right.id));
const artifactIds = ITEM_DEFINITIONS
  .filter((definition) => definition.id.startsWith('artifact.'))
  .map((definition) => definition.id);
if (ordinary.length === 0) {
  console.error('itemDefinitions.ts 已收缩为门面；迁移已完成，无需再次执行。');
  process.exitCode = 1;
  process.exit();
}

// The JSON must be fully expanded: every definition carries its defaults so
// the compiled data never depends on code-side factory helpers again.
const REQUIRED_FIELDS = ['id', 'name', 'description', 'roleplayText', 'category', 'subcategory', 'tags', 'material', 'image', 'baseQuality', 'rarity', 'bulk', 'stackable', 'maxStack', 'unique', 'equippable', 'allowedPositions', 'baseValue', 'effects'];
const document = {
  schemaVersion: 1,
  items: ordinary.map((definition) => {
    for (const field of REQUIRED_FIELDS) {
      if (definition[field] === undefined) throw new Error(`物品 ${definition.id} 缺少显式字段 ${field}`);
    }
    return structuredClone(definition);
  }),
};

const outputDir = join(root, 'content', 'world', 'items');
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'ordinary-items.json'), stableJson(document), 'utf8');
console.log(`已迁移 ${ordinary.length} 个普通物品；保留手工唯一物品 ${artifactIds.length} 件（${artifactIds.join(', ')}）。`);
