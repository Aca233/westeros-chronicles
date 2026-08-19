# CK3 式近景三维地形 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用现有离线 Terrain-RGB DEM 为维斯特洛地图增加按缩放自动过渡的近景三维地形、可旋转镜头、俯视锁定、归北控制和可靠的二维回退。

**Architecture:** 新增纯函数 `terrainProfile.ts` 集中计算各地图模式的倾角、夸张系数和迟滞阈值，再由独立的 `terrainController.ts` 把这些结果安全应用到现有 MapLibre 实例。`MapCanvas` 只负责生命周期和事件接线，`mapUiStore` 只保存会话级俯视偏好与一次性归北请求；政治、语义、人物、资产、地点和旅行继续使用原图层与权威状态。

**Tech Stack:** React 18、TypeScript 5.7、Zustand 5、MapLibre GL JS 5.24、本地 Terrain-RGB DEM、Node test runner、Vite 6。

**Spec:** `docs/superpowers/specs/2026-08-19-ck3-near-terrain-design.md`

## Global Constraints

- 远景保持二维俯视；`zoom 3.2–4.8` 平滑进入近景三维，`zoom >= 4.8` 达到当前模式推荐倾角。
- 地形模式、政治模式、人物模式、旅行模式和资产模式必须共用同一个 MapLibre 实例与同一个 `agot-dem` source。
- 运行时不得读取 `/mnt/c/agot/2962333032`、Steam、Workshop 或网络资源。
- 原始 `9216×6144` 像素坐标继续作为地点、旅行和世界逻辑坐标，三维表现不得改变游戏计算。
- 地形失败只能回退二维，不能设置地图初始化失败、关闭抽屉或破坏政治、人物、资产、旅行和伯爵领交互。
- `MapViewport` 只保存 center 与 zoom；pitch 由缩放和模式推导，bearing 重新打开地图时固定归零。
- “锁定俯视”只保存在当前应用会话，不进入游戏存档，不提升存档格式版本。
- UI 禁止 Emoji；无合适 CK3/AGOT 小尺寸控制图标时使用 Lucide `Layers3` 与 `Compass`。
- 手写源码只通过 `apply_patch` 修改；`node_modules` 软链接不得暂存或提交。
- 不新增 Three.js、第二个 WebGL 画布、3D 建筑、树林、军队、船只、云层、天气或昼夜系统。

---

## File Structure

- Create `src/features/map/terrainProfile.ts`: 纯函数镜头曲线、模式常量、迟滞与目标动画参数。
- Create `src/features/map/terrainController.ts`: MapLibre terrain 生命周期、单帧节流、手势开关、归北与失败回退。
- Modify `src/features/map/cameraProfile.ts`: 将现有固定二维相机上限调整为三维可用，并让语义双击接收目标 pitch。
- Modify `src/features/map/mapUiStore.ts`: 会话级俯视锁定与归北请求编号。
- Modify `src/features/map/MapToolbar.tsx`: 俯视锁定和归北按钮。
- Modify `src/features/map/MapDrawer.tsx`: 在工具栏、画布与会话状态之间传递控制和可用性。
- Modify `src/features/map/MapCanvas.tsx`: 创建控制器、接入 zoom/模式/搜索/错误/销毁生命周期。
- Modify `src/index.css`: 两个紧凑相机控制按钮及移动端、禁用态样式。
- Create `scripts/test-map-terrain-profile.mjs`: 镜头曲线与迟滞纯逻辑测试。
- Create `scripts/test-map-terrain-controller.mjs`: MapLibre 适配器、节流、回退和清理测试。
- Create `scripts/test-map-terrain-ui.mjs`: Zustand 与工具栏结构测试。
- Create `scripts/test-map-terrain-integration.mjs`: MapCanvas、相机、模式与错误隔离接线测试。
- Modify `scripts/test-map-semantic-zoom.mjs`: 双击语义缩放同步 pitch 的回归测试。
- Modify `scripts/test-map-integration.mjs`: 重开地图不保存 bearing、失败保持二维交互的回归测试。
- Modify `scripts/check-map-runtime-boundaries.mjs`: 禁止第二渲染器、网络地形与连续缩放重投影。
- Modify `package.json`: 注册四个地形测试并加入 `verify:map`。

---

### Task 1: 纯函数地形镜头配置

