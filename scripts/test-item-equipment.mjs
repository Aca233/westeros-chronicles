import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/items/equipment.ts';",
      "export * from './src/features/items/state.ts';",
      "export * from './src/features/items/catalog.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'item-equipment-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const module = await import(moduleUrl);
const {
  ACCESSORY_INDICES,
  EQUIPMENT_GROUPS,
  LEG_LAYERS,
  TORSO_LAYERS,
  canEquipItem,
  createEmptyItemSystem,
  createItemCatalog,
  equipItem,
  getEquippedInstance,
  getEquipmentGroups,
  getReservedPositions,
  unequipItem,
} = module;

function definition(overrides = {}) {
  return {
    id: 'clothing.tunic',
    name: '亚麻束腰衣',
    description: '普通衣物。',
    roleplayText: '适合日常起居。',
    category: 'clothing',
    subcategory: 'tunic',
    tags: [],
    image: { type: 'game', icon: 'clothes' },
    material: '亚麻',
    baseQuality: 'common',
    rarity: 'common',
    bulk: 'small',
    stackable: false,
    maxStack: 1,
    unique: false,
    equippable: true,
    allowedPositions: [{ group: 'torso', layer: 'garment' }],
    baseValue: 2,
    effects: [],
    ...overrides,
  };
}

function instance(instanceId, definitionId, overrides = {}) {
  return {
    instanceId,
    definitionId,
    quantity: 1,
    durability: 100,
    quality: 'common',
    renown: 0,
    isHeirloom: false,
    history: [],
    ...overrides,
  };
}

const catalog = createItemCatalog([
  definition(),
  definition({ id: 'armor.mail', name: '锁子甲', category: 'armor', subcategory: 'mail', bulk: 'medium', allowedPositions: [{ group: 'torso', layer: 'armor' }] }),
  definition({ id: 'armor.plate', name: '板甲', category: 'armor', subcategory: 'plate', bulk: 'large', allowedPositions: [{ group: 'torso', layer: 'armor' }] }),
  definition({ id: 'clothing.cloak', name: '北境大氅', subcategory: 'cloak', allowedPositions: [{ group: 'torso', layer: 'outerwear' }] }),
  definition({ id: 'clothing.breeches', name: '羊毛长裤', subcategory: 'breeches', allowedPositions: [{ group: 'legs', layer: 'legwear' }] }),
  definition({ id: 'clothing.boots', name: '熟皮靴', subcategory: 'boots', allowedPositions: [{ group: 'legs', layer: 'footwear' }] }),
  definition({ id: 'weapon.greatsword', name: '巨剑', category: 'weapon', subcategory: 'greatsword', bulk: 'medium', allowedPositions: [{ group: 'mainhand' }], handedness: 'two' }),
  definition({ id: 'weapon.sword', name: '长剑', category: 'weapon', subcategory: 'sword', allowedPositions: [{ group: 'mainhand' }, { group: 'offhand' }], handedness: 'one' }),
  definition({ id: 'weapon.shield', name: '盾牌', category: 'weapon', subcategory: 'shield', allowedPositions: [{ group: 'offhand' }], handedness: 'one' }),
  ...[0, 1, 2].map((index) => definition({ id: `jewelry.ring_${index}`, name: `戒指 ${index}`, category: 'jewelry', subcategory: 'ring', bulk: 'tiny', allowedPositions: [{ group: 'accessories', index }] })),
]);

function stateWith(definitionIds) {
  const state = createEmptyItemSystem();
  for (const definitionId of definitionIds) {
    const id = definitionId.replaceAll('.', '_');
    state.instances[id] = instance(id, definitionId);
    state.placements[id] = { type: 'carried' };
  }
  return state;
}

const options = { currentLocation: { locationId: 'b_winterfell' }, displacedTo: { type: 'carried' } };

test('装备只暴露六个常态分组和规定的隐藏位置', () => {
  assert.deepEqual(EQUIPMENT_GROUPS, ['head', 'torso', 'mainhand', 'offhand', 'legs', 'accessories']);
  assert.equal(TORSO_LAYERS.join(','), 'garment,armor,outerwear');
  assert.equal(LEG_LAYERS.join(','), 'legwear,footwear');
  assert.equal(ACCESSORY_INDICES.length, 3);
  assert.equal(EQUIPMENT_GROUPS.includes('cloak'), false);
  assert.equal(EQUIPMENT_GROUPS.includes('shoulder'), false);
  assert.equal(getEquipmentGroups(createEmptyItemSystem()).length, 6);
});

