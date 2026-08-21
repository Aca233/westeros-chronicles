import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import test from 'node:test'

import { buildCountyInteractionIndex } from '../src/features/map/countyInteraction.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const entries = [
  { id: 'b_winter_town', name: '冬市镇', type: 'town', importance: 95, regionId: 'the_north', mapX: 1180, mapY: 910 },
  { id: 'b_winterfell', name: '临冬城', type: 'castle', importance: 80, regionId: 'the_north', mapX: 1200, mapY: 900 },
  { id: 'b_brandford', name: '布兰福德', type: 'village', importance: 20, regionId: 'the_north', mapX: 1210, mapY: 930 },
  { id: 'b_lonely_port', name: '孤港', type: 'port', importance: 60, regionId: 'the_north', mapX: 1700, mapY: 1000 },
]

const semantic = {
  titles: [
    { featureId: 1, titleId: 'c_winterfell', rank: 'county', name: '临冬城', importance: 60, regionId: 'the_north', mapX: 1200, mapY: 900 },
    { featureId: 2, titleId: 'c_lonely', rank: 'county', name: '孤寂海岸', importance: 40, regionId: 'the_north', mapX: 1700, mapY: 1000 },
  ],
  memberships: [
    { locationId: 'b_winter_town', baronyId: 'b_winter_town', countyId: 'c_winterfell', duchyId: 'd_winterfell', hegemonId: 'h_the_iron_throne', regionId: 'the_north' },
    { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', hegemonId: 'h_the_iron_throne', regionId: 'the_north' },
    { locationId: 'b_brandford', baronyId: 'b_brandford', countyId: 'c_winterfell', duchyId: 'd_winterfell', hegemonId: 'h_the_iron_throne', regionId: 'the_north' },
    { locationId: 'b_lonely_port', baronyId: 'b_lonely_port', countyId: 'c_lonely', duchyId: 'd_lonely', hegemonId: 'h_the_iron_throne', regionId: 'the_north' },
  ],
}

const manifest = {
  schemaVersion: 4,
  sourceId: '2962333032',
  sourceHashes: { source: 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
  tileSize: 512,
  minZoom: 0,
  maxZoom: 6,
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
    regions: 1, provinces: 4, locations: 4, routeEdges: 0,
    terrainLightTiles: 341, terrainTiles: 1, materialTerrainTiles: 1, vectorTiles: 1, demTiles: 1, semanticTiles: 1,
    semanticHegemons: 1, semanticEmpires: 1, semanticKingdoms: 1, semanticDuchies: 2, semanticCounties: 2, semanticLabels: 5,
    missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64), semanticHash: 'c'.repeat(64),
}

test('伯爵领同名中心优先于更高重要度的次级男爵领地点', () => {
  const index = buildCountyInteractionIndex(entries, semantic)
  assert.equal(index.primaryLocationByCountyId.get('c_winterfell'), 'b_winterfell')
  assert.equal(index.primaryLocationByCountyId.get('c_lonely'), 'b_lonely_port')
})

test('点击伯爵领内任意省份都解析到同一中心地点', () => {
  const index = buildCountyInteractionIndex(entries, semantic)
})

test('选择伯爵领中心后只展开该伯爵领内部地点并标记首府', () => {
  const index = buildCountyInteractionIndex(entries, semantic)
  const selected = index.selectedCountyForLocation('b_winterfell')
  assert.equal(selected?.countyId, 'c_winterfell')
  assert.equal(selected?.primaryLocationId, 'b_winterfell')
  assert.deepEqual(selected?.locations.map((location) => location.id), [
    'b_winterfell', 'b_winter_town', 'b_brandford',
  ])
  assert.deepEqual(selected?.locations.map((location) => location.isPrimary), [true, false, false])
  assert.equal(index.selectedCountyForLocation('b_lonely_port')?.locations.length, 1)
  assert.equal(index.selectedCountyForLocation('b_missing'), undefined)
})

test('地图不再渲染男爵领点并提供全伯爵领透明点击层', () => {
  const style = createLocalMapStyle(manifest)
  const serialized = JSON.stringify(style)
  assert.doesNotMatch(serialized, /agot-locations|agot-location-cluster|agot-location-points/)
  const hitLayer = style.layers.find((layer) => layer.id === 'agot-county-hit-areas')
  assert.equal(hitLayer?.type, 'fill')
  assert.equal(hitLayer?.source, 'agot-vector')
  assert.equal(hitLayer?.['source-layer'], 'provinces')
  assert.ok(Number(hitLayer?.paint?.['fill-opacity']) > 0)
  assert.ok(Number(hitLayer?.paint?.['fill-opacity']) <= 0.01)

  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.match(canvas, /COUNTY_HIT_LAYER/)
  assert.match(canvas, /countyIdForBarony/)
  assert.match(canvas, /primaryLocationForCounty/)
  assert.match(canvas, /syncSelectedCountyLocations/)
  assert.doesNotMatch(canvas, /LOCATION_(?:POINT|CLUSTER)_LAYER|zoomToCluster/)

  const layers = readFileSync('src/features/map/mapLayers.ts', 'utf8')
  assert.match(layers, /agot-selected-county-outline/)
  assert.match(layers, /agot-selected-county-locations/)
  assert.match(layers, /minzoom:\s*4\.6/)
  assert.match(layers, /location-winterfell\.webp/)
  const iconManifest = JSON.parse(readFileSync('public/assets/map-icons/manifest.json', 'utf8'))
  assert.equal(iconManifest.sourceId, '2962333032')
  for (const type of ['castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark', 'region']) {
    assert.ok(statSync(`public/assets/map-icons/location-${type}.webp`).size > 0, `缺少 ${type} 地点图标`)
    assert.match(
      iconManifest.icons[type],
      /^gfx\/interface\/icons\/building_types\/[^/]+\.dds$/,
      `${type} 必须来自离线导入的 AGOT 中世纪建筑图标`,
    )
  }
  assert.doesNotMatch(JSON.stringify(iconManifest), /Building2|Store|high-?rise|skyscraper/i)
})
