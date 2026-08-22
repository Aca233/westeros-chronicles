import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/diceEngine.ts';",
      "export * from './src/services/stateReducer.ts';",
      "export * from './src/features/items/catalog.ts';",
      "export * from './src/features/items/state.ts';",
      "export * from './scripts/fixtures/living-world-test.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'item-dice-integration-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const diceModule = await import(url);
await diceModule.ordinaryCatalogReady;
const { performD20Check, applyStateCommands, createItemCatalog, createEmptyItemSystem, createLivingWorldTestLord } = diceModule;

function definition(overrides = {}) {
  return {
    id: 'weapon.test_sword', name: '测试长剑', description: '', roleplayText: '', category: 'weapon', subcategory: 'sword', tags: ['sword'],
    image: { type: 'game', icon: 'gear-sword' }, material: '钢', baseQuality: 'fine', rarity: 'common', bulk: 'small', stackable: false,
    maxStack: 1, unique: false, equippable: true, allowedPositions: [{ group: 'mainhand' }], handedness: 'one', baseValue: 1,
    effects: [{ kind: 'check_modifier', domain: 'duel', value: 3, stackGroup: 'duel.weapon', cap: 5, condition: { actionPatterns: ['持剑', '决斗'], requiredSceneTags: ['melee'] }, label: '趁手长剑' }], ...overrides,
  };
}
function instance(id, definitionId) {
  return { instanceId: id, definitionId, quantity: 1, durability: 100, quality: 'fine', renown: 0, isHeirloom: false, history: [] };
}
const armor = definition({
  id: 'armor.test_heavy', name: '测试重甲', category: 'armor', subcategory: 'plate', tags: ['heavy_armor'], bulk: 'large', handedness: undefined,
  allowedPositions: [{ group: 'torso', layer: 'armor' }],
  effects: [{ kind: 'check_modifier', domain: 'diplomacy', value: -1, stackGroup: 'court.armor', cap: 2, condition: { requiredSceneTags: ['court'] }, label: '武装赴会' }],
});
const sword = definition();
const catalog = createItemCatalog([sword, armor]);
const items = createEmptyItemSystem();
items.instances.sword = instance('sword', sword.id);
items.placements.sword = { type: 'equipped', position: { group: 'mainhand' } };
items.instances.armor = instance('armor', armor.id);
items.placements.armor = { type: 'equipped', position: { group: 'torso', layer: 'armor' } };
const attributes = { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 };

test('物品只修正匹配的 D20 行动并提供来源明细', () => {
  const duel = performD20Check('持剑近身决斗', attributes, items, catalog, [], 'prowess', 12, 'duel', ['melee'], () => 0.45);
  assert.equal(duel.roll, 10);
  assert.equal(duel.equipmentModifier, 3);
  assert.equal(duel.equipmentModifierBreakdown[0].definitionId, 'weapon.test_sword');
  const court = performD20Check('宫廷谈判', attributes, items, catalog, [], 'diplomacy', 12, 'diplomacy', ['court'], () => 0.45);
  assert.equal(court.equipmentModifier, -1);
  const road = performD20Check('路边谈判', attributes, items, catalog, [], 'diplomacy', 12, 'diplomacy', ['travel'], () => 0.45);
  assert.equal(road.equipmentModifier, 0);
});

function nedWithChainmail() {
  const lord = structuredClone(createLivingWorldTestLord());
  lord.items.placements['ned.chainmail'] = { type: 'equipped', position: { group: 'torso', layer: 'armor' } };
  return lord;
}

test('躯干护甲先确定性减伤且只有实际减伤时损耗耐久', () => {
  const lord = nedWithChainmail();
  const before = lord.items.instances['ned.chainmail'].durability;
  const result = applyStateCommands(lord, [{ type: 'INJURE_ZONE', zone: 'torso', level: 'critical', woundText: '剑刃劈中胸甲', damageTags: ['slashing'] }], () => 1);
  assert.equal(result.updatedLord.body.torso.level, 'heavy');
  assert.equal(result.updatedLord.items.instances['ned.chainmail'].durability, before - 5);
  assert.match(result.changesLog.join('\n'), /护甲减伤/);
});

test('未覆盖头部的护甲不减伤也不损耗', () => {
  const lord = nedWithChainmail();
  const before = lord.items.instances['ned.chainmail'].durability;
  const result = applyStateCommands(lord, [{ type: 'INJURE_ZONE', zone: 'head', level: 'critical', woundText: '头部遭劈砍', damageTags: ['slashing'] }], () => 1);
  assert.equal(result.updatedLord.body.head.level, 'critical');
  assert.equal(result.updatedLord.items.instances['ned.chainmail'].durability, before);
});
