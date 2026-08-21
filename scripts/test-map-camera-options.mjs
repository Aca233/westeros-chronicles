import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createCk3MapOptions } from '../src/features/map/cameraProfile.ts'

const manifest = { westerosBounds: { minX: 168, minY: 6, maxX: 2335, maxY: 4305 } }

test('瓦片快速显现并限制跨缩放层缓存，兼顾回看与显存占用', () => {
  const options = createCk3MapOptions(manifest, false)
  assert.equal(options.fadeDuration, 120)
  assert.equal(options.maxTileCacheSize, 160)
  assert.equal(options.maxTileCacheZoomLevels, 3)
  assert.equal(options.refreshExpiredTiles, false)
  assert.equal(options.canvasContextAttributes?.powerPreference, 'high-performance')
})

test('减少动态效果时不做瓦片淡入', () => {
  assert.equal(createCk3MapOptions(manifest, true).fadeDuration, 0)
})

test('瓦片解析与解码在多核 worker 上并行,不再挤单个 worker', () => {
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(canvas, /maplibregl\.setWorkerCount\(/)
  assert.match(canvas, /navigator\.hardwareConcurrency/)
  assert.match(canvas, /maplibregl\.prewarm\(\)/)
  assert.match(app, /prewarmMapRuntime\(\)/)
})

test('世界边界与缩放限制保持不变', () => {
  const options = createCk3MapOptions(manifest, false)
  assert.equal(options.minZoom, 0)
  assert.equal(options.maxZoom, 6)
  assert.equal(options.zoomSnap, 0)
  assert.equal(options.renderWorldCopies, false)
  assert.equal(options.maxBounds[0][0] >= -180, true)
  assert.equal(options.maxBounds[1][0] <= 180, true)
})
