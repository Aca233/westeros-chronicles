import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/items/state.ts';",
      "export * from './src/features/items/custody.ts';",
      "export * from './src/features/items/catalog.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'item-custody-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  splitting: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const module = await import(moduleUrl);
const {
  createEmptyItemSystem,
  createItemInstance,
  validateItemSystem,
  createItemCatalog,
  getCarryUnits,
  getStorageUnits,
  getUsedCarryUnits,
  canContainerAccept,
  transferItem,
} = module;

function definition(overrides = {}) {
  return {
    id: 'tool.rope',
    name: '结实绳索',
    description: '旅行用绳索。',
    roleplayText: '编织紧密，足以承受一名成年人的重量。',
    category: 'tool',
    subcategory: 'rope',
    tags: ['travel'],
    image: { type: 'game', icon: 'artifact-white-book' },
    material: '麻绳',
    baseQuality: 'common',
    rarity: 'common',
    bulk: 'medium',
    stackable: false,
    maxStack: 1,
    unique: false,
    equippable: false,
    allowedPositions: [],
    baseValue: 4,
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

const definitions = [
  definition(),
  definition({ id: 'medicine.herbs', name: '止血药草', category: 'medicine', subcategory: 'herb', bulk: 'tiny', stackable: true, maxStack: 12 }),
  definition({ id: 'tool.medicine_pouch', name: '学士药囊', category: 'tool', subcategory: 'pouch', bulk: 'tiny', effects: [{ kind: 'capacity', categories: ['medicine', 'poison'], units: 2, stackGroup: 'container.medicine', cap: 2, label: '药物收纳' }] }),
  definition({ id: 'weapon.training_sword', name: '训练剑', category: 'weapon', subcategory: 'sword', bulk: 'small' }),
  definition({ id: 'supply.bedroll', name: '铺盖卷', category: 'supply', subcategory: 'bedroll', bulk: 'medium' }),
  definition({ id: 'armor.plate_harness', name: '全身板甲', category: 'armor', subcategory: 'plate', bulk: 'large' }),
];
const catalog = createItemCatalog(definitions);

function stateWith(entries) {
  const state = createEmptyItemSystem();
  for (const [item, placement] of entries) {
    state.instances[item.instanceId] = item;
    state.placements[item.instanceId] = placement;
  }
  return state;
}

test('实例工厂采用定义默认值并锁定身份字段', () => {
  const created = createItemInstance(catalog, 'tool.rope', 'rope_created', {
    instanceId: 'attempted_override',
    definitionId: 'medicine.herbs',
    customName: '攀城绳',
  });
  assert.equal(created.instanceId, 'rope_created');
  assert.equal(created.definitionId, 'tool.rope');
  assert.equal(created.quality, 'common');
  assert.equal(created.customName, '攀城绳');
});

test('体积单位区分随身与储藏', () => {
  assert.equal(getCarryUnits('tiny'), 0.25);
  assert.equal(getCarryUnits('small'), 1);
  assert.equal(getCarryUnits('medium'), 2);
  assert.equal(getCarryUnits('large'), Number.POSITIVE_INFINITY);
  assert.equal(getStorageUnits('large'), 4);
});

test('随身体积按堆叠数量计算', () => {
  const state = stateWith([
    [instance('herbs', 'medicine.herbs', { quantity: 2 }), { type: 'carried' }],
    [instance('rope', 'tool.rope'), { type: 'carried' }],
  ]);
  assert.equal(getUsedCarryUnits(state, catalog), 2.5);
  assert.doesNotThrow(() => validateItemSystem(state, catalog));
});

test('药囊只扩展药物容量，不能替武器扩容', () => {
  const entries = [
    [instance('pouch', 'tool.medicine_pouch'), { type: 'carried' }],
    [instance('bedroll_1', 'supply.bedroll'), { type: 'carried' }],
    [instance('bedroll_2', 'supply.bedroll'), { type: 'carried' }],
    [instance('bedroll_3', 'supply.bedroll'), { type: 'carried' }],
    [instance('sword_1', 'weapon.training_sword'), { type: 'carried' }],
    [instance('herbs', 'medicine.herbs', { quantity: 8 }), { type: 'carried' }],
  ];
  const state = stateWith(entries);
  assert.equal(getUsedCarryUnits(state, catalog), 9.25);
  assert.equal(canContainerAccept(state, catalog, { type: 'carried' }), true);

  state.instances.sword_2 = instance('sword_2', 'weapon.training_sword');
  state.placements.sword_2 = { type: 'carried' };
  assert.equal(canContainerAccept(state, catalog, { type: 'carried' }), false);
  assert.throws(() => validateItemSystem(state, catalog), /随身容量不足/);
});

test('大型物品不能随身但可占用运输工具四格', () => {
  const state = stateWith([[instance('plate', 'armor.plate_harness'), { type: 'site', siteId: 'armory' }]]);
  state.sites.armory = { id: 'armory', name: '军械库', type: 'armory', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', description: '', capacity: 4 };
  state.vehicles.wagon = { id: 'wagon', name: '辎重马车', type: 'wagon', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', capacity: 8, description: '' };
  assert.throws(() => transferItem(state, catalog, 'plate', { type: 'carried' }, { currentLocation: { locationId: 'b_winterfell' } }), /大型物品不能普通随身携带/);
  assert.equal(canContainerAccept(state, catalog, { type: 'site', siteId: 'armory' }), true);
  state.instances.rope = instance('rope', 'tool.rope');
  state.placements.rope = { type: 'site', siteId: 'armory' };
  assert.equal(canContainerAccept(state, catalog, { type: 'site', siteId: 'armory' }), false);
  delete state.instances.rope;
  delete state.placements.rope;

  const moved = transferItem(state, catalog, 'plate', { type: 'vehicle', vehicleId: 'wagon' }, { currentLocation: { locationId: 'b_winterfell' } });
  assert.deepEqual(moved.placements.plate, { type: 'vehicle', vehicleId: 'wagon' });
});

test('转移会验证地点、装备目标与堆叠拆分 ID', () => {
  const state = stateWith([[instance('herbs', 'medicine.herbs', { quantity: 4 }), { type: 'carried' }]]);
  state.sites.armory = { id: 'armory', name: '临冬城军械库', type: 'armory', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', description: '' };
  const moved = transferItem(state, catalog, 'herbs', { type: 'site', siteId: 'armory' }, { currentLocation: { locationId: 'b_winterfell' }, quantity: 2, newInstanceId: 'herbs_stored' });
  assert.equal(state.instances.herbs.quantity, 4);
  assert.equal(state.instances.herbs_stored, undefined);
  assert.equal(moved.instances.herbs.quantity, 2);
  assert.equal(moved.instances.herbs_stored.quantity, 2);
  assert.deepEqual(moved.placements.herbs_stored, { type: 'site', siteId: 'armory' });
  assert.throws(() => transferItem(state, catalog, 'herbs', { type: 'equipped', position: { group: 'mainhand' } }, { currentLocation: { locationId: 'b_winterfell' } }), /装备位置只能通过装备规则写入/);
  assert.throws(() => transferItem(state, catalog, 'herbs', { type: 'site', siteId: 'armory' }, { currentLocation: { locationId: 'b_red_keep' } }), /目标据点不在当前地点/);
});

test('实例与位置键必须完全一致', () => {
  const state = stateWith([[instance('rope', 'tool.rope'), { type: 'carried' }]]);
  delete state.placements.rope;
  assert.throws(() => validateItemSystem(state, catalog), /位置记录与实例不一致/);
});
