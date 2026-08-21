import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lifecycle = readFileSync('src/features/map/canvas/useMapLifecycle.ts', 'utf8')
const cameraSync = readFileSync('src/features/map/canvas/useMapCameraSync.ts', 'utf8')
const canvasRuntime = `${lifecycle}\n${cameraSync}`
const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')

test('MapCanvas 在 load 后创建单一地形控制器并监听连续 zoom', () => {
  assert.match(canvasRuntime, /createTerrainController/)
  assert.match(canvasRuntime, /map\.on\('zoom', handleTerrainZoom\)/)
  assert.match(canvasRuntime, /map\.off\('zoom', handleTerrainZoom\)/)
  assert.match(lifecycle, /terrainController\?\.destroy\(\)/)
  const continuous = lifecycle.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(continuous, /terrainController\?\.requestSync\(terrainInput\(\)\)/)
  assert.match(continuous, /terrainSurfaceController\?\.requestSync\(map\.getZoom\(\)\)/)
  assert.match(canvasRuntime, /const handleZoomEnd[\s\S]*?requestSync\(terrainInput\(\), true\)/)
})

test('近景材质控制器监听来源就绪并在销毁前完整解绑', () => {
  assert.match(canvasRuntime, /createTerrainSurfaceController/)
  assert.match(canvasRuntime, /map\.on\('sourcedata'/)
  assert.match(canvasRuntime, /map\.off\('sourcedata'/)
  assert.match(lifecycle, /terrainSurfaceController\?\.destroy\(\)/)
  assert.match(canvasRuntime, /terrainSurfaceController\?\.requestSync\(map\.getZoom\(\)\)/)
})

test('桌面滚轮控制器在地图生命周期内只创建一次并随状态更新', () => {
  assert.match(canvasRuntime, /createWheelCameraController/)
  assert.match(canvasRuntime, /wheelCameraControllerRef\.current\?\.update/)
  assert.match(canvasRuntime, /wheelCameraController\.destroy\(\)/)
  assert.match(canvasRuntime, /const handleZoomEnd[\s\S]*?requestSync\(terrainInput\(\), true\)/)
  const continuous = lifecycle.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.doesNotMatch(continuous, /setPitch|easeTo/)
})

test('近景材质失败只回退远景，不关闭 DEM 或整个地图', () => {
  const branch = lifecycle.match(/if \(terrainEvent\.sourceId === MATERIAL_TERRAIN_SOURCE[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(branch, /disable\('近景地形材质不可用'\)/)
  assert.doesNotMatch(branch, /terrainControllerRef|setInitializationError|onTerrainAvailabilityChange/)
})

test('搜索飞行同时携带目标 pitch', () => {
  assert.match(canvasRuntime, /flyTo\(\{[\s\S]*?pitch:/)
})

test('地形失败只降低可用性，不设置初始化失败', () => {
  assert.match(canvasRuntime, /onTerrainAvailabilityChange\(false\)/)
  assert.doesNotMatch(canvasRuntime, /onTerrainAvailabilityChange\(false\)[\s\S]{0,160}setInitializationError\(true\)/)
})

test('抽屉把会话控制传给画布和工具栏', () => {
  assert.match(drawer, /topDownLocked=\{topDownLocked\}/)
  assert.match(drawer, /northResetRequestId=\{northResetRequestId\}/)
  assert.match(drawer, /onTerrainAvailabilityChange=\{setTerrainAvailable\}/)
})
