import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createTerrainController } from '../src/features/map/terrainController.ts'

function fakeMap({ zoom = 4.8 } = {}) {
  const calls = []
  return {
    calls,
    zoom,
    getZoom() { return this.zoom },
    getBearing() { return 0 },
    getSource(id) { return id === 'agot-dem' ? {} : undefined },
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

const input = { topDownLocked: false, reducedMotion: false }

test('滚轮结束的同步不强制写相机,避免顶掉滚轮缩放动画', () => {
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const handler = canvas.match(/const handleZoomEnd =[\s\S]*?\n    \}/)?.[0] ?? ''
  assert.match(handler, /event\?\.agotWheelCamera/)
  assert.match(handler, /agotWheelCamera\) \{[\s\S]*?requestSync\(terrainInput\(\)\)/)
  assert.match(handler, /requestSync\(terrainInput\(\), true\)/)
})

test('非强制同步在启用缩放即挂载地形,不积攒到停稳后爆发', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, false)
  assert.ok(map.calls.some(([name, value]) => name === 'terrain' && value?.source === 'agot-dem'))
})

test('相机运动途中不拆装地形:没有运动卸载入口', () => {
  const controller = readFileSync('src/features/map/terrainController.ts', 'utf8')
  assert.doesNotMatch(controller, /setCameraInMotion|MOTION_DETACH/)
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.doesNotMatch(canvas, /handleCameraMotion/)
})