**Files:**
- Create: `src/features/map/terrainProfile.ts`
- Create: `scripts/test-map-terrain-profile.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MapMode` from `src/features/map/mapLayers.ts`。
- Produces: `TerrainProfileInput`、`TerrainCameraProfile`、`terrainCameraProfile(input)`、`terrainCameraAnimation(reducedMotion, kind)`。
- Constants: `TERRAIN_ENTER_ZOOM = 3.25`、`TERRAIN_EXIT_ZOOM = 3.05`、`TERRAIN_TRANSITION_START = 3.2`、`TERRAIN_TRANSITION_END = 4.8`、`TERRAIN_MAX_PITCH = 55`。

- [ ] **Step 1: 写失败的镜头曲线测试**

```js
// scripts/test-map-terrain-profile.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  terrainCameraAnimation,
  terrainCameraProfile,
} from '../src/features/map/terrainProfile.ts'

const profile = (overrides = {}) => terrainCameraProfile({
  zoom: 4.8,
  mode: 'terrain',
  topDownLocked: false,
  available: true,
  terrainWasEnabled: false,
  ...overrides,
})

test('远景保持二维，近景按模式达到推荐倾角和强度', () => {
  assert.deepEqual(profile({ zoom: 2.5 }), {
    terrainEnabled: false,
    pitch: 0,
    maxPitch: 52,
    terrainExaggeration: 0.9,
    rotationEnabled: false,
  })
  assert.equal(profile({ zoom: 4.8, mode: 'terrain' }).pitch, 52)
  assert.equal(profile({ zoom: 4.8, mode: 'political' }).pitch, 42)
  for (const mode of ['characters', 'travel', 'assets']) {
    const result = profile({ zoom: 4.8, mode })
    assert.equal(result.pitch, 34)
    assert.equal(result.terrainExaggeration, 0.65)
  }
})

test('过渡区平滑插值且迟滞避免阈值抖动', () => {
  const middle = profile({ zoom: 4, terrainWasEnabled: true })
  assert.ok(middle.pitch > 0 && middle.pitch < 52)
  assert.equal(profile({ zoom: 3.15, terrainWasEnabled: false }).terrainEnabled, false)
  assert.equal(profile({ zoom: 3.15, terrainWasEnabled: true }).terrainEnabled, true)
})

test('锁定俯视和能力失败都强制二维', () => {
  for (const overrides of [{ topDownLocked: true }, { available: false }]) {
    const result = profile(overrides)
    assert.equal(result.terrainEnabled, false)
    assert.equal(result.pitch, 0)
    assert.equal(result.rotationEnabled, false)
  }
})

test('减少动态效果只改变动画，不改变最终镜头目标', () => {
  assert.deepEqual(terrainCameraAnimation(true, 'automatic'), { duration: 0, essential: false })
  assert.deepEqual(terrainCameraAnimation(false, 'reset'), { duration: 360, essential: true })
})
```

- [ ] **Step 2: 注册测试并确认失败**

Use `apply_patch` to add:

```json
"test:map-terrain-profile": "node --experimental-strip-types scripts/test-map-terrain-profile.mjs"
```

Run: `npm run test:map-terrain-profile`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `terrainProfile.ts`。

- [ ] **Step 3: 实现集中式镜头配置**

