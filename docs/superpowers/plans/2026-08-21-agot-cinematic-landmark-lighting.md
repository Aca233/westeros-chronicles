# AGOT Cinematic Landmark Lighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为十二个现有 Three.js 地标增加固定下午电影光照、按需建筑自阴影、轻量程序化接触阴影，并让 MapLibre hillshade 使用同一世界光照方向。

**Architecture:** 新增一个纯光照配置模块，统一太阳方向、灯光参数和硬件质量分级；地标资源加载时配置 Mesh 自阴影并附加程序化接触阴影；现有共享 WebGL 自定义层负责唯一方向光、按需 shadow map 和有限实时阴影集合。运行时继续按 `moveend`/`zoomend` 选择可见地标，只把距离视野中心最近的 2/1/0 个地标放入实时阴影集合；MapLibre hillshade 直接读取同一方位常量。

**Tech Stack:** TypeScript 5.7、Three.js 0.185.1、MapLibre GL 5.24、Node.js test runner、Vite 6。

**Spec:** `docs/superpowers/specs/2026-08-21-agot-cinematic-landmark-lighting-design.md`

## Global Constraints

- 在现有 `/mnt/c/agot` 工作区内实施，保留当前全部未提交的五级地图、3D 地标和其他脏工作区修改。
- 不运行 `git reset`、`git clean`、批量还原或任何会覆盖无关修改的命令。
- 不提交、不推送；每个任务的检查点使用聚焦测试、`git diff -- <files>` 与 `git diff --check`。
- 不修改模型导入器、`public/data/agot-map/models/landmarks.json` 或二十四个已发布 GLB；不修改生成的模型资产。
- 不增加昼夜循环、动态太阳、DEM 阴影接收网格、后处理管线或远程资源。
- Three.js 必须继续复用 MapLibre 的 canvas、WebGL2 context、投影矩阵和渲染调用。
- 不增加第二 canvas、第二 WebGL context、`requestAnimationFrame`、OrbitControls、Raycaster 或独立交互系统。
- 现有二维 MapLibre 点击层继续是唯一交互权威；地标光影失败只能降级，不得设置地图初始化失败。
- 固定太阳方位为 `310°`，太阳高度为 `35°`，MapLibre hillshade 必须使用 `map` 锚点。
- 高质量使用 2048 阴影贴图和最多 2 个实时阴影地标；中质量使用 1024 和最多 1 个；低质量禁用实时阴影但保留灯光与接触阴影。
- 阴影贴图使用按需更新，普通逐帧地图渲染不得持续重算静态阴影。

---

## File Structure

### 新增文件

- `src/features/map/landmarks/landmarkLightingProfile.ts`：电影太阳常量、世界方向向量、硬件质量分类和 shadow map 参数。
- `src/features/map/landmarks/landmarkContactShadow.ts`：根据本地模型包围盒创建无纹理、可释放的柔和椭圆接触阴影。
- `scripts/test-map-landmark-lighting-profile.mjs`：太阳方向、质量分级和 hillshade 共享配置测试。
- `scripts/test-map-landmark-contact-shadow.mjs`：接触阴影几何、材质、尺寸与释放测试。

### 修改文件

- `src/features/map/landmarks/landmarkResourceCache.ts`：为真实模型 Mesh 开启 cast/receive shadow，附加接触阴影，并沿用统一释放流程。
- `src/features/map/landmarks/landmarkCustomLayer.ts`：建立电影灯光、配置按需 PCF shadow map、维护实时阴影集合与方向光相机。
- `src/features/map/landmarks/landmarkRuntime.ts`：在初始化时固定光影质量，按可见请求顺序选择 2/1/0 个实时阴影地标。
- `src/features/map/mapStyle.ts`：hillshade 使用统一太阳方位和 `map` 锚点。
- `scripts/test-map-landmark-cache.mjs`：补充 Mesh 自阴影与接触阴影资源生命周期测试。
- `scripts/test-map-landmark-layer.mjs`：补充灯光、shadow map、按需更新、context 恢复和降级测试。
- `scripts/test-map-landmark-integration.mjs`：补充运行时质量注入和实时阴影集合测试。
- `scripts/test-map-aesthetics.mjs`：补充生成样式的 hillshade 方向测试。
- `scripts/check-map-runtime-boundaries.mjs`：扩展禁止第二渲染/交互系统的源码边界。
- `package.json`：注册两个新聚焦测试并接入 `verify:map`。
- `docs/agot-landmark-model-import.md`：记录固定电影光照、质量分级、降级和人工视觉验收边界。

---

### Task 1: Add the Shared Cinematic Sun and Lighting Quality Profile

**Files:**
- Create: `src/features/map/landmarks/landmarkLightingProfile.ts`
- Create: `scripts/test-map-landmark-lighting-profile.mjs`
- Modify: `src/features/map/mapStyle.ts`
- Modify: `scripts/test-map-aesthetics.mjs`

