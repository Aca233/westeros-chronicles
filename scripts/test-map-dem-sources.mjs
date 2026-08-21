import assert from 'node:assert/strict'
import test from 'node:test'

import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const manifest = {
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
  },
}

test('三维地形保留唯一 DEM，地表光影使用独立透明烘焙瓦片', () => {
  const style = createLocalMapStyle(manifest)
  assert.ok(style.sources['agot-dem'])
  assert.equal(Object.values(style.sources).filter((source) => source.type === 'raster-dem').length, 1)
  assert.deepEqual(style.sources['agot-terrain-light'].tiles, [manifest.paths.terrainLight])
  assert.equal(
    style.sources['agot-terrain-light'].maxzoom,
    style.sources['agot-material-terrain'].maxzoom,
    '近景光照瓦片必须与近景材质保持同级清晰度',
  )
  const lighting = style.layers.find((layer) => layer.id === 'agot-terrain-light')
  assert.equal(lighting.type, 'raster')
  assert.equal(lighting.source, 'agot-terrain-light')
  assert.ok(lighting.paint['raster-opacity'] >= 0.7)
  assert.equal(style.layers.some((layer) => layer.id === 'agot-hillshade'), false)
})