```ts
// src/features/map/terrainProfile.ts
import type { MapMode } from './mapLayers.ts'

export const TERRAIN_ENTER_ZOOM = 3.25
export const TERRAIN_EXIT_ZOOM = 3.05
export const TERRAIN_TRANSITION_START = 3.2
export const TERRAIN_TRANSITION_END = 4.8
export const TERRAIN_MAX_PITCH = 55

const MODE_PROFILE: Record<MapMode, { pitch: number; exaggeration: number }> = {
  terrain: { pitch: 52, exaggeration: 0.9 },
  political: { pitch: 42, exaggeration: 0.78 },
  characters: { pitch: 34, exaggeration: 0.65 },
  travel: { pitch: 34, exaggeration: 0.65 },
  assets: { pitch: 34, exaggeration: 0.65 },
}

export interface TerrainProfileInput {
  zoom: number
  mode: MapMode
  topDownLocked: boolean
  available: boolean
  terrainWasEnabled: boolean
}

export interface TerrainCameraProfile {
  terrainEnabled: boolean
  pitch: number
  maxPitch: number
  terrainExaggeration: number
  rotationEnabled: boolean
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
}

export function terrainCameraProfile(input: TerrainProfileInput): TerrainCameraProfile {
  const mode = MODE_PROFILE[input.mode]
  const allowed = input.available && !input.topDownLocked
  const threshold = input.terrainWasEnabled ? TERRAIN_EXIT_ZOOM : TERRAIN_ENTER_ZOOM
  const terrainEnabled = allowed && input.zoom >= threshold
  const progress = allowed
    ? smoothstep((input.zoom - TERRAIN_TRANSITION_START) / (TERRAIN_TRANSITION_END - TERRAIN_TRANSITION_START))
    : 0
  return {
    terrainEnabled,
    pitch: Math.round(mode.pitch * progress * 100) / 100,
    maxPitch: mode.pitch,
    terrainExaggeration: mode.exaggeration,
    rotationEnabled: terrainEnabled,
  }
}

export type TerrainAnimationKind = 'automatic' | 'reset' | 'search'

export function terrainCameraAnimation(
  reducedMotion: boolean,
  kind: TerrainAnimationKind,
): { duration: number; essential: boolean } {
  if (reducedMotion) return { duration: 0, essential: false }
  const duration = kind === 'search' ? 850 : kind === 'reset' ? 360 : 180
  return { duration, essential: true }
}
```

- [ ] **Step 4: 运行纯逻辑测试**

Run: `npm run test:map-terrain-profile`

Expected: PASS, 4 tests, 0 failures。

- [ ] **Step 5: 提交镜头配置**

```bash
git add src/features/map/terrainProfile.ts scripts/test-map-terrain-profile.mjs package.json
git commit -m "feat: 定义三维地形镜头曲线"
```

---

### Task 2: 可测试的 MapLibre 地形控制器

**Files:**
- Create: `src/features/map/terrainController.ts`
- Create: `scripts/test-map-terrain-controller.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TerrainProfileInput`、`TerrainCameraProfile`、`terrainCameraProfile`、`terrainCameraAnimation` from Task 1。
- Produces: `TerrainMapAdapter`、`TerrainSyncInput`、`TerrainController`、`createTerrainController(map, callbacks, scheduler?)`。
- `TerrainController` methods: `requestSync(input, forceRecommendedPitch?)`、`syncNow(input, forceRecommendedPitch?)`、`resetNorth(input)`、`disable(reason)`、`destroy()`、`isAvailable()`。

- [ ] **Step 1: 写控制器失败测试**

```js
// scripts/test-map-terrain-controller.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { createTerrainController } from '../src/features/map/terrainController.ts'

function fakeMap({ source = {} } = {}) {
  const calls = []
  return {
    calls,
    zoom: 4.8,
    getZoom() { return this.zoom },
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
  assert.ok(map.calls.some(([name, value]) => name === 'pitch' && value === 52))
  assert.ok(map.calls.some(([name, value]) => name === 'drag' && value === true))
})

test('俯视锁定卸载地形并关闭旋转', () => {
  const map = fakeMap()
  const controller = createTerrainController(map, { onUnavailable() {} })
  controller.syncNow(input, true)
  controller.syncNow({ ...input, topDownLocked: true }, true)
  assert.ok(map.calls.some(([name, value]) => name === 'terrain' && value === null))
  assert.ok(map.calls.some(([name, value]) => name === 'pitch' && value === 0))
  assert.ok(map.calls.some(([name, value]) => name === 'bearing' && value === 0))
})

test('缺失 DEM 或 setTerrain 异常只回退二维一次', () => {
  const unavailable = []
  const map = fakeMap({ source: null })
  const controller = createTerrainController(map, { onUnavailable: (reason) => unavailable.push(reason) })
  controller.syncNow(input, true)
  controller.syncNow(input, true)
  assert.equal(unavailable.length, 1)
  assert.equal(controller.isAvailable(), false)
  assert.ok(map.calls.some(([name, value]) => name === 'drag' && value === false))
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
```

- [ ] **Step 2: 注册测试并确认失败**

Use `apply_patch` to add:

```json
"test:map-terrain-controller": "node --experimental-strip-types scripts/test-map-terrain-controller.mjs"
```

Run: `npm run test:map-terrain-controller`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `terrainController.ts`。

