import assert from 'node:assert/strict'
import test from 'node:test'

import {
  terrainCameraAnimation,
  terrainCameraProfile,
} from '../src/features/map/terrainProfile.ts'

const profile = (overrides = {}) => terrainCameraProfile({
  zoom: 4.8,
  mode: 'terrain',
  topDownLocked: false,
  available: true,
  terrainWasEnabled: false,
  ...overrides,
})

test('远景保持二维，近景按模式达到推荐倾角和强度', () => {
  assert.deepEqual(profile({ zoom: 2.5 }), {
    terrainEnabled: false,
    pitch: 0,
    maxPitch: 52,
    terrainExaggeration: 0.9,
    rotationEnabled: false,
  })
  assert.equal(profile({ zoom: 4.8, mode: 'terrain' }).pitch, 52)
  assert.equal(profile({ zoom: 4.8, mode: 'political' }).pitch, 42)
  for (const mode of ['characters', 'travel', 'assets']) {
    const result = profile({ zoom: 4.8, mode })
    assert.equal(result.pitch, 34)
    assert.equal(result.terrainExaggeration, 0.65)
  }
})

test('过渡区平滑插值且迟滞避免阈值抖动', () => {
  const middle = profile({ zoom: 4, terrainWasEnabled: true })
  assert.ok(middle.pitch > 0 && middle.pitch < 52)
  assert.equal(profile({ zoom: 3.15, terrainWasEnabled: false }).terrainEnabled, false)
  assert.equal(profile({ zoom: 3.15, terrainWasEnabled: true }).terrainEnabled, true)
})

test('锁定俯视和能力失败都强制二维', () => {
  for (const overrides of [{ topDownLocked: true }, { available: false }]) {
    const result = profile(overrides)
    assert.equal(result.terrainEnabled, false)
    assert.equal(result.pitch, 0)
    assert.equal(result.rotationEnabled, false)
  }
})

test('减少动态效果只改变动画，不改变最终镜头目标', () => {
  assert.deepEqual(terrainCameraAnimation(true, 'automatic'), { duration: 0, essential: false })
  assert.deepEqual(terrainCameraAnimation(false, 'reset'), { duration: 360, essential: true })
})
