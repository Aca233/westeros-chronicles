import assert from 'node:assert/strict'
import test from 'node:test'

import { landmarkCacheBytes, landmarkLodFor, retainedLimit, visibleLandmarkRequests } from '../src/features/map/landmarks/landmarkVisibility.ts'

function record(id, mapX, mapY, radius = 1) {
  return {
    id, locationId: `b_${id}`, provinceId: 1, name: id,
    transform: { mapX, mapY, elevationMeters: 0, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    lods: [
      { minZoom: 5.35, path: `/assets/agot-map/models/${id}/lod0.glb`, bytes: 1, triangleCount: 100, sha256: 'a'.repeat(64) },
      { minZoom: 4.6, path: `/assets/agot-map/models/${id}/lod1.glb`, bytes: 1, triangleCount: 35, sha256: 'b'.repeat(64) },
    ],
    bounds: { radiusMapPixels: radius, heightMeters: 1 },
  }
}

test('硬缩放阈值按能力选择 LOD', () => {
  assert.equal(landmarkLodFor(4.599, 'standard'), null)
  assert.equal(landmarkLodFor(4.60, 'standard'), 1)
  assert.equal(landmarkLodFor(5.349, 'standard'), 1)
  assert.equal(landmarkLodFor(5.35, 'standard'), 0)
  assert.equal(landmarkLodFor(5.35, 'low'), 1)
  assert.equal(landmarkLodFor(6, 'unsupported'), null)
})

test('视野使用模型半径缓冲、距离排序和 2/6 上限', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  const records = [record('outside', 12, 5, 2), record('near', 5, 5), record('far', 0, 0)]
  assert.deepEqual(visibleLandmarkRequests(records, bounds, 5.35, 'standard').map((item) => item.key), ['near:lod0', 'outside:lod0', 'far:lod0'])
  assert.equal(visibleLandmarkRequests(records, bounds, 5.35, 'low').length, 2)
  assert.equal(retainedLimit('standard'), 6)
  assert.equal(landmarkCacheBytes('low'), 12 * 1024 * 1024)
  assert.equal(landmarkCacheBytes('standard'), 120 * 1024 * 1024)
})
