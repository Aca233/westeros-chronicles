import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldBaseline.ts';",
      "export * from './src/features/world/worldRuntimeState.ts';",
      "export * from './src/features/world/worldTransactions.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-transactions-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { commitWorldTransaction, createWorldBaselineSnapshot, createWorldRuntimeState, siteAccessEventDrafts } = await import(url);

const baseline = createWorldBaselineSnapshot({
  characters: [
    { id: 'agot:Stark_3', alive: true, location: { locationId: 'b_winterfell' } },
    { id: 'agot:Stark_7', alive: true, location: { locationId: 'b_winterfell' } },
  ],
  titles: [{ id: 'c_winterfell', lawfulHolderId: 'agot:Stark_3', controllerId: 'agot:Stark_3', contestedByIds: [] }],
  assets: [
    { id: 'ice', kind: 'item', lawfulOwner: { type: 'character', characterId: 'agot:Stark_3' }, controller: { type: 'character', characterId: 'agot:Stark_3' }, custodian: { type: 'character', characterId: 'agot:Stark_3' }, placement: { type: 'character', characterId: 'agot:Stark_3' }, equippedPosition: null, status: 'normal' },
    { id: 'wagon', kind: 'vehicle', lawfulOwner: { type: 'character', characterId: 'agot:Stark_3' }, controller: { type: 'character', characterId: 'agot:Stark_3' }, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' },
  ],
  knownLocationIds: ['b_winterfell'],
});

function inputState() {
  return {
    runtime: createWorldRuntimeState(),
    items: { schemaVersion: 1, instances: {}, placements: {}, sites: {}, vehicles: {} },
    date: { year: 298, month: 5, day: 10 },
  };
}

function giftTransaction(overrides = {}) {
  return {
    id: 'tx:gift-ice',
    turn: 2,
    source: 'player_input',
    reason: '艾德正式把寒冰赠予琼恩',
    intents: [],
    mutations: [
      { type: 'asset.set-lawful-owner', assetId: 'ice', owner: { type: 'character', characterId: 'agot:Stark_7' } },
      { type: 'asset.set-custodian', assetId: 'ice', custodian: { type: 'character', characterId: 'agot:Stark_7' } },
      { type: 'asset.place', assetId: 'ice', placement: { type: 'character', characterId: 'agot:Stark_7' } },
    ],
    eventDrafts: [{
      type: 'asset.gifted',
      actorIds: ['agot:Stark_3', 'agot:Stark_7'],
      subjectRefs: [{ type: 'asset', assetId: 'ice' }],
      location: { locationId: 'b_winterfell' },
      reason: '寒冰的法理所有权、保管和位置一并转移。',
      visibility: 'public',
    }],
    ...overrides,
  };
}

test('事务只递增一次修订号并可幂等重放', () => {
  const input = inputState();
  const transaction = giftTransaction();
  const first = commitWorldTransaction(input, baseline, transaction);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.state.runtime.revision, 1);
  assert.equal(first.state.runtime.events[0].transactionId, 'tx:gift-ice');
  assert.deepEqual(first.state.runtime.assets.ice.lawfulOwner, { type: 'character', characterId: 'agot:Stark_7' });
  assert.deepEqual(first.state.runtime.assets.ice.placement, { type: 'character', characterId: 'agot:Stark_7' });

  const second = commitWorldTransaction(first.state, baseline, transaction);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.state, first.state);
  assert.equal(second.state.runtime.revision, 1);
  assert.equal(second.state.runtime.events.length, 1);
});

