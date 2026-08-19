import assert from 'node:assert/strict'
import test from 'node:test'

import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'
import { MapRepository } from '../src/features/map/repository.ts'

const manifestV2 = {
  schemaVersion: 2, sourceId: '2962333032', sourceHashes: { source: 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 168, minY: 6, maxX: 2335, maxY: 4305 },
  tileSize: 512, minZoom: 0, maxZoom: 6,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
    dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
    semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
    locations: '/data/agot-map/locations', routes: '/data/agot-map/routes',
    searchIndex: '/data/agot-map/location-search-index.json',
    semanticTitles: '/data/agot-map/semantic/titles.json',
    semanticMembership: '/data/agot-map/semantic/membership.json',
  },
  counts: {
    regions: 12, provinces: 6094, locations: 6094, routeEdges: 31724,
    terrainTiles: 341, vectorTiles: 3474, demTiles: 341, semanticTiles: 3474,
    semanticRealms: 9, semanticDuchies: 30, semanticCounties: 120,
    semanticLabels: 159, missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64),
  semanticHash: 'c'.repeat(64),
}
const manifest = manifestV2

test('仓储按清单路径缓存语义标题和 membership', async () => {
  const requested = []
  const repository = new MapRepository(async (url) => {
    requested.push(String(url))
    if (String(url).endsWith('manifest.json')) return { ok: true, json: async () => manifestV2 }
    if (String(url).endsWith('/semantic/titles.json')) return { ok: true, json: async () => [
      { featureId: 1, titleId: 'the_north', rank: 'realm', name: '北境', mapX: 3130, mapY: 1410, importance: 100, regionId: 'the_north' },
      { featureId: 2, titleId: 'd_winterfell', rank: 'duchy', name: '临冬城公国', mapX: 3130, mapY: 1410, importance: 80, regionId: 'the_north' },
      { featureId: 3, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领', mapX: 3130, mapY: 1410, importance: 60, regionId: 'the_north' },
    ] }
    if (String(url).endsWith('/semantic/membership.json')) return { ok: true, json: async () => [
      { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', realmId: 'the_north' },
    ] }
    throw new Error(`unexpected request: ${url}`)
  })
  const [titles, memberships, index] = await Promise.all([
    repository.loadSemanticTitles(), repository.loadSemanticMembership(), repository.loadSemanticIndex(),
  ])
  assert.equal(titles[0].name, '北境')
  assert.equal(memberships[0].locationId, 'b_winterfell')
  assert.equal(index.byLocationId.get('b_winterfell')?.realmId, 'the_north')
  assert.equal(requested.filter((value) => value.endsWith('/semantic/titles.json')).length, 1)
  assert.equal(requested.filter((value) => value.endsWith('/semantic/membership.json')).length, 1)
})

test('仓储合并并发请求，失败后允许重试', async () => {
  let calls = 0
  const repository = new MapRepository(async () => {
    calls += 1
    if (calls === 1) throw new Error('temporary')
    return { ok: true, json: async () => manifest }
  })
  await assert.rejects(repository.loadManifest(), /地图资料载入失败/)
  const [first, second] = await Promise.all([repository.loadManifest(), repository.loadManifest()])
  assert.equal(first.datasetHash, manifest.datasetHash)
  assert.equal(second.datasetHash, manifest.datasetHash)
  assert.equal(calls, 2)
})

test('搜索只读取轻量索引且支持中文、英文和稳定 ID', async () => {
  const requested = []
  const repository = new MapRepository(async (url) => {
    requested.push(String(url))
    if (String(url).endsWith('manifest.json')) return { ok: true, json: async () => manifest }
    return { ok: true, json: async () => [
      { id: 'b_winterfell', name: '临冬城', englishName: 'Winterfell', type: 'castle', mapX: 1360, mapY: 1447, importance: 100, regionId: 'world_westeros_the_north' },
    ] }
  })
  assert.equal((await repository.searchLocations('临冬', 20))[0].id, 'b_winterfell')
  assert.equal((await repository.searchLocations('winter', 20))[0].id, 'b_winterfell')
  assert.equal((await repository.searchLocations('b_winter', 20))[0].id, 'b_winterfell')
  assert.equal(requested.filter((url) => url.includes('/locations/')).length, 0)
  assert.equal(requested.filter((url) => url.includes('location-search-index')).length, 1)
})

test('本地样式只引用生成资源并启用 hillshade 而非三维 terrain', () => {
  const style = createLocalMapStyle(manifest)
  const serialized = JSON.stringify(style)
  assert.doesNotMatch(serialized, /https?:|2962333032|\\/)
  assert.match(serialized, /agot-hillshade/)
  assert.equal('terrain' in style, false)
})
