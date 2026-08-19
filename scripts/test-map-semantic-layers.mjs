import assert from 'node:assert/strict'
import test from 'node:test'

import { applyMapMode, MODE_VISIBILITY } from '../src/features/map/mapLayers.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const manifestV2 = {
  schemaVersion: 2,
  sourceId: '2962333032',
  sourceHashes: { source: 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
  tileSize: 512,
  minZoom: 0,
  maxZoom: 6,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
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
    terrainTiles: 85, vectorTiles: 85, demTiles: 85, semanticTiles: 85,
    semanticRealms: 9, semanticDuchies: 30, semanticCounties: 120,
    semanticLabels: 159, missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64),
  semanticHash: 'c'.repeat(64),
}

const modes = ['terrain', 'political', 'characters', 'travel', 'assets']
const semanticLayerIds = [
  'agot-realm-boundaries', 'agot-duchy-boundaries', 'agot-county-boundaries',
  'agot-realm-labels', 'agot-duchy-labels', 'agot-county-labels',
]

test('样式只包含三级可见边界和三级中文主标签', () => {
  const style = createLocalMapStyle(manifestV2)
  assert.deepEqual(style.sources['agot-semantic'].tiles, [manifestV2.paths.semantic])
  for (const rank of ['realm', 'duchy', 'county']) {
    const boundary = style.layers.find((layer) => layer.id === `agot-${rank}-boundaries`)
    const label = style.layers.find((layer) => layer.id === `agot-${rank}-labels`)
    assert.equal(boundary['source-layer'], `${rank}_boundaries`)
    assert.equal(label['source-layer'], 'title_labels')
    assert.deepEqual(label.filter, ['==', ['get', 'rank'], rank])
    assert.deepEqual(label.layout['text-field'], ['get', 'name'])
  }
  const serialized = JSON.stringify(style)
  assert.doesNotMatch(serialized, /https?:|glyphs|sprite/)
  assert.doesNotMatch(serialized, /barony_boundaries|agot-barony-|agot-borders/)
})

test('政治填色无缩放门槛且道路细节随缩放连续增加', () => {
  const style = createLocalMapStyle(manifestV2)
  const provinces = style.layers.find((layer) => layer.id === 'agot-provinces')
  const roads = style.layers.find((layer) => layer.id === 'agot-roads')
  assert.equal(provinces.minzoom, undefined)
  assert.equal(provinces.maxzoom, undefined)
  assert.ok(Array.isArray(roads.paint['line-opacity']))
  assert.match(JSON.stringify(roads.paint['line-opacity']), /4\.1.*4\.4/)
  const labelIndex = style.layers.findIndex((layer) => layer.id === 'agot-county-labels')
  const locationIndex = style.layers.findIndex((layer) => layer.id === 'agot-locations')
  assert.ok(labelIndex >= 0 && labelIndex < locationIndex)
})

test('五种模式切换不会写入 zoom 且完整控制新增图层', () => {
  const allLayers = new Set(Object.keys(MODE_VISIBILITY.terrain))
  for (const layerId of [...semanticLayerIds, 'agot-political-house-labels']) {
    for (const mode of modes) assert.equal(layerId in MODE_VISIBILITY[mode], true, `${mode}:${layerId}`)
  }
  for (const mode of modes) {
    const visibility = new Map()
    const zoomCalls = []
    const map = {
      getLayer: (layerId) => allLayers.has(layerId),
      setLayoutProperty: (layerId, property, value) => {
        assert.equal(property, 'visibility')
        visibility.set(layerId, value)
      },
      setZoom: (...args) => zoomCalls.push(args),
      easeTo: (...args) => zoomCalls.push(args),
    }
    applyMapMode(map, mode)
    assert.equal(zoomCalls.length, 0)
    assert.equal(visibility.get('agot-political-house-labels'), mode === 'political' ? 'visible' : 'none')
    assert.equal(visibility.get('agot-provinces'), mode === 'political' ? 'visible' : 'none')
    assert.equal(visibility.get('agot-routes'), mode === 'travel' ? 'visible' : 'none')
    for (const layerId of semanticLayerIds) assert.equal(visibility.get(layerId), 'visible')
  }
})
