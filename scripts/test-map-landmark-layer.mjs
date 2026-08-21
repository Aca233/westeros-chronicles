import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, PCFShadowMap } from 'three'

import {
  LANDMARK_LAYER_ID,
  LANDMARK_SHADOW_CASTER_LAYER,
  createLandmarkCustomLayer,
} from '../src/features/map/landmarks/landmarkCustomLayer.ts'
import { landmarkLightingProfile } from '../src/features/map/landmarks/landmarkLightingProfile.ts'

class FakeCanvas extends EventTarget {}

function fixture({
  profile = landmarkLightingProfile({ hardwareConcurrency: 8, deviceMemory: 8 }),
  renderError = null,
} = {}) {
  const canvas = new FakeCanvas()
  const repaintCalls = []
  const warnings = []
  const map = {
    getCanvas: () => canvas,
    triggerRepaint: () => repaintCalls.push('repaint'),
  }
  const gl = { marker: 'shared-webgl2' }
  const calls = { parameters: null, reset: 0, render: 0, renderLayers: [], dispose: 0, forceContextLoss: 0 }
  const renderer = {
    autoClear: true,
    shadowMap: { enabled: false, type: null, autoUpdate: true, needsUpdate: false },
    outputColorSpace: '',
    resetState() { calls.reset += 1 },
    render(_scene, camera) {
      calls.render += 1
      calls.renderLayers.push(camera.layers.mask)
      if (renderError) throw renderError
      this.shadowMap.needsUpdate = false
    },
    dispose() { calls.dispose += 1 },
    forceContextLoss() { calls.forceContextLoss += 1 },
  }
  const layer = createLandmarkCustomLayer({
    lightingProfile: profile,
    isWebGL2: (value) => value === gl,
    rendererFactory(parameters) {
      calls.parameters = parameters
      return renderer
    },
    onWarning(message) { warnings.push(message) },
  })
  return { canvas, repaintCalls, warnings, map, gl, calls, renderer, layer }
}

test('自定义层复用 MapLibre context 并按质量配置按需阴影', () => {
  const high = fixture()
  assert.equal(high.layer.id, LANDMARK_LAYER_ID)
  assert.equal(high.layer.type, 'custom')
  assert.equal(high.layer.renderingMode, '3d')
  high.layer.onAdd(high.map, high.gl)
  assert.deepEqual(high.calls.parameters, { canvas: high.canvas, context: high.gl, antialias: true })
  assert.equal(high.renderer.autoClear, false)
  assert.equal(high.renderer.shadowMap.enabled, true)
  assert.equal(high.renderer.shadowMap.type, PCFShadowMap)
  assert.equal(high.renderer.shadowMap.autoUpdate, false)
  assert.equal(high.renderer.shadowMap.needsUpdate, true)
  assert.equal(high.layer.lightingQuality(), 'high')

  const low = fixture({ profile: landmarkLightingProfile({ hardwareConcurrency: 4, deviceMemory: 8 }) })
  low.layer.onAdd(low.map, low.gl)
  assert.equal(low.renderer.shadowMap.enabled, false)
  assert.equal(low.layer.lightingQuality(), 'low')
  const lowSun = low.layer.sunSourceDirection()
  assert.ok(lowSun.x < 0)
  assert.ok(lowSun.y < 0)
  assert.ok(lowSun.z > 0)
})

test('只有选中的地标加入实时阴影投射层且变化才使阴影失效', () => {
  const { map, gl, renderer, repaintCalls, layer } = fixture()
  layer.onAdd(map, gl)
  const selectedMesh = new Mesh(new BoxGeometry(2, 3, 2), new MeshStandardMaterial())
  const selectedObject = new Object3D(); selectedObject.add(selectedMesh)
  const otherMesh = new Mesh(new BoxGeometry(2, 3, 2), new MeshStandardMaterial())
  const otherObject = new Object3D(); otherObject.add(otherMesh)
  layer.setShadowObjects(['winterfell:lod0'])
  layer.setObject('winterfell:lod0', selectedObject, new Matrix4())
  layer.setObject('red-keep:lod0', otherObject, new Matrix4().makeTranslation(5, 0, 0))
  assert.equal(selectedMesh.layers.isEnabled(LANDMARK_SHADOW_CASTER_LAYER), true)
  assert.equal(otherMesh.layers.isEnabled(LANDMARK_SHADOW_CASTER_LAYER), false)
  assert.equal(renderer.shadowMap.needsUpdate, true)
  const repaintCount = repaintCalls.length
  layer.setShadowObjects(['winterfell:lod0'])
  assert.equal(repaintCalls.length, repaintCount)
})

