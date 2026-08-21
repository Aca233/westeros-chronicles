import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/worldRuntimeState.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  cloneWorldRuntimeState,
  createWorldRuntimeState,
  validateWorldRuntimeState,
} = await import(moduleUrl);

test('世界运行时状态以稀疏空状态开始', () => {
  const state = createWorldRuntimeState();
  assert.deepEqual(state, {
    schemaVersion: 1,
    revision: 0,
    characters: {},
    titles: {},
    assets: {},
    events: [],
    pendingTransactions: [],
  });
  assert.doesNotThrow(() => validateWorldRuntimeState(state));
  assert.deepEqual(cloneWorldRuntimeState(state), state);
  assert.notEqual(cloneWorldRuntimeState(state), state);
});

test('世界运行时状态拒绝无效修订号和资产自包含', () => {
  const state = createWorldRuntimeState();
  assert.throws(
    () => validateWorldRuntimeState({ ...state, revision: -1 }),
    /世界状态修订号/,
  );
  assert.throws(
    () => validateWorldRuntimeState({
      ...state,
      assets: { sword: { kind: 'item', placement: { type: 'asset', assetId: 'sword' } } },
    }),
    /资产不能直接放入自身/,
  );
});

test('世界运行时状态拒绝重复 ID 和不一致的装备关系', () => {
  const state = createWorldRuntimeState();
  const event = {
    id: 'event:1',
    transactionId: 'transaction:1',
    turn: 1,
    date: { year: 298, month: 5, day: 10 },
    type: 'asset_transferred',
    actorIds: ['agot:Stark_3'],
    subjectRefs: [{ type: 'asset', assetId: 'ice' }],
    reason: '测试',
    source: 'system_rule',
    visibility: 'public',
  };
  assert.throws(
    () => validateWorldRuntimeState({ ...state, events: [event, event] }),
    /世界事件 ID 重复/,
  );
  assert.throws(
    () => validateWorldRuntimeState({
      ...state,
      assets: {
        ice: {
          kind: 'item',
          placement: { type: 'location', location: { locationId: 'b_winterfell' } },
          equippedPosition: { group: 'mainhand' },
        },
      },
    }),
    /已装备资产必须直接位于人物身上/,
  );
  assert.throws(
    () => validateWorldRuntimeState({
      ...state,
      assets: {
        ice: {
          kind: 'item',
          placement: { type: 'character', characterId: 'agot:Stark_3' },
          custodian: { type: 'character', characterId: 'agot:Snow_1' },
          equippedPosition: { group: 'mainhand' },
        },
      },
    }),
    /已装备资产的保管人与穿戴者不一致/,
  );
});
