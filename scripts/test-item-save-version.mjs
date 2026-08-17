import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/items/saveVersion.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { ITEM_SAVE_FORMAT_VERSION, assertSupportedGameState, assertSupportedSaveEnvelope } = await import(moduleUrl);
const [dbSource, settingsSource, presetsSource, creatorSource] = await Promise.all([
  readFile('src/services/db.ts', 'utf8'),
  readFile('src/components/SettingsModal.tsx', 'utf8'),
  readFile('src/data/presets.ts', 'utf8'),
  readFile('src/components/CharacterCreator.tsx', 'utf8'),
]);

test('物品存档格式固定为版本 4 并明确拒绝旧版本', () => {
  assert.equal(ITEM_SAVE_FORMAT_VERSION, 4);
  assert.throws(() => assertSupportedSaveEnvelope({ version: 3, snapshots: [] }), /测试版存档格式已更新.*重置/);
  assert.doesNotThrow(() => assertSupportedSaveEnvelope({ version: 4, snapshots: [] }));
  assert.throws(() => assertSupportedGameState({ saveFormatVersion: 3 }), /测试版存档格式已更新.*重置/);
  assert.doesNotThrow(() => assertSupportedGameState({ saveFormatVersion: 4, lord: { items: { schemaVersion: 1 } } }));
});

test('数据库不迁移旧物品并在事务前校验版本', () => {
  assert.equal(dbSource.includes('ensureItemCustody'), false);
  assert.match(dbSource, /assertSupportedSaveEnvelope\(parsed\)/);
  assert.match(dbSource, /assertSupportedGameState\(gameState\)/);
  assert.match(dbSource, /version: ITEM_SAVE_FORMAT_VERSION/);
  assert.match(dbSource, /formatVersion: ITEM_SAVE_FORMAT_VERSION/);
});

test('所有新游戏入口直接提供新物品状态', () => {
  assert.match(presetsSource, /items: createNedItemState\(\)/);
  assert.match(presetsSource, /items: createJonItemState\(\)/);
  assert.match(presetsSource, /items: createDaenerysItemState\(\)/);
  assert.match(creatorSource, /const customItems = createCustomRulerItemState\(\)/);
  assert.match(creatorSource, /items: customItems/);
});

test('设置界面提供显式测试存档重置且成功清除后才刷新', () => {
  assert.match(settingsSource, /重置测试存档/);
  assert.match(settingsSource, /await clearSaveData\(\)/);
  assert.match(settingsSource, /window\.location\.reload\(\)/);
});
