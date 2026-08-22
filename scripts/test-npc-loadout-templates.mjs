import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

const { preloadNpcLoadoutContent, getNpcLoadoutContent } = await bundleModule('src/features/items/npcLoadoutContent.ts');
await preloadNpcLoadoutContent();
const loaded = getNpcLoadoutContent();
const NPC_LOADOUT_TEMPLATES = Object.fromEntries(loaded.templates);
const NPC_LOADOUT_OVERRIDES = Object.fromEntries(loaded.overrides);
const { ITEM_CATALOG, preloadItemCatalog } = await bundleModule('src/data/itemDefinitions.ts');
await preloadItemCatalog();
const itemsModule = await bundleModule('src/features/characters/characterItems.ts');
await itemsModule.preloadNpcLoadoutContent();
const { expandBaselineLoadout } = itemsModule;

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

test('重点人物覆盖引用有效定义且位置兼容', () => {
  for (const [charId, override] of Object.entries(NPC_LOADOUT_OVERRIDES)) {
    if (override.templateId) {
      assert.ok(NPC_LOADOUT_TEMPLATES[override.templateId], `${charId} 引用了不存在的模板 ${override.templateId}`);
    }
    if (override.slots) {
      for (const slot of override.slots) {
        const definition = ITEM_CATALOG.get(slot.definitionId);
        assert.ok(definition, `${charId}/${slot.id} 缺少物品定义 ${slot.definitionId}`);
        assert.ok(definition.allowedPositions.some((position) => JSON.stringify(position) === JSON.stringify(slot.position)), `${charId}/${slot.id} 装备位置不兼容`);
      }
    }
  }
});



function readAllCharacters() {
  return readdirSync('public/data/agot-characters/shards')
    .flatMap((file) => JSON.parse(readFileSync(`public/data/agot-characters/shards/${file}`, 'utf8')));
}

function readAllProfiles() {
  return Object.assign({}, ...readdirSync('public/data/agot-characters/loadouts')
    .map((file) => JSON.parse(readFileSync(`public/data/agot-characters/loadouts/${file}`, 'utf8'))));
}

test('损坏的模板或覆盖 ID 必须立即报错，不能静默回退通用装束', () => {
  const record = { id: 'agot:test', rawId: 'test', name: '测试人物' };
  assert.throws(
    () => expandBaselineLoadout(record, { characterId: 'agot:test', templateId: 'missing-template' }),
    /人物装束模板不存在/,
  );
  assert.throws(
    () => expandBaselineLoadout(record, { characterId: 'agot:test', templateId: 'generic', overrideId: 'missing-override' }),
    /人物装束覆盖不存在或不匹配/,
  );
});

test('全量开局装束只包含日常穿戴，未成年人不使用成人模板或战斗装备', () => {
  const characters = new Map(readAllCharacters().map((record) => [record.id, record]));
  const profiles = readAllProfiles();
  let checked = 0;
  for (const [characterId, profile] of Object.entries(profiles)) {
    const record = characters.get(characterId);
    assert.ok(record, `${characterId} 缺少人物记录`);
    const override = NPC_LOADOUT_OVERRIDES[characterId];
    const templateId = override?.templateId ?? profile.templateId;
    const template = NPC_LOADOUT_TEMPLATES[templateId];
    assert.ok(template, `${characterId} 引用不存在的模板 ${templateId}`);
    if (profile.overrideId) assert.equal(override?.id, profile.overrideId, `${characterId} 的覆盖 ID 与数据分片不一致`);

    const birthYear = Number(record.birthDate?.split('.')[0]);
    const age = Number.isFinite(birthYear) ? 8298 - birthYear : undefined;
    if (age !== undefined && age < 16) {
      assert.notEqual(template.ageGroup, 'adult', `${record.name}（${age}岁）不应使用成人装束 ${template.id}`);
    }

    const items = expandBaselineLoadout(record, profile);
    for (const item of items) {
      const definition = ITEM_CATALOG.get(item.definitionId);
      assert.ok(definition, `${record.name} 的 ${item.definitionId} 缺少定义`);
      assert.notEqual(definition.category, 'weapon', `${record.name} 的静态日常装束不应默认持有武器 ${definition.name}`);
      assert.notEqual(definition.category, 'armor', `${record.name} 的静态日常装束不应默认穿着护甲 ${definition.name}`);
    }
    checked += 1;
  }
  assert.equal(checked, Object.keys(profiles).length);
});

test('重点人物不得复用他人的专属饰品', () => {
  for (const characterId of ['agot:Lannister_1', 'agot:Lannister_7']) {
    const override = NPC_LOADOUT_OVERRIDES[characterId];
    assert.ok(override);
    assert.equal(override.slots?.some((slot) => slot.definitionId === 'jewelry.tyrion_golden_ring'), false);
  }
});
