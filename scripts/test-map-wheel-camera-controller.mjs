import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createWheelCameraController,
  normalizeWheelDelta,
} from '../src/features/map/wheelCameraController.ts'

function fixture({ zoom = 3, minZoom = 0, maxZoom = 6, cancelPreviousEase = false } = {}) {
  const cameraCalls = []
  const added = []
  const removed = []
  const mapListeners = new Map()
  let currentZoom = zoom
  let scrollDisabled = 0
  const frames = new Map()
  let nextFrame = 1
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
    easeTo: (options, eventData) => {
      cameraCalls.push({ ...options, eventData })
      if (cancelPreviousEase) {
        currentZoom += 0.01
        mapListeners.get('zoomend')?.(eventData)
      }
    },
    on: (event, listener) => mapListeners.set(event, listener),
    off: (event, listener) => {
      if (mapListeners.get(event) === listener) mapListeners.delete(event)
    },
  }
  return {
    map, canvas, cameraCalls, added, removed, mapListeners,
    scheduler: {
      request(callback) {
        const id = nextFrame++
        frames.set(id, callback)
        return id
      },
      cancel(id) { frames.delete(id) },
    },
    flushFrame() {
      const queued = [...frames.values()]
      frames.clear()
      for (const callback of queued) callback()
    },
    get pendingFrames() { return frames.size },
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
  }, state.scheduler)
  assert.equal(state.scrollDisabled, 1)
  assert.equal(state.wheel(-120), true)
  assert.equal(state.cameraCalls.length, 0)
  state.flushFrame()
  const { easing, ...cameraCall } = state.cameraCalls[0]
  assert.deepEqual(cameraCall, {
    zoom: 10 / 3,
    pitch: 100 / 3,
    around: { lng: 12, lat: 8 },
    duration: 90,
    essential: true,
    easeId: 'agot-wheel-camera',
    eventData: { agotWheelCamera: true },
  })
  assert.equal(easing(0.25), 0.25)
  assert.equal(easing(0.75), 0.75)
  controller.destroy()
})

test('上一段滚轮动画被新输入取消时不会把累计目标重置到中间帧', () => {
  const state = fixture({ cancelPreviousEase: true })
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: (zoom) => zoom,
  }, state.scheduler)
  state.wheel(-120)
  state.flushFrame()
  state.wheel(-120)
  state.flushFrame()
  state.wheel(-120)
  state.flushFrame()
  assert.deepEqual(
    state.cameraCalls.map((call) => call.easeId),
    ['agot-wheel-camera', 'agot-wheel-camera', 'agot-wheel-camera'],
  )
  const expectedZooms = [10 / 3, 11 / 3, 4]
  state.cameraCalls.forEach((call, index) => {
    assert.ok(Math.abs(call.zoom - expectedZooms[index]) < 1e-9)
  })
  controller.destroy()
})

test('连续滚轮累积目标并限制在地图缩放范围内', () => {
  const state = fixture({ zoom: 5.9 })
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: (zoom) => zoom,
  }, state.scheduler)
  state.wheel(-120)
  state.flushFrame()
  state.wheel(-120)
  state.flushFrame()
  assert.deepEqual(state.cameraCalls.map((call) => call.zoom), [6, 6])
  state.setZoom(1)
  state.mapListeners.get('zoomend')()
  state.wheel(1200)
  state.flushFrame()
  assert.equal(state.cameraCalls.at(-1).zoom, 0)
  controller.destroy()
})

test('更新减少动态效果后立即改用无动画镜头', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: () => 30,
  }, state.scheduler)
  controller.update({ reducedMotion: true, targetPitch: () => 0 })
  state.wheel(-60)
  state.flushFrame()
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
  }, state.scheduler)
  const wheelRegistration = state.added.find(([type]) => type === 'wheel')
  assert.deepEqual(wheelRegistration[2], { passive: false })
  controller.destroy()
  assert.equal(state.removed.length, 1)
  assert.equal(state.removed[0][0], 'wheel')
  assert.equal(state.removed[0][1], wheelRegistration[1])
  assert.equal(state.removed[0][2], wheelRegistration[2])
  assert.equal(state.mapListeners.has('zoomend'), false)
})

test('同一渲染帧内的高频滚轮只提交一次镜头更新', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: (zoom) => zoom * 10,
  }, state.scheduler)
  state.wheel(-40, 0, 100, 80)
  state.wheel(-40, 0, 110, 90)
  state.wheel(-40, 0, 120, 100)
  assert.equal(state.pendingFrames, 1)
  assert.equal(state.cameraCalls.length, 0)
  state.flushFrame()
  assert.equal(state.cameraCalls.length, 1)
  assert.equal(state.cameraCalls[0].zoom, 10 / 3)
  assert.deepEqual(state.cameraCalls[0].around, { lng: 12, lat: 10 })
  controller.destroy()
})

test('销毁控制器会取消尚未提交的滚轮帧', () => {
  const state = fixture()
  const controller = createWheelCameraController(state.map, {
    reducedMotion: false,
    targetPitch: () => 0,
  }, state.scheduler)
  state.wheel(-120)
  assert.equal(state.pendingFrames, 1)
  controller.destroy()
  assert.equal(state.pendingFrames, 0)
  state.flushFrame()
  assert.equal(state.cameraCalls.length, 0)
})
