import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTerrainSurfaceController,
} from '../src/features/map/terrainSurfaceController.ts'
import {
  FAR_MAP_LAYER,
  MATERIAL_TERRAIN_LAYER,
  MATERIAL_TERRAIN_SOURCE,
} from '../src/features/map/mapLayers.ts'

function fixture(sourceLoaded = false) {
  const writes = []
  const layoutWrites = []
  const warnings = []
  const frames = new Map()
  let nextFrame = 1
  let loaded = sourceLoaded
  const map = {
    isSourceLoaded: (sourceId) => sourceId === MATERIAL_TERRAIN_SOURCE && loaded,
    setPaintProperty: (layerId, property, value) => writes.push([layerId, property, value]),
    setLayoutProperty: (layerId, property, value) => layoutWrites.push([layerId, property, value]),
  }
  const scheduler = {
    request(callback) {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    },
    cancel(id) { frames.delete(id) },
  }
  const controller = createTerrainSurfaceController(
    map,
    { onUnavailable: (reason) => warnings.push(reason) },
    scheduler,
  )
  return {
    controller, writes, layoutWrites, warnings, frames,
    setLoaded(value) { loaded = value },
    flush() {
      const queued = [...frames.values()]
      frames.clear()
      for (const callback of queued) callback()
    },
  }
}

test('近景地表在来源就绪后淡入覆盖,远景保留兜底并使用迟滞返回', () => {
  const state = fixture(false)
  state.controller.syncNow(2.8)
  assert.equal(state.controller.isNear(), false)
  assert.deepEqual(state.layoutWrites, [])
  state.controller.syncNow(3.05)
  assert.deepEqual(state.layoutWrites.at(-1), [MATERIAL_TERRAIN_LAYER, 'visibility', 'visible'])
  state.controller.syncNow(3.24)
  state.controller.syncNow(3.25)
  assert.equal(state.controller.isNear(), false)
  assert.deepEqual(state.writes, [])

  state.setLoaded(true)
  state.controller.handleSourceData(MATERIAL_TERRAIN_SOURCE)
  assert.equal(state.controller.isNear(), true)
  // 材质淡入时远景保持可见:快速平移缺块的区域透出远景而非黑块
  assert.deepEqual(state.writes.slice(-2), [
    [MATERIAL_TERRAIN_LAYER, 'raster-opacity', 1],
    [FAR_MAP_LAYER, 'raster-opacity', 1],
  ])

  state.controller.syncNow(3.15)
  assert.equal(state.controller.isNear(), true)
  state.controller.syncNow(3.04)
  assert.equal(state.controller.isNear(), false)
  assert.deepEqual(state.writes.slice(-2), [
    [FAR_MAP_LAYER, 'raster-opacity', 1],
    [MATERIAL_TERRAIN_LAYER, 'raster-opacity', 0],
  ])
  assert.deepEqual(state.layoutWrites.at(-1), [MATERIAL_TERRAIN_LAYER, 'visibility', 'none'])
  assert.ok(state.writes.every(([, property, value]) => property === 'raster-opacity' && (value === 0 || value === 1)))
})

test('来源失败只警告一次并立即恢复远景', () => {
  const state = fixture(true)
  state.controller.syncNow(4)
  assert.equal(state.controller.isNear(), true)
  state.controller.disable('近景地形材质不可用')
  state.controller.disable('重复错误')
  assert.equal(state.controller.isAvailable(), false)
  assert.equal(state.controller.isNear(), false)
  assert.deepEqual(state.warnings, ['近景地形材质不可用'])
  assert.deepEqual(state.writes.slice(-2), [
    [FAR_MAP_LAYER, 'raster-opacity', 1],
    [MATERIAL_TERRAIN_LAYER, 'raster-opacity', 0],
  ])
  assert.deepEqual(state.layoutWrites.at(-1), [MATERIAL_TERRAIN_LAYER, 'visibility', 'none'])
})

test('帧同步会合并连续缩放，销毁会取消待处理帧', () => {
  const state = fixture(true)
  state.controller.requestSync(3.1)
  state.controller.requestSync(3.4)
  assert.equal(state.frames.size, 1)
  state.flush()
  assert.equal(state.controller.isNear(), true)

  state.controller.requestSync(2)
  assert.equal(state.frames.size, 1)
  state.controller.destroy()
  assert.equal(state.frames.size, 0)
  state.flush()
  assert.equal(state.controller.isNear(), true)
})

test('忽略无关来源的数据事件', () => {
  const state = fixture(true)
  state.controller.syncNow(3.25)
  const writeCount = state.writes.length
  state.controller.handleSourceData('agot-dem')
  assert.equal(state.writes.length, writeCount)
})