test('普通渲染不持续重算阴影，context 恢复时只失效一次', () => {
  const { canvas, map, gl, calls, renderer, layer } = fixture()
  layer.onAdd(map, gl)
  const object = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  layer.setShadowObjects(['winterfell:lod0'])
  layer.setObject('winterfell:lod0', object, new Matrix4())
  const projection = new Matrix4().makeScale(2, 3, 4)
  layer.render(gl, { defaultProjectionData: { mainMatrix: projection.elements } })
  assert.equal(renderer.shadowMap.needsUpdate, false)
  layer.render(gl, { defaultProjectionData: { mainMatrix: projection.elements } })
  assert.equal(renderer.shadowMap.needsUpdate, false)
  assert.equal(calls.render, 4)
  assert.deepEqual(calls.renderLayers, [1 << 2, 1, 1 << 2, 1])
  assert.equal(calls.reset, 4)
  assert.deepEqual(layer.cameraProjectionMatrix().elements, projection.elements)
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  assert.equal(renderer.shadowMap.needsUpdate, true)
})

test('场景成员变化才触发重绘并完整移除对象', () => {
  const { map, gl, repaintCalls, layer } = fixture()
  layer.onAdd(map, gl)
  const object = new Object3D()
  const matrix = new Matrix4().makeTranslation(1, 2, 3)
  layer.setObject('winterfell:lod0', object, matrix)
  assert.deepEqual(repaintCalls, ['repaint'])
  assert.equal(object.matrixAutoUpdate, false)
  assert.deepEqual(object.matrix.elements, matrix.elements)
  layer.setObject('winterfell:lod0', object, matrix)
  assert.deepEqual(repaintCalls, ['repaint'])
  layer.removeObject('winterfell:lod0')
  assert.deepEqual(repaintCalls, ['repaint', 'repaint'])
})

test('实时阴影渲染失败只降级光影并恢复共享状态', () => {
  const { map, gl, calls, renderer, warnings, layer } = fixture({ renderError: new Error('shadow failed') })
  layer.onAdd(map, gl)
  layer.setShadowObjects(['winterfell:lod0'])
  layer.setObject('winterfell:lod0', new Mesh(new BoxGeometry(), new MeshStandardMaterial()), new Matrix4())
  assert.doesNotThrow(() => layer.render(gl, { defaultProjectionData: { mainMatrix: new Matrix4().elements } }))
  assert.equal(layer.lightingQuality(), 'low')
  assert.equal(renderer.shadowMap.enabled, false)
  assert.equal(calls.reset, 2)
  assert.equal(warnings.length, 1)
})

test('context 丢失时停止模型渲染，移除时不破坏共享上下文', () => {
  const { canvas, map, gl, calls, layer } = fixture()
  layer.onAdd(map, gl)
  let prevented = false
  const lost = new Event('webglcontextlost', { cancelable: true })
  lost.preventDefault = () => { prevented = true }
  canvas.dispatchEvent(lost)
  layer.render(gl, { defaultProjectionData: { mainMatrix: new Matrix4().elements } })
  assert.equal(prevented, true)
  assert.equal(calls.render, 0)
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  layer.render(gl, { defaultProjectionData: { mainMatrix: new Matrix4().elements } })
  assert.equal(calls.render, 2)
  layer.onRemove()
  assert.equal(calls.dispose, 1)
  assert.equal(calls.forceContextLoss, 0)
  assert.equal(layer.capability(), 'unsupported')
})

test('源码不创建第二 canvas、RAF、控制器或 raycast', () => {
  const source = readFileSync('src/features/map/landmarks/landmarkCustomLayer.ts', 'utf8')
  assert.doesNotMatch(source, /document\.createElement\(['"]canvas|requestAnimationFrame|Raycaster|OrbitControls|TrackballControls|forceContextLoss/)
})