- [ ] **Step 3: 实现地形控制器和失败回退**

Implement `src/features/map/terrainController.ts` with this public shape and behavior:

```ts
import type { MapMode } from './mapLayers.ts'
import { terrainCameraAnimation, terrainCameraProfile } from './terrainProfile.ts'

export interface TerrainMapAdapter {
  getZoom(): number
  getSource(id: string): unknown
  setTerrain(value: { source: string; exaggeration: number } | null): void
  setPitch(value: number): void
  setBearing(value: number): void
  easeTo(value: { pitch: number; bearing: number; duration: number; essential: boolean }): void
  dragRotate: { enable(): void; disable(): void }
  touchZoomRotate: { enableRotation(): void; disableRotation(): void }
  touchPitch: { enable(): void; disable(): void }
}

export interface TerrainSyncInput {
  mode: MapMode
  topDownLocked: boolean
  reducedMotion: boolean
}

export interface TerrainController {
  requestSync(input: TerrainSyncInput, forceRecommendedPitch?: boolean): void
  syncNow(input: TerrainSyncInput, forceRecommendedPitch?: boolean): void
  resetNorth(input: TerrainSyncInput): void
  disable(reason: string): void
  destroy(): void
  isAvailable(): boolean
}
```

The implementation must:

```ts
const frameScheduler = {
  request: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
  cancel: (id: number) => cancelAnimationFrame(id),
}
```

- Cache the latest `TerrainSyncInput` and merge repeated `requestSync` calls into one scheduled callback.
- Pass the current attached state into `terrainCameraProfile` so `3.25/3.05` hysteresis is preserved.
- Call `setTerrain` only when attached state or exaggeration changed.
- Enable right-drag, touch rotation, and touch pitch only when `rotationEnabled` is true.
- When `rotationEnabled` becomes false, call both `setPitch(0)` and `setBearing(0)` so far view and locked top-down always face north.
- Call `setPitch` during automatic zoom or when `forceRecommendedPitch` is true.
- `resetNorth` must call `easeTo({ pitch, bearing: 0, ...terrainCameraAnimation(...) })` without changing center or zoom.
- Wrap `getSource` and `setTerrain` in `try/catch`; `disable(reason)` must notify once, attempt `setTerrain(null)`, set pitch to zero, disable gestures, and never throw.
- `destroy()` must cancel the pending frame and make future calls no-ops.

- [ ] **Step 4: 运行控制器与纯逻辑测试**

Run: `npm run test:map-terrain-controller && npm run test:map-terrain-profile`

Expected: both commands PASS。

- [ ] **Step 5: 提交控制器**

```bash
git add src/features/map/terrainController.ts scripts/test-map-terrain-controller.mjs package.json
git commit -m "feat: 添加地图地形控制器"
```

---

### Task 3: 放开 CK3 相机并同步语义双击倾角

**Files:**
- Modify: `src/features/map/cameraProfile.ts`
- Modify: `scripts/test-map-semantic-zoom.mjs`

**Interfaces:**
- Consumes: `TERRAIN_MAX_PITCH` and a callback `targetPitch(zoom: number): number`。
- Produces: `configureCk3Camera(map, reducedMotion, targetPitch)` cleanup function。
- Preserves: `cameraAnimation(reducedMotion, kind)` for existing search and semantic timings。

- [ ] **Step 1: 扩充相机失败测试**

Add assertions to `scripts/test-map-semantic-zoom.mjs`:

```js
test('相机允许近景倾斜且双击同步目标 pitch', () => {
  const options = createCk3MapOptions(manifest, false)
  assert.equal(options.maxPitch, 55)
  assert.equal(options.pitchWithRotate, true)
  assert.equal(options.dragRotate, false, '地形控制器加载前不得提前启用旋转')
  assert.equal(options.touchPitch, false)

  const source = readFileSync('src/features/map/cameraProfile.ts', 'utf8')
  assert.match(source, /targetPitch\(targetZoom\)/)
  assert.match(source, /pitch:\s*targetPitch/)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:map-semantic-zoom`

Expected: FAIL because `maxPitch` is still `0` and rotation is hard-disabled。

- [ ] **Step 3: 修改相机选项和双击处理**

Use `apply_patch` to make these exact behavior changes:

