import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/items/catalog.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const source = bundle.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createItemCatalog, getItemDefinition } = await import(moduleUrl);

function definition(overrides = {}) {
  return {
    id: 'weapon.castle_sword',
    name: '城堡精钢长剑',
    description: '一柄由城堡铁匠锻造的长剑。',
    roleplayText: '剑身平衡，适合受过正规训练的战士。',
    category: 'weapon',
    subcategory: 'longsword',
    tags: ['steel', 'melee'],
    image: { type: 'game', icon: 'gear-sword' },
    material: '城堡精钢',
    baseQuality: 'fine',
    rarity: 'uncommon',
    bulk: 'medium',
    stackable: false,
    maxStack: 1,
    unique: false,
    equippable: true,
    allowedPositions: [{ group: 'mainhand' }],
    handedness: 'one',
    baseValue: 80,
    effects: [],
    ...overrides,
  };
}

test('目录拒绝重复定义 ID', () => {
  const sword = definition();
  assert.throws(() => createItemCatalog([sword, sword]), /重复物品定义/);
});

test('唯一物品不能堆叠', () => {
  assert.throws(() => createItemCatalog([definition({
    id: 'artifact.ice',
    unique: true,
    stackable: true,
    maxStack: 2,
  })]), /唯一物品不能堆叠/);
});

test('目录拒绝空 ID、非法堆叠和矛盾装备声明', () => {
  assert.throws(() => createItemCatalog([definition({ id: '   ' })]), /物品定义 ID 不能为空/);
  assert.throws(() => createItemCatalog([definition({ stackable: true, maxStack: 1 })]), /可堆叠物品的最大堆叠数必须大于 1/);
  assert.throws(() => createItemCatalog([definition({ equippable: true, allowedPositions: [] })]), /可装备物品必须声明装备位置/);
  assert.throws(() => createItemCatalog([definition({ equippable: false, allowedPositions: [{ group: 'mainhand' }] })]), /不可装备物品不能声明装备位置/);
});

test('目录返回已验证定义并对未知 ID 失败关闭', () => {
  const sword = definition();
  const catalog = createItemCatalog([sword]);
  assert.equal(getItemDefinition(catalog, 'weapon.castle_sword').name, '城堡精钢长剑');
  assert.throws(() => getItemDefinition(catalog, 'missing'), /未知物品定义/);
});