**Interfaces:**
- Produces: `CINEMATIC_SUN_AZIMUTH_DEGREES = 310`
- Produces: `CINEMATIC_SUN_ALTITUDE_DEGREES = 35`
- Produces: `cinematicSunSourceDirection(): readonly [number, number, number]`
- Produces: `LandmarkLightingQuality = 'high' | 'medium' | 'low'`
- Produces: `LandmarkLightingHardware { hardwareConcurrency?: number; deviceMemory?: number }`
- Produces: `LandmarkLightingProfile { quality; shadowMapSize; realtimeShadowLimit; sunColor; sunIntensity; skyColor; groundColor; hemisphereIntensity; ambientColor; ambientIntensity }`
- Produces: `landmarkLightingProfile(hardware): LandmarkLightingProfile`
- Consumed later by: `landmarkCustomLayer.ts` and `landmarkRuntime.ts`

- [ ] **Step 1: Write the failing profile and style tests**

Create `scripts/test-map-landmark-lighting-profile.mjs` with tests equivalent to:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CINEMATIC_SUN_ALTITUDE_DEGREES,
  CINEMATIC_SUN_AZIMUTH_DEGREES,
  cinematicSunSourceDirection,
  landmarkLightingProfile,
} from '../src/features/map/landmarks/landmarkLightingProfile.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

test('固定下午太阳从西北偏西上方照射', () => {
  assert.equal(CINEMATIC_SUN_AZIMUTH_DEGREES, 310)
  assert.equal(CINEMATIC_SUN_ALTITUDE_DEGREES, 35)
  const [east, south, up] = cinematicSunSourceDirection()
  assert.ok(east < 0)
  assert.ok(south < 0)
  assert.ok(up > 0)
  assert.ok(Math.abs(Math.hypot(east, south, up) - 1) < 1e-12)
})

test('光影质量按硬件一次性分为高、中、低三档', () => {
  assert.deepEqual(
    landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 8 }),
    assert.objectContaining({ quality: 'high', shadowMapSize: 2048, realtimeShadowLimit: 2 }),
  )
  assert.deepEqual(
    landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 4 }),
    assert.objectContaining({ quality: 'medium', shadowMapSize: 1024, realtimeShadowLimit: 1 }),
  )
  assert.deepEqual(
    landmarkLightingProfile({ hardwareConcurrency: 4, deviceMemory: 8 }),
    assert.objectContaining({ quality: 'low', shadowMapSize: 0, realtimeShadowLimit: 0 }),
  )
  assert.equal(landmarkLightingProfile({}).quality, 'medium')
})
```

Because `assert.objectContaining` is unavailable in Node strict assert, implement the actual assertions field-by-field:

```js
const high = landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 8 })
assert.equal(high.quality, 'high')
assert.equal(high.shadowMapSize, 2048)
assert.equal(high.realtimeShadowLimit, 2)
```

Add a style test using the existing map manifest fixture from `scripts/test-map-aesthetics.mjs`:

```js
const hillshade = createLocalMapStyle(manifest).layers.find(({ id }) => id === 'agot-hillshade')
assert.equal(hillshade.paint['hillshade-illumination-direction'], CINEMATIC_SUN_AZIMUTH_DEGREES)
assert.equal(hillshade.paint['hillshade-illumination-anchor'], 'map')
```

- [ ] **Step 2: Run the tests and verify the new module/style assertions fail**

Run:

```bash
node --experimental-strip-types scripts/test-map-landmark-lighting-profile.mjs
npm run test:map-aesthetics
```

Expected: the first command fails because `landmarkLightingProfile.ts` does not exist; the aesthetics test fails because hillshade does not yet expose the shared direction/anchor.

- [ ] **Step 3: Implement the pure lighting profile**

Create `src/features/map/landmarks/landmarkLightingProfile.ts` with this public shape:

```ts
export const CINEMATIC_SUN_AZIMUTH_DEGREES = 310
export const CINEMATIC_SUN_ALTITUDE_DEGREES = 35

export type LandmarkLightingQuality = 'high' | 'medium' | 'low'

export interface LandmarkLightingHardware {
  hardwareConcurrency?: number
  deviceMemory?: number
}

export interface LandmarkLightingProfile {
  quality: LandmarkLightingQuality
  shadowMapSize: 0 | 1024 | 2048
  realtimeShadowLimit: 0 | 1 | 2
  sunColor: number
  sunIntensity: number
  skyColor: number
  groundColor: number
  hemisphereIntensity: number
  ambientColor: number
  ambientIntensity: number
}

export function cinematicSunSourceDirection(): readonly [number, number, number] {
  const azimuth = CINEMATIC_SUN_AZIMUTH_DEGREES * Math.PI / 180
  const altitude = CINEMATIC_SUN_ALTITUDE_DEGREES * Math.PI / 180
  const horizontal = Math.cos(altitude)
  return [
    Math.sin(azimuth) * horizontal,
    -Math.cos(azimuth) * horizontal,
    Math.sin(altitude),
  ]
}

