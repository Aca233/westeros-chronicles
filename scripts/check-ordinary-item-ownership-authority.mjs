import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const legacyField = ['lawful', 'ControllerId'].join('');
const ordinaryItemFiles = [
  'src/features/items/types.ts',
  'src/features/items/actions.ts',
  'src/features/items/viewModel.ts',
  'src/data/itemPresetState.ts',
  'scripts/test-item-actions.mjs',
  'scripts/test-item-view-model.mjs',
];

const violations = [];
for (const file of ordinaryItemFiles) {
  const source = await readFile(file, 'utf8');
  if (source.includes(legacyField)) violations.push(file);
}
assert.deepEqual(
  violations,
  [],
  `普通物品不得保存旧归属字段；违规文件：${violations.join(', ')}`,
);

const worldArtifactSource = await readFile('src/features/items/worldArtifacts.ts', 'utf8');
assert.equal(
  worldArtifactSource.includes(legacyField),
  true,
  '世界神器导入记录的原始归属字段必须保留',
);

console.log('普通物品归属权威边界检查通过');
