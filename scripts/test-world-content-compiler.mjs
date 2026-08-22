import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compileWorldContent } from './world-content/compiler.mjs';

const WORLD_MANIFEST = {
  schemaVersion: 1,
  worldId: 'agot-298',
  startDate: { year: 298, month: 5, day: 10 },
  characterDataset: 'agot-characters',
  mapDataset: 'agot-map',
  artifactDataset: 'agot-artifacts',
};

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createWorldFixture(manifest = WORLD_MANIFEST) {
  const rootDir = await mkdtemp(join(tmpdir(), 'agot-world-content-'));
  const contentDir = join(rootDir, 'content', 'world');
  const outputDir = join(rootDir, 'public', 'data', 'world');
  await mkdir(contentDir, { recursive: true });
  await writeJson(join(contentDir, 'manifest.json'), manifest);
  await writeJson(join(contentDir, 'playable-characters.json'), []);
  await writeJson(join(contentDir, 'start-state', 'characters.json'), []);
  await writeJson(join(contentDir, 'start-state', 'titles.json'), []);
  await writeJson(join(contentDir, 'start-state', 'assets.json'), { schemaVersion: 1, instances: [], sites: [], vehicles: [] });
  await writeJson(join(contentDir, 'locations', 'gameplay-locations.json'), {
    schemaVersion: 1,
    include: ['b_winterfell'],
    exclude: [],
    rules: {
      minimumImportance: 45,
      types: ['castle', 'city', 'town', 'port', 'ruin', 'landmark'],
      includePoliticalCenters: true,
      includeStartReferences: true,
      includeEventReferences: true,
      includeMajorRoutePorts: true,
    },
  });
  for (const name of ['cultures', 'faiths', 'relationships']) {
    await writeJson(join(contentDir, 'terminology', `${name}.json`), { schemaVersion: 1, labels: {} });
  }
  await writeJson(join(contentDir, 'items', 'ordinary-items.json'), { schemaVersion: 1, items: [] });
  await writeJson(join(contentDir, 'items', 'loadout-templates.json'), { schemaVersion: 1, templates: [] });
  await writeJson(join(contentDir, 'items', 'loadout-overrides.json'), { schemaVersion: 1, overrides: [] });
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'manifest.json'), {
    schemaVersion: 2,
    datasetHash: 'characters-hash',
    source: { sourceId: '2962333032' },
    shards: [],
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'search-index.json'), []);
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'holder-summaries.json'), {
    schemaVersion: 1,
    holders: [
      { id: 'agot:minor_holder', name: '小领主', dynastyId: 'dynn_Minor', alive: true, titleIds: ['c_minor'], displayLabel: '小伯爵领' },
    ],
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'manifest.json'), {
    schemaVersion: 4,
    datasetHash: 'map-hash',
    paths: { searchIndex: '/data/agot-map/location-search-index.json' },
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), []);
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'semantic', 'membership.json'), []);
  await mkdir(join(rootDir, 'public', 'data', 'agot-map', 'routes'), { recursive: true });
  await writeJson(join(rootDir, 'public', 'data', 'items', 'agot-artifact-world-state.json'), {
    schemaVersion: 1,
    artifactDatasetHash: 'artifacts-hash',
    characterDatasetHash: 'characters-hash',
    datasetHash: 'artifact-world-hash',
    artifacts: {},
  });
  return { rootDir, contentDir, outputDir };
}

test('相同输入生成相同内容哈希且固定唯一世界日期', async () => {
  const fixture = await createWorldFixture();
  const first = await compileWorldContent(fixture);
  const firstBytes = await readFile(join(fixture.outputDir, 'manifest.json'));
  const second = await compileWorldContent(fixture);
  const secondBytes = await readFile(join(fixture.outputDir, 'manifest.json'));
  assert.equal(first.worldId, 'agot-298');
  assert.deepEqual(first.startDate, { year: 298, month: 5, day: 10 });
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(firstBytes, secondBytes);
  const emitted = JSON.parse(firstBytes);
  assert.equal(emitted.characterDatasetHash, 'characters-hash');
  assert.equal(emitted.mapDatasetHash, 'map-hash');
  assert.equal(emitted.artifactDatasetHash, 'artifacts-hash');
  const holderSummaries = JSON.parse(await readFile(join(fixture.outputDir, 'holder-summaries.json'), 'utf8'));
  assert.deepEqual(holderSummaries.holders.map((holder) => holder.id), ['agot:minor_holder']);
});

test('校验失败保留上一份完整产物', async () => {
  const fixture = await createWorldFixture();
  await mkdir(fixture.outputDir, { recursive: true });
  await writeFile(join(fixture.outputDir, 'sentinel.txt'), 'keep');
  await writeFile(join(fixture.contentDir, 'manifest.json'), '{ invalid json');
  await assert.rejects(compileWorldContent(fixture));
  assert.equal(await readFile(join(fixture.outputDir, 'sentinel.txt'), 'utf8'), 'keep');
});

