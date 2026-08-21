import assert from 'node:assert/strict'
import test from 'node:test'

import { landmarkTextureFill } from '../src/features/map/landmarks/landmarkMaterialProfile.ts'

test('偏暗地标只获得防纯黑的低强度纹理补光', () => {
  const harrenhal = landmarkTextureFill('harrenhal', 'building_special_HH_Dread_ruinedShape')
  const pyke = landmarkTextureFill('pyke', 'building_special_pyke01Shape')
  const dragonstone = landmarkTextureFill('dragonstone', 'building_special_dragonstoneShape')
  assert.ok(harrenhal > 0 && harrenhal <= 0.14)
  assert.ok(pyke > 0 && pyke < harrenhal)
  assert.ok(dragonstone > 0 && dragonstone <= 0.06)
  assert.equal(landmarkTextureFill('highgarden', 'building_special_highgardenShape'), 0)
})
