import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LEGACY_UNIQUE_LEAVES,
  STRUCTURE_GUARDS,
  VERIFICATION_SUITES,
  getVerificationSuite,
  validateVerificationSuites,
} from './verify/suites.mjs';
import { runVerificationSuite } from './verify/run-suite.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function scriptsFor(name) {
  return VERIFICATION_SUITES[name].map((step) => step.script);
}

test('所有验证套件只引用存在的单项 script，且各自无重复', () => {
  assert.doesNotThrow(() => validateVerificationSuites(packageJson.scripts));
  for (const suite of Object.values(VERIFICATION_SUITES)) {
    const scripts = suite.map((step) => step.script);
    assert.equal(new Set(scripts).size, scripts.length);
    assert.equal(scripts.some((script) => script.startsWith('verify:')), false);
  }
});

test('迁移后的套件按原顺序保留全部唯一叶子任务', () => {
  for (const name of ['quick', 'world', 'map', 'full']) {
    const current = scriptsFor(name);
    assert.deepEqual(
      current.filter((script) => LEGACY_UNIQUE_LEAVES[name].includes(script)),
      LEGACY_UNIQUE_LEAVES[name],
    );
  }
  assert.deepEqual(
    scriptsFor('full').filter((script) => !LEGACY_UNIQUE_LEAVES.full.includes(script)),
    STRUCTURE_GUARDS,
  );
});

test('旧 full 基线只有 115 个唯一叶子任务且不重复装备队列别名', () => {
  assert.equal(LEGACY_UNIQUE_LEAVES.full.length, 115);
  assert.equal(new Set(LEGACY_UNIQUE_LEAVES.full).size, 115);
  assert.equal(LEGACY_UNIQUE_LEAVES.full.filter((script) => script === 'test:item-action-queue').length, 1);
  assert.equal(LEGACY_UNIQUE_LEAVES.full.includes('test:equipment-queue'), false);
});

test('runner 串行执行并在首个失败处保留退出码', async () => {
  const calls = [];
  const result = await runVerificationSuite('quick', {
    packageScripts: packageJson.scripts,
    logger: { log() {}, error() {} },
    execute: async (script) => {
      calls.push(script);
      return script === VERIFICATION_SUITES.quick[1].script ? 17 : 0;
    },
  });
  assert.equal(result, 17);
  assert.deepEqual(calls, VERIFICATION_SUITES.quick.slice(0, 2).map((step) => step.script));
});

test('runner 拒绝未知套件', async () => {
  assert.throws(() => getVerificationSuite('missing'), /未知验证套件/);
  await assert.rejects(
    runVerificationSuite('missing', {
      packageScripts: packageJson.scripts,
      logger: { log() {}, error() {} },
      execute: async () => 0,
    }),
    /未知验证套件/,
  );
});
