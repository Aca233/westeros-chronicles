import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')

test('MapCanvas 在 load 后创建单一地形控制器并监听连续 zoom', () => {
  assert.match(canvas, /createTerrainController/)
  assert.match(canvas, /map\.on\('zoom', handleTerrainZoom\)/)
  assert.match(canvas, /map\.off\('zoom', handleTerrainZoom\)/)
  assert.match(canvas, /terrainController\.destroy\(\)/)
  const continuous = canvas.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(continuous, /terrainController\?\.requestSync\(terrainInput\(\)\)/)
  assert.match(continuous, /terrainSurfaceController\?\.requestSync\(map\.getZoom\(\)\)/)
  assert.match(canvas, /const handleZoomEnd[\s\S]*?requestSync\(terrainInput\(\), true\)/)
})

test('近景材质控制器监听来源就绪并在销毁前完整解绑', () => {
  assert.match(canvas, /createTerrainSurfaceController/)
  assert.match(canvas, /map\.on\('sourcedata'/)
  assert.match(canvas, /map\.off\('sourcedata'/)
  assert.match(canvas, /terrainSurfaceController\.destroy\(\)/)
  assert.match(canvas, /terrainSurfaceController\?\.requestSync\(map\.getZoom\(\)\)/)
})

test('桌面滚轮控制器在地图生命周期内只创建一次并随状态更新', () => {
  assert.match(canvas, /createWheelCameraController/)
  assert.match(canvas, /wheelCameraControllerRef\.current\?\.update/)
  assert.match(canvas, /wheelCameraController\.destroy\(\)/)
  assert.match(canvas, /const handleZoomEnd[\s\S]*?requestSync\(terrainInput\(\), true\)/)
  const continuous = canvas.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.doesNotMatch(continuous, /setPitch|easeTo/)
})

test('近景材质失败只回退远景，不关闭 DEM 或整个地图', () => {
  const branch = canvas.match(/if \(terrainEvent\.sourceId === MATERIAL_TERRAIN_SOURCE[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(branch, /disable\('近景地形材质不可用'\)/)
  assert.doesNotMatch(branch, /terrainControllerRef|setInitializationError|onTerrainAvailabilityChange/)
})

test('搜索飞行同时携带目标 pitch', () => {
  assert.match(canvas, /flyTo\(\{[\s\S]*?pitch:/)
})

test('地形失败只降低可用性，不设置初始化失败', () => {
  assert.match(canvas, /onTerrainAvailabilityChange\(false\)/)
  assert.doesNotMatch(canvas, /onTerrainAvailabilityChange\(false\)[\s\S]{0,160}setInitializationError\(true\)/)
})

test('抽屉把会话控制传给画布和工具栏', () => {
  assert.match(drawer, /topDownLocked=\{topDownLocked\}/)
  assert.match(drawer, /northResetRequestId=\{northResetRequestId\}/)
  assert.match(drawer, /onTerrainAvailabilityChange=\{setTerrainAvailable\}/)
})
