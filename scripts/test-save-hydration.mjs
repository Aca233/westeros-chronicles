import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const dexieStub = `
export default class Dexie {
  constructor() {}
  version() { return { stores: () => undefined }; }
  table() { return {}; }
}
export class Table {}
`;

const result = await build({
  entryPoints: ['src/services/db.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'stub-dexie',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^dexie$/ }, () => ({ path: 'dexie', namespace: 'stub' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: dexieStub, loader: 'js' }));
    },
  }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
const { gameStateFromSnapshot } = await import(moduleUrl);

const validState = {
  saveFormatVersion: 9,
  currentYear: 298,
  currentMonth: 5,
  currentDay: 10,
  currentSeason: '晚春',
  turnCount: 1,
  lord: {
    location: { locationId: 'b_winterfell' },
    locationLabel: '临冬城',
    items: { schemaVersion: 1, instances: {}, placements: {}, equipment: {}, sites: {}, vehicles: {} },
  },
  turns: [{ id: 'turn_1', turnNumber: 1, playerInput: '开局', narrate: '正文', branches: [], timestamp: 1 }],
  worldArtifacts: { schemaVersion: 1, datasetHash: 'hash', startDate: '8298.1.1', artifacts: {} },
  worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
  worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
  worldFlags: {},
  isGameOver: false,
};

const validSnapshot = { formatVersion: 9, turnNumber: 1, timestamp: 1, gameState: validState };

test('有效的最近快照会返回独立游戏状态副本', () => {
  const restored = gameStateFromSnapshot(validSnapshot);
  assert.deepEqual(restored, validState);
  assert.notEqual(restored, validState);
  restored.currentDay = 11;
  assert.equal(validState.currentDay, 10);
});

test('损坏或旧版本快照被拒绝，恢复函数不承担清空数据库的副作用', () => {
  assert.throws(() => gameStateFromSnapshot({ ...validSnapshot, formatVersion: 8 }), /重置/);
  assert.throws(() => gameStateFromSnapshot({ ...validSnapshot, turnNumber: 2 }), /快照回合号与游戏状态不一致/);
});

test('应用启动和存档导入都通过 Store 恢复状态而不是刷新页面', async () => {
  const [storeSource, appSource, settingsSource, dbSource] = await Promise.all([
    readFile('src/store/useGameStore.ts', 'utf8'),
    readFile('src/App.tsx', 'utf8'),
    readFile('src/components/SettingsModal.tsx', 'utf8'),
    readFile('src/services/db.ts', 'utf8'),
  ]);
  assert.match(dbSource, /export async function loadLatestGameState/);
  assert.match(storeSource, /hydrateGameState:/);
  assert.match(storeSource, /replaceGameState:/);
  assert.match(appSource, /hydrateGameState\(\)/);
  assert.doesNotMatch(settingsSource.slice(settingsSource.indexOf('const handleImportSave'), settingsSource.indexOf('const handleResetTestSave')), /window\.location\.reload/);
  assert.match(settingsSource, /replaceGameState\(loaded\)/);
});
