import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/data/itemDefinitions.ts';",
      "export * from './src/data/itemPresetState.ts';",
      "export * from './src/features/items/state.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'item-definitions-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  ITEM_CATALOG,
  ITEM_DEFINITIONS,
  createCustomRulerItemState,
  createDaenerysItemState,
  createJonItemState,
  createNedItemState,
  validateItemSystem,
} = await import(moduleUrl);

const requiredIds = [
  'clothing.northern_wool_tunic',
  'clothing.nights_watch_uniform',
  'clothing.grey_wolf_cloak',
  'clothing.black_winter_cloak',
  'armor.stark_wolf_helm',
  'armor.castle_chainmail',
  'armor.nights_watch_leathers',
  'artifact.ice',
  'weapon.castle_bastard_sword',
  'medicine.maester_staunching_herbs',
  'medicine.milk_of_the_poppy',
  'supply.nights_watch_spirits',
  'keepsake.house_seal',
  'jewelry.simple_silver_ring',
];

test('首批目录覆盖切换前要求的所有定义', () => {
  const ids = new Set(ITEM_DEFINITIONS.map((definition) => definition.id));
  requiredIds.forEach((id) => assert.equal(ids.has(id), true, `缺少 ${id}`));
  assert.equal(ITEM_CATALOG.size, ITEM_DEFINITIONS.length);
});

test('寒冰是具有明确来历的唯一传奇双手武器', () => {
  const ice = ITEM_CATALOG.get('artifact.ice');
  assert.ok(ice);
  assert.equal(ice.unique, true);
  assert.equal(ice.rarity, 'unique');
  assert.equal(ice.baseQuality, 'legendary');
  assert.equal(ice.handedness, 'two');
  assert.equal(ice.stackable, false);
  assert.deepEqual(ice.allowedPositions, [{ group: 'mainhand' }]);
  assert.ok(ice.provenance?.origin?.length > 10);
  assert.ok(ice.effects.some((effect) => effect.kind === 'check_modifier' && effect.domain === 'duel'));
});

test('披风属于躯干外披层，目录没有独立披风或肩部位置', () => {
  for (const id of ['clothing.grey_wolf_cloak', 'clothing.black_winter_cloak']) {
    assert.deepEqual(ITEM_CATALOG.get(id).allowedPositions, [{ group: 'torso', layer: 'outerwear' }]);
  }
  assert.equal(ITEM_DEFINITIONS.some((definition) => definition.allowedPositions.some((position) => position.group === 'cloak' || position.group === 'shoulder')), false);
});

test('护甲、药物与身份物品使用结构化效果', () => {
  const chainmail = ITEM_CATALOG.get('armor.castle_chainmail');
  assert.ok(chainmail.effects.some((effect) => effect.kind === 'protection' && effect.zones.includes('torso')));
  assert.ok(chainmail.effects.some((effect) => effect.kind === 'burden'));
  assert.ok(ITEM_CATALOG.get('medicine.maester_staunching_herbs').effects.some((effect) => effect.kind === 'action_unlock'));
  assert.ok(ITEM_CATALOG.get('keepsake.house_seal').effects.some((effect) => effect.kind === 'social'));
});

test('四套预设确定、合法且不从旧装备对象迁移', () => {
  const factories = [createNedItemState, createJonItemState, createDaenerysItemState, createCustomRulerItemState];
  for (const factory of factories) {
    const first = factory();
    const second = factory();
    assert.deepEqual(first, second);
    assert.doesNotThrow(() => validateItemSystem(first, ITEM_CATALOG));
    assert.deepEqual(Object.keys(first).sort(), ['instances', 'placements', 'schemaVersion', 'sites', 'vehicles']);
    assert.equal(Object.values(first.instances).filter((instance) => instance.definitionId === 'artifact.ice').length <= 1, true);
  }
  assert.equal(createNedItemState().instances['ned.ice'].definitionId, 'artifact.ice');
  assert.equal(createNedItemState().instances['ned.wool_tunic'].definitionId, 'clothing.northern_wool_tunic');
  assert.equal(createJonItemState().instances['jon.castle_sword'].definitionId, 'weapon.castle_bastard_sword');
});

test('药物与酒液预设使用明确次数而不是隐藏百分比', () => {
  const ned = createNedItemState();
  const jon = createJonItemState();
  assert.ok(ned.instances['ned.staunching_herbs'].charges > 0);
  assert.ok(jon.instances['jon.spirits'].charges > 0);
  assert.equal(JSON.stringify({ ned, jon }).includes('%'), false);
});
