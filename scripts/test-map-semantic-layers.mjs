import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addDynamicMapSubjectLayers,
  applyMapPresentation,
  syncDynamicMapSubjects,
} from '../src/features/map/mapLayers.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'
import { semanticZoomState } from '../src/features/map/semanticZoom.ts'

const manifestV4 = {
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
    regions: 9, provinces: 1200, locations: 800, routeEdges: 2400,
    terrainLightTiles: 341, terrainTiles: 85, materialTerrainTiles: 1365, vectorTiles: 85, demTiles: 85, semanticTiles: 85,
    semanticHegemons: 1, semanticEmpires: 9, semanticKingdoms: 9, semanticDuchies: 30, semanticCounties: 120,
    semanticLabels: 159, missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64),
  semanticHash: 'c'.repeat(64),
}

const semanticRanks = ['hegemon', 'empire', 'kingdom', 'duchy', 'county']
const semanticLayerIds = semanticRanks.flatMap((rank) => [
  `agot-${rank}-surface`, `agot-${rank}-boundaries-casing`, `agot-${rank}-boundaries`, `agot-${rank}-labels`,
])

test('样式只包含五级头衔边界、颜色面和中文主标签', () => {
  const style = createLocalMapStyle(manifestV4)
  assert.deepEqual(style.sources['agot-semantic'].tiles, [manifestV4.paths.semantic])
  for (const rank of semanticRanks) {
    const boundary = style.layers.find((layer) => layer.id === `agot-${rank}-boundaries`)
    const surface = style.layers.find((layer) => layer.id === `agot-${rank}-surface`)
    const label = style.layers.find((layer) => layer.id === `agot-${rank}-labels`)
    assert.equal(boundary['source-layer'], `${rank}_boundaries`)
    assert.equal(surface['source-layer'], `${rank}_surfaces`)
    assert.deepEqual(surface.paint['fill-color'], ['get', 'titleColor'])
    assert.equal(label['source-layer'], 'title_labels')
    assert.deepEqual(label.filter, ['==', ['get', 'rank'], rank])
    assert.deepEqual(label.layout['text-field'], ['get', 'name'])
    assert.equal(label.layout['text-allow-overlap'], rank !== 'county')
    assert.equal(label.layout['text-ignore-placement'], rank !== 'county')
  }
  const serialized = JSON.stringify(style)
  assert.doesNotMatch(serialized, /https?:|glyphs|sprite/)
  assert.doesNotMatch(serialized, /barony_boundaries|agot-barony-|agot-borders/)
  assert.equal('terrain' in style, false)
  assert.doesNotMatch(serialized, /fill-extrusion/)
})

test('政治填色由五级头衔颜色驱动并在近景退出', () => {
  const style = createLocalMapStyle(manifestV4)
  const roads = style.layers.find((layer) => layer.id === 'agot-roads')
  const countySurface = style.layers.find((layer) => layer.id === 'agot-county-surface')
  assert.deepEqual(countySurface.paint['fill-color'], ['get', 'titleColor'])
  assert.deepEqual(countySurface.paint['fill-opacity'], ['step', ['zoom'], 0, 2.95, 0.2, 4.6, 0])
  assert.ok(Array.isArray(roads.paint['line-opacity']))
  assert.match(JSON.stringify(roads.paint['line-opacity']), /4\.1.*4\.4/)
  const hitIndex = style.layers.findIndex((layer) => layer.id === 'agot-county-hit-areas')
  const boundaryIndex = style.layers.findIndex((layer) => layer.id === 'agot-county-boundaries')
  assert.ok(hitIndex >= 0 && hitIndex < boundaryIndex)
  assert.equal(style.layers.some((layer) => layer.id === 'agot-provinces'), false)
})