```ts
return {
  zoomSnap: 0,
  minZoom: 0,
  maxZoom: 6,
  maxPitch: TERRAIN_MAX_PITCH,
  pitchWithRotate: true,
  dragRotate: false,
  touchPitch: false,
  // unchanged offline bounds and motion fields
}
```

Update the function signature and double-click body:

```ts
export function configureCk3Camera(
  map: MapLibreMap,
  reducedMotion: boolean,
  targetPitch: (zoom: number) => number,
): () => void {
  // scroll and touch zoom setup remains
  map.doubleClickZoom.disable()
  map.keyboard.disableRotation()

  const onDoubleClick = (event: MapMouseEvent): void => {
    event.preventDefault()
    const targetZoom = nextSemanticZoom(map.getZoom())
    map.easeTo({
      zoom: targetZoom,
      pitch: targetPitch(targetZoom),
      around: event.lngLat,
      ...cameraAnimation(reducedMotion, 'semantic'),
    })
  }
  map.on('dblclick', onDoubleClick)
  return () => map.off('dblclick', onDoubleClick)
}
```

Do not enable rotation here; Task 2 controller remains the only owner of gesture availability.

- [ ] **Step 4: 运行相机与地形测试**

Run: `npm run test:map-semantic-zoom && npm run test:map-terrain-profile`

Expected: PASS。

- [ ] **Step 5: 提交相机改动**

```bash
git add src/features/map/cameraProfile.ts scripts/test-map-semantic-zoom.mjs
git commit -m "feat: 同步三维语义缩放镜头"
```

---

### Task 4: 会话状态与地图相机控制按钮

**Files:**
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/features/map/MapToolbar.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/index.css`
- Create: `scripts/test-map-terrain-ui.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces store fields: `topDownLocked: boolean`、`northResetRequestId: number`、`toggleTopDown()`、`requestNorthReset()`。
- Extends `MapToolbarProps` with `topDownLocked`、`terrainAvailable`、`onToggleTopDown`、`onResetNorth`。
- Extends `MapCanvasProps` indirectly in Task 5 with the same state and `onTerrainAvailabilityChange`。

- [ ] **Step 1: 写 UI 与状态失败测试**

```js
// scripts/test-map-terrain-ui.mjs
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
```

- [ ] **Step 2: 注册测试并确认失败**

Use `apply_patch` to add:

```json
"test:map-terrain-ui": "node --experimental-strip-types scripts/test-map-terrain-ui.mjs"
```

Run: `npm run test:map-terrain-ui`

Expected: FAIL because the store fields and toolbar controls do not exist。

- [ ] **Step 3: 扩充会话 store**

Add to `MapUiState` and its initializer:

```ts
topDownLocked: boolean
northResetRequestId: number
toggleTopDown: () => void
requestNorthReset: () => void
```

```ts
topDownLocked: false,
northResetRequestId: 0,
toggleTopDown: () => set((state) => ({ topDownLocked: !state.topDownLocked })),
requestNorthReset: () => set((state) => ({ northResetRequestId: state.northResetRequestId + 1 })),
```

Do not add Zustand persistence or write these fields into `gameState`.

- [ ] **Step 4: 添加紧凑工具栏按钮与抽屉接线**

Use Lucide only because the inspected AGOT interface resources contain no clear small compass control:

```tsx
import { Boxes, Compass, Layers3, Mountain, Route, Shield, Users } from 'lucide-react'

<div className="map-camera-controls" aria-label="地图视角">
  <button
    type="button"
    aria-pressed={topDownLocked}
    disabled={!terrainAvailable}
    onClick={onToggleTopDown}
    title={terrainAvailable ? '锁定俯视' : '当前设备使用二维地图'}
  >
    <Layers3 className="h-3.5 w-3.5" />
    <span>俯视</span>
  </button>
  <button type="button" onClick={onResetNorth} aria-label="地图归北" title="归北">
    <Compass className="h-3.5 w-3.5" />
    <span>归北</span>
  </button>
</div>
```

In `MapDrawer`, read `topDownLocked`, `northResetRequestId`, `toggleTopDown`, and `requestNorthReset`; add local `terrainAvailable` defaulting to `true`; pass all values to `MapToolbar` and reserve props for Task 5 `MapCanvas` integration.

- [ ] **Step 5: 添加样式并验证移动端不拥挤**

