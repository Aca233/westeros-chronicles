import assert from 'node:assert/strict'
import test from 'node:test'

import { lngLatToMapPixel, mapPixelToLngLat } from '../src/features/map/coordinates.ts'
import { parseMapLocation, parseMapManifest } from '../src/features/map/schemas.ts'

const manifest = {
  schemaVersion: 1,
  sourceId: '2962333032',
  sourceHashes: { 'map_data/provinces.png': 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
  tileSize: 512,
  minZoom: 0,
  maxZoom: 7,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
    dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
    locations: '/data/agot-map/locations',
    routes: '/data/agot-map/routes',
    searchIndex: '/data/agot-map/location-search-index.json',
  },
  counts: {
    regions: 9,
    provinces: 1200,
    locations: 800,
    routeEdges: 2400,
    terrainTiles: 85,
    vectorTiles: 85,
    demTiles: 85,
  },
  datasetHash: 'b'.repeat(64),
}

test('地图清单接受稳定来源标识并只允许项目内资源路径', () => {
  assert.equal(parseMapManifest(manifest).sourceId, '2962333032')
  assert.equal(parseMapManifest({ ...manifest, sourceId: 'agot-map-fixture-v1' }).sourceId, 'agot-map-fixture-v1')
  for (const sourceId of ['', '../workshop', '/mnt/mod-source', 'https://mods.example.test/map']) {
    assert.throws(
      () => parseMapManifest({ ...manifest, sourceId }),
      /地图清单格式无效/,
    )
  }
  assert.throws(
    () => parseMapManifest({
      ...manifest,
      paths: { ...manifest.paths, terrain: 'https://tiles.example.test/{z}/{x}/{y}.webp' },
    }),
    /地图清单格式无效/,
  )
})

test('地点 schema 保留原始像素坐标并拒绝越界 importance', () => {
  const location = parseMapLocation({
    id: 'b_winterfell',
    name: '临冬城',
    englishName: 'Winterfell',
    type: 'castle',
    mapX: 3130,
    mapY: 1410,
    provinceId: 42,
    baronyId: 'b_winterfell',
    countyId: 'c_winterfell',
    duchyId: 'd_winterfell',
    kingdomId: 'k_the_north',
    regionId: 'world_westeros_the_north',
    terrain: 'plains',
    isCoastal: false,
    isPort: false,
    importance: 100,
    tags: ['capital'],
  })
  assert.deepEqual([location.mapX, location.mapY], [3130, 1410])
  assert.throws(() => parseMapLocation({ ...location, importance: 101 }), /地图地点格式无效/)
})

test('MapLibre 坐标映射可逆并把输入限制在维斯特洛裁剪范围', () => {
  const point = { mapX: 3130, mapY: 1410 }
  const rendered = mapPixelToLngLat(point, manifest)
  const restored = lngLatToMapPixel(rendered, manifest)
  assert.ok(Math.abs(restored.mapX - point.mapX) < 1e-6)
  assert.ok(Math.abs(restored.mapY - point.mapY) < 1e-6)
  assert.deepEqual(
    lngLatToMapPixel([-999, 999], manifest),
    { mapX: manifest.westerosBounds.minX, mapY: manifest.westerosBounds.minY },
  )
})