test('拒绝其他产品世界、日期、未知字段和绝对数据路径', async () => {
  for (const manifest of [
    { ...WORLD_MANIFEST, worldId: 'other-world' },
    { ...WORLD_MANIFEST, startDate: { year: 298, month: 10, day: 15 } },
    { ...WORLD_MANIFEST, extra: true },
    { ...WORLD_MANIFEST, characterDataset: '/absolute/path' },
  ]) {
    const fixture = await createWorldFixture(manifest);
    await assert.rejects(compileWorldContent(fixture));
  }
});

test('人物起点引用未知人物或未知地点时编译失败', async () => {
  const fixture = await createWorldFixture();
  await writeJson(join(fixture.rootDir, 'public', 'data', 'agot-characters', 'search-index.json'), [
    { id: 'agot:Stark_3', shard: '00' },
  ]);
  await writeJson(join(fixture.rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), [
    { id: 'b_winterfell' },
  ]);
  const startCharactersPath = join(fixture.contentDir, 'start-state', 'characters.json');
  for (const [characters, pattern] of [
    [[{ characterId: 'agot:missing', location: { locationId: 'b_winterfell' }, currentActivity: 'idle' }], /未知人物/],
    [[{ characterId: 'agot:Stark_3', location: { locationId: 'b_missing' }, currentActivity: 'idle' }], /不在地图数据集中/],
    [[{ characterId: 'agot:Stark_3', location: { locationId: 'b_winterfell' }, currentActivity: 'dancing' }], /活动值无效/],
    [[{ characterId: 'agot:Stark_3', location: { locationId: 'b_winterfell' }, currentActivity: 'idle', extra: true }], /未知字段/],
  ]) {
    await writeJson(startCharactersPath, characters);
    await assert.rejects(compileWorldContent(fixture), pattern);
  }
  await writeJson(startCharactersPath, [
    { characterId: 'agot:Stark_3', location: { locationId: 'b_winterfell' }, currentActivity: 'idle' },
  ]);
  await compileWorldContent(fixture);
});

test('编译器拒绝唯一资产重复、悬空保管引用和错误的神器覆盖控制者', async () => {
  const fixture = await createWorldFixture();
  await writeJson(join(fixture.rootDir, 'public', 'data', 'agot-characters', 'search-index.json'), [
    { id: 'agot:Stark_3', shard: '00' },
    { id: 'agot:Stark_7', shard: '01' },
  ]);
  await writeJson(join(fixture.rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), [
    { id: 'b_winterfell' },
  ]);
  await writeJson(join(fixture.rootDir, 'public', 'data', 'items', 'agot-artifact-world-state.json'), {
    schemaVersion: 1,
    artifactDatasetHash: 'artifacts-hash',
    characterDatasetHash: 'characters-hash',
    datasetHash: 'artifact-world-hash',
    artifacts: {
      'artifact.ice': {
        definitionId: 'artifact.ice',
        instanceId: 'world.artifact.ice',
        lawfulControllerId: 'agot:Stark_3',
        placement: { type: 'character', characterId: 'agot:Stark_3' },
        equipped: false,
        projectionKind: 'portable-asset',
        source: { effectId: 'effect', file: 'fixture.txt', line: 1 },
      },
    },
  });
  const assetsPath = join(fixture.contentDir, 'start-state', 'assets.json');
  const site = { id: 'winterfell_armory', name: '临冬城军械库', type: 'armory', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', description: '', capacity: 80 };
  const instance = (overrides) => ({
    instanceId: 'ned.ice',
    definitionId: 'artifact.ice',
    kind: 'item',
    lawfulOwner: { type: 'character', characterId: 'agot:Stark_3' },
    controller: { type: 'character', characterId: 'agot:Stark_3' },
    custodian: { type: 'character', characterId: 'agot:Stark_3' },
    placement: { type: 'character', characterId: 'agot:Stark_3' },
    equippedPosition: null,
    status: 'normal',
    ...overrides,
  });
  for (const [instances, pattern] of [
    [[instance(), instance({ instanceId: 'ned.ice_copy' })], /唯一资产重复/],
    [[instance({ custodian: { type: 'asset', assetId: 'site:missing' }, placement: { type: 'asset', assetId: 'site:missing' } })], /保管站点不存在/],
    [[instance({ controller: { type: 'character', characterId: 'agot:Stark_7' } })], /神器覆盖控制者不一致/],
    [[instance({ lawfulOwner: { type: 'character', characterId: 'agot:missing' } })], /引用未知人物/],
  ]) {
    await writeJson(assetsPath, { schemaVersion: 1, instances: [...instances], sites: [site], vehicles: [] });
    await assert.rejects(compileWorldContent(fixture), pattern);
  }
  await writeJson(assetsPath, { schemaVersion: 1, instances: [instance()], sites: [site], vehicles: [] });
  await compileWorldContent(fixture);
});
