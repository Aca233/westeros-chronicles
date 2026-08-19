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
  const continuous = canvas.match(/const handleTerrainZoom[^\n]*/)?.[0] ?? ''
  assert.match(continuous, /requestSync\(terrainInput\(\)\)$/)
  assert.match(canvas, /const handleZoomEnd[\s\S]*?requestSync\(terrainInput\(\), true\)/)
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
