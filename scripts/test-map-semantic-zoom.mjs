import assert from 'node:assert/strict'
import test from 'node:test'

import {
  nextSemanticZoom,
  semanticLabelSizeExpression,
  semanticRankOpacityExpression,
  semanticZoomState,
} from '../src/features/map/semanticZoom.ts'
import {
  cameraAnimation,
  configureCk3Camera,
  createCk3MapOptions,
} from '../src/features/map/cameraProfile.ts'

const manifest = {
  westerosBounds: { minX: 1024, minY: 512, maxX: 7168, maxY: 5632 },
}

test('三级权重在两个行政重叠区连续交叉且总和为一', () => {
  assert.deepEqual(semanticZoomState(0).weights, { realm: 1, duchy: 0, county: 0 })
  assert.deepEqual(semanticZoomState(1.25).weights, { realm: 0.5, duchy: 0.5, county: 0 })
  assert.deepEqual(semanticZoomState(2.65).weights, { realm: 0, duchy: 0.5, county: 0.5 })
  assert.deepEqual(semanticZoomState(4.25).weights, { realm: 0, duchy: 0, county: 1 })
  assert.deepEqual(semanticZoomState(6).weights, { realm: 0, duchy: 0, county: 1 })
  assert.equal(semanticZoomState(4.25).detailMix, 0.5)
  for (const zoom of [0, 1.1, 1.25, 1.4, 2.5, 2.65, 2.8, 4.25, 6]) {
    const state = semanticZoomState(zoom)
    assert.equal(state.weights.realm + state.weights.duchy + state.weights.county, 1)
  }
})

test('双击只推进到下一个语义观察层', () => {
  assert.equal(nextSemanticZoom(0), 2)
  assert.equal(nextSemanticZoom(2.2), 3.4)
  assert.equal(nextSemanticZoom(3.8), 5)
  assert.equal(nextSemanticZoom(5.2), 6)
})

test('伯爵领细节观察点不会创建第四个行政层', () => {
  assert.equal(semanticZoomState(5).primaryRank, 'county')
  assert.equal(semanticZoomState(5).detailMix, 1)
})

test('地图表达式使用三级行政交叉且细节不构成第四层', () => {
  assert.deepEqual(semanticRankOpacityExpression('realm'), [
    'interpolate', ['linear'], ['zoom'], 0, 1, 1.1, 1, 1.4, 0,
  ])
  assert.deepEqual(semanticRankOpacityExpression('duchy'), [
    'interpolate', ['linear'], ['zoom'], 1.1, 0, 1.4, 1, 2.5, 1, 2.8, 0,
  ])
  assert.deepEqual(semanticRankOpacityExpression('county'), [
    'interpolate', ['linear'], ['zoom'], 2.5, 0, 2.8, 1, 6, 1,
  ])
  assert.deepEqual(semanticLabelSizeExpression('county'), [
    'interpolate', ['linear'], ['zoom'], 2.5, 15, 6, 12,
  ])
})

test('减少动态效果关闭长动画并保留语义跳转时长', () => {
  assert.deepEqual(cameraAnimation(true, 'search'), { duration: 0, essential: false })
  assert.deepEqual(cameraAnimation(false, 'search'), { duration: 850, essential: true })
  assert.deepEqual(cameraAnimation(false, 'semantic'), { duration: 420, essential: true })
})

test('镜头配置使用 MapLibre 安全的维斯特洛边界并完整清理自有双击监听', () => {
  const options = createCk3MapOptions(manifest, true)
  assert.equal(options.zoomSnap, 0)
  assert.equal(options.minZoom, 0)
  assert.equal(options.maxZoom, 6)
  assert.equal(options.maxPitch, 55)
  assert.equal(options.pitchWithRotate, true)
  assert.equal(options.dragRotate, false)
  assert.equal(options.touchPitch, false)
  assert.equal(options.renderWorldCopies, false)
  assert.ok(options.maxBounds[0][0] > -180)
  assert.ok(options.maxBounds[0][0] < -179.999)
  assert.ok(options.maxBounds[1][0] < 180)
  assert.ok(options.maxBounds[1][0] > 179.999)
  assert.ok(options.maxBounds[1][0] - options.maxBounds[0][0] > 359)
  assert.ok(Math.abs(options.maxBounds[0][1] + 85.05112878) < 1e-8)
  assert.ok(Math.abs(options.maxBounds[1][1] - 85.05112878) < 1e-8)

  const calls = []
  const listeners = new Map()
  const map = {
    scrollZoom: {
      enable: () => calls.push('scroll-enable'),
      setWheelZoomRate: (rate) => calls.push(['wheel', rate]),
      setZoomRate: (rate) => calls.push(['zoom', rate]),
    },
    doubleClickZoom: { disable: () => calls.push('double-disable') },
    dragRotate: { disable: () => calls.push('drag-rotate-disable') },
    touchZoomRotate: {
      enable: () => calls.push('touch-enable'),
      disableRotation: () => calls.push('touch-rotate-disable'),
    },
    touchPitch: { disable: () => calls.push('touch-pitch-disable') },
    keyboard: { disableRotation: () => calls.push('keyboard-rotate-disable') },
    getZoom: () => 2.2,
    easeTo: (value) => calls.push(['ease', value]),
    on: (name, listener) => { listeners.set(name, listener); calls.push(['on', name]) },
    off: (name, listener) => {
      assert.equal(listeners.get(name), listener)
      listeners.delete(name)
      calls.push(['off', name])
    },
  }
  const teardown = configureCk3Camera(map, false, (zoom) => zoom * 10)
  assert.ok(calls.some((value) => Array.isArray(value) && value[0] === 'wheel' && value[1] === 1 / 600))
  assert.ok(calls.some((value) => Array.isArray(value) && value[0] === 'zoom' && value[1] === 1 / 160))
  assert.ok(calls.includes('double-disable'))
  listeners.get('dblclick')({ lngLat: { lng: 12, lat: 34 }, preventDefault() {} })
  const ease = calls.find((value) => Array.isArray(value) && value[0] === 'ease')
  assert.equal(ease[1].zoom, 3.4)
  assert.equal(ease[1].pitch, 34)
  assert.deepEqual(ease[1].around, { lng: 12, lat: 34 })
  teardown()
  assert.equal(listeners.size, 0)
})