export function landmarkLightingProfile(hardware: LandmarkLightingHardware): LandmarkLightingProfile {
  const low = (hardware.hardwareConcurrency ?? Infinity) <= 4
    || (hardware.deviceMemory !== undefined && hardware.deviceMemory < 4)
  const high = !low
    && hardware.hardwareConcurrency !== undefined
    && hardware.hardwareConcurrency >= 8
    && hardware.deviceMemory !== undefined
    && hardware.deviceMemory >= 8
  const quality = low ? 'low' : high ? 'high' : 'medium'
  return {
    quality,
    shadowMapSize: quality === 'high' ? 2048 : quality === 'medium' ? 1024 : 0,
    realtimeShadowLimit: quality === 'high' ? 2 : quality === 'medium' ? 1 : 0,
    sunColor: 0xffd6a3,
    sunIntensity: 2.6,
    skyColor: 0xbfd7ff,
    groundColor: 0x5a4633,
    hemisphereIntensity: 0.85,
    ambientColor: 0xfff2df,
    ambientIntensity: 0.32,
  }
}
```

Keep the function pure and independent of browser globals so Node tests can call it directly.

- [ ] **Step 4: Make MapLibre hillshade consume the shared azimuth**

Import `CINEMATIC_SUN_AZIMUTH_DEGREES` in `src/features/map/mapStyle.ts` and extend the existing `agot-hillshade` paint object:

```ts
'hillshade-illumination-direction': CINEMATIC_SUN_AZIMUTH_DEGREES,
'hillshade-illumination-anchor': 'map',
```

Do not change the existing shadow/highlight/accent colors or exaggeration in this task.

- [ ] **Step 5: Run focused tests and inspect the diff**

Run:

```bash
node --experimental-strip-types scripts/test-map-landmark-lighting-profile.mjs
npm run test:map-aesthetics
npx tsc --noEmit
git diff --check -- src/features/map/landmarks/landmarkLightingProfile.ts src/features/map/mapStyle.ts scripts/test-map-landmark-lighting-profile.mjs scripts/test-map-aesthetics.mjs
git diff -- src/features/map/landmarks/landmarkLightingProfile.ts src/features/map/mapStyle.ts scripts/test-map-landmark-lighting-profile.mjs scripts/test-map-aesthetics.mjs
```

Expected: all commands exit 0; the style keeps the existing hillshade appearance except for explicit shared direction and map anchoring.

---

### Task 2: Create the Procedural Contact Shadow

**Files:**
- Create: `src/features/map/landmarks/landmarkContactShadow.ts`
- Create: `scripts/test-map-landmark-contact-shadow.mjs`

**Interfaces:**
- Produces: `LANDMARK_CONTACT_SHADOW_NAME = 'agot-landmark-contact-shadow'`
- Produces: `createLandmarkContactShadow(model: Object3D): Mesh | null`
- The returned Mesh owns its `CircleGeometry` and `ShaderMaterial`; existing recursive resource disposal will dispose both.
- Consumed by: `createGltfLandmarkLoader()` in Task 3.

- [ ] **Step 1: Write failing geometry/material tests**

Create a box model and assert the generated contact shadow:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three'

import {
  LANDMARK_CONTACT_SHADOW_NAME,
  createLandmarkContactShadow,
} from '../src/features/map/landmarks/landmarkContactShadow.ts'

test('接触阴影从模型本地包围盒生成柔和椭圆且不写深度', () => {
  const model = new Group()
  const castle = new Mesh(new BoxGeometry(20, 10, 12), new MeshBasicMaterial())
  castle.position.set(4, 5, -3)
  model.add(castle)
  model.updateMatrixWorld(true)

  const shadow = createLandmarkContactShadow(model)
  assert.ok(shadow)
  assert.equal(shadow.name, LANDMARK_CONTACT_SHADOW_NAME)
  assert.ok(shadow.material instanceof ShaderMaterial)
  assert.equal(shadow.material.transparent, true)
  assert.equal(shadow.material.depthWrite, false)
  assert.equal(shadow.castShadow, false)
  assert.equal(shadow.receiveShadow, false)
  assert.ok(shadow.scale.x > shadow.scale.y)
  assert.ok(shadow.position.y >= 0)
  assert.match(shadow.material.fragmentShader, /smoothstep/)
})

test('空模型不生成接触阴影', () => {
  assert.equal(createLandmarkContactShadow(new Group()), null)
})
```

Also spy on `geometry.dispose()` and `material.dispose()` after adding the returned Mesh to a Group; Task 3 will prove the existing `disposeObject3D` calls both exactly once.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node --experimental-strip-types scripts/test-map-landmark-contact-shadow.mjs
```

Expected: FAIL because the contact-shadow module does not exist.

- [ ] **Step 3: Implement the contact-shadow factory**

Create `src/features/map/landmarks/landmarkContactShadow.ts` using:

```ts
import { Box3, CircleGeometry, Mesh, Object3D, ShaderMaterial, Vector3 } from 'three'

export const LANDMARK_CONTACT_SHADOW_NAME = 'agot-landmark-contact-shadow'

