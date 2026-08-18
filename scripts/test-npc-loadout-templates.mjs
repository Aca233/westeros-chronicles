import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

const { NPC_LOADOUT_TEMPLATES } = await bundleModule('src/data/npcLoadoutTemplates.ts');
const { ITEM_CATALOG } = await bundleModule('src/data/itemDefinitions.ts');

test('所有日常模板引用有效且位置兼容的非唯一物品', () => {
  for (const template of Object.values(NPC_LOADOUT_TEMPLATES)) {
    for (const slot of template.slots) {
      const definition = ITEM_CATALOG.get(slot.definitionId);
      assert.ok(definition, `${template.id}/${slot.id} 缺少物品定义`);
      assert.equal(definition.unique, false, `${template.id} 不得引用唯一物品`);
      assert.ok(definition.allowedPositions.some((position) => JSON.stringify(position) === JSON.stringify(slot.position)), `${template.id}/${slot.id} 装备位置不兼容`);
    }
  }
});

test('成人日常模板包含服装、腿部与足部', () => {
  for (const template of Object.values(NPC_LOADOUT_TEMPLATES).filter((entry) => entry.ageGroup === 'adult')) {
    const groups = new Set(template.slots.map((slot) => slot.position.group === 'legs' ? `legs:${slot.position.layer}` : slot.position.group === 'torso' ? `torso:${slot.position.layer}` : slot.position.group));
    assert.ok(groups.has('torso:garment'), `${template.id} 缺少躯干服装`);
    assert.ok(groups.has('legs:legwear'), `${template.id} 缺少腿部衣物`);
    assert.ok(groups.has('legs:footwear'), `${template.id} 缺少足部物品`);
  }
});

test('婴儿和儿童模板没有成人武器与盔甲', () => {
  for (const template of Object.values(NPC_LOADOUT_TEMPLATES).filter((entry) => entry.ageGroup === 'infant' || entry.ageGroup === 'child')) {
    for (const slot of template.slots) {
      const definition = ITEM_CATALOG.get(slot.definitionId);
      assert.notEqual(definition.category, 'weapon');
      assert.notEqual(definition.category, 'armor');
    }
  }
});