test('自动表达切换图层但不写入 zoom，近景材质可见性由生命周期控制器独占', () => {
  const knownLayers = new Set([
    ...semanticLayerIds,
    'agot-flatmap', 'agot-hillshade', 'agot-county-hit-areas',
    'agot-political-contested-borders',
    'agot-roads-casing', 'agot-roads', 'agot-routes',
    'agot-character-points', 'agot-character-aggregates', 'agot-character-aggregate-counts',
    'agot-asset-points', 'agot-asset-aggregates', 'agot-asset-aggregate-counts',
  ])
  const visibility = new Map()
  const zoomCalls = []
  const map = {
    getLayer: (layerId) => knownLayers.has(layerId),
    setLayoutProperty: (layerId, property, value) => { assert.equal(property, 'visibility'); visibility.set(layerId, value) },
    setPaintProperty: () => {},
    setZoom: (...args) => zoomCalls.push(args),
    easeTo: (...args) => zoomCalls.push(args),
  }
  applyMapPresentation(map, {
    band: 'strategic', politicalSurface: true, countyLabels: false,
    internalLocations: false, roads: false, characters: false, assets: false,
  }, false, 'hegemon')
  assert.equal(zoomCalls.length, 0)
  assert.equal(visibility.get('agot-hegemon-surface'), 'visible')
  assert.equal(visibility.get('agot-county-surface'), 'visible')
  for (const rank of semanticRanks) {
    assert.equal(visibility.get(`agot-${rank}-labels`), rank === 'hegemon' ? 'visible' : 'none')
  }
  assert.equal(visibility.get('agot-routes'), 'none')
  assert.equal(knownLayers.has('agot-material-terrain'), false)
})

test('人物与资产聚合层和个体层只在伯爵领细节区连续交叉', () => {
  const sources = new Map()
  const layers = new Map()
  const map = {
    getSource: (id) => sources.get(id),
    addSource: (id, source) => sources.set(id, source),
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, layer),
  }
  addDynamicMapSubjectLayers(map)
  for (const id of ['agot-character-aggregates', 'agot-asset-aggregates']) {
    assert.match(JSON.stringify(layers.get(id).paint['circle-opacity']), /4\.1.*4\.4/)
    assert.match(JSON.stringify(layers.get(id).paint['circle-opacity']), /"-",1/)
  }
  for (const id of ['agot-character-points', 'agot-asset-points']) {
    assert.match(JSON.stringify(layers.get(id).paint['circle-opacity']), /4\.1.*4\.4/)
  }
})

test('中景只发送聚合，细节交叉区同时发送聚合和个体', () => {
  const sources = new Map()
  const layers = new Map()
  const writes = []
  const map = {
    isStyleLoaded: () => true,
    getSource: (id) => sources.get(id),
    addSource: (id, definition) => sources.set(id, {
      definition,
      data: definition.data,
      setData(value) { this.data = value; writes.push(id) },
    }),
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, layer),
  }
  const characters = [{
    id: 'character:agot:Ned_1', characterId: 'agot:Ned_1', name: '艾德·史塔克',
    locationId: 'b_winterfell', locationName: '临冬城', regionId: 'the_north',
    mapX: 1200, mapY: 900, knowledge: 'confirmed',
  }]
  const assets = []
  const semanticContext = {
    titles: [{ featureId: 1, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领', mapX: 1200, mapY: 900, importance: 60, regionId: 'the_north', titleColor: '#777777' }],
    memberships: [{ locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', regionId: 'the_north' }],
  }
  const bounds = { minX: 1000, minY: 700, maxX: 1400, maxY: 1100 }
  syncDynamicMapSubjects(map, manifestV4, characters, assets, bounds, {
    ...semanticContext, zoomState: semanticZoomState(3),
  })
  assert.equal(sources.get('agot-character-aggregate-source').data.features.length, 1)
  assert.equal(sources.get('agot-character-point-source').data.features.length, 0)
  assert.equal(writes.some((id) => id.includes('asset')), true)
  const writesAfterFirstSync = writes.length
  syncDynamicMapSubjects(map, manifestV4, characters, assets, bounds, {
    ...semanticContext, zoomState: semanticZoomState(3),
  })
  assert.equal(writes.length, writesAfterFirstSync)
  syncDynamicMapSubjects(map, manifestV4, characters, assets, bounds, {
    ...semanticContext, zoomState: semanticZoomState(4.2),
  })
  assert.equal(sources.get('agot-character-aggregate-source').data.features.length, 1)
  assert.equal(sources.get('agot-character-point-source').data.features.length, 1)
})


test('地图代码不再包含家族副标题来源或同步器', () => {
  const style = JSON.stringify(createLocalMapStyle(manifestV4))
  assert.doesNotMatch(style, /political-house|kingdom-house|HouseLabel|家族/)
})
