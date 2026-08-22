import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const bundle = await build({
  stdin: {
    contents: "export * from './src/features/debug/debugSettings.ts'; export * from './src/features/debug/modelRequestTrace.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'debug-settings-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  DEBUG_SETTING_STORAGE_KEY,
  readDebugEnabled,
  writeDebugEnabled,
  buildModelRequestTrace,
  modelRequestTraceContainsSecret,
} = await import(url);

test('debug 开关默认关闭，并写入独立 localStorage 键', () => {
  assert.equal(DEBUG_SETTING_STORAGE_KEY, 'westeros-debug');
  assert.equal(readDebugEnabled(), false);
  writeDebugEnabled(true);
  assert.equal(store.get(DEBUG_SETTING_STORAGE_KEY), '1');
  assert.equal(readDebugEnabled(), true);
  writeDebugEnabled(false);
  assert.equal(store.has(DEBUG_SETTING_STORAGE_KEY), false);
  assert.equal(readDebugEnabled(), false);
});

test('模型请求追踪不含密钥，并保留解析与叙事两套消息', () => {
  const secret = 'sk-test-secret';
  const trace = buildModelRequestTrace({
    turnNumber: 2,
    offline: true,
    provider: 'deepseek',
    model: 'deepseek-chat',
    contextError: '地图资料未能载入',
    worldContext: {
      automatic: '自动切片',
      committed: '结算切片',
      resolutionPrompt: '解析上下文',
      narrationPrompt: '叙事上下文',
    },
    resolutionMessages: [{ role: 'system', content: '规则解析' }, { role: 'user', content: '当前行动' }],
    narrationMessages: [{ role: 'system', content: '已结算叙事' }, { role: 'user', content: '写正文' }],
  });
  assert.equal(trace.offline, true);
  assert.equal(trace.resolution.messages[0].content, '规则解析');
  assert.equal(trace.narration.messages[0].content, '已结算叙事');
  assert.equal(trace.resolution.chars, '规则解析'.length + '当前行动'.length);
  assert.equal(modelRequestTraceContainsSecret(trace, secret), false);
  assert.equal(JSON.stringify(trace).includes('apiKey'), false);
});

test('源码不以 URL 打开 debug，也不把 debug 写入存档形状', async () => {
  const files = [
    'src/features/debug/debugSettings.ts',
    'src/store/useGameStore.ts',
    'src/components/SettingsModal.tsx',
    'src/features/debug/DebugOverlay.tsx',
    'src/types/game.ts',
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /URLSearchParams|location\.search|window\.location/, `${file} 不得用 URL 打开 debug`);
  }
  const gameTypes = await readFile('src/types/game.ts', 'utf8');
  assert.doesNotMatch(gameTypes, /debugEnabled|lastModelRequestTrace|westeros-debug/);
  const storeSource = await readFile('src/store/useGameStore.ts', 'utf8');
  assert.match(storeSource, /debugEnabled: readDebugEnabled\(\)/);
  assert.match(storeSource, /captureTrace\(buildModelRequestTrace/);
  assert.match(storeSource, /if \(get\(\)\.debugEnabled\) set\(\{ lastModelRequestTrace: trace \}\)/);
});
