import assert from 'node:assert/strict'
import test from 'node:test'
import { Vector3 } from 'three'

import { landmarkAnchor, landmarkModelMatrix } from '../src/features/map/landmarks/landmarkTransform.ts'

const manifest = { westerosBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, mapSize: { width: 100, height: 100 } }
const rectangularManifest = { westerosBounds: { minX: 0, minY: 0, maxX: 100, maxY: 200 }, mapSize: { width: 100, height: 200 } }
const record = {
  id: 'test', locationId: 'b_test', provinceId: 1, name: 'test',
  transform: { mapX: 50, mapY: 50, elevationMeters: 100, rotation: [0, 0, 0, 1], scale: [2, 3, 4] },
  lods: [], bounds: { radiusMapPixels: 1, heightMeters: 1 },
}

test('锚点使用离线高程与地形视觉倍率', () => {
  const normal = landmarkAnchor(record, manifest, 1)
  const exaggerated = landmarkAnchor(record, manifest, 32)
  assert.ok(exaggerated.z > normal.z)
  assert.equal(normal.x, 0.5)
  assert.equal(normal.y, 0.5)
})

test('矩阵把模型 X/Y/Z 映射到地图 X/海拔/Y 并只应用一次 scale', () => {
  const matrix = landmarkModelMatrix(record, manifest, 1)
  const origin = new Vector3(0, 0, 0).applyMatrix4(matrix)
  const east = new Vector3(1, 0, 0).applyMatrix4(matrix)
  const up = new Vector3(0, 1, 0).applyMatrix4(matrix)
  const south = new Vector3(0, 0, 1).applyMatrix4(matrix)
  assert.ok(east.x > origin.x)
  assert.ok(up.z > origin.z)
  assert.ok(south.y < origin.y)
  assert.ok(Math.abs((east.x - origin.x) - 0.02) < 1e-12)
  assert.ok(matrix.determinant() > 0, '坐标基变换不能镜像模型面朝向')
})


test('非正方形地图分别按宽高换算平面轴，并保持模型垂直体积', () => {
  const terrainScale = 2
  const matrix = landmarkModelMatrix(record, rectangularManifest, terrainScale)
  const origin = new Vector3(0, 0, 0).applyMatrix4(matrix)
  const east = new Vector3(1, 0, 0).applyMatrix4(matrix)
  const up = new Vector3(0, 1, 0).applyMatrix4(matrix)
  const north = new Vector3(0, 0, 1).applyMatrix4(matrix)

  assert.ok(Math.abs((east.x - origin.x) - record.transform.scale[0] / 100) < 1e-12)
  assert.ok(Math.abs((north.y - origin.y) + record.transform.scale[2] / 200) < 1e-12)
  assert.ok(Math.abs((up.z - origin.z) - record.transform.scale[1] / 100) < 1e-12)
  assert.ok((up.z - origin.z) / (east.x - origin.x) > 1, '模型高度不能坍缩成平面')
  assert.ok(matrix.determinant() > 0, '非均匀轴换算不能镜像模型面朝向')
})
