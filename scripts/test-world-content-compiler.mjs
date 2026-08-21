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
    include: [],
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
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'manifest.json'), {
    schemaVersion: 4,
    datasetHash: 'map-hash',
    paths: { searchIndex: '/data/agot-map/location-search-index.json' },
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), []);
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
