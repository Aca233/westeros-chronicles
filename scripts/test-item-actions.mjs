import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/items/actions.ts';",
      "export * from './src/features/items/state.ts';",
      "export * from './src/features/items/catalog.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'item-actions-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { applyItemActions, createEmptyItemSystem, createItemCatalog, validateItemAction } = await import(moduleUrl);

function definition(overrides = {}) {
  return {
    id: 'tool.rope', name: '绳索', description: '结实绳索。', roleplayText: '旅行工具。',
    category: 'tool', subcategory: 'rope', tags: [], image: { type: 'game', icon: 'artifact-white-book' },
    material: '麻', baseQuality: 'common', rarity: 'common', bulk: 'small', stackable: false, maxStack: 1,
    unique: false, equippable: false, allowedPositions: [], baseValue: 2, effects: [], ...overrides,
  };
}
function instance(instanceId, definitionId, overrides = {}) {
  return { instanceId, definitionId, quantity: 1, durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [], ...overrides };
}

const catalog = createItemCatalog([
  definition(),
  definition({ id: 'medicine.herbs', name: '药草', category: 'medicine', subcategory: 'herbs', bulk: 'tiny', stackable: true, maxStack: 12 }),
  definition({ id: 'poison.vial', name: '毒液瓶', category: 'poison', subcategory: 'vial', bulk: 'tiny' }),
  definition({ id: 'weapon.sword', name: '长剑', category: 'weapon', subcategory: 'sword', equippable: true, allowedPositions: [{ group: 'mainhand' }], handedness: 'one' }),
  definition({ id: 'weapon.unique', name: '祖传剑', category: 'weapon', subcategory: 'sword', unique: true, equippable: true, allowedPositions: [{ group: 'mainhand' }], handedness: 'one' }),
]);
const context = {
  actorId: 'lord_player', actorLocation: '临冬城', gameDate: '298.1.2',
  accessibleSiteIds: new Set(['armory']), accessibleVehicleIds: new Set(['wagon']),
};

function baseState() {
  const state = createEmptyItemSystem();
  state.sites.armory = { id: 'armory', name: '军械库', type: 'armory', location: '临冬城', description: '', capacity: 20 };
  state.vehicles.wagon = { id: 'wagon', name: '马车', type: 'wagon', location: '临冬城', description: '', capacity: 20 };
  const entries = [
    [instance('rope', 'tool.rope'), { type: 'carried' }],
    [instance('herbs_a', 'medicine.herbs', { quantity: 4 }), { type: 'carried' }],
    [instance('herbs_b', 'medicine.herbs', { quantity: 2 }), { type: 'carried' }],
    [instance('poison', 'poison.vial', { charges: 2 }), { type: 'carried' }],
    [instance('sword', 'weapon.sword'), { type: 'carried' }],
    [instance('broken_rope', 'tool.rope', { durability: 40 }), { type: 'site', siteId: 'armory' }],
    [instance('unique_a', 'weapon.unique'), { type: 'site', siteId: 'armory' }],
  ];
  for (const [item, placement] of entries) {
    state.instances[item.instanceId] = item;
    state.placements[item.instanceId] = placement;
  }
  return state;
}

test('装备、卸下、使用与损坏动作按顺序结算', () => {
  const result = applyItemActions(baseState(), [
    { kind: 'equip', instanceId: 'sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } },
    { kind: 'unequip', instanceId: 'sword', to: { type: 'carried' } },
    { kind: 'use', instanceId: 'poison' },
    { kind: 'damage', instanceId: 'rope', amount: 15, reason: '攀爬时磨损' },
  ], context, catalog);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.placements.sword, { type: 'carried' });
  assert.equal(result.state.instances.poison.charges, 1);
  assert.equal(result.state.instances.poison.quantity, 1);
  assert.equal(result.state.instances.rope.durability, 85);
});

test('转移、拆分与合并保持实例唯一和数量守恒', () => {
  const result = applyItemActions(baseState(), [
    { kind: 'transfer', instanceId: 'rope', to: { type: 'site', siteId: 'armory' } },
    { kind: 'split', instanceId: 'herbs_a', quantity: 2, newInstanceId: 'herbs_trip', to: { type: 'vehicle', vehicleId: 'wagon' } },
    { kind: 'merge', sourceInstanceId: 'herbs_b', targetInstanceId: 'herbs_a' },
  ], context, catalog);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.placements.rope, { type: 'site', siteId: 'armory' });
  assert.equal(result.state.instances.herbs_a.quantity, 4);
  assert.equal(result.state.instances.herbs_trip.quantity, 2);
  assert.equal(result.state.instances.herbs_b, undefined);
});

test('赠送、丢弃、修理和传家宝动作写入关键历史', () => {
  const result = applyItemActions(baseState(), [
    { kind: 'gift', instanceId: 'herbs_a', recipientId: 'char_arya', quantity: 1, newInstanceId: 'herbs_gift' },
    { kind: 'discard', instanceId: 'rope' },
    { kind: 'repair', instanceId: 'broken_rope', amount: 80 },
    { kind: 'mark_heirloom', instanceId: 'sword', houseId: 'house_stark' },
  ], context, catalog);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.placements.herbs_gift, { type: 'character', characterId: 'char_arya' });
  assert.equal(result.state.instances.herbs_gift.history.at(-1).type, 'gifted');
  assert.equal(result.state.instances.rope.history.at(-1).type, 'lost');
  assert.equal(result.state.instances.broken_rope.durability, 100);
  assert.equal(result.state.instances.broken_rope.history.at(-1).type, 'repaired');
  assert.equal(result.state.instances.sword.isHeirloom, true);
  assert.equal(result.state.instances.sword.history.at(-1).type, 'heirloom');
});

test('取得动作记录偷取与寻回', () => {
  const state = baseState();
  const stolen = instance('stolen_rope', 'tool.rope');
  const recovered = instance('recovered_rope', 'tool.rope');
  const result = applyItemActions(state, [
    { kind: 'acquire', instance: stolen, placement: { type: 'carried' }, historyType: 'stolen' },
    { kind: 'acquire', instance: recovered, placement: { type: 'site', siteId: 'armory' }, historyType: 'recovered' },
  ], context, catalog);
  assert.equal(result.ok, true);
  assert.equal(result.state.instances.stolen_rope.history.at(-1).type, 'stolen');
  assert.equal(result.state.instances.recovered_rope.history.at(-1).type, 'recovered');
});

test('唯一物品不能合并，动作验证给出明确错误', () => {
  const state = baseState();
  assert.throws(
    () => validateItemAction(state, { kind: 'merge', sourceInstanceId: 'unique_a', targetInstanceId: 'unique_a' }, context, catalog),
    /唯一物品不能合并/,
  );
});

test('普通转移不能绕过赠送与丢弃历史', () => {
  const state = baseState();
  assert.throws(
    () => validateItemAction(state, { kind: 'transfer', instanceId: 'rope', to: { type: 'character', characterId: 'char_arya' } }, context, catalog),
    /普通转移只能前往/,
  );
});

test('批量动作原子失败并返回原始状态', () => {
  const state = baseState();
  const result = applyItemActions(state, [
    { kind: 'transfer', instanceId: 'rope', to: { type: 'site', siteId: 'armory' } },
    { kind: 'gift', instanceId: 'missing', recipientId: 'char_arya' },
  ], context, catalog);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(result.state.placements.rope, { type: 'carried' });
});
