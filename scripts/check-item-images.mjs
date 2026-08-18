import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const categories = ['weapon', 'armor', 'clothing', 'jewelry', 'tool', 'document', 'medicine', 'poison', 'supply', 'keepsake'];
const expected = {
  'artifact.ice': ['https://awoiaf.westeros.org/index.php/Ice', '/assets/item-images/artifact-ice.webp'],
  'artifact.longclaw': ['https://awoiaf.westeros.org/index.php/Longclaw', '/assets/item-images/artifact-longclaw.webp'],
  'artifact.dawn': ['https://awoiaf.westeros.org/index.php/Dawn', '/assets/item-images/artifact-dawn.webp'],
  'artifact.blackfyre': ['https://awoiaf.westeros.org/index.php/Blackfyre', '/assets/item-images/artifact-blackfyre.webp'],
};

const bundle = await build({
  stdin: { contents: "export * from './src/data/itemDefinitions.ts';", resolveDir: process.cwd(), sourcefile: 'item-image-check-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { ITEM_DEFINITIONS } = await import(moduleUrl);
assert.ok(ITEM_DEFINITIONS.length >= 48, `目录只有 ${ITEM_DEFINITIONS.length} 个定义，至少需要 48 个`);
for (const category of categories) {
  const count = ITEM_DEFINITIONS.filter((definition) => definition.category === category).length;
  assert.ok(count >= 4, `${category} 只有 ${count} 个定义，至少需要 4 个`);
}
for (const [itemId, [, localPath]] of Object.entries(expected)) {
  const definition = ITEM_DEFINITIONS.find((entry) => entry.id === itemId);
  assert.ok(definition, `缺少唯一物品 ${itemId}`);
  assert.equal(definition.image.type, 'wiki', `${itemId} 未使用本地 Wiki 图片引用`);
  assert.equal(definition.image.path, localPath, `${itemId} 本地路径不正确`);
}
for (const definition of ITEM_DEFINITIONS) {
  if (definition.image.type === 'wiki') assert.doesNotMatch(definition.image.path, /^https?:\/\//i, `${definition.id} 运行时仍使用外链图片`);
}

const manifest = JSON.parse(await readFile('public/assets/item-images/source-manifest.json', 'utf8'));
assert.equal(manifest.version, 1);
assert.ok(Array.isArray(manifest.items));
assert.equal(manifest.items.length, 4);
for (const [itemId, [sourcePage, localPath]] of Object.entries(expected)) {
  const entry = manifest.items.find((item) => item.itemId === itemId);
  assert.ok(entry, `清单缺少 ${itemId}`);
  for (const key of ['itemId', 'localPath', 'localSourcePath', 'sourcePage', 'sourceImage', 'retrievedAt', 'attribution', 'licenseNote', 'sourceSha256', 'sha256']) assert.equal(typeof entry[key], 'string', `${itemId} 缺少 ${key}`);
  assert.equal(entry.sourcePage, sourcePage);
  assert.equal(entry.localPath, localPath);
  assert.match(entry.sourceImage, /^https:\/\//);
  assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.match(entry.localSourcePath, /^scripts\/item-image-sources\/[a-z0-9-]+\.png$/);
  const sourceBytes = await readFile(entry.localSourcePath);
  assert.ok(sourceBytes.length > 0, `${entry.localSourcePath} 为空`);
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), entry.sourceSha256, `${itemId} 来源缓存哈希与清单不一致`);
  const filePath = join('public', localPath.replace(/^\//, ''));
  assert.ok((await stat(filePath)).size > 0, `${filePath} 为空`);
  const digest = createHash('sha256').update(await readFile(filePath)).digest('hex');
  assert.equal(digest, entry.sha256, `${itemId} 本地文件哈希与清单不一致`);
}
console.log('Item catalog breadth and localized Wiki image provenance are valid.');

const generatedManifest = JSON.parse(await readFile('public/data/items/agot-artifact-import-manifest.json', 'utf8'));
assert.equal(generatedManifest.schemaVersion, 1);
assert.ok(generatedManifest.counts.emittedItems >= 400, `生成神器只有 ${generatedManifest.counts.emittedItems} 件`);
assert.equal(generatedManifest.items.length, generatedManifest.counts.emittedItems);
const generatedDefinitions = ITEM_DEFINITIONS.filter((definition) => definition.contentSource);
assert.equal(generatedDefinitions.length, generatedManifest.counts.emittedItems);
const approvedWorkshopIds = new Set(['2962333032', '2995674648', '2962713441', '3101422928', '2950245430']);
const generatedById = new Map(generatedDefinitions.map((definition) => [definition.id, definition]));
for (const item of generatedManifest.items) {
  assert.ok(approvedWorkshopIds.has(item.workshopId), `${item.itemId} 使用了未批准来源 ${item.workshopId}`);
  assert.match(item.sha256, /^[a-f0-9]{64}$/);
  assert.match(item.sourceSha256, /^[a-f0-9]{64}$/);
  const definition = generatedById.get(item.itemId);
  assert.ok(definition, `生成目录缺少 ${item.itemId}`);
  assert.equal(definition.image.type, 'asset');
  assert.equal(definition.image.path, item.localPath);
  assert.equal(definition.contentSource.imageSha256, item.sha256);
  const filePath = join('public', item.localPath.replace(/^\//, ''));
  const bytes = await readFile(filePath);
  assert.ok(bytes.length > 0, `${filePath} 为空`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, `${item.itemId} WebP 哈希不一致`);
}
console.log(`Validated ${generatedManifest.items.length} offline AGOT artifact images from approved Workshop sources.`);
