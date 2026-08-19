import assert from 'node:assert/strict'
import test from 'node:test'

import { createTerrainController } from '../src/features/map/terrainController.ts'

function fakeMap({ source = {} } = {}) {
  const calls = []
  return {
    calls,
    zoom: 4.8,
    getZoom() { return this.zoom },
    getBearing() { return 17 },
    getSource(id) { return id === 'agot-dem' ? source : undefined },
    setTerrain(value) { calls.push(['terrain', value]) },
    setPitch(value) { calls.push(['pitch', value]) },
    setBearing(value) { calls.push(['bearing', value]) },
    easeTo(value) { calls.push(['ease', value]) },
    dragRotate: { enable: () => calls.push(['drag', true]), disable: () => calls.push(['drag', false]) },
    touchZoomRotate: {
      enableRotation: () => calls.push(['touchRotate', true]),
      disableRotation: () => calls.push(['touchRotate', false]),
    },
    touchPitch: { enable: () => calls.push(['touchPitch', true]), disable: () => calls.push(['touchPitch', false]) },
  }
}

const input = { mode: 'terrain', topDownLocked: false, reducedMotion: false }

test('近景连接唯一 DEM source 并启用旋转', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, true)
  assert.deepEqual(map.calls[0], ['terrain', { source: 'agot-dem', exaggeration: 0.9 }])
  assert.ok(map.calls.some(([name, value]) => name === 'ease' && value.pitch === 52 && value.bearing === 17))
  assert.ok(map.calls.some(([name, value]) => name === 'drag' && value === true))
})

test('俯视锁定卸载地形、关闭旋转并恢复朝北', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, true)
  controller.syncNow({ ...input, topDownLocked: true }, true)
  assert.ok(map.calls.some(([name, value]) => name === 'terrain' && value === null))
  assert.ok(map.calls.some(([name, value]) => name === 'ease' && value.pitch === 0 && value.bearing === 0))
})

test('缺失 DEM 或 setTerrain 异常只回退二维一次', () => {
  for (const map of [
    fakeMap({ source: null }),
    Object.assign(fakeMap(), { setTerrain() { throw new Error('terrain failed') } }),
  ]) {
    const unavailable = []
    const controller = createTerrainController(map, { onUnavailable: (reason) => unavailable.push(reason) })
    assert.doesNotThrow(() => controller.syncNow(input, true))
    controller.syncNow(input, true)
    assert.equal(unavailable.length, 1)
    assert.equal(controller.isAvailable(), false)
    assert.ok(map.calls.some(([name, value]) => name === 'drag' && value === false))
  }
})

test('二维回退即使相机和手势已损坏也不会向外抛错', () => {
  const map = fakeMap({ source: null })
  map.setTerrain = () => { throw new Error('terrain broken') }
  map.setPitch = () => { throw new Error('pitch broken') }
  map.setBearing = () => { throw new Error('bearing broken') }
  map.dragRotate.disable = () => { throw new Error('gesture broken') }
  const unavailable = []
  const controller = createTerrainController(map, { onUnavailable: (reason) => unavailable.push(reason) })
  assert.doesNotThrow(() => controller.syncNow(input, true))
  assert.equal(unavailable.length, 1)
})

test('连续请求合并为一帧且 destroy 取消未执行帧', () => {
  const queued = []
  const cancelled = []
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} }, {
    request: (callback) => { queued.push(callback); return queued.length },
    cancel: (id) => cancelled.push(id),
  })
  controller.requestSync(input)
  controller.requestSync({ ...input, mode: 'political' })
  assert.equal(queued.length, 1)
  controller.destroy()
  assert.deepEqual(cancelled, [1])
})

test('连续缩放阶段不写相机，避免中断 MapLibre 正在进行的缩放', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, true)
  map.calls.length = 0
  map.zoom = 2.8
  controller.syncNow(input, false)
  assert.equal(map.calls.some(([name]) => name === 'pitch' || name === 'bearing' || name === 'ease'), false)
})

test('归北保留缩放中心并恢复推荐倾角', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, true)
  map.calls.length = 0
  controller.resetNorth(input)
  const call = map.calls.find(([name]) => name === 'ease')
  assert.deepEqual(call, ['ease', { pitch: 52, bearing: 0, duration: 360, essential: true }])
})
