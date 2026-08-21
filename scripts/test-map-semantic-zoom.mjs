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

test('五级头衔在阈值处硬切换且始终只有一个等级可见', () => {
  const cases = [
    [0.84, 'hegemon'], [0.85, 'empire'], [1.54, 'empire'], [1.55, 'kingdom'],
    [2.24, 'kingdom'], [2.25, 'duchy'], [2.94, 'duchy'], [2.95, 'county'], [6, 'county'],
  ]
  for (const [zoom, rank] of cases) {
    const state = semanticZoomState(zoom)
    assert.equal(state.primaryRank, rank)
    assert.equal(Object.values(state.weights).filter((opacity) => opacity === 1).length, 1)
    assert.equal(Object.values(state.weights).filter((opacity) => opacity === 0).length, 4)
  }
})

test('双击推进到下一个头衔观察层或本地细节层', () => {
  assert.equal(nextSemanticZoom(0), 0.85)
  assert.equal(nextSemanticZoom(0.85), 1.55)
  assert.equal(nextSemanticZoom(1.55), 2.25)
  assert.equal(nextSemanticZoom(2.25), 2.95)
  assert.equal(nextSemanticZoom(3.8), 4.6)
  assert.equal(nextSemanticZoom(5.2), 6)
})

test('伯爵领是最后一个政治等级，本地细节不创建第六级头衔', () => {
  assert.equal(semanticZoomState(5).primaryRank, 'county')
  assert.equal(semanticZoomState(5).detailMix, 1)
})

test('地图表达式使用五级硬切换且不交叉融合', () => {
  assert.deepEqual(semanticRankOpacityExpression('hegemon'), ['step', ['zoom'], 1, 0.85, 0])
  assert.deepEqual(semanticRankOpacityExpression('empire'), ['step', ['zoom'], 0, 0.85, 1, 1.55, 0])
  assert.deepEqual(semanticRankOpacityExpression('kingdom'), ['step', ['zoom'], 0, 1.55, 1, 2.25, 0])
  assert.deepEqual(semanticRankOpacityExpression('duchy'), ['step', ['zoom'], 0, 2.25, 1, 2.95, 0])
  assert.deepEqual(semanticRankOpacityExpression('county'), ['step', ['zoom'], 0, 2.95, 1])
  assert.deepEqual(semanticLabelSizeExpression('county'), [
    'interpolate', ['linear'], ['zoom'], 2.95, 15, 6, 12,
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
      disable: () => calls.push('scroll-disable'),
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
  assert.ok(calls.includes('scroll-disable'))
  assert.ok(calls.includes('double-disable'))
  listeners.get('dblclick')({ lngLat: { lng: 12, lat: 34 }, preventDefault() {} })
  const ease = calls.find((value) => Array.isArray(value) && value[0] === 'ease')
  assert.equal(ease[1].zoom, 2.25)
  assert.equal(ease[1].pitch, 22.5)
  assert.deepEqual(ease[1].around, { lng: 12, lat: 34 })
  teardown()
  assert.equal(listeners.size, 0)
})
