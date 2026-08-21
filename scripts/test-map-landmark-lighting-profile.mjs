import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CINEMATIC_SUN_ALTITUDE_DEGREES,
  CINEMATIC_SUN_AZIMUTH_DEGREES,
  cinematicSunSourceDirection,
  landmarkLightingProfile,
} from '../src/features/map/landmarks/landmarkLightingProfile.ts'
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

test('固定下午太阳从西北偏西上方照射', () => {
  assert.equal(CINEMATIC_SUN_AZIMUTH_DEGREES, 310)
  assert.equal(CINEMATIC_SUN_ALTITUDE_DEGREES, 35)
  const [east, south, up] = cinematicSunSourceDirection()
  assert.ok(east < 0)
  assert.ok(south < 0)
  assert.ok(up > 0)
  assert.ok(Math.abs(Math.hypot(east, south, up) - 1) < 1e-12)
})

test('光影质量按硬件一次性分为高、中、低三档', () => {
  const high = landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 8 })
  assert.equal(high.quality, 'high')
  assert.equal(high.shadowMapSize, 2048)
  assert.equal(high.realtimeShadowLimit, 2)
  assert.ok(high.sunIntensity >= 2.2 && high.sunIntensity <= 2.7)
  assert.ok(high.ambientIntensity >= 0.12 && high.ambientIntensity <= 0.22)
  assert.ok(high.hemisphereIntensity >= 0.35 && high.hemisphereIntensity <= 0.55)
  assert.ok(high.shadowIntensity >= 0.18 && high.shadowIntensity <= 0.28)

  const medium = landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 4 })
  assert.equal(medium.quality, 'medium')
  assert.equal(medium.shadowMapSize, 1024)
  assert.equal(medium.realtimeShadowLimit, 1)

  const low = landmarkLightingProfile({ hardwareConcurrency: 4, deviceMemory: 8 })
  assert.equal(low.quality, 'low')
  assert.equal(low.shadowMapSize, 0)
  assert.equal(low.realtimeShadowLimit, 0)

  assert.equal(landmarkLightingProfile({}).quality, 'medium')
})

test('地形光照由固定电影太阳烘焙瓦片提供', () => {
  const style = createLocalMapStyle(manifest)
  const lighting = style.layers.find(({ id }) => id === 'agot-terrain-light')
  assert.deepEqual(style.sources['agot-terrain-light'].tiles, [manifest.paths.terrainLight])
  assert.equal(lighting.source, 'agot-terrain-light')
  assert.equal(style.layers.some(({ id }) => id === 'agot-hillshade'), false)
})
