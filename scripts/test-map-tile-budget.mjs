import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function directoryBytes(root) {
  let total = 0
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    total += entry.isDirectory() ? directoryBytes(path) : statSync(path).size
  }
  return total
}

function lowZoomBytes(kind) {
  return [0, 1, 2]
    .map((zoom) => directoryBytes(`public/assets/agot-map/${kind}/${zoom}`))
    .reduce((sum, value) => sum + value, 0)
}

test('首屏矢量瓦片保持在低缩放预算内', () => {
  const rootTileBytes = statSync('public/assets/agot-map/vector/0/0/0.pbf').size
  assert.ok(rootTileBytes <= 2_600_000, `0 级矢量瓦片过大：${rootTileBytes}`)
  assert.ok(lowZoomBytes('vector') <= 8_300_000, '0—2 级矢量瓦片总量超出预算')
})

test('首屏语义瓦片保持在低缩放预算内', () => {
  const rootTileBytes = statSync('public/assets/agot-map/semantic/0/0/0.pbf').size
  assert.ok(rootTileBytes <= 300_000, `0 级语义瓦片过大：${rootTileBytes}`)
  assert.ok(lowZoomBytes('semantic') <= 1_200_000, '0—2 级语义瓦片总量超出预算')
})
