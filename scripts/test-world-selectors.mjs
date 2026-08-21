import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldSelectors.ts';",
      "export * from './src/features/world/worldBaseline.ts';",
      "export * from './src/features/world/worldRuntimeState.ts';",
      "export * from './src/features/world/worldEventIndex.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'world-selectors-runtime.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  buildWorldEventIndex,
  createWorldBaselineSnapshot,
  createWorldRuntimeState,
  selectActualEquipment,
  selectCharacterAssetGroups,
  selectCharacterWorldView,
  selectWorldAssetView,
} = await import(url);

const CHARACTER = 'agot:Stark_3';
const OTHER = 'agot:Bolton_4';
const characterRef = { type: 'character', characterId: CHARACTER };
const otherRef = { type: 'character', characterId: OTHER };
const baseline = createWorldBaselineSnapshot({
  characters: [
    { id: CHARACTER, alive: true, location: { locationId: 'b_winterfell', sceneLocation: '大厅' }, currentActivity: 'idle' },
    { id: OTHER, alive: true, location: { locationId: 'b_dreadfort' }, currentActivity: 'idle' },
  ],
  titles: [{ id: 'c_winterfell', lawfulHolderId: CHARACTER, controllerId: CHARACTER, contestedByIds: [] }],
  assets: [
    { id: 'item:sword', kind: 'item', lawfulOwner: characterRef, controller: characterRef, custodian: characterRef, placement: characterRef, equippedPosition: { group: 'mainhand' }, status: 'normal' },
    { id: 'item:book', kind: 'item', lawfulOwner: characterRef, controller: characterRef, custodian: characterRef, placement: characterRef, equippedPosition: null, status: 'normal' },
    { id: 'site:castle', kind: 'site', lawfulOwner: characterRef, controller: characterRef, custodian: null, placement: { type: 'location', location: { locationId: 'b_dreadfort' } }, equippedPosition: null, status: 'normal' },
    { id: 'site:warehouse', kind: 'site', lawfulOwner: otherRef, controller: characterRef, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'contested' },
    { id: 'vehicle:wagon', kind: 'vehicle', lawfulOwner: characterRef, controller: characterRef, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' },
  ],
  knownLocationIds: ['b_winterfell', 'b_dreadfort'],
});
const runtime = createWorldRuntimeState();
runtime.events.push({
  id: 'event:1', transactionId: 'tx:1', turn: 1, date: { year: 298, month: 1, day: 1 },
  type: 'asset.transferred', actorIds: [CHARACTER], subjectRefs: [{ type: 'asset', assetId: 'item:book' }],
  reason: '把书交给艾德', source: 'system_rule', visibility: 'public',
});
const eventIndex = buildWorldEventIndex(runtime.events);
const context = { baseline, runtime, eventIndex };
const ids = (assets) => assets.map((asset) => asset.id);

test('人物资产按真实关系精确分组，实际装备不会重复成为携带物', () => {
  const groups = selectCharacterAssetGroups(CHARACTER, context);
  assert.deepEqual(ids(groups.equipment), ['item:sword']);
  assert.deepEqual(ids(groups.carried), ['item:book']);
  assert.deepEqual(ids(groups.ownedElsewhere), ['site:castle']);
  assert.deepEqual(ids(groups.controlled), ['site:warehouse']);
  assert.deepEqual(ids(groups.vehicles), ['vehicle:wagon']);
  assert.equal(groups.carried.some((asset) => asset.id === 'item:sword'), false);
  assert.equal(groups.equipment.some((asset) => asset.id === 'site:castle'), false);
  assert.deepEqual(ids(selectActualEquipment(CHARACTER, context)), ['item:sword']);
});

test('人物世界视图合并地点、活动、法理头衔、资产和关联事件', () => {
  const view = selectCharacterWorldView(CHARACTER, context);
  assert.deepEqual(view.location, { locationId: 'b_winterfell', sceneLocation: '大厅' });
  assert.equal(view.activity, 'idle');
  assert.deepEqual(view.titleIds, ['c_winterfell']);
  assert.deepEqual(ids(view.assetGroups.equipment), ['item:sword']);
  assert.deepEqual(view.events.map((event) => event.id), ['event:1']);
  assert.strictEqual(selectCharacterWorldView(CHARACTER, context), view, '相同 revision 与人物应命中缓存');
});

test('资产视图解析容器位置和关联事件，并返回只读投影', () => {
  const asset = selectWorldAssetView('item:book', context);
  assert.ok(asset);
  assert.equal(asset.asset.id, 'item:book');
  assert.deepEqual(asset.location, { locationId: 'b_winterfell', sceneLocation: '大厅' });
  assert.deepEqual(asset.events.map((event) => event.id), ['event:1']);
  assert.equal(Object.isFrozen(asset.events), true);
  assert.equal(Object.isFrozen(selectCharacterAssetGroups(CHARACTER, context).equipment), true);
});
