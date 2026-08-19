import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createWheelCameraController,
  normalizeWheelDelta,
} from '../src/features/map/wheelCameraController.ts'

function fixture({ zoom = 3, minZoom = 0, maxZoom = 6 } = {}) {
  const cameraCalls = []
  const added = []
  const removed = []
  const mapListeners = new Map()
  let currentZoom = zoom
  let scrollDisabled = 0
  const canvas = {
    clientHeight: 800,
    addEventListener: (...args) => added.push(args),
    removeEventListener: (...args) => removed.push(args),
  }
  const map = {
    scrollZoom: { disable: () => { scrollDisabled += 1 } },
    getCanvas: () => canvas,
    getZoom: () => currentZoom,
    getMinZoom: () => minZoom,
    getMaxZoom: () => maxZoom,
    unproject: ([x, y]) => ({ lng: x / 10, lat: y / 10 }),
    easeTo: (options) => cameraCalls.push(options),
    on: (event, listener) => mapListeners.set(event, listener),
    off: (event, listener) => {
      if (mapListeners.get(event) === listener) mapListeners.delete(event)
    },
  }
  return {
    map, canvas, cameraCalls, added, removed, mapListeners,
    get scrollDisabled() { return scrollDisabled },
    setZoom(value) { currentZoom = value },
    wheel(deltaY, deltaMode = 0, offsetX = 120, offsetY = 80) {
      let prevented = false
      const listener = added.find(([type]) => type === 'wheel')?.[1]
      listener({ deltaY, deltaMode, offsetX, offsetY, preventDefault: () => { prevented = true } })
      return prevented
    },
  }
}

test('滚轮增量按像素、行和页面统一换算', () => {
  assert.equal(normalizeWheelDelta(100, 0, 800), 100)
  assert.equal(normalizeWheelDelta(2, 1, 800), 32)
  assert.equal(normalizeWheelDelta(0.5, 2, 800), 400)
  assert.equal(normalizeWheelDelta(Number.NaN, 0, 800), 0)
})

test('一次滚轮用同一 easeTo 连续提交缩放、倾角和指针锚点', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: (zoom) => zoom * 10,
  })
  assert.equal(state.scrollDisabled, 1)
  assert.equal(state.wheel(-120), true)
  assert.deepEqual(state.cameraCalls[0], {
    zoom: 3.2,
    pitch: 32,
    around: { lng: 12, lat: 8 },
    duration: 220,
    essential: true,
  })
  controller.destroy()
})

test('连续滚轮累积目标并限制在地图缩放范围内', () => {
  const state = fixture({ zoom: 5.9 })
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: (zoom) => zoom,
  })
  state.wheel(-120)
  state.wheel(-120)
  assert.deepEqual(state.cameraCalls.map((call) => call.zoom), [6, 6])
  state.setZoom(1)
  state.mapListeners.get('zoomend')()
  state.wheel(1200)
  assert.equal(state.cameraCalls.at(-1).zoom, 0)
  controller.destroy()
})

test('更新减少动态效果后立即改用无动画镜头', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: () => 30,
  })
  controller.update({ reducedMotion: true, targetPitch: () => 0 })
  state.wheel(-60)
  assert.equal(state.cameraCalls[0].duration, 0)
  assert.equal(state.cameraCalls[0].essential, false)
  assert.equal(state.cameraCalls[0].pitch, 0)
  controller.destroy()
})

test('销毁移除同一个非被动滚轮监听并解除镜头校准监听', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: () => 0,
  })
  const wheelRegistration = state.added.find(([type]) => type === 'wheel')
  assert.deepEqual(wheelRegistration[2], { passive: false })
  controller.destroy()
  assert.equal(state.removed.length, 1)
  assert.equal(state.removed[0][0], 'wheel')
  assert.equal(state.removed[0][1], wheelRegistration[1])
  assert.equal(state.removed[0][2], wheelRegistration[2])
  assert.equal(state.mapListeners.has('zoomend'), false)
})
