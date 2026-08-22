import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';
import { EXPECTED_ORDINARY_ITEM_IDS } from './fixtures/ordinary-item-ids.mjs';
import { validateOrdinaryItems } from './world-content/schemas.mjs';

const bundle = await build({
  entryPoints: ['src/features/items/ordinaryItemCatalog.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createOrdinaryItemCatalogLoader } = await import(url);

const fixture = new Map([
  ['/data/world/manifest.json', JSON.parse(await readFile('public/data/world/manifest.json', 'utf8'))],
  ['/data/world/ordinary-items.json', JSON.parse(await readFile('public/data/world/ordinary-items.json', 'utf8'))],
]);
const loadOrdinaryItemDefinitions = createOrdinaryItemCatalogLoader(async (path) => {
  const value = fixture.get(path);
  if (value === undefined) throw new Error(`fixture 缺少 ${path}`);
  return value;
});

const compiled = JSON.parse(await readFile('public/data/world/ordinary-items.json', 'utf8'));

test('迁移前后普通物品 ID 和关键定义保持一致', async () => {
  const definitions = await loadOrdinaryItemDefinitions();
  assert.deepEqual(definitions.map((item) => item.id).sort(), EXPECTED_ORDINARY_ITEM_IDS);
  assert.deepEqual(
    definitions.find((item) => item.id === 'clothing.northern_wool_tunic')?.allowedPositions,
    [{ group: 'torso', layer: 'garment' }],
  );
  assert.equal(definitions.find((item) => item.id === 'weapon.castle_bastard_sword')?.equippable, true);
  assert.equal(definitions.find((item) => item.id === 'medicine.maester_staunching_herbs')?.category, 'medicine');
});

test('编译产物中的普通物品与运行时加载结果一致', async () => {
  const definitions = await loadOrdinaryItemDefinitions();
  assert.deepEqual(
    compiled.map((item) => item.id).sort(),
    definitions.map((item) => item.id).sort(),
  );
});

test('迁移后的 JSON 不含手工唯一物品且不含隐藏默认值', () => {
  for (const item of compiled) {
    assert.equal(item.id.startsWith('artifact.'), false, `${item.id} 唯一物品不得混入普通物品编辑源`);
    assert.equal(item.image === undefined, false, `${item.id} 必须显式声明图片引用`);
    assert.equal(item.baseQuality === undefined, false, `${item.id} 必须显式声明品质`);
    assert.equal(item.maxStack === undefined, false, `${item.id} 必须显式声明堆叠上限`);
    assert.equal(item.baseValue === undefined, false, `${item.id} 必须显式声明价值`);
    assert.equal(item.effects === undefined, false, `${item.id} 必须显式声明效果`);
  }
});

const validItem = {
  id: 'clothing.test_tunic',
  name: '测试外衣',
  description: '测试用外衣。',
  roleplayText: '一件只用于编译校验的外衣。',
  category: 'clothing',
  subcategory: 'tunic',
  tags: [],
  image: { type: 'game', icon: 'tunic' },
  material: '羊毛',
  baseQuality: 'common',
  rarity: 'common',
  bulk: 'small',
  stackable: false,
  maxStack: 1,
  unique: false,
  equippable: true,
  allowedPositions: [{ group: 'torso', layer: 'garment' }],
  baseValue: 1,
  effects: [],
};

function compileItems(items) {
  return validateOrdinaryItems({ schemaVersion: 1, items });
}

test('未知效果、非法装备位置和重复 ID 在编译时失败', () => {
  assert.throws(() => compileItems([{ ...validItem, effects: [{ kind: 'unknown' }] }]), /未知物品效果/);
  assert.throws(() => compileItems([{ ...validItem, allowedPositions: [{ group: 'torso', layer: 'boots' }] }]), /装备位置/);
  assert.throws(() => compileItems([validItem, validItem]), /物品 ID 重复/);
});