test('未知资产和最终容器循环会原子拒绝并返回原引用', () => {
  const input = inputState();
  const unknown = commitWorldTransaction(input, baseline, giftTransaction({
    id: 'tx:unknown',
    mutations: [{ type: 'asset.place', assetId: 'missing', placement: null }],
  }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.state, input);
  assert.equal(input.runtime.revision, 0);

  const cyclic = commitWorldTransaction(input, baseline, giftTransaction({
    id: 'tx:cycle',
    mutations: [
      { type: 'asset.place', assetId: 'ice', placement: { type: 'asset', assetId: 'wagon' } },
      { type: 'asset.place', assetId: 'wagon', placement: { type: 'asset', assetId: 'ice' } },
    ],
  }));
  assert.equal(cyclic.ok, false);
  assert.match(cyclic.reason, /资产容器形成循环/);
  assert.equal(cyclic.state, input);
  assert.deepEqual(input.runtime.assets, {});
});

test('人物、头衔、装备和日期变更在同一事务中提交', () => {
  const result = commitWorldTransaction(inputState(), baseline, giftTransaction({
    id: 'tx:combined',
    mutations: [
      { type: 'character.move', characterId: 'agot:Stark_7', location: { locationId: 'b_winterfell', sceneLocation: '神木林' }, activity: 'idle' },
      { type: 'title.set-holder', titleId: 'c_winterfell', holderId: 'agot:Stark_7' },
      { type: 'asset.equip', assetId: 'ice', characterId: 'agot:Stark_7', position: { group: 'mainhand' } },
    ],
    dateAdvance: { days: 2 },
  }));
  assert.equal(result.ok, true, 'reason=' + (result.ok === false ? result.reason : ''));
  assert.deepEqual(result.state.date, { year: 298, month: 5, day: 12 });
  assert.deepEqual(result.state.runtime.characters['agot:Stark_7'].location, { locationId: 'b_winterfell', sceneLocation: '神木林' });
  assert.equal(result.state.runtime.titles.c_winterfell.lawfulHolderId, 'agot:Stark_7');
  assert.deepEqual(result.state.runtime.assets.ice.equippedPosition, { group: 'mainhand' });
  assert.deepEqual(result.state.runtime.assets.ice.custodian, { type: 'character', characterId: 'agot:Stark_7' });
});


test('建站事务把站点写入物品系统并以带前缀资产镜像', () => {
  const state = inputState();
  const transaction = giftTransaction({
    id: 'tx:create-site',
    siteCreations: [{
      id: 'turn2_site_0', name: '辎重帐', type: 'camp',
      location: { locationId: 'b_winterfell' }, locationLabel: '临冬城',
      description: '本回合经行动确立的储藏处。', capacity: 20,
    }],
  });
  const result = commitWorldTransaction(state, baseline, transaction);
  assert.equal(result.ok, true);
  assert.ok(result.state.items.sites['turn2_site_0']);
  assert.equal(result.state.runtime.revision, 1);
  const duplicate = commitWorldTransaction(result.state, baseline, transaction);
  assert.equal(duplicate.duplicate, true);
});

test('越权取用产生 site.access 事件，本人控制或无主据点不产生', () => {
  const siteBaseline = createWorldBaselineSnapshot({
    characters: [
      { id: 'agot:Stark_3', alive: true, location: { locationId: 'b_winterfell' } },
      { id: 'agot:Bolton_1', alive: true, location: { locationId: 'b_winterfell' } },
    ],
    titles: [{ id: 'b_winterfell', lawfulHolderId: 'agot:Stark_3', controllerId: 'agot:Stark_3', contestedByIds: [] }],
    assets: [{
      id: 'site:castle_cache', kind: 'site', lawfulOwner: null, controller: null, custodian: null,
      placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal',
    }],
    knownLocationIds: ['b_winterfell'],
  });
  const runtime = createWorldRuntimeState();
  const violations = siteAccessEventDrafts([{ instanceId: 'item_x', siteId: 'castle_cache' }], 'agot:Bolton_1', siteBaseline, runtime);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'site.access');
  assert.equal(violations[0].visibility, 'public');

  const byController = siteAccessEventDrafts([{ instanceId: 'item_x', siteId: 'castle_cache' }], 'agot:Stark_3', siteBaseline, runtime);
  assert.equal(byController.length, 0);
});
