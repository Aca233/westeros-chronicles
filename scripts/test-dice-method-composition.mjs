import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/diceEngine.ts';",
      "export * from './src/features/items/catalog.ts';",
      "export * from './src/features/items/state.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'dice-method-composition-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { performD20Check, createItemCatalog, createEmptyItemSystem } = await import(url);

const catalog = createItemCatalog([]);
const items = createEmptyItemSystem();

test('CK3 原始点数按方法形成连续的主辅能力贡献', () => {
  const attributes = { diplomacy: 10, martial: 20, stewardship: 10, intrigue: 30, learning: 10, prowess: 10 };
  const check = performD20Check(
    '我设伏诱敌', attributes, items, catalog, [], 'martial', 16, 'battle', [], () => 0.45,
    { secondaryAttribute: 'intrigue', reason: '以军事安排伏击，以谋略隐藏布置。' },
  );
  assert.equal(check.roll, 10);
  assert.equal(check.primaryAttributeValue, 20);
  assert.equal(check.secondaryAttributeValue, 30);
  assert.equal(check.effectiveAttribute, 23);
  assert.equal(check.attributeModifier, 4.6);
  assert.equal(check.total, 14.6);
  assert.equal(check.methodReason, '以军事安排伏击，以谋略隐藏布置。');
});

test('单属性检定不被强制加入无关辅属性', () => {
  const attributes = { diplomacy: 10, martial: 20, stewardship: 10, intrigue: 30, learning: 10, prowess: 25 };
  const check = performD20Check(
    '我拔剑与敌方骑士决斗', attributes, items, catalog, [], 'prowess', 14, 'duel', [], () => 0.45,
    { secondaryAttribute: undefined },
  );
  assert.equal(check.secondaryAttribute, undefined);
  assert.equal(check.effectiveAttribute, 25);
  assert.equal(check.attributeModifier, 5);
  assert.equal(check.total, 15);
});