Add styles beside existing `.map-toolbar` and `.map-mode-tabs` rules:

```css
.map-camera-controls {
  display: flex;
  gap: 0.25rem;
}

.map-camera-controls button {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgba(196, 166, 103, 0.28);
  background: rgba(22, 18, 13, 0.86);
  color: rgb(var(--parchment-dim));
}

.map-camera-controls button[aria-pressed='true'] {
  border-color: rgba(222, 190, 112, 0.72);
  color: rgb(var(--gold));
}

.map-camera-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
```

At the existing mobile toolbar breakpoint, hide only the two button text spans and keep the icon buttons at least `32×32px`.

- [ ] **Step 6: 运行 UI 测试和类型检查**

Run: `npm run test:map-terrain-ui && npx tsc --noEmit`

Expected: PASS。

- [ ] **Step 7: 提交相机 UI**

```bash
git add src/features/map/mapUiStore.ts src/features/map/MapToolbar.tsx \
  src/features/map/MapDrawer.tsx src/index.css scripts/test-map-terrain-ui.mjs package.json
git commit -m "feat: 添加地图俯视与归北控制"
```

---

### Task 5: MapCanvas 地形生命周期、搜索与模式接入

**Files:**
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Create: `scripts/test-map-terrain-integration.mjs`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createTerrainController`、`terrainCameraProfile`、`TerrainSyncInput`、store fields from Task 4。
- Extends `MapCanvasProps`: `topDownLocked`、`northResetRequestId`、`onTerrainAvailabilityChange(available: boolean): void`。
- Preserves all existing map mode, location, political, character, asset, route and journey props。

- [ ] **Step 1: 写 MapCanvas 接线失败测试**

```js
// scripts/test-map-terrain-integration.mjs
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
})

