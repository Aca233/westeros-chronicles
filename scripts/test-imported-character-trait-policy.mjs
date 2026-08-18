import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/data/importedCharacterTraitPolicy.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { IMPORTED_CHARACTER_TRAIT_POLICIES, filterImportedCharacterTraits } = await import(moduleUrl);

test('隐藏辅助修正保留在规则结果中但不进入可见特质', () => {
  const result = filterImportedCharacterTraits([
    'education_martial_3',
    'education_martial_prowess_3',
    'unknown',
  ], 35);
  assert.deepEqual(result.visibleTraitIds, ['education_martial_3']);
  assert.deepEqual(result.hiddenModifierIds, ['education_martial_prowess_3', 'unknown']);
  assert.deepEqual(result.statusTraitIds, []);
});

test('童年特质只在未满十六岁或年龄未知时显示', () => {
  assert.deepEqual(filterImportedCharacterTraits(['rowdy'], 15).visibleTraitIds, ['rowdy']);
  assert.deepEqual(filterImportedCharacterTraits(['rowdy'], undefined).visibleTraitIds, ['rowdy']);
  assert.deepEqual(filterImportedCharacterTraits(['rowdy'], 16).visibleTraitIds, []);
});

test('状态特质参与显示并单独输出，别名会归一化并去重', () => {
  const result = filterImportedCharacterTraits([
    'nightswatch_historical',
    'nightswatch',
    'lifestyle_hunter',
  ], 30);
  assert.deepEqual(result.visibleTraitIds, ['nightswatch', 'lifestyle_hunter']);
  assert.deepEqual(result.statusTraitIds, ['nightswatch']);
  assert.deepEqual(result.hiddenModifierIds, []);
});

test('策略表没有重复原始 ID 且四种呈现分类都有明确条目', () => {
  const ids = IMPORTED_CHARACTER_TRAIT_POLICIES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...new Set(IMPORTED_CHARACTER_TRAIT_POLICIES.map((entry) => entry.presentation))].sort(),
    ['childhood_only', 'display', 'hidden_modifier', 'status'],
  );
});
