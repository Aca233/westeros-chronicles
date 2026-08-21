import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldBaseline.ts';",
      "export * from './src/features/world/worldProjection.ts';",
      "export * from './src/features/world/worldRuntimeState.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-projection-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  WorldBaselineRepository,
  createWorldBaselineSnapshot,
  createWorldRuntimeState,
  projectWorldAsset,
  projectWorldCharacter,
  projectWorldTitle,
  resolveAssetMapLocation,
} = await import(moduleUrl);

function fixtureBaseline() {
  return createWorldBaselineSnapshot({
    characters: [{ id: 'agot:Stark_3', alive: true, location: { locationId: 'b_winterfell' } }],
    titles: [{ id: 'c_winterfell', lawfulHolderId: 'agot:Stark_3', controllerId: 'agot:Stark_3', contestedByIds: [] }],
    assets: [
      { id: 'wagon', kind: 'vehicle', lawfulOwner: null, controller: null, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' },
      { id: 'sword', kind: 'item', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' },
    ],
    knownLocationIds: ['b_winterfell'],
  });
}

test('三态覆盖区分缺失、明确清除和具体替换', () => {
  const baseline = fixtureBaseline();
  const emptyState = createWorldRuntimeState();
  const withVacancy = { ...emptyState, titles: { c_winterfell: { lawfulHolderId: null } } };
  const withMove = {
    ...emptyState,
    characters: { 'agot:Stark_3': { location: { locationId: 'b_castle_black' }, currentActivity: 'travelling' } },
    assets: { sword: { kind: 'item', status: 'stolen', custodian: null } },
  };

  assert.equal(projectWorldTitle(baseline, emptyState, 'c_winterfell').lawfulHolderId, 'agot:Stark_3');
  assert.equal(projectWorldTitle(baseline, withVacancy, 'c_winterfell').lawfulHolderId, null);
  assert.deepEqual(projectWorldCharacter(baseline, withMove, 'agot:Stark_3').location, { locationId: 'b_castle_black' });
  assert.equal(projectWorldAsset(baseline, withMove, 'sword').custodian, null);
  assert.equal(projectWorldAsset(baseline, withMove, 'sword').placement.type, 'asset');
  assert.equal(projectWorldAsset(baseline, withMove, 'sword').status, 'stolen');
});

test('资产地图位置递归跟随人物和容器并拒绝循环', () => {
  const baseline = fixtureBaseline();
  const emptyState = createWorldRuntimeState();
  assert.deepEqual(resolveAssetMapLocation(baseline, emptyState, 'sword'), { locationId: 'b_winterfell' });

  const carried = {
    ...emptyState,
    assets: { sword: { kind: 'item', placement: { type: 'character', characterId: 'agot:Stark_3' } } },
  };
  assert.deepEqual(resolveAssetMapLocation(baseline, carried, 'sword'), { locationId: 'b_winterfell' });

  const cyclicBaseline = createWorldBaselineSnapshot({
    characters: [],
    titles: [],
    assets: [
      { id: 'wagon', kind: 'vehicle', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'sword' }, placement: { type: 'asset', assetId: 'sword' }, equippedPosition: null, status: 'normal' },
      { id: 'sword', kind: 'item', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' },
    ],
    knownLocationIds: [],
  });
  assert.throws(() => resolveAssetMapLocation(cyclicBaseline, emptyState, 'sword'), /资产容器形成循环/);
});

test('基线快照拒绝重复 ID', () => {
  assert.throws(() => createWorldBaselineSnapshot({
    characters: [
      { id: 'agot:Stark_3', alive: true, location: null },
      { id: 'agot:Stark_3', alive: false, location: null },
    ],
    titles: [],
    assets: [],
    knownLocationIds: [],
  }), /人物基线 ID 重复/);
});

test('按需基线加载不调用人物全量搜索并递归加载资产容器', async () => {
  const calls = { directCharacters: 0, search: 0, assets: [] };
  const assets = new Map([
    ['sword', { id: 'sword', kind: 'item', lawfulOwner: { type: 'character', characterId: 'agot:Stark_3' }, controller: null, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' }],
    ['wagon', { id: 'wagon', kind: 'vehicle', lawfulOwner: null, controller: null, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' }],
  ]);
  const repository = new WorldBaselineRepository({
    characters: {
      async getWorldBaselineRecords(ids) {
        calls.directCharacters += 1;
        return ids.includes('agot:Stark_3') ? [{ id: 'agot:Stark_3', alive: true, location: null }] : [];
      },
      async findTitleHoldersByTitleIds() { return new Map(); },
      async search() { calls.search += 1; return []; },
    },
    map: {
      async getLocations(ids) { return ids.map((id) => ({ id })); },
      async hasPoliticalTitles(ids) { return new Set(ids); },
    },
    async loadAssets(ids) {
      calls.assets.push([...ids]);
      return ids.flatMap((id) => assets.has(id) ? [assets.get(id)] : []);
    },
  });

  const snapshot = await repository.loadSnapshot({
    characterIds: ['agot:Stark_3'],
    titleIds: ['c_winterfell'],
    assetIds: ['sword'],
    locationIds: ['b_winterfell'],
  });
  assert.equal(calls.search, 0);
  assert.equal(calls.directCharacters, 1);
  assert.deepEqual(calls.assets, [['sword'], ['wagon']]);
  assert.equal(snapshot.characters.has('agot:Stark_3'), true);
  assert.equal(snapshot.assets.has('wagon'), true);
  assert.equal(snapshot.titles.has('c_winterfell'), true);
  assert.equal(snapshot.knownLocationIds.has('b_winterfell'), true);
});
