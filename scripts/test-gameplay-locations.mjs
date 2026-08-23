import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const worldContentBundle = await build({
  entryPoints: ['src/features/world-content/repository.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const repositoryUrl = `data:text/javascript;base64,${Buffer.from(worldContentBundle.outputFiles[0].text).toString('base64')}`;
const { WorldContentRepository } = await import(repositoryUrl);

const [gameplayDataset, searchIndex, mapManifest] = await Promise.all([
  readFile('public/data/world/gameplay-locations.json', 'utf8').then(JSON.parse),
  readFile('public/data/agot-map/location-search-index.json', 'utf8').then(JSON.parse),
  readFile('public/data/agot-map/manifest.json', 'utf8').then(JSON.parse),
]);

const fixture = new Map();
for (const path of ['/data/world/manifest.json', '/data/world/gameplay-locations.json']) {
  fixture.set(path, JSON.parse(await readFile(`public${path}`, 'utf8')));
}
const repository = new WorldContentRepository(async (path) => {
  const value = fixture.get(path);
  if (value === undefined) throw new Error(`fixture 缺少 ${path}`);
  return value;
});

test('隐藏中转节点不可搜索但路线仍可经过', async () => {
  const gameplayIds = new Set(gameplayDataset.entries.map((entry) => entry.id));
  const routeFiles = (await readdir('public/data/agot-map/routes')).filter((name) => name.endsWith('.json'));
  const graphs = await Promise.all(routeFiles
    .map((name) => readFile(`public/data/agot-map/routes/${name}`, 'utf8').then(JSON.parse)));
  const allNodeIds = new Set(graphs.flatMap((graph) => graph.nodes.map((node) => node.location_id ?? node.id)));

  // 隐藏语义成立：存在路线节点不属于游戏地点。
  const hiddenNodeIds = [...allNodeIds].filter((id) => !gameplayIds.has(id));
  assert.ok(hiddenNodeIds.length > 0, '应当存在不进入游戏语义的隐藏中转节点');

  // 语义隔离不得裁剪路线数据：边仍然连接隐藏节点。
  const edgesTouchingHidden = graphs
    .flatMap((graph) => graph.edges)
    .filter((edge) => hiddenNodeIds.includes(edge.from) || hiddenNodeIds.includes(edge.to));
  assert.ok(edgesTouchingHidden.length > 0, '路线算法仍应能经过隐藏中转节点');

  for (const hiddenId of hiddenNodeIds.slice(0, 200)) {
    const entry = searchIndex.find((candidate) => candidate.id === hiddenId);
    if (!entry) continue;
    const results = await repository.searchGameplayLocations(entry.name);
    assert.equal(results.some((result) => result.id === hiddenId), false, `隐藏节点 ${hiddenId} 不得被游戏地点搜索命中`);
  }
});

test('游戏地点全部来自全量地图空间且数量为数百级', () => {
  const indexIds = new Set(searchIndex.map((entry) => entry.id));
  for (const entry of gameplayDataset.entries) {
    assert.ok(indexIds.has(entry.id), `游戏地点 ${entry.id} 不在全量地图空间中`);
    assert.ok(entry.reasons.length >= 1, `游戏地点 ${entry.id} 缺少保留理由`);
  }
  assert.ok(gameplayDataset.entries.length >= 100 && gameplayDataset.entries.length <= 999, '游戏地点应落在数百级');
  assert.equal(gameplayDataset.counts.total, gameplayDataset.entries.length);
  for (const id of ['b_winterfell', 'b_castle_black', 'b_the_red_keep']) {
    assert.ok(gameplayDataset.entries.some((entry) => entry.id === id), `${id} 应为游戏地点`);
  }
});

test('地图视觉清单和 schema 不因语义裁剪变化', () => {
  assert.equal(mapManifest.schemaVersion, 4);
  assert.equal(searchIndex.length, 7001);
});
