import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { useMapUiStore } from '../src/features/map/mapUiStore.ts'

test('俯视锁定保留在会话 store，归北使用单调请求编号', () => {
  useMapUiStore.setState({ topDownLocked: false, northResetRequestId: 0 })
  useMapUiStore.getState().toggleTopDown()
  assert.equal(useMapUiStore.getState().topDownLocked, true)
  useMapUiStore.getState().requestNorthReset()
  useMapUiStore.getState().requestNorthReset()
  assert.equal(useMapUiStore.getState().northResetRequestId, 2)
})

test('工具栏提供可访问的俯视锁定和归北按钮', () => {
  const source = readFileSync('src/features/map/MapToolbar.tsx', 'utf8')
  assert.match(source, /aria-pressed=\{topDownLocked\}/)
  assert.match(source, /锁定俯视/)
  assert.match(source, /归北/)
  assert.match(source, /terrainAvailable/)
  assert.doesNotMatch(source, /[😀-🙏]/u)
})
