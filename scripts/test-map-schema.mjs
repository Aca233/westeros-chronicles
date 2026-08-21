import assert from 'node:assert/strict'
import test from 'node:test'

import { lngLatToMapPixel, mapPixelToLngLat } from '../src/features/map/coordinates.ts'
import {
  buildSemanticMembershipIndex,
  parseMapLocation,
  parseMapManifest,
  parseSemanticMembership,
  parseSemanticTitles,
} from '../src/features/map/schemas.ts'

const manifestV4 = {
  schemaVersion: 4,
  sourceId: '2962333032',
  sourceHashes: { 'map_data/provinces.png': 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
  tileSize: 512,
  minZoom: 0,
  maxZoom: 7,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    terrainLight: '/assets/agot-map/terrain-light/{z}/{x}/{y}.webp',
    materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
    vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
    dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
    semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
    locations: '/data/agot-map/locations',
    routes: '/data/agot-map/routes',
    searchIndex: '/data/agot-map/location-search-index.json',
    semanticTitles: '/data/agot-map/semantic/titles.json',
    semanticMembership: '/data/agot-map/semantic/membership.json',
  },
  counts: {
    regions: 9,
    provinces: 1200,
    locations: 800,
    routeEdges: 2400,
    terrainTiles: 85,
    terrainLightTiles: 341,
    materialTerrainTiles: 1365,
    vectorTiles: 85,
    demTiles: 85,
    semanticTiles: 85,
    semanticHegemons: 1,
    semanticEmpires: 9,
    semanticKingdoms: 9,
    semanticDuchies: 30,
    semanticCounties: 120,
    semanticLabels: 159,
    missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64),
  semanticHash: 'c'.repeat(64),
}

const manifest = manifestV4
const semanticTitle = {
  featureId: 1,
  titleId: 'h_the_iron_throne',
  rank: 'hegemon',
  name: '铁王座',
  mapX: 3130,
  mapY: 1410,
  importance: 100,
  regionId: 'the_north',
  titleColor: '#777777',
}
const semanticTitles = [
  semanticTitle,
  { ...semanticTitle, featureId: 4, titleId: 'e_the_north', rank: 'empire', name: '北境' },
  { ...semanticTitle, featureId: 5, titleId: 'k_the_north', rank: 'kingdom', name: '北境王国' },
  { ...semanticTitle, featureId: 2, titleId: 'd_winterfell', rank: 'duchy', name: '临冬城公国' },
  { ...semanticTitle, featureId: 3, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领' },
]
const membership = {
  locationId: 'b_winterfell',
  baronyId: 'b_winterfell',
  countyId: 'c_winterfell',
  duchyId: 'd_winterfell',
  kingdomId: 'k_the_north',
  empireId: 'e_the_north',
  hegemonId: 'h_the_iron_throne',
  regionId: 'the_north',
}

test('地图清单只接受版本四并要求近景材质与地形光照路径及计数', () => {
  assert.equal(parseMapManifest(manifestV4).schemaVersion, 4)
  assert.throws(() => parseMapManifest({ ...manifestV4, schemaVersion: 2 }), /地图清单格式无效/)
  assert.throws(() => parseMapManifest({
    ...manifestV4,
    paths: { ...manifestV4.paths, materialTerrain: 'https://example.test/{z}.webp' },
  }), /项目内 AGOT 地图资源路径/)
  const { materialTerrain: _path, ...pathsWithoutMaterial } = manifestV4.paths
  assert.throws(() => parseMapManifest({ ...manifestV4, paths: pathsWithoutMaterial }), /地图清单格式无效/)
  const { materialTerrainTiles: _count, ...countsWithoutMaterial } = manifestV4.counts
  assert.throws(() => parseMapManifest({ ...manifestV4, counts: countsWithoutMaterial }), /地图清单格式无效/)
  const { terrainLight: _terrainLight, ...pathsWithoutTerrainLight } = manifestV4.paths
  assert.throws(() => parseMapManifest({ ...manifestV4, paths: pathsWithoutTerrainLight }), /地图清单格式无效/)
  const { terrainLightTiles: _terrainLightCount, ...countsWithoutTerrainLight } = manifestV4.counts
  assert.throws(() => parseMapManifest({ ...manifestV4, counts: countsWithoutTerrainLight }), /地图清单格式无效/)
})

test('语义标题与 membership 拒绝重复和悬空层级', () => {
  assert.equal(parseSemanticTitles([semanticTitle]).length, 1)
  assert.throws(() => parseSemanticTitles([semanticTitle, semanticTitle]), /featureId/)
  assert.throws(() => parseSemanticMembership([{ ...membership, regionId: '' }]), /regionId/)
  assert.throws(() => parseSemanticTitles([{ ...semanticTitle, rank: 'realm' }]), /地图语义标题格式无效/)
  assert.throws(() => parseSemanticMembership([{ ...membership, realmId: 'the_north' }]), /地图语义归属格式无效/)
  assert.throws(() => buildSemanticMembershipIndex(
    semanticTitles, [{ ...membership, countyId: 'c_missing' }],
  ), /c_missing/)
})

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
