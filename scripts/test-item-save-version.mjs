import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/items/saveVersion.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { ITEM_SAVE_FORMAT_VERSION, assertSupportedGameState, assertSupportedSaveEnvelope, isCompatibleTurnBaseline, repairKnownTurnRevisionDrift } = await import(moduleUrl);
const [dbSource, storeSource, settingsSource, livingWorldSource, creatorSource, appSource, loadScreenSource] = await Promise.all([
  readFile('src/services/db.ts', 'utf8'),
  readFile('src/store/useGameStore.ts', 'utf8'),
  readFile('src/components/SettingsModal.tsx', 'utf8'),
  readFile('src/features/world/createLivingWorldGame.ts', 'utf8'),
  readFile('src/components/CharacterCreator.tsx', 'utf8'),
  readFile('src/App.tsx', 'utf8'),
  readFile('src/components/menu/LoadGameScreen.tsx', 'utf8'),
]);

const emptyWorldRuntime = () => ({ schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] });

test('物品存档格式固定为版本 9 并明确拒绝版本 8', () => {
  assert.equal(ITEM_SAVE_FORMAT_VERSION, 9);
  assert.throws(() => assertSupportedSaveEnvelope({ version: 5, snapshots: [] }), /测试版存档格式已更新.*重置/);
  assert.throws(() => assertSupportedSaveEnvelope({ version: 6, snapshots: [] }), /测试版存档格式已更新.*重置/);
  assert.throws(() => assertSupportedSaveEnvelope({ version: 7, snapshots: [] }), /测试版存档格式已更新.*重置/);
  assert.throws(() => assertSupportedSaveEnvelope({ version: 8, snapshots: [] }), /测试版存档格式已更新.*重置/);
  assert.doesNotThrow(() => assertSupportedSaveEnvelope({ version: 9, snapshots: [] }));
  assert.throws(() => assertSupportedGameState({ saveFormatVersion: 5 }), /测试版存档格式已更新.*重置/);
  assert.throws(() => assertSupportedGameState({ saveFormatVersion: 6, lord: { items: { schemaVersion: 1 } } }), /重置/);
  assert.doesNotThrow(() => assertSupportedGameState({ saveFormatVersion: 9, lord: { location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', items: { schemaVersion: 1, sites: {}, vehicles: {} } }, worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] }, worldRuntime: emptyWorldRuntime() }));
  assert.throws(() => assertSupportedGameState({ saveFormatVersion: 9, lord: { location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', items: { schemaVersion: 1, sites: {}, vehicles: {} } }, activeJourney: { status: 'travelling', currentLeg: -1 }, worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] }, worldRuntime: emptyWorldRuntime() }), /重置/);
});


test('旧测试快照会在叙事开始前被识别并重建当前回合基线', () => {
  const currentState = {
    saveFormatVersion: 9,
    turnCount: 1,
    lord: { location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', items: { schemaVersion: 1, sites: {}, vehicles: {} } },
    worldCharacters: { runId: 'run-current', datasetHash: 'dataset', revision: 0 },
    worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
    worldRuntime: emptyWorldRuntime(),
  };
  const matching = { formatVersion: 9, turnNumber: 1, gameState: currentState };
  assert.equal(isCompatibleTurnBaseline(matching, currentState), true);
  assert.equal(isCompatibleTurnBaseline({ ...matching, formatVersion: 8 }, currentState), false);
  assert.equal(isCompatibleTurnBaseline({ ...matching, gameState: { ...currentState, worldCharacters: { ...currentState.worldCharacters, runId: 'run-old' } } }, currentState), false);
  assert.match(dbSource, /export async function ensureTurnSnapshotBaseline/);
  assert.match(dbSource, /await purgeSlotChain\(slotId\)/);
  const preflightIndex = storeSource.indexOf('await ensureTurnSnapshotBaseline(activeSlotId, gameState)');
  const narrationIndex = storeSource.indexOf('requestTurnResolution(');
  assert.ok(preflightIndex >= 0, '提交行动前应准备当前回合存档基线');
  assert.ok(narrationIndex > preflightIndex, '存档基线必须在请求叙事前完成');
});

test('当前版本因旧回合计数缺陷产生的修订漂移会在叙事前就地修正', () => {
  const broken = {
    saveFormatVersion: 9,
    turnCount: 2,
    turns: [{}, {}],
    worldCharacters: { runId: 'run-current', datasetHash: 'dataset', revision: 1 },
    worldHistory: { turns: [{}] },
    worldRuntime: { revision: 0 },
  };
  const repaired = repairKnownTurnRevisionDrift(broken);
  assert.notEqual(repaired, broken);
  assert.equal(repaired.worldRuntime.revision, 1);
  assert.equal(repaired.worldCharacters.revision, 1);
  assert.equal(repairKnownTurnRevisionDrift(repaired), repaired);

  const futureRevision = {
    ...broken,
    worldRuntime: { revision: 2 },
  };
  assert.equal(repairKnownTurnRevisionDrift(futureRevision), futureRevision);
});

test('数据库不迁移旧物品并在事务前校验版本', () => {
  assert.equal(dbSource.includes('ensureItemCustody'), false);
  assert.match(dbSource, /assertSupportedSaveEnvelope\(parsed\)/);
  assert.match(dbSource, /assertSupportedGameState\(gameState\)/);
  assert.match(dbSource, /version: ITEM_SAVE_FORMAT_VERSION/);
  assert.match(dbSource, /formatVersion: ITEM_SAVE_FORMAT_VERSION/);
});

test('所有新游戏入口通过统一世界工厂提供物品状态', () => {
  assert.match(livingWorldSource, /createLordFromExistingCharacter/);
  assert.match(livingWorldSource, /worldArtifacts: structuredClone\(artifacts\)/);
  assert.match(creatorSource, /const customItems = createCustomRulerItemState\(\)/);
  assert.match(creatorSource, /items: customItems/);
  assert.match(creatorSource, /createCustomLivingWorldGame/);
});

test('存档重置与存档管理入口收敛到主菜单且不依赖刷新页面', () => {
  assert.doesNotMatch(settingsSource, /exportSaveData|importSaveData/);
  assert.match(settingsSource, /读取存档/);
  assert.match(appSource, /resetStoredGame\(\)/);
  assert.match(loadScreenSource, /deleteSlot\(/);
  assert.doesNotMatch(settingsSource, /window\.location\.reload\(\)/);
  assert.doesNotMatch(loadScreenSource, /window\.location\.reload\(\)/);
});