export function createLandmarkContactShadow(model: Object3D): Mesh | null {
  model.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(model)
  if (bounds.isEmpty()) return null
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) return null
  if (size.x <= 0 || size.z <= 0) return null

  const geometry = new CircleGeometry(1, 48)
  const material = new ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; void main() { float d = length((vUv - 0.5) * 2.0); float alpha = (1.0 - smoothstep(0.08, 1.0, d)) * 0.28; gl_FragColor = vec4(0.055, 0.045, 0.035, alpha); }`,
  })
  const shadow = new Mesh(geometry, material)
  shadow.name = LANDMARK_CONTACT_SHADOW_NAME
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(center.x, bounds.min.y + Math.max(size.y * 0.001, 0.01), center.z)
  shadow.scale.set(size.x * 0.62, size.z * 0.62, 1)
  shadow.castShadow = false
  shadow.receiveShadow = false
  shadow.renderOrder = -10
  shadow.frustumCulled = true
  return shadow
}
```

The literal shader is local source code, not a downloaded asset or CanvasTexture. Do not add pointer handlers or raycasting metadata.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
node --experimental-strip-types scripts/test-map-landmark-contact-shadow.mjs
npx tsc --noEmit
git diff --check -- src/features/map/landmarks/landmarkContactShadow.ts scripts/test-map-landmark-contact-shadow.mjs
git diff -- src/features/map/landmarks/landmarkContactShadow.ts scripts/test-map-landmark-contact-shadow.mjs
```

Expected: all commands exit 0; no external texture or network path appears in the implementation.

---

### Task 3: Configure Loaded Landmark Meshes for Self-Shadowing and Attach Contact Shadows

**Files:**
- Modify: `src/features/map/landmarks/landmarkResourceCache.ts`
- Modify: `scripts/test-map-landmark-cache.mjs`

**Interfaces:**
- Produces: `configureLandmarkRenderable(node: Object3D): void`
- `createGltfLandmarkLoader()` invokes `configureLandmarkRenderable` for parsed nodes, then invokes `createLandmarkContactShadow(gltf.scene)` once and adds a non-null result to `gltf.scene`.
- Preserves: `configureLandmarkMaterial(material)` and `disposeObject3D(object)` public behavior.

- [ ] **Step 1: Add failing Mesh configuration tests**

Extend `scripts/test-map-landmark-cache.mjs`:

```js
import { configureLandmarkRenderable } from '../src/features/map/landmarks/landmarkResourceCache.ts'

