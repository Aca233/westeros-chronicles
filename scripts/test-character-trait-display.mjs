import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/data/characterTraits.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { CHARACTER_TRAITS, migrateLordTraitData, resolveCharacterTraits } = await import(moduleUrl);

const presetBundle = await build({
  entryPoints: ['scripts/fixtures/living-world-test.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const presetModuleUrl = `data:text/javascript;base64,${Buffer.from(presetBundle.outputFiles[0].text).toString('base64')}`;
const livingWorldFixture = await import(presetModuleUrl);
await livingWorldFixture.ordinaryCatalogReady;
const { createLivingWorldTestLord } = livingWorldFixture;


test('正式特质 ID 能解析为带游戏图标和规则的游戏内特质', () => {
  const traits = resolveCharacterTraits(['honest', 'education_martial_3'], ['诚实', '优秀战术家']);
  assert.deepEqual(traits.map((trait) => trait.id), ['education_martial_3', 'honest']);
  assert.ok(traits.every((trait) => trait.icon.startsWith('trait-')));
  assert.ok(traits.every((trait) => trait.description.length > 0));
});

test('旧存档的纯文本特质继续显示且不会与正式特质重名', () => {
  const traits = resolveCharacterTraits(['honest'], ['诚实', '北境守护者']);
  assert.deepEqual(traits.map((trait) => trait.name), ['诚实', '北境守护者']);
  assert.equal(traits[1].isLegacy, true);
  assert.ok(traits[1].icon.startsWith('trait-'));
});


test('统一世界测试人物带有规则引擎能够识别的正式特质 ID', () => {
  const catalogIds = new Set(CHARACTER_TRAITS.map((trait) => trait.id));
  const lord = createLivingWorldTestLord();
  assert.ok(lord.traitIds?.length);
  assert.ok(lord.traitIds.every((traitId) => catalogIds.has(traitId)));
});


test('教育特质始终排在其他特质之前，其他特质保持原有顺序', () => {
  const traits = resolveCharacterTraits(['brave', 'beauty_good_3', 'education_martial_2', 'honest'], []);
  assert.deepEqual(traits.map((trait) => trait.id), ['education_martial_2', 'brave', 'beauty_good_3', 'honest']);
});

test('测试人物保存基础属性并可由规则引擎解析', () => {
  const lord = createLivingWorldTestLord();
  assert.ok(lord.baseAttributes);
  assert.ok(lord.traitIds.every((traitId) => CHARACTER_TRAITS.some((trait) => trait.id === traitId)));
});


test('旧预设存档能补出正式特质 ID 并只结算一次属性加成', () => {
  const oldLord = {
    attributes: { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 },
    traits: ['刚正不阿', '战场老将'],
  };
  const migrated = migrateLordTraitData(oldLord);
  assert.deepEqual(migrated.traitIds, ['honest', 'education_martial_3']);
  assert.deepEqual(migrated.baseAttributes, oldLord.attributes);
  assert.deepEqual(migrateLordTraitData(migrated).attributes, migrated.attributes);
});

test('已有正式 ID 但没有基础值的旧自建角色不会重复获得属性加成', () => {
  const oldCustomLord = {
    attributes: { diplomacy: 15, martial: 15, stewardship: 15, intrigue: 15, learning: 15, prowess: 15 },
    traits: ['勇敢'],
    traitIds: ['brave'],
  };
  const migrated = migrateLordTraitData(oldCustomLord);
  assert.deepEqual(migrated.attributes, oldCustomLord.attributes);
  assert.equal(migrated.baseAttributes, undefined);
});
