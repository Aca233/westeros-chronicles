import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldContentRepository, assertWorldDatasetCompatibility } from '../src/features/world-content/repository.ts';

const worldManifest = {
  schemaVersion: 1,
  worldId: 'agot-298',
  startDate: { year: 298, month: 5, day: 10 },
  characterDatasetHash: 'a'.repeat(64),
  mapDatasetHash: 'b'.repeat(64),
  artifactDatasetHash: 'c'.repeat(64),
  artifactWorldStateHash: 'd'.repeat(64),
  contentHash: 'e'.repeat(64),
  paths: {
    startState: '/data/world/start-state.json',
    playableCharacters: '/data/world/playable-characters.json',
    characterContentIndex: '/data/world/character-content/index.json',
    terminology: '/data/world/terminology.json',
    gameplayLocations: '/data/world/gameplay-locations.json',
    holderSummaries: '/data/world/holder-summaries.json',
    ordinaryItems: '/data/world/ordinary-items.json',
    loadouts: '/data/world/loadouts.json',
  },
};

const fixtureByPath = {
  '/data/world/manifest.json': worldManifest,
  '/data/world/start-state.json': { schemaVersion: 1, characters: [], titles: [], assets: [], sites: [], vehicles: [] },
  '/data/world/playable-characters.json': [{
    characterId: 'agot:Stark_3', enabled: true, difficulty: 'normal', focus: ['守护北境'],
    card: { title: '北境之狼', tagline: '凛冬将至', background: '国王御驾抵达临冬城。', avatarIcon: 'house-stark' },
  }],
  '/data/world/character-content/index.json': {
    schemaVersion: 1,
    shards: { '0a': '/data/world/character-content/0a.json' },
    characters: { 'agot:Stark_3': '0a' },
  },
  '/data/world/character-content/0a.json': {
    'agot:Stark_3': { schemaVersion: 1, characterId: 'agot:Stark_3', summary: '北境守护。', sources: [] },
  },
  '/data/world/terminology.json': { schemaVersion: 1, cultures: {}, faiths: {}, relationships: {} },
  '/data/world/gameplay-locations.json': { schemaVersion: 1, entries: [], config: { schemaVersion: 1, include: [], exclude: [], rules: { minimumImportance: 45, types: ['castle'], includePoliticalCenters: true, includeStartReferences: true, includeEventReferences: true, includeMajorRoutePorts: true } } },
  '/data/world/holder-summaries.json': { schemaVersion: 1, holders: [] },
  '/data/world/ordinary-items.json': [],
  '/data/world/loadouts.json': { schemaVersion: 1, templates: [], overrides: [] },
};

test('仓储缓存清单并按索引只读取人物内容分片', async () => {
  const calls = [];
  const repository = new WorldContentRepository(async (path) => {
    calls.push(path);
    if (!(path in fixtureByPath)) throw new Error(`404 ${path}`);
    return structuredClone(fixtureByPath[path]);
  });
  const first = await repository.loadCharacterContent('agot:Stark_3');
  const second = await repository.loadCharacterContent('agot:Stark_3');
  assert.equal(first?.characterId, 'agot:Stark_3');
  assert.deepEqual(second, first);
  assert.equal(calls.filter((path) => path.endsWith('/manifest.json')).length, 1);
  assert.equal(calls.filter((path) => path.includes('/character-content/0a.json')).length, 1);
  assert.equal(await repository.loadCharacterContent('agot:Missing'), undefined);
});

test('加载所有世界内容产物并缓存', async () => {
  const repository = new WorldContentRepository(async (path) => structuredClone(fixtureByPath[path]));
  assert.equal((await repository.loadPlayableCharacters())[0].characterId, 'agot:Stark_3');
  assert.equal((await repository.loadStartState()).schemaVersion, 1);
  assert.equal((await repository.loadTerminology()).schemaVersion, 1);
  assert.deepEqual(await repository.loadGameplayLocations(), []);
  assert.deepEqual(await repository.loadHolderSummaries(), []);
  assert.deepEqual(await repository.loadOrdinaryItems(), []);
  assert.deepEqual(await repository.loadLoadouts(), { templates: [], overrides: [] });
});

test('依赖哈希不一致时拒绝组合世界', () => {
  assert.throws(() => assertWorldDatasetCompatibility(
    worldManifest,
    { datasetHash: 'different' },
    { datasetHash: worldManifest.mapDatasetHash },
    { artifactDatasetHash: worldManifest.artifactDatasetHash, datasetHash: worldManifest.artifactWorldStateHash },
  ), /人物数据哈希不匹配/);
  assert.throws(() => assertWorldDatasetCompatibility(
    worldManifest,
    { datasetHash: worldManifest.characterDatasetHash },
    { datasetHash: 'different' },
    { artifactDatasetHash: worldManifest.artifactDatasetHash, datasetHash: worldManifest.artifactWorldStateHash },
  ), /地图数据哈希不匹配/);
});

test('clear 清除失败缓存后允许重试', async () => {
  let attempts = 0;
  const repository = new WorldContentRepository(async (path) => {
    if (path === '/data/world/manifest.json' && attempts++ === 0) throw new Error('temporary');
    return structuredClone(fixtureByPath[path]);
  });
  await assert.rejects(repository.loadManifest(), /temporary/);
  repository.clear();
  assert.equal((await repository.loadManifest()).worldId, 'agot-298');
});
