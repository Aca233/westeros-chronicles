import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/worldEventIndex.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  buildWorldEventIndex,
  eventsForAsset,
  eventsForCharacter,
  eventsForLocation,
  eventsForTitle,
  validateWorldEventIndex,
} = await import(moduleUrl);

function eventFixture(overrides) {
  return {
    id: 'event',
    transactionId: 'transaction',
    turn: 1,
    date: { year: 298, month: 5, day: 10 },
    type: 'fixture',
    actorIds: [],
    subjectRefs: [],
    reason: '测试事件',
    source: 'system_rule',
    visibility: 'public',
    ...overrides,
  };
}

test('统一事件索引按人物、地点、资产和头衔查询并保持全局顺序', () => {
  const events = [
    eventFixture({
      id: 'e1',
      actorIds: ['agot:Stark_3'],
      subjectRefs: [
        { type: 'character', characterId: 'agot:Stark_3' },
        { type: 'asset', assetId: 'ice' },
      ],
      location: { locationId: 'b_winterfell' },
    }),
    eventFixture({ id: 'e2', subjectRefs: [{ type: 'title', titleId: 'c_winterfell' }] }),
  ];
  const index = buildWorldEventIndex(events);
  assert.deepEqual(eventsForCharacter(events, index, 'agot:Stark_3').map((event) => event.id), ['e1']);
  assert.deepEqual(eventsForAsset(events, index, 'ice').map((event) => event.id), ['e1']);
  assert.deepEqual(eventsForLocation(events, index, 'b_winterfell').map((event) => event.id), ['e1']);
  assert.deepEqual(eventsForTitle(events, index, 'c_winterfell').map((event) => event.id), ['e2']);
  assert.deepEqual(index.byCharacterId.get('agot:Stark_3'), ['e1'], '同一人物同时是行动者和主体时不能重复索引');
});

test('统一事件索引拒绝重复事件 ID 和悬空索引引用', () => {
  const event = eventFixture({ id: 'e1' });
  assert.throws(() => buildWorldEventIndex([event, event]), /世界事件 ID 重复/);
  assert.throws(() => validateWorldEventIndex([event], {
    byCharacterId: new Map([['agot:Stark_3', ['missing']]]),
    byLocationId: new Map(),
    byAssetId: new Map(),
    byTitleId: new Map(),
  }), /索引引用的世界事件不存在/);
});
