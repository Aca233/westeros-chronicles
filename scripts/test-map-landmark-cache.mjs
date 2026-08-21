import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, Texture } from 'three'

import { createLandmarkContactShadow, createLandmarkShadowReceiver } from '../src/features/map/landmarks/landmarkContactShadow.ts'
import { configureLandmarkMaterial, configureLandmarkRenderable, disposeObject3D, LandmarkResourceCache } from '../src/features/map/landmarks/landmarkResourceCache.ts'

function request(key, bytes = 1) { return { key, lod: { path: key, bytes }, landmark: {}, lodLevel: 1 } }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('并发最多两个、离开需求集合会取消、清空释放资源', async () => {
  const jobs = []
  const disposed = []
  const cache = new LandmarkResourceCache({ maxConcurrent: 2, maxBytes: 100, loader: (item, signal) => {
    const job = deferred(); signal.addEventListener('abort', () => job.reject(new DOMException('Aborted', 'AbortError')), { once: true }); jobs.push({ item, signal, job }); return job.promise
  } })
  cache.reconcile(new Set(['a', 'b', 'c']))
  const promises = ['a', 'b', 'c'].map((key) => cache.request(request(key)))
  assert.equal(jobs.length, 2)
  jobs[0].job.resolve({ key: 'a', object: new Group(), bytes: 1, dispose: () => disposed.push('a') })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(jobs.length, 3)
  cache.reconcile(new Set(['a']))
  assert.equal(jobs[1].signal.aborted, true)
  assert.equal(jobs[2].signal.aborted, true)
  cache.clear()
  await Promise.allSettled(promises)
  assert.deepEqual(disposed, ['a'])
})

test('递归释放会去重共享 geometry material texture', () => {
  const geometry = new BoxGeometry()
  const texture = new Texture()
  const material = new MeshStandardMaterial({ map: texture, normalMap: texture })
  const calls = { geometry: 0, texture: 0, material: 0 }
  geometry.dispose = () => { calls.geometry += 1 }
  texture.dispose = () => { calls.texture += 1 }
  material.dispose = () => { calls.material += 1 }
  const group = new Group(); group.add(new Mesh(geometry, material), new Mesh(geometry, material))
  disposeObject3D(group)
  assert.deepEqual(calls, { geometry: 1, texture: 1, material: 1 })
})


test('同一在途资源的重复请求全部完成且只加载一次', async () => {
  const job = deferred()
  let loads = 0
  const cache = new LandmarkResourceCache({ maxConcurrent: 2, maxBytes: 100, loader: () => {
    loads += 1
    return job.promise
  } })
  cache.reconcile(new Set(['shared']))
  const first = cache.request(request('shared'))
  const second = cache.request(request('shared'))
  const resource = { key: 'shared', object: new Group(), bytes: 1, dispose() {} }
  job.resolve(resource)
  assert.equal(await first, resource)
  assert.equal(await second, resource)
  assert.equal(loads, 1)
  cache.clear()
})

test('CK3 地标材质使用双面哑光并减弱过黑 AO', () => {
  const material = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 })
  material.aoMap = new Texture()
  const version = material.version
  configureLandmarkMaterial(material)
  assert.equal(material.side, DoubleSide)
  assert.equal(material.metalness, 0)
  assert.equal(material.roughness, 0.88)
  assert.equal(material.aoMapIntensity, 0.18)
  assert.equal(material.shadowSide, FrontSide)
  assert.ok(material.version > version)
})


test('偏暗 CK3 贴图只获得低强度中性补光且不再像自发光塑料', () => {
  const harrenhalMap = new Texture()
  const harrenhal = new MeshStandardMaterial({ map: harrenhalMap })
  harrenhal.name = 'building_special_HH_Dread_ruinedShape'
  configureLandmarkMaterial(harrenhal, 'harrenhal')
  assert.equal(harrenhal.emissiveMap, harrenhalMap)
  assert.equal(harrenhal.emissive.getHex(), 0xd8d2c6)
  assert.ok(harrenhal.emissiveIntensity > 0 && harrenhal.emissiveIntensity <= 0.14)


  const pykeMap = new Texture()
  const pyke = new MeshStandardMaterial({ map: pykeMap })
  pyke.name = 'building_special_pyke01Shape'
  configureLandmarkMaterial(pyke, 'pyke')
  assert.equal(pyke.emissiveMap, pykeMap)
  assert.ok(pyke.emissiveIntensity > 0 && pyke.emissiveIntensity < harrenhal.emissiveIntensity)

  const winterfellMap = new Texture()
  const winterfell = new MeshStandardMaterial({ map: winterfellMap })
  winterfell.name = 'winterfell_new_outerShape'
  configureLandmarkMaterial(winterfell, 'winterfell')
  assert.equal(winterfell.emissiveMap, winterfellMap)
  assert.equal(winterfell.emissive.getHex(), 0xd8d2c6)
  assert.ok(winterfell.emissiveIntensity > 0 && winterfell.emissiveIntensity <= 0.03)
})

test('普通地标恢复建筑自阴影但赫伦堡复杂废墟不接收实时阴影', () => {
  const ordinaryMaterial = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 })
  const ordinary = new Mesh(new BoxGeometry(), ordinaryMaterial)
  configureLandmarkRenderable(ordinary, 'winterfell')
  assert.equal(ordinary.castShadow, true)
  assert.equal(ordinary.receiveShadow, true)

  const harrenhal = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  configureLandmarkRenderable(harrenhal, 'harrenhal')
  assert.equal(harrenhal.castShadow, true)
  assert.equal(harrenhal.receiveShadow, false)
  assert.equal(ordinaryMaterial.side, DoubleSide)
  assert.equal(ordinaryMaterial.metalness, 0)
  assert.equal(ordinaryMaterial.roughness, 0.88)
})

test('接触阴影随模型资源递归释放', () => {
  const model = new Group()
  model.add(new Mesh(new BoxGeometry(8, 4, 5), new MeshStandardMaterial()))
  const shadow = createLandmarkContactShadow(model)
  assert.ok(shadow)
  let geometryDisposals = 0
  let materialDisposals = 0
  shadow.geometry.dispose = () => { geometryDisposals += 1 }
  shadow.material.dispose = () => { materialDisposals += 1 }
  model.add(shadow)
  disposeObject3D(model)
  assert.equal(geometryDisposals, 1)
  assert.equal(materialDisposals, 1)
})

test('实时阴影承接面随模型资源递归释放', () => {
  const model = new Group()
  model.add(new Mesh(new BoxGeometry(8, 12, 5), new MeshStandardMaterial()))
  const receiver = createLandmarkShadowReceiver(model)
  assert.ok(receiver)
  let geometryDisposals = 0
  let materialDisposals = 0
  receiver.geometry.dispose = () => { geometryDisposals += 1 }
  receiver.material.dispose = () => { materialDisposals += 1 }
  model.add(receiver)
  disposeObject3D(model)
  assert.equal(geometryDisposals, 1)
  assert.equal(materialDisposals, 1)
})