test('搜索飞行同时携带目标 pitch', () => {
  assert.match(canvas, /flyTo\(\{[\s\S]*pitch:/)
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
```

- [ ] **Step 2: 注册测试并确认失败**

Use `apply_patch` to add:

```json
"test:map-terrain-integration": "node --experimental-strip-types scripts/test-map-terrain-integration.mjs"
```

Run: `npm run test:map-terrain-integration`

Expected: FAIL because `MapCanvas` does not create or destroy a terrain controller。

- [ ] **Step 3: 增加 props、refs 和控制器输入**

Add to `MapCanvasProps`:

```ts
topDownLocked: boolean
northResetRequestId: number
onTerrainAvailabilityChange: (available: boolean) => void
```

Add refs that avoid rebuilding MapLibre when mode or lock changes:

```ts
const terrainControllerRef = useRef<TerrainController | null>(null)
const topDownLockedRef = useRef(topDownLocked)
const terrainAvailableRef = useRef(true)

const terrainInput = (): TerrainSyncInput => ({
  mode: modeRef.current,
  topDownLocked: topDownLockedRef.current,
  reducedMotion: reducedMotionRef.current,
})
```

Include `onTerrainAvailabilityChange` in `callbacksRef` so controller callbacks never capture a stale React callback.

- [ ] **Step 4: 在 map load 后建立控制器和 zoom 监听**

Inside the existing MapLibre effect, define:

```ts
const handleTerrainUnavailable = () => {
  terrainAvailableRef.current = false
  callbacksRef.current.onTerrainAvailabilityChange(false)
  callbacksRef.current.onWarning('当前使用二维地图')
}

const terrainController = createTerrainController(map, {
  onUnavailable: handleTerrainUnavailable,
})
terrainControllerRef.current = terrainController

const handleTerrainZoom = () => terrainController.requestSync(terrainInput(), true)
```

Register `map.on('zoom', handleTerrainZoom)` only after the style `load` event confirms `agot-dem` exists. Call `terrainController.syncNow(terrainInput(), true)` once after registration. On cleanup call `map.off('zoom', handleTerrainZoom)`, `terrainController.destroy()`, clear the ref, then continue existing `stop()` and `remove()` cleanup.

Do not call `refreshSemanticSubjects` or `refreshPoliticalHouseLabels` from `handleTerrainZoom`.

- [ ] **Step 5: 同步模式、锁定、归北和减少动态效果**

Add focused React effects:

```ts
useEffect(() => {
  topDownLockedRef.current = topDownLocked
  terrainControllerRef.current?.requestSync(terrainInput(), true)
}, [topDownLocked])

useEffect(() => {
  terrainControllerRef.current?.requestSync(terrainInput(), true)
}, [mode])

useEffect(() => {
  if (northResetRequestId > 0) terrainControllerRef.current?.resetNorth(terrainInput())
}, [northResetRequestId])
```

When `prefers-reduced-motion` changes, reconfigure double-click camera and request one forced controller sync. `configureCk3Camera` receives a callback that calls `terrainCameraProfile` for the supplied target zoom and current refs.

- [ ] **Step 6: 让搜索和选择地点同步目标 pitch**

Before `flyTo`, compute:

```ts
const targetZoom = 4.8
const profile = terrainCameraProfile({
  zoom: targetZoom,
  mode: modeRef.current,
  topDownLocked: topDownLockedRef.current,
  available: terrainAvailableRef.current,
  terrainWasEnabled: targetZoom >= 3.25,
})
```

Then include `zoom: targetZoom` and `pitch: profile.pitch` in the existing `flyTo`. Do not set bearing, so a player rotating within the current open map retains orientation until explicitly归北 or reopening the drawer.

- [ ] **Step 7: 将 DEM 错误精确归因后回退**

Extend `handleMapError` so it first checks errors whose source identifier is `agot-dem` or whose message explicitly names `agot-dem`/terrain decode. For those errors call:

```ts
terrainControllerRef.current?.disable('DEM 地形不可用')
```

Do not call `setInitializationError(true)` or destroy the map. After the DEM branch, keep the existing behavior that ignores ordinary non-DEM 404s and reports other tile errors as a non-blocking warning.

- [ ] **Step 8: 完成抽屉 props 接线与重试状态**

Pass the three new props from `MapDrawer`. When `retryMap` increments `reloadKey`, reset local `terrainAvailable` to `true`. Also add an `activeDrawer === 'map'` effect that resets local availability before each fresh `MapCanvas` mount; closing and reopening keeps the Zustand `topDownLocked` choice but creates a fresh terrain capability probe.

- [ ] **Step 9: 扩充现有集成回归测试**

Add to `scripts/test-map-integration.mjs`:

```js
test('镜头持久化只保存中心与缩放，不保存 bearing 或 pitch', () => {
  const store = readFileSync('src/features/map/mapUiStore.ts', 'utf8')
  assert.match(store, /longitude:\s*number[\s\S]*latitude:\s*number[\s\S]*zoom:\s*number/)
  assert.doesNotMatch(store, /interface MapViewport[\s\S]{0,180}\b(?:bearing|pitch)\b/)
})

test('连续地形 zoom 不触发政治人物资产重投影', () => {
  const match = canvas.match(/const handleTerrainZoom[\s\S]*?\n\s*}/)?.[0] ?? ''
  assert.doesNotMatch(match, /syncDynamicMapSubjects|syncPoliticalHouseLabels|applyPoliticalFeatureStates/)
})
```

- [ ] **Step 10: 运行地形集成和现有地图集成测试**

Run: `npm run test:map-terrain-integration && npm run test:map-integration && npm run test:map-semantic-zoom`

Expected: PASS。

- [ ] **Step 11: 提交 MapCanvas 集成**

```bash
git add src/features/map/MapCanvas.tsx src/features/map/MapDrawer.tsx \
  scripts/test-map-terrain-integration.mjs scripts/test-map-integration.mjs package.json
git commit -m "feat: 接入近景三维地形生命周期"
```

---

### Task 6: 运行时边界、完整验证与视觉验收

**Files:**
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `scripts/test-map-terrain-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes all terrain modules and UI integration from Tasks 1–5。
- Produces a complete `verify:map` gate that runs all four terrain tests before data audit。

- [ ] **Step 1: 写失败的运行时边界断言**

Add to `scripts/check-map-runtime-boundaries.mjs`:

```js
test('三维地形复用本地 DEM 且不引入第二渲染器', () => {
  assert.doesNotMatch(runtimeSource, /three(?:\.module)?\.js|@react-three|new\s+THREE\.|<canvas[^>]+terrain/i)
  assert.doesNotMatch(runtimeSource, /https?:\/\//)
  assert.match(readFileSync('src/features/map/terrainController.ts', 'utf8'), /source:\s*'agot-dem'/)
})

test('连续缩放处理只更新地形镜头', () => {
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const handler = canvas.match(/const handleTerrainZoom[\s\S]*?\n\s*}/)?.[0] ?? ''
  assert.match(handler, /requestSync/)
  assert.doesNotMatch(handler, /fetch\(|loadSemanticIndex|syncDynamicMapSubjects|syncPoliticalHouseLabels/)
})
```

Run: `npm run check:map-runtime-boundaries`

Expected: FAIL because the current boundary check explicitly rejects every `setTerrain` call and has not asserted the native local DEM boundary。

- [ ] **Step 2: 将二维专用边界改为原生地形边界**

The checker already recursively scans every TypeScript file under `src/features/map`, so do not add a second file list. Replace the existing test named `语义地图保持二维且没有远程字体或地图回退` with:

```js
test('语义地图只使用原生本地 DEM 三维且没有远程字体或地图回退', () => {
  assert.match(runtimeSource, /setTerrain/)
  assert.match(runtimeSource, /source:\s*['"]agot-dem['"]/)
  assert.doesNotMatch(runtimeSource, /three(?:\.module)?\.js|@react-three|new\s+THREE\./i)
  assert.doesNotMatch(runtimeSource, /glyphs:\s*['"]https?:|fallback.*https?:/i)
})
```

Preserve current checks for no Workshop, no Steam path, no Emoji, no remote font, no second terrain renderer, and no dynamic projection on continuous zoom.

- [ ] **Step 3: 把四个测试加入完整地图验证链**

Update `verify:map` so this exact group runs after semantic zoom and before county interaction:

```text
npm run test:map-terrain-profile &&
npm run test:map-terrain-controller &&
npm run test:map-terrain-ui &&
npm run test:map-terrain-integration
```

Do not add the real AGOT import command to `verify:map` or `verify:quick`。

Extend the existing `完整地图验证包含全部语义测试且不触发真实导入` assertion with:

```js
for (const command of [
  'test:map-terrain-profile',
  'test:map-terrain-controller',
  'test:map-terrain-ui',
  'test:map-terrain-integration',
]) {
  assert.match(verifyMap, new RegExp(command))
}
```

- [ ] **Step 4: 运行专项测试、完整地图验证和构建**

Run:

```bash
npm run test:map-terrain-profile
npm run test:map-terrain-controller
npm run test:map-terrain-ui
npm run test:map-terrain-integration
npm run verify:map
npm run build:code
git diff --check
```

Expected: all commands exit `0`; `verify:map` still reports `6094` locations, `31724` route edges and `3468` semantic tiles; build may retain the existing large-chunk warning but must complete successfully。

- [ ] **Step 5: 在 5199 进行视觉验收**

Start or reuse the worktree server:

```bash
npm run dev -- --host 0.0.0.0 --port 5199
```

Check these exact cases at `http://localhost:5199/`:

1. At world and strategic-region zoom, pitch is zero and the map remains readable.
2. Zoom through `3.2–4.8`; pitch changes smoothly and does not oscillate around the threshold.
3. Search 临冬城; the camera arrives near `4.8` with moderate terrain and no flat-to-tilted pop.
4. Inspect 谷地与明月山脉、临冬城平原、多恩、君临和河湾地。
5. Switch all five modes without resetting center, zoom, bearing, selected county, or route.
6. Lock top-down, zoom in and confirm pitch remains zero; unlock and confirm the current mode's pitch returns.
7. Rotate with right drag and touch; click 归北 and confirm center/zoom/selection do not change.
8. Close and reopen the map; center/zoom remain while bearing returns to north.
9. In browser development tools, block one `agot-dem` request; confirm a one-time二维说明 appears while county clicks, political mode, people, assets, and travel still work.

Record any visual constant adjustment only in `terrainProfile.ts`, rerun Tasks 1 and 4 verification commands, and do not add per-location height exceptions.

- [ ] **Step 6: 提交边界与验收加固**

```bash
git add scripts/check-map-runtime-boundaries.mjs scripts/test-map-terrain-integration.mjs package.json
git commit -m "test: 加固三维地图回退边界"
```

- [ ] **Step 7: 最终状态检查**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: only the pre-existing untracked `node_modules` symlink remains; the six terrain commits are visible and no generated cache, screenshot, source-mod file, or unrelated avatar change is staged。
