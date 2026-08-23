import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Group } from 'three'

import { createLandmarkRuntime } from '../src/features/map/landmarks/landmarkRuntime.ts'

function record(id, mapX, mapY, provinceId) {
  return {
    id, locationId: `b_${id.replaceAll('-', '_')}`, provinceId, name: id,
    transform: { mapX, mapY, elevationMeters: 0, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    lods: [
      { minZoom: 5.35, path: `/assets/agot-map/models/${id}/lod0.glb`, bytes: 100, triangleCount: 100, sha256: 'a'.repeat(64) },
      { minZoom: 4.6, path: `/assets/agot-map/models/${id}/lod1.glb`, bytes: 50, triangleCount: 35, sha256: 'b'.repeat(64) },
    ],
    bounds: { radiusMapPixels: 10, heightMeters: 20 },
  }
}
const records = [
  record('winterfell', 50, 50, 1),
  record('red-keep', 65, 50, 2),
  record('dragonstone', 80, 50, 3),
]
const modelManifest = { landmarks: records }
const mapManifest = { westerosBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, mapSize: { width: 100, height: 100 } }

function fixture() {
  const events = []
  let zoom = 5.5
  let layer = null
  const map = {
    getLayer: (id) => layer?.id === id ? layer : undefined,
    addLayer(value, before) { events.push(['addLayer', value.id, before]); layer = value },
    removeLayer(id) { events.push(['removeLayer', id]); layer?.onRemove?.(); layer = null },
    getZoom: () => zoom,
    getBounds: () => ({ getWest: () => -180, getNorth: () => 85.05112878, getEast: () => 180, getSouth: () => -85.05112878 }),
  }
  const objects = new Map()
  const fakeLayer = {
    id: 'agot-landmark-models', type: 'custom', renderingMode: '3d', shadowKeys: [],
    capability: () => 'webgl2',
    lightingQuality: () => 'high',
    setShadowObjects(keys) { this.shadowKeys = [...keys]; events.push(['shadow', ...keys]) },
    setObject(key, object, matrix) { objects.set(key, { object, matrix }); events.push(['setObject', key]) },
    removeObject(key) { objects.delete(key); events.push(['removeObject', key]) },
    clearObjects() { objects.clear() },
    onRemove() { this.clearObjects() },
    render() {},
  }
  const resources = new Map()
  const cache = {
    retained: new Set(),
    reconcile(keys) { this.retained = new Set(keys); events.push(['reconcile', ...keys]) },
    async request(request) {
      events.push(['request', request.key])
      if (!resources.has(request.key)) resources.set(request.key, { key: request.key, object: new Group(), bytes: request.lod.bytes, dispose() { events.push(['dispose', request.key]) } })
      return resources.get(request.key)
    },
    clear() { events.push(['clear']); for (const resource of resources.values()) resource.dispose() },
  }
  return { map, fakeLayer, cache, events, objects, setZoom(value) { zoom = value } }
}

async function createForHardware(hardware) {
  const f = fixture()
  let receivedProfile = null
  const runtime = await createLandmarkRuntime(f.map, mapManifest, {
    manifestLoader: async () => modelManifest,
    layerFactory: (profile) => { receivedProfile = profile; f.fakeLayer.lightingQuality = () => profile.quality; return f.fakeLayer },
    cacheFactory: () => f.cache,
    hardware,
  })
  await runtime.whenIdle()
  return { ...f, runtime, receivedProfile }
}

test('高质量运行时选择距离视野中心最近的两个实时阴影地标', async () => {
  const f = await createForHardware({ hardwareConcurrency: 8, deviceMemory: 8 })
  assert.equal(f.receivedProfile.quality, 'high')
  assert.deepEqual(f.fakeLayer.shadowKeys, ['winterfell:lod0', 'red-keep:lod0'])
  assert.deepEqual(f.events[0], ['addLayer', 'agot-landmark-models', 'agot-county-hit-areas'])
  assert.ok(f.objects.has('winterfell:lod0'))
  assert.deepEqual(f.runtime.syncReasons(), ['manifest-ready'])
  f.runtime.sync('moveend')
  f.runtime.sync('zoomend')
  await f.runtime.whenIdle()
  assert.deepEqual(f.runtime.syncReasons(), ['manifest-ready', 'moveend', 'zoomend'])
  f.runtime.destroy()
  assert.deepEqual(f.fakeLayer.shadowKeys, [])
  assert.ok(f.events.find(([name]) => name === 'clear'))
  assert.ok(f.events.find(([name]) => name === 'removeLayer'))
})

test('中质量只选择最近地标，低质量保留 LOD1 但关闭实时阴影', async () => {
  const medium = await createForHardware({ hardwareConcurrency: 8, deviceMemory: 4 })
  assert.equal(medium.receivedProfile.quality, 'medium')
  assert.deepEqual(medium.fakeLayer.shadowKeys, ['winterfell:lod0'])
  medium.runtime.destroy()

  const low = await createForHardware({ hardwareConcurrency: 4, deviceMemory: 8 })
  assert.equal(low.receivedProfile.quality, 'low')
  assert.deepEqual(low.fakeLayer.shadowKeys, [])
  assert.ok(low.events.find((entry) => entry[0] === 'request' && entry[1] === 'winterfell:lod1'))
  low.setZoom(4)
  low.runtime.sync('zoomend')
  await low.runtime.whenIdle()
  assert.equal(low.cache.retained.size, 0)
  low.runtime.destroy()
})

test('MapCanvas 动态加载模型运行时，保留二维点击权威并先销毁模型再移除地图', () => {
  const lifecycle = readFileSync('src/features/map/canvas/useMapLifecycle.ts', 'utf8')
  const controller = readFileSync('src/features/map/canvas/landmarkRuntimeController.ts', 'utf8')
  const source = `${lifecycle}\n${controller}`
  assert.match(controller, /import\(['"]\.\.\/landmarks\/landmarkRuntime\.ts['"]\)/)
  assert.match(lifecycle, /landmarkController\.sync\(['"]moveend['"]\)/)
  assert.match(lifecycle, /landmarkController\.sync\(['"]zoomend['"]\)/)
  assert.match(lifecycle, /landmarkController\.destroy\(\)[\s\S]*map\.remove\(\)/)
  const terrainHandler = lifecycle.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.doesNotMatch(terrainHandler, /landmark|GLTF|fetch\(/i)
  for (const layer of ['COUNTY_HIT_LAYER', 'SELECTED_COUNTY_LOCATION_LAYER', 'CHARACTER_POINT_LAYER', 'ASSET_POINT_LAYER']) {
    assert.match(source, new RegExp(`map\\.on\\('click', ${layer}`))
  }
  assert.doesNotMatch(source, /setInitializationError\([^)]*landmark|setSemanticInitializationError\([^)]*landmark/i)
})
