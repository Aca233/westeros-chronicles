import assert from 'node:assert/strict'
import test from 'node:test'

import { LandmarkDataError, LandmarkRepository } from '../src/features/map/landmarks/landmarkRepository.ts'
import { LANDMARK_IDS, parseLandmarkManifest } from '../src/features/map/landmarks/landmarkSchemas.ts'

const sha = 'a'.repeat(64)
function validManifest() {
  return {
    schemaVersion: 1,
    sourceId: '2962333032',
    converter: { name: 'io_pdx_mesh', commit: '2249e35f80a1cc04ba4c2b8e4c650f36b18085db' },
    assetHash: sha,
    landmarks: LANDMARK_IDS.map((id, index) => ({
      id,
      locationId: `b_landmark_${index}`,
      provinceId: index + 1,
      name: id,
      transform: { mapX: index, mapY: index, elevationMeters: 0, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      lods: [
        { minZoom: 5.35, path: `/assets/agot-map/models/${id}/lod0.glb`, bytes: 1024, triangleCount: 100, sha256: sha },
        { minZoom: 4.60, path: `/assets/agot-map/models/${id}/lod1.glb`, bytes: 512, triangleCount: 35, sha256: sha },
      ],
      bounds: { radiusMapPixels: 10, heightMeters: 20 },
    })),
  }
}

test('模型 schema 独立接受十二地标并拒绝远程或错位 LOD', () => {
  assert.equal(parseLandmarkManifest(validManifest()).schemaVersion, 1)
  const remote = validManifest()
  remote.landmarks[0].lods[0].path = 'https://example.com/model.glb'
  assert.throws(() => parseLandmarkManifest(remote))
  const duplicate = validManifest()
  duplicate.landmarks[1].locationId = duplicate.landmarks[0].locationId
  assert.throws(() => parseLandmarkManifest(duplicate))
})

test('独立仓储缓存成功请求，失败后允许重试', async () => {
  const manifest = validManifest()
  let calls = 0
  const repository = new LandmarkRepository(async () => { calls += 1; return { ok: true, json: async () => manifest } })
  assert.equal(await repository.loadManifest(), await repository.loadManifest())
  assert.equal(calls, 1)
  let attempts = 0
  const retrying = new LandmarkRepository(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('offline')
    return { ok: true, json: async () => manifest }
  })
  await assert.rejects(retrying.loadManifest(), LandmarkDataError)
  assert.equal((await retrying.loadManifest()).landmarks.length, 12)
  assert.equal(attempts, 2)
})
