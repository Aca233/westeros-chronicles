import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/worldTransactionQueue.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  cancelWorldTransaction,
  enqueueWorldTransaction,
  itemActionToWorldIntent,
  settleWorldTransactionStatus,
  travelCommandToWorldIntent,
} = await import(moduleUrl);

const actorId = 'agot:1001';
const equipTx = {
  id: 'tx:equip:sword',
  status: 'pending',
  source: 'ui_action',
  conflictKeys: ['asset:item:sword', 'equipment:agot:1001:mainhand'],
  intents: [{
    kind: 'equip_asset',
    actorId,
    assetId: 'item:sword',
    position: { group: 'mainhand' },
    evidenceText: '穿上长剑',
  }],
};
const unequipSameAssetTx = {
  id: 'tx:unequip:sword',
  status: 'pending',
  source: 'ui_action',
  conflictKeys: ['asset:item:sword', 'equipment:agot:1001:mainhand'],
  intents: [{
    kind: 'unequip_asset',
    actorId,
    assetId: 'item:sword',
    placement: { type: 'character', characterId: actorId },
    evidenceText: '卸下长剑',
  }],
};

test('待处理事务按冲突键替换并只能在待处理时取消', () => {
  const queued = enqueueWorldTransaction([], equipTx);
  assert.equal(queued[0].status, 'pending');

  const replaced = enqueueWorldTransaction(queued, unequipSameAssetTx);
  assert.deepEqual(replaced.map((entry) => entry.id), [unequipSameAssetTx.id]);

  const cancelled = cancelWorldTransaction(replaced, unequipSameAssetTx.id);
  assert.equal(cancelled[0].status, 'cancelled');
  assert.equal(cancelled[0].rejectionReason, undefined);
  assert.throws(
    () => cancelWorldTransaction(cancelled, unequipSameAssetTx.id),
    /只能取消待处理事务/,
  );
});

test('新事务不替换已结算历史，且状态结算不可二次修改', () => {
  const committed = settleWorldTransactionStatus([equipTx], equipTx.id, 'committed');
  const queued = enqueueWorldTransaction(committed, unequipSameAssetTx);
  assert.deepEqual(queued.map((entry) => entry.status), ['committed', 'pending']);
  assert.throws(
    () => settleWorldTransactionStatus(queued, equipTx.id, 'rejected', '后来失败'),
    /只能结算待处理事务/,
  );

  const rejected = settleWorldTransactionStatus(queued, unequipSameAssetTx.id, 'rejected', '资产不在直接保管范围');
  assert.equal(rejected[1].status, 'rejected');
  assert.equal(rejected[1].rejectionReason, '资产不在直接保管范围');
});

test('物品动作转换为统一资产意图并生成稳定冲突键', () => {
  const converted = itemActionToWorldIntent({
    kind: 'equip',
    instanceId: 'sword',
    position: { group: 'mainhand' },
    displacedTo: { type: 'carried' },
  }, actorId, '穿上长剑');

  assert.deepEqual(converted.conflictKeys, [
    'asset:item:sword',
    'equipment:agot:1001:mainhand',
  ]);
  assert.equal(converted.intents[0].kind, 'equip_asset');
  assert.equal(converted.intents[0].assetId, 'item:sword');
  assert.equal(converted.itemCommands[0].type, 'ITEM_EQUIP');
});

test('旅行命令转换为人物旅程意图并保留命令负载', () => {
  const routePlan = {
    ok: true,
    from: 'winterfell',
    to: 'kings_landing',
    totalDays: 20,
    legs: [],
  };
  const converted = travelCommandToWorldIntent({
    type: 'START_TRAVEL',
    routePlan,
    companions: [],
    vehicleIds: [],
  }, actorId, '启程前往君临');

  assert.deepEqual(converted.conflictKeys, ['journey:agot:1001']);
  assert.equal(converted.intents[0].kind, 'start_travel');
  assert.deepEqual(converted.intents[0].targetRef, {
    type: 'location',
    location: { locationId: 'kings_landing' },
  });
  assert.equal(converted.travelCommands[0].type, 'START_TRAVEL');
});
