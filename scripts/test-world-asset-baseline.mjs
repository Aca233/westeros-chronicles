import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/worldBaseline.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { buildWorldAssetBaseline, createWorldAssetBaselineLoader } = await import(url);

const playerId = 'agot:Stark_3';
const itemState = {
  schemaVersion: 1,
  instances: {
    cloak: { instanceId: 'cloak', definitionId: 'clothing.cloak', quantity: 1, durability: 100, quality: 'fine', lawfulControllerId: 'agot:wrong_owner', renown: 0, isHeirloom: false, history: [] },
    book: { instanceId: 'book', definitionId: 'document.book', quantity: 1, durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [] },
  },
  placements: {
    cloak: { type: 'equipped', position: { group: 'torso', layer: 'outerwear' } },
    book: { type: 'vehicle', vehicleId: 'wagon-1' },
  },
  sites: {
    armory: { id: 'armory', name: '军械库', type: 'armory', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', description: '' },
  },
  vehicles: {
    'wagon-1': { id: 'wagon-1', name: '马车', type: 'wagon', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', capacity: 20, description: '' },
  },
};
const worldArtifacts = {
  schemaVersion: 1,
  startDate: '8298.1.1',
  datasetHash: 'a'.repeat(64),
  artifactDatasetHash: 'b'.repeat(64),
  characterDatasetHash: 'c'.repeat(64),
  artifacts: {
    longclaw: {
      instanceId: 'longclaw',
      definitionId: 'artifact.longclaw',
      lawfulControllerId: 'agot:Mormont_2',
      placement: { type: 'character', characterId: 'agot:Mormont_2' },
      equipped: false,
      source: { file: 'fixture', line: 1, effectId: 'longclaw' },
    },
    title_scroll: {
      instanceId: 'title-scroll',
      definitionId: 'artifact.title_scroll',
      lawfulControllerId: 'agot:Stark_3',
      placement: { type: 'title', titleId: 'c_winterfell', controllerId: 'agot:Stark_3' },
      equipped: false,
      source: { file: 'fixture', line: 2, effectId: 'title_scroll' },
    },
  },
};

test('玩家物品、容器和世界物品映射为稳定统一资产', () => {
  const assets = new Map(buildWorldAssetBaseline({ playerId, itemState, worldArtifacts }).map((asset) => [asset.id, asset]));
  assert.equal(assets.get('item:cloak').definitionId, 'clothing.cloak');
  assert.deepEqual(assets.get('item:cloak').placement, { type: 'character', characterId: playerId });
  assert.deepEqual(assets.get('item:cloak').equippedPosition, { group: 'torso', layer: 'outerwear' });
  assert.deepEqual(assets.get('item:cloak').lawfulOwner, { type: 'character', characterId: playerId }, '不得继续读取物品实例中的旧 lawfulControllerId');
  assert.deepEqual(assets.get('item:book').placement, { type: 'asset', assetId: 'vehicle:wagon-1' });
  assert.deepEqual(assets.get('vehicle:wagon-1').placement, { type: 'location', location: { locationId: 'b_winterfell' } });
  assert.equal(assets.get('world-item:longclaw').definitionId, 'artifact.longclaw');
  assert.equal(assets.get('world-item:longclaw').equippedPosition, null);
  assert.deepEqual(assets.get('world-item:longclaw').custodian, { type: 'character', characterId: 'agot:Mormont_2' });
  assert.deepEqual(assets.get('world-item:title-scroll').lawfulOwner, { type: 'title', titleId: 'c_winterfell' });
  assert.equal(assets.get('world-item:title-scroll').placement, null);
});

test('世界物品只有明确记录实际穿戴和槽位时才映射装备', () => {
  const equipped = structuredClone(worldArtifacts);
  equipped.artifacts.longclaw.equipped = true;
  equipped.artifacts.longclaw.equippedPosition = { group: 'mainhand' };
  const assets = new Map(buildWorldAssetBaseline({ playerId, itemState, worldArtifacts: equipped }).map((asset) => [asset.id, asset]));
  assert.deepEqual(assets.get('world-item:longclaw').equippedPosition, { group: 'mainhand' });

  delete equipped.artifacts.longclaw.equippedPosition;
  const withoutPosition = new Map(buildWorldAssetBaseline({ playerId, itemState, worldArtifacts: equipped }).map((asset) => [asset.id, asset]));
  assert.equal(withoutPosition.get('world-item:longclaw').equippedPosition, null);
});

test('按需资产加载器只返回请求资产、直接容器链和合格地图据点', async () => {
  const mapCalls = [];
  const loader = createWorldAssetBaselineLoader(
    () => ({ playerId, itemState }),
    () => worldArtifacts,
    {
      async getLocation(id) {
        mapCalls.push(id);
        if (id === 'b_winterfell') return { id, type: 'castle', name: '临冬城', mapX: 0, mapY: 0, provinceId: 1, regionId: 'north', terrain: 'plains', isCoastal: false, isPort: false, importance: 10, tags: [] };
        return { id, type: 'landmark', name: '地标', mapX: 0, mapY: 0, provinceId: 1, regionId: 'north', terrain: 'plains', isCoastal: false, isPort: false, importance: 1, tags: [] };
      },
    },
  );
  const wagonAssets = await loader(['item:book']);
  assert.deepEqual(wagonAssets.map((asset) => asset.id).sort(), ['item:book', 'vehicle:wagon-1']);

  const siteAssets = await loader(['site:b_winterfell', 'site:b_landmark']);
  assert.deepEqual(siteAssets.map((asset) => asset.id), ['site:b_winterfell']);
  assert.deepEqual(mapCalls, ['b_winterfell', 'b_landmark']);
});