test('真实地标 Mesh 开启建筑自阴影且保留哑光材质', () => {
  const material = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 })
  const mesh = new Mesh(new BoxGeometry(), material)
  configureLandmarkRenderable(mesh)
  assert.equal(mesh.castShadow, true)
  assert.equal(mesh.receiveShadow, true)
  assert.equal(material.side, DoubleSide)
  assert.equal(material.metalness, 0)
  assert.equal(material.roughness, 0.78)
})
```

Add a disposal test that creates a model, attaches `createLandmarkContactShadow(model)`, replaces the shadow geometry/material `dispose` methods with counters, then calls `disposeObject3D(model)` and expects one call each.

- [ ] **Step 2: Run the cache test and verify the new export/assertions fail**

Run:

```bash
npm run test:map-landmark-cache
```

Expected: FAIL because `configureLandmarkRenderable` does not exist and loaded Mesh shadow flags remain false.

- [ ] **Step 3: Implement Mesh-only shadow configuration**

In `landmarkResourceCache.ts`, import `Mesh` and `createLandmarkContactShadow`. Implement:

```ts
export function configureLandmarkRenderable(node: Object3D): void {
  if (!(node instanceof Mesh)) return
  node.castShadow = true
  node.receiveShadow = true
  const materials = Array.isArray(node.material) ? node.material : [node.material]
  for (const material of materials) configureLandmarkMaterial(material)
}
```

Replace the current broad `castShadow = false`/`receiveShadow = false` traversal with:

```ts
gltf.scene.traverse(configureLandmarkRenderable)
const contactShadow = createLandmarkContactShadow(gltf.scene)
if (contactShadow) gltf.scene.add(contactShadow)
```

Do not call `configureLandmarkRenderable` after adding the contact shadow; its factory deliberately leaves both shadow flags false.

- [ ] **Step 4: Verify resource disposal and cache behavior remain correct**

Run:

```bash
npm run test:map-landmark-cache
npm run test:map-landmark-contact-shadow
npx tsc --noEmit
git diff --check -- src/features/map/landmarks/landmarkResourceCache.ts scripts/test-map-landmark-cache.mjs
git diff -- src/features/map/landmarks/landmarkResourceCache.ts scripts/test-map-landmark-cache.mjs
```

Expected: all existing concurrency, fan-out, cancellation, LRU and deduplicated disposal tests still pass together with the new shadow tests.

---

### Task 4: Upgrade the Shared-Context Custom Layer to Cinematic Lights and On-Demand Shadow Maps

**Files:**
- Modify: `src/features/map/landmarks/landmarkCustomLayer.ts`
- Modify: `scripts/test-map-landmark-layer.mjs`

**Interfaces:**
- Consumes: `LandmarkLightingProfile` and `cinematicSunSourceDirection()` from Task 1.
- Adds to `LandmarkCustomLayer`: `setShadowObjects(keys: readonly string[]): void`
- Adds to `LandmarkCustomLayer`: `lightingQuality(): LandmarkLightingQuality`
- Adds to `LandmarkCustomLayerOptions`: `lightingProfile?: LandmarkLightingProfile`
- Uses one Three.js shadow-caster layer bit, constant `LANDMARK_SHADOW_CASTER_LAYER = 1`.
- Keeps: `setObject`, `removeObject`, `clearObjects`, `capability`, `cameraProjectionMatrix`, shared-context cleanup.

- [ ] **Step 1: Replace the old “shadows disabled” test with failing quality-specific renderer assertions**

Extend the fake renderer in `scripts/test-map-landmark-layer.mjs` so its `shadowMap` includes:

```js
shadowMap: { enabled: false, type: null, autoUpdate: true, needsUpdate: false }
```

Create layers with explicit high, medium and low profiles. Assert after `onAdd`:

```js
assert.equal(highRenderer.shadowMap.enabled, true)
assert.equal(highRenderer.shadowMap.autoUpdate, false)
assert.equal(highLayer.lightingQuality(), 'high')
assert.equal(lowRenderer.shadowMap.enabled, false)
assert.equal(lowLayer.lightingQuality(), 'low')
```

Do not expose the private scene for tests. Verify behavior through renderer shadow state, object layer membership, repaint calls and `needsUpdate` transitions.

Add a selected-caster test:

```js
layer.onAdd(map, gl)
layer.setShadowObjects(['winterfell:lod0'])
layer.setObject('winterfell:lod0', selectedObject, selectedMatrix)
layer.setObject('red-keep:lod0', unselectedObject, unselectedMatrix)
assert.equal(selectedMesh.layers.isEnabled(1), true)
assert.equal(unselectedMesh.layers.isEnabled(1), false)
assert.equal(renderer.shadowMap.needsUpdate, true)
```

Add an on-demand test that clears `needsUpdate`, calls `render` twice without object/selection changes, and verifies the layer does not set it back to true. Then dispatch `webglcontextrestored` and assert it becomes true once.

- [ ] **Step 2: Run the layer test and verify the new API/behavior fails**

Run:

```bash
npm run test:map-landmark-layer
```

Expected: FAIL because the layer has no lighting profile or shadow-object API and still forcibly disables shadow maps.

- [ ] **Step 3: Build the cinematic light rig inside the existing scene**

Replace the two current lights with fields created from the profile:

```ts
private readonly ambientLight: AmbientLight
private readonly hemisphereLight: HemisphereLight
private readonly sunLight: DirectionalLight
private readonly sunTarget = new Object3D()
```

In the constructor:

```ts
const profile = options.lightingProfile ?? landmarkLightingProfile({})
this.lightingProfile = profile
this.ambientLight = new AmbientLight(profile.ambientColor, profile.ambientIntensity)
this.hemisphereLight = new HemisphereLight(
  profile.skyColor,
  profile.groundColor,
  profile.hemisphereIntensity,
)
this.sunLight = new DirectionalLight(profile.sunColor, profile.sunIntensity)
this.sunLight.castShadow = profile.shadowMapSize > 0
this.sunLight.target = this.sunTarget
this.sunLight.shadow.camera.layers.set(LANDMARK_SHADOW_CASTER_LAYER)
this.scene.add(this.ambientLight, this.hemisphereLight, this.sunLight, this.sunTarget)
```

Keep the sun in map world coordinates. `cinematicSunSourceDirection()` returns the direction from the target toward the sun.

- [ ] **Step 4: Configure the shared renderer for on-demand PCF shadows**

Expand the internal renderer interface:

```ts
shadowMap: {
  enabled: boolean
  type: import('three').ShadowMapType
  autoUpdate: boolean
  needsUpdate: boolean
}
```

During `onAdd`, inside a `try` block:

```ts
this.renderer.shadowMap.enabled = profile.shadowMapSize > 0
this.renderer.shadowMap.type = PCFShadowMap
this.renderer.shadowMap.autoUpdate = false
this.renderer.shadowMap.needsUpdate = profile.shadowMapSize > 0
this.sunLight.shadow.mapSize.set(profile.shadowMapSize || 1, profile.shadowMapSize || 1)
```

If setup throws, call one internal `disableRealtimeShadows(message)` method that:

- sets `sunLight.castShadow = false`;
- sets `renderer.shadowMap.enabled = false` when the renderer exists;
- records effective quality as `low`;
- warns once through `onWarning`;
- leaves all three lights and contact shadows active.

Do not recreate the renderer or context.

- [ ] **Step 5: Implement the selected shadow-caster set and shadow camera fitting**

Store `shadowKeys = new Set<string>()`. Implement `setShadowObjects(keys)` by comparing stable sorted values; if unchanged, return without repaint or shadow invalidation.

For changed keys:

1. Traverse each attached object and enable layer 1 only for selected Mesh nodes; disable layer 1 for all other Mesh nodes.
2. Call `scene.updateMatrixWorld(true)`.
3. Build one `Box3` union from selected attached objects.
4. If the union is empty, leave realtime shadow enabled but set `sunLight.castShadow = false` until a selected object attaches.
5. Otherwise position the light and target around the union:

```ts
const center = bounds.getCenter(new Vector3())
const size = bounds.getSize(new Vector3())
const radius = Math.max(size.length() * 0.5, 1e-7)
const [x, y, z] = cinematicSunSourceDirection()
this.sunTarget.position.copy(center)
this.sunLight.position.set(
  center.x + x * radius * 4,
  center.y + y * radius * 4,
  center.z + z * radius * 4,
)
const camera = this.sunLight.shadow.camera
camera.left = -radius * 1.35
camera.right = radius * 1.35
camera.top = radius * 1.35
camera.bottom = -radius * 1.35
camera.near = radius * 0.1
camera.far = radius * 8
camera.updateProjectionMatrix()
```

Set `sunLight.shadow.bias = -0.00015`, mark `shadowMap.needsUpdate = true`, and trigger one repaint.

`setObject`, `removeObject` and `clearObjects` must refit/invalidate only when they affect the selected set. Ordinary `render` must never set `needsUpdate = true` on every frame.

- [ ] **Step 6: Preserve shared-context state and add render-time shadow downgrade**

Keep the current render sequence:

```ts
renderer.resetState()
renderer.render(scene, camera)
renderer.resetState()
```

Wrap only the render call. If it throws while realtime shadows are active, disable realtime shadows, reset renderer state in `finally`, warn once, and request a repaint so the next frame renders without realtime shadows. Do not throw into MapLibre and do not call `forceContextLoss`.

On successful `webglcontextrestored`, set `shadowMap.needsUpdate = true` only when realtime shadows remain enabled.

- [ ] **Step 7: Run layer and boundary tests**

Run:

```bash
npm run test:map-landmark-layer
npm run check:map-runtime-boundaries
npx tsc --noEmit
git diff --check -- src/features/map/landmarks/landmarkCustomLayer.ts scripts/test-map-landmark-layer.mjs
git diff -- src/features/map/landmarks/landmarkCustomLayer.ts scripts/test-map-landmark-layer.mjs
```

Expected: all commands exit 0; the source still contains no second canvas, RAF, controls, raycast or context loss call.

---

### Task 5: Select the Nearest Real-Time Shadow Landmarks in the Runtime

**Files:**
- Modify: `src/features/map/landmarks/landmarkRuntime.ts`
- Modify: `scripts/test-map-landmark-integration.mjs`

**Interfaces:**
- Consumes: `landmarkLightingProfile(hardware)` from Task 1.
- Changes `LandmarkRuntimeOptions.layerFactory` to `(profile: LandmarkLightingProfile) => LandmarkCustomLayer` while keeping optional test injection.
- Passes the profile into `ActiveLandmarkRuntime`.
- Calls `layer.setShadowObjects(requests.slice(0, profile.realtimeShadowLimit).map(({ key }) => key))` once per explicit runtime sync.
- Existing visible requests remain distance-sorted by `visibleLandmarkRequests`.

- [ ] **Step 1: Extend the fake layer and write failing high/medium/low selection tests**

Add `shadowKeys` and `setShadowObjects(keys)` to the integration fixture. Create at least three visible records at increasing distances from the viewport center.

Assert:

```js
const highRuntime = await createLandmarkRuntime(map, manifest, {
  hardware: { hardwareConcurrency: 8, deviceMemory: 8 },
  layerFactory: (profile) => {
    assert.equal(profile.quality, 'high')
    return fakeLayer
  },
  // fixture manifest/cache
})
assert.deepEqual(fakeLayer.shadowKeys, ['nearest:lod0', 'second:lod0'])
```

Repeat with medium hardware and expect only the nearest key. Repeat with low hardware and expect an empty array while model requests still use the existing low-capability LOD1 behavior.

Add an unchanged-sync assertion: `moveend` with the same visible ordering may call `setShadowObjects`, but the layer itself must suppress duplicate invalidation; runtime must not add continuous `zoom` synchronization.

- [ ] **Step 2: Run the integration test and verify it fails**

Run:

```bash
npm run test:map-landmark-integration
```

Expected: FAIL because `layerFactory` receives no profile and the runtime never calls `setShadowObjects`.

- [ ] **Step 3: Compute one immutable lighting profile during runtime creation**

In `createLandmarkRuntime`:

```ts
const hardware = options.hardware ?? browserHardware()
const lightingProfile = landmarkLightingProfile(hardware)
const layer = options.layerFactory?.(lightingProfile) ?? createLandmarkCustomLayer({
  lightingProfile,
  onWarning: existingWarningHandler,
})
```

Continue using the same `hardware` object for existing model capability classification. Do not add frame-rate sampling or dynamic quality switching.

- [ ] **Step 4: Update the real-time shadow set from already-sorted visible requests**

Store the profile in `ActiveLandmarkRuntime`. In `sync`, immediately after computing `requests`:

```ts
this.layer.setShadowObjects(
  requests.slice(0, this.lightingProfile.realtimeShadowLimit).map(({ key }) => key),
)
```

Call `setShadowObjects([])` in `destroy()` before clearing/removing objects. Do not create a new visibility query or sort—the existing request order is already nearest-first and deterministic.

- [ ] **Step 5: Verify low-quality fallback does not affect 2D interaction or model loading**

Run:

```bash
npm run test:map-landmark-integration
npm run test:map-landmark-visibility
npm run test:map-landmark-layer
npx tsc --noEmit
git diff --check -- src/features/map/landmarks/landmarkRuntime.ts scripts/test-map-landmark-integration.mjs
git diff -- src/features/map/landmarks/landmarkRuntime.ts scripts/test-map-landmark-integration.mjs
```

Expected: all tests pass; the MapCanvas source still dynamically imports the landmark runtime, destroys it before `map.remove()`, and retains every existing 2D click handler.

---

### Task 6: Harden Boundaries, Register Verification, and Document the Visual System

**Files:**
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `package.json`
- Modify: `docs/agot-landmark-model-import.md`

**Interfaces:**
- Adds npm scripts:
  - `test:map-landmark-lighting-profile`
  - `test:map-landmark-contact-shadow`
- Inserts both scripts into `verify:map` before the existing cache/layer/integration tests.
- Keeps `import:agot-models` absent from every verification chain.

- [ ] **Step 1: Extend boundary tests before registering the new verification chain**

Add assertions over every file under `src/features/map/landmarks`:

```js
assert.doesNotMatch(source, /document\.createElement\(['"]canvas/)
assert.doesNotMatch(source, /requestAnimationFrame|cancelAnimationFrame/)
assert.doesNotMatch(source, /Raycaster|OrbitControls|TrackballControls/)
assert.doesNotMatch(source, /forceContextLoss/)
assert.doesNotMatch(source, /https?:\/\/|steamapps|Workshop/)
```

Add a positive assertion that `landmarkContactShadow.ts` uses `ShaderMaterial` and does not use `CanvasTexture`, `TextureLoader` or `fetch`.

Add a package-script assertion that neither `verify:map` nor `verify:quick` contains `import:agot-models` or `agot_model_import.cli convert`.

- [ ] **Step 2: Run the boundary test and fix only genuine new violations**

Run:

```bash
npm run check:map-runtime-boundaries
```

Expected: PASS. If it fails, remove the violating implementation rather than weakening the boundary regex.

- [ ] **Step 3: Register the two focused tests**

Add to `package.json`:

```json
"test:map-landmark-lighting-profile": "node --experimental-strip-types scripts/test-map-landmark-lighting-profile.mjs",
"test:map-landmark-contact-shadow": "node --experimental-strip-types scripts/test-map-landmark-contact-shadow.mjs"
```

Insert both in `verify:map` after `test:map-landmark-transform` and before `test:map-landmark-cache`. Do not add real model conversion.

- [ ] **Step 4: Document the fixed-lighting behavior and manual acceptance boundary**

Append a concise section to `docs/agot-landmark-model-import.md` that states:

- lighting is a fixed 310°/35° cinematic afternoon, not a day/night simulation;
- MapLibre hillshade and Three.js share the world direction;
- high/medium/low quality is selected once from WebGL2/hardware information;
- realtime self-shadowing covers at most 2/1/0 nearest visible landmarks;
- all visible landmarks keep the warm/cool light rig and procedural contact shadow;
- shadow failure degrades to lighting/contact shadow and never breaks the map;
- contact shadows are an artistic horizontal approximation, not DEM-accurate terrain shadows;
- final appearance requires user screenshot review.

Do not claim automated tests prove visual quality.

- [ ] **Step 5: Run all focused lighting verification**

Run:

```bash
npm run test:map-landmark-lighting-profile
npm run test:map-landmark-contact-shadow
npm run test:map-landmark-cache
npm run test:map-landmark-layer
npm run test:map-landmark-integration
npm run test:map-aesthetics
npm run check:map-runtime-boundaries
npx tsc --noEmit
```

Expected: every command exits 0.

- [ ] **Step 6: Inspect the exact implementation diff without touching unrelated work**

Run:

```bash
git diff --check
git diff -- \
  src/features/map/landmarks/landmarkLightingProfile.ts \
  src/features/map/landmarks/landmarkContactShadow.ts \
  src/features/map/landmarks/landmarkResourceCache.ts \
  src/features/map/landmarks/landmarkCustomLayer.ts \
  src/features/map/landmarks/landmarkRuntime.ts \
  src/features/map/mapStyle.ts \
  scripts/test-map-landmark-lighting-profile.mjs \
  scripts/test-map-landmark-contact-shadow.mjs \
  scripts/test-map-landmark-cache.mjs \
  scripts/test-map-landmark-layer.mjs \
  scripts/test-map-landmark-integration.mjs \
  scripts/test-map-aesthetics.mjs \
  scripts/check-map-runtime-boundaries.mjs \
  package.json \
  docs/agot-landmark-model-import.md
```

Expected: no whitespace errors; only planned lighting changes appear in these paths. Do not attempt to make the entire already-dirty workspace clean.

---

### Task 7: Run Complete Non-Browser Cross-Platform Verification

**Files:**
- Verify only; do not modify generated model assets.

**Interfaces:**
- Consumes all previous tasks.
- Produces final evidence for automated correctness; visual quality remains manual.

- [ ] **Step 1: Run the full map verification chain**

Run:

```bash
npm run verify:map
```

Expected: all existing map, terrain, five-tier semantic, interaction, landmark and generated-data tests pass; the command does not run `import:agot-models`.

- [ ] **Step 2: Run the Linux code build**

Run:

```bash
npm run build:code
```

Expected: TypeScript and Vite build exit 0. Existing bundle-size warnings are informational unless a new hard failure occurs.

- [ ] **Step 3: Run the established Windows code build**

Run:

```bash
/mnt/c/Windows/System32/cmd.exe /d /s /c "cd /d C:\AGOT && npm run build:code"
```

Expected: exit 0 using the already-restored Rollup 4.62.4 and esbuild 0.25.12 Windows native packages. Do not run a normal `npm install` against the shared dependency tree if a native package is missing; diagnose and restore only the exact locked package tarball.

- [ ] **Step 4: Re-run final audits**

Run:

```bash
npm run audit:agot-models
npm run check:map-runtime-boundaries
npx tsc --noEmit
git diff --check
```

Expected:

- model audit still reports 12 landmarks, 24 GLBs and 99.40 MiB;
- runtime boundary tests pass;
- TypeScript exits 0;
- no diff whitespace errors exist.

- [ ] **Step 5: Confirm no generated model assets changed**

Run:

```bash
git status --short -- \
  public/data/agot-map/models \
  public/assets/agot-map/models
find public/data/agot-map/models public/assets/agot-map/models \
  \( -name '*staging*' -o -name '*backup*' -o -name '*.tmp' -o -name '*.bak' \) -print
```

Expected: the existing published model files remain present without new modifications caused by this task, and no staging/backup residue is printed.

- [ ] **Step 6: Record manual visual review requirements**

Ask the user to inspect one close oblique view and one near-top-down view of Winterfell, then at least one steep-terrain landmark such as the Eyrie or Casterly Rock. Record, without claiming automation proved it:

- tower/roof/wall self-shadow depth;
- readable back-facing walls;
- contact shadow grounding;
- no dark overlay over labels or county boundaries;
- stable world lighting direction after map rotation;
- acceptable performance while panning and zooming.

If the contact shadow looks too large/dark, tune only its shader alpha and `0.62` scale multiplier. If the whole castle is too dark, tune only light intensities/colors in `landmarkLightingProfile.ts`. Do not introduce DEM receivers or dynamic time without a new approved design.

- [ ] **Step 7: Preserve the current workspace**

Run:

```bash
git status --short
```

Expected: all pre-existing dirty work plus the new lighting changes remain uncommitted. Do not commit, push, merge, reset or clean.

---

### Task 8: Replace Imperceptible Runtime Lighting With Stable Visible Lighting

**Files:**
- Create: `scripts/agot_map_import/terrain_lighting.py`
- Create: `src/features/map/landmarks/landmarkMaterialProfile.ts`
- Modify: `scripts/agot_map_import/cli.py`
- Modify: `scripts/agot_map_import/writer.py`
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/schemas.ts`
- Modify: `src/features/map/mapStyle.ts`
- Modify: `src/features/map/landmarks/landmarkLightingProfile.ts`
- Modify: `src/features/map/landmarks/landmarkCustomLayer.ts`
- Modify: `src/features/map/landmarks/landmarkContactShadow.ts`
- Modify: `src/features/map/landmarks/landmarkResourceCache.ts`
- Modify: focused map and landmark tests
- Generate: `public/assets/agot-map/terrain-light/**`
- Modify: `public/data/agot-map/manifest.json`

**Interfaces:**
- Produces `build_terrain_light_tiles(heightmap, bounds, output, zooms, tile_size, azimuth_degrees, altitude_degrees) -> TileReport`.
- Adds `manifest.paths.terrainLight` and `manifest.counts.terrainLightTiles`.
- Produces `landmarkTextureFill(landmarkId, materialName) -> number` for audited dark-material exposure.
- Keeps the fixed world sun direction active independently of realtime shadow quality.

- [ ] Add failing tests for a separate transparent terrain-light source/layer, manifest path/count, fixed low-quality sun direction, audited dark-material profiles, and always-visible directional soft shadow.
- [ ] Implement global-heightmap lighting with multi-scale normals and transparent warm-highlight/dark-shadow RGBA output, then tile it at zoom 0–4.
- [ ] Add the terrain-light source above both far and material terrain rasters and remove the ineffective runtime hillshade layer.
- [ ] Initialize DirectionalLight direction before shadow selection and retain it when realtime shadows are disabled.
- [ ] Apply conservative texture-driven fill to audited dark landmarks, including Harrenhal and Pyke, without changing GLBs.
- [ ] Strengthen and elongate the procedural southeast soft shadow so it remains visible on every quality tier.
- [ ] Generate only terrain-light assets, update the existing manifest fields/count, and avoid regenerating unrelated semantic/model assets.
- [ ] Run focused Python, schema, style, landmark, TypeScript, and build checks; defer final visual acceptance to the user screenshot.
