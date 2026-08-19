import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyMapMode,
  FAR_MAP_LAYER,
  FAR_MAP_SOURCE,
  MATERIAL_TERRAIN_LAYER,
  MATERIAL_TERRAIN_SOURCE,
} from '../src/features/map/mapLayers.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const manifest = {
  schemaVersion: 3,
  sourceId: 'local-fixture',
  sourceHashes: { source: 'a'.repeat(64) },
  mapSize: { width: 9216, height: 6144 },
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
  tileSize: 512,
  minZoom: 0,
  maxZoom: 6,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
    vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
    dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
    semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
    locations: '/data/agot-map/locations', routes: '/data/agot-map/routes',
    searchIndex: '/data/agot-map/location-search-index.json',
    semanticTitles: '/data/agot-map/semantic/titles.json',
    semanticMembership: '/data/agot-map/semantic/membership.json',
  },
  counts: {
    regions: 9, provinces: 1200, locations: 800, routeEdges: 2400,
    terrainTiles: 341, materialTerrainTiles: 1365, vectorTiles: 5461,
    demTiles: 341, semanticTiles: 5461, semanticRealms: 9,
    semanticDuchies: 30, semanticCounties: 120, semanticLabels: 159,
    missingSemanticLocalizations: 0,
  },
  datasetHash: 'b'.repeat(64), semanticHash: 'c'.repeat(64),
}

test('远景与近景地表使用独立本地栅格源并按正确顺序叠放', () => {
  const style = createLocalMapStyle(manifest)
  assert.deepEqual(style.sources[FAR_MAP_SOURCE].tiles, [manifest.paths.terrain])
  assert.deepEqual(style.sources[MATERIAL_TERRAIN_SOURCE].tiles, [manifest.paths.materialTerrain])
  assert.equal(style.sources[MATERIAL_TERRAIN_SOURCE].maxzoom, 5)

  const farIndex = style.layers.findIndex((layer) => layer.id === FAR_MAP_LAYER)
  const nearIndex = style.layers.findIndex((layer) => layer.id === MATERIAL_TERRAIN_LAYER)
  const hillshadeIndex = style.layers.findIndex((layer) => layer.id === 'agot-hillshade')
  const politicalIndex = style.layers.findIndex((layer) => layer.id === 'agot-provinces')
  assert.ok(farIndex >= 0 && farIndex < nearIndex)
  assert.ok(nearIndex < hillshadeIndex && hillshadeIndex < politicalIndex)

  const far = style.layers[farIndex]
  const near = style.layers[nearIndex]
  assert.equal(far.paint['raster-opacity'], 1)
  assert.equal(near.paint['raster-opacity'], 0)
  assert.equal(Array.isArray(far.paint['raster-opacity']), false)
  assert.equal(Array.isArray(near.paint['raster-opacity']), false)
})

test('地图模式只调整两张地表的色彩，不接管远近景透明度', () => {
  const paintCalls = []
  const map = {
    getLayer: (id) => id === FAR_MAP_LAYER || id === MATERIAL_TERRAIN_LAYER,
    setLayoutProperty: () => {},
    setPaintProperty: (layerId, property, value) => paintCalls.push([layerId, property, value]),
  }
  applyMapMode(map, 'characters')
  assert.ok(paintCalls.some(([, property]) => property === 'raster-saturation'))
  assert.ok(paintCalls.some(([, property]) => property === 'raster-brightness-max'))
  assert.equal(paintCalls.some(([, property]) => property === 'raster-opacity'), false)
  for (const layerId of [FAR_MAP_LAYER, MATERIAL_TERRAIN_LAYER]) {
    assert.ok(paintCalls.some(([id]) => id === layerId))
  }
})
