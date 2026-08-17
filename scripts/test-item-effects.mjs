import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/items/effects.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  aggregateEquippedItemEffects,
  formatItemNarrativeDirectives,
  getEquipmentBurden,
  getItemCheckModifier,
  getItemCheckModifierBreakdown,
  getUnlockedItemActions,
  getZoneProtection,
  mitigateWoundLevel,
} = await import(moduleUrl);

function definition(overrides = {}) {
  return {
    id: 'weapon.sword',
    name: '城堡精钢长剑',
    description: '平衡良好的长剑。',
    roleplayText: '剑锋经过仔细保养。',
    category: 'weapon',
    subcategory: 'sword',
    tags: ['sword', 'melee'],
    image: { type: 'game', icon: 'crossed-swords' },
    material: '城堡精钢',
    baseQuality: 'fine',
    rarity: 'uncommon',
    bulk: 'small',
    stackable: false,
    maxStack: 1,
    unique: false,
    equippable: true,
    allowedPositions: [{ group: 'mainhand' }],
    handedness: 'one',
    baseValue: 40,
    effects: [],
    ...overrides,
  };
}

function instance(instanceId, definitionId, durability = 100) {
  return { instanceId, definitionId, quantity: 1, durability, quality: 'fine', renown: 0, isHeirloom: false, history: [] };
}

function fixture(definitions, equipped) {
  const catalog = new Map(definitions.map((item) => [item.id, item]));
  const state = { schemaVersion: 1, instances: {}, placements: {}, sites: {}, vehicles: {} };
  equipped.forEach(([item, position]) => {
    state.instances[item.instanceId] = item;
    state.placements[item.instanceId] = { type: 'equipped', position };
  });
  return { state, catalog };
}

const sword = definition({
  effects: [{
    kind: 'check_modifier', domain: 'duel', value: 3, stackGroup: 'duel.weapon', cap: 5,
    condition: { actionPatterns: ['持剑', '近身决斗'], requiredSceneTags: ['melee'], requiredItemTags: ['sword'] },
    label: '趁手长剑',
  }],
});
const armor = definition({
  id: 'armor.heavy_mail', name: '重甲', category: 'armor', subcategory: 'mail', tags: ['heavy_armor'], bulk: 'large',
  allowedPositions: [{ group: 'torso', layer: 'armor' }], handedness: undefined,
  effects: [
    { kind: 'check_modifier', domain: 'diplomacy', value: -1, stackGroup: 'court.armor', cap: 2, condition: { requiredSceneTags: ['court'] }, label: '武装赴会' },
    { kind: 'protection', zones: ['torso', 'arms'], damageTags: ['slashing', 'piercing'], value: 3, stackGroup: 'armor.body', cap: 5, label: '重甲防护' },
    { kind: 'burden', value: 2, stackGroup: 'armor.weight', cap: 4, label: '重甲负担' },
    { kind: 'heat', contextTags: ['warm', 'hot'], value: 2, stackGroup: 'armor.heat', cap: 4, label: '重甲闷热' },
    { kind: 'fatigue', contextTags: ['travel', 'combat'], value: 1, stackGroup: 'armor.fatigue', cap: 3, label: '重甲耗力' },
    { kind: 'action_unlock', actionId: 'brace_behind_armor', label: '依甲固守' },
    { kind: 'narrative', directive: '重甲会在安静场合发出金属摩擦声。' },
  ],
});

const base = fixture(
  [sword, armor],
  [
    [instance('sword', sword.id), { group: 'mainhand' }],
    [instance('armor', armor.id), { group: 'torso', layer: 'armor' }],
  ],
);
const effects = aggregateEquippedItemEffects(base.state, base.catalog);

test('检定修正严格匹配领域、动作与场景', () => {
  assert.equal(getItemCheckModifier(effects, { domain: 'duel', actionText: '我拔剑进行持剑近身决斗', sceneTags: ['melee'] }), 3);
  assert.equal(getItemCheckModifier(effects, { domain: 'duel', actionText: '徒手角力', sceneTags: ['melee'] }), 0);
  assert.equal(getItemCheckModifier(effects, { domain: 'diplomacy', actionText: '宫廷谈判', sceneTags: ['court'] }), -1);
  assert.equal(getItemCheckModifier(effects, { domain: 'diplomacy', actionText: '路边问讯', sceneTags: ['travel'] }), 0);
});

test('同一叠加组不会突破上限', () => {
  const charms = [1, 2, 3].map((value) => definition({
    id: `weapon.charm_${value}`,
    name: `决斗配件 ${value}`,
    effects: [{ kind: 'check_modifier', domain: 'duel', value: value + 1, stackGroup: 'duel.weapon', cap: 5, label: '决斗辅助' }],
  }));
  const stacked = fixture(charms, charms.map((item, index) => [instance(`charm_${index}`, item.id), { group: 'accessories', index }]));
  const stackedEffects = aggregateEquippedItemEffects(stacked.state, stacked.catalog);
  const context = { domain: 'duel', actionText: '决斗', sceneTags: [] };
  assert.equal(getItemCheckModifier(stackedEffects, context), 5);
  assert.equal(getItemCheckModifierBreakdown(stackedEffects, context).reduce((sum, entry) => sum + entry.value, 0), 5);
});

test('防护按部位与伤害类型生效并确定性降低伤势', () => {
  assert.equal(getZoneProtection(effects, 'torso', ['slashing']), 3);
  assert.equal(getZoneProtection(effects, 'head', ['slashing']), 0);
  assert.equal(getZoneProtection(effects, 'torso', ['fire']), 0);
  assert.equal(mitigateWoundLevel('critical', 3), 'heavy');
  assert.equal(mitigateWoundLevel('minor', 0), 'minor');
});

test('损坏装备不贡献任何效果', () => {
  const broken = fixture([sword], [[instance('broken_sword', sword.id, 0), { group: 'mainhand' }]]);
  assert.equal(aggregateEquippedItemEffects(broken.state, broken.catalog).active.length, 0);
});

test('叙事模式返回明确事实、行动与代价且不包含百分比', () => {
  assert.equal(getEquipmentBurden(effects), 2);
  assert.deepEqual(getUnlockedItemActions(effects), ['brace_behind_armor']);
  const directives = formatItemNarrativeDirectives(effects);
  assert.ok(directives.some((line) => line.includes('重甲')));
  assert.ok(directives.some((line) => line.includes('依甲固守')));
  assert.equal(directives.some((line) => line.includes('%')), false);
});