test('躯干护甲和外披可以同时存在', () => {
  let state = stateWith(['armor.mail', 'clothing.cloak']);
  state = equipItem(state, catalog, 'armor_mail', { group: 'torso', layer: 'armor' }, options);
  state = equipItem(state, catalog, 'clothing_cloak', { group: 'torso', layer: 'outerwear' }, options);
  assert.equal(getEquippedInstance(state, { group: 'torso', layer: 'armor' })?.instanceId, 'armor_mail');
  assert.equal(getEquippedInstance(state, { group: 'torso', layer: 'outerwear' })?.instanceId, 'clothing_cloak');
});

test('双腿内的腿部与足部可以同时装备', () => {
  let state = stateWith(['clothing.breeches', 'clothing.boots']);
  state = equipItem(state, catalog, 'clothing_breeches', { group: 'legs', layer: 'legwear' }, options);
  state = equipItem(state, catalog, 'clothing_boots', { group: 'legs', layer: 'footwear' }, options);
  assert.equal(getEquippedInstance(state, { group: 'legs', layer: 'legwear' })?.instanceId, 'clothing_breeches');
  assert.equal(getEquippedInstance(state, { group: 'legs', layer: 'footwear' })?.instanceId, 'clothing_boots');
});

test('佩饰只有三个内部位置，第四件会被拒绝', () => {
  let state = stateWith(['jewelry.ring_0', 'jewelry.ring_1', 'jewelry.ring_2']);
  for (const index of ACCESSORY_INDICES) {
    state = equipItem(state, catalog, `jewelry_ring_${index}`, { group: 'accessories', index }, options);
  }
  assert.equal(canEquipItem(state, catalog, 'jewelry_ring_0', { group: 'accessories', index: 3 }), false);
  assert.equal(getEquipmentGroups(state).find((group) => group.group === 'accessories').instances.length, 3);
});

test('双手武器清空并保留副手，副手物品不能与其共存', () => {
  let state = stateWith(['weapon.greatsword', 'weapon.shield']);
  state = equipItem(state, catalog, 'weapon_shield', { group: 'offhand' }, options);
  state = equipItem(state, catalog, 'weapon_greatsword', { group: 'mainhand' }, options);
  assert.deepEqual(state.placements.weapon_shield, { type: 'carried' });
  assert.deepEqual(state.placements.weapon_greatsword, { type: 'equipped', position: { group: 'mainhand' } });
  assert.deepEqual(getReservedPositions(state, catalog), [{ group: 'offhand' }]);
  assert.equal(canEquipItem(state, catalog, 'weapon_shield', { group: 'offhand' }), false);
  assert.throws(() => equipItem(state, catalog, 'weapon_shield', { group: 'offhand' }, options), /双手武器占用副手/);
});

test('兼容性来自定义数据且损坏物品不能装备', () => {
  const state = stateWith(['weapon.sword']);
  assert.equal(canEquipItem(state, catalog, 'weapon_sword', { group: 'head' }), false);
  state.instances.weapon_sword.durability = 0;
  assert.equal(canEquipItem(state, catalog, 'weapon_sword', { group: 'mainhand' }), false);
});

test('装备与卸下在容量失败时保持原状态', () => {
  const state = stateWith(['armor.mail']);
  state.instances.armor_plate = instance('armor_plate', 'armor.plate');
  state.placements.armor_plate = { type: 'equipped', position: { group: 'torso', layer: 'armor' } };
  assert.throws(
    () => equipItem(state, catalog, 'armor_mail', { group: 'torso', layer: 'armor' }, options),
    /大型物品不能普通随身携带/,
  );
  assert.throws(
    () => unequipItem(state, catalog, 'armor_plate', { type: 'carried' }, { currentLocation: { locationId: 'b_winterfell' } }),
    /大型物品不能普通随身携带/,
  );
  assert.deepEqual(state.placements.armor_plate, { type: 'equipped', position: { group: 'torso', layer: 'armor' } });
});
