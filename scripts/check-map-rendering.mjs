import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { Group, Matrix4 } from 'three'

// Exercise production modules without a DOM, WebGL context, or browser.
const built = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    export * from './src/features/map/mapLayers.ts';
    export * from './src/features/map/semanticAggregation.ts';
    export { createLocalMapStyle } from './src/features/map/mapStyle.ts';
    export { mapPresentationFor } from './src/features/map/mapPresentation.ts';
    export { semanticZoomState } from './src/features/map/semanticZoom.ts';
    export { mapRepository } from './src/features/map/repository.ts';
    export { createMapSemanticProjectionController } from './src/features/map/canvas/semanticProjectionController.ts';
    export { createLandmarkRuntimeController } from './src/features/map/canvas/landmarkRuntimeController.ts';
    export { ensureJourneyLayers, syncJourneyLayers } from './src/features/map/canvas/journeyLayers.ts';
    export { projectPoliticalState } from './src/features/map/politicalProjection.ts';
    export { createLandmarkCustomLayer } from './src/features/map/landmarks/landmarkCustomLayer.ts';
    export { landmarkLightingProfile } from './src/features/map/landmarks/landmarkLightingProfile.ts';
    export { createLandmarkRuntime } from './src/features/map/landmarks/landmarkRuntime.ts';
    export { landmarkRepository } from './src/features/map/landmarks/landmarkRepository.ts';
    export { terrainCameraProfile } from './src/features/map/terrainProfile.ts';
    export { classifyTerrainSurfaceError, createTerrainSurfaceController } from './src/features/map/terrainSurfaceController.ts';
    export { createCk3MapOptions } from './src/features/map/cameraProfile.ts';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  logLevel: 'silent',
})
const compiled = new Module(resolve('.cache/map-rendering-check.cjs'))
compiled.paths = Module._nodeModulePaths(process.cwd())
compiled._compile(built.outputFiles[0].text, compiled.filename = resolve('.cache/map-rendering-check.cjs'))
const api = compiled.exports
const manifest = JSON.parse(readFileSync('public/data/agot-map/manifest.json', 'utf8'))
const empty = { type: 'FeatureCollection', features: [] }

function fakeMap(zoom = 4.8) {
  const style = api.createLocalMapStyle(manifest)
  const layers = new Map(style.layers.map(layer => [layer.id, layer]))
  const sources = new Map()
  const images = new Set()
  const map = {
    zoom, loaded: true, dirtyOnWrite: true, writes: [], setters: 0, layers, sources,
    getZoom() { return this.zoom },
    isStyleLoaded() { return this.loaded },
    isSourceLoaded(id) { return sources.has(id) },
    getLayer(id) { return layers.get(id) },
    getSource(id) { return sources.get(id) },
    addLayer(layer) { layers.set(layer.id, structuredClone(layer)) },
    addSource(id, source) {
      sources.set(id, {
        ...source,
        setData(data) { this.data = data; map.writes.push(id); if (map.dirtyOnWrite) map.loaded = false },
      })
    },
    setLayoutProperty(id, name, value) {
      this.setters++; const layer = layers.get(id); layer.layout ??= {}; layer.layout[name] = value
    },
    setPaintProperty(id, name, value) {
      this.setters++; const layer = layers.get(id); layer.paint ??= {}; layer.paint[name] = value
    },
    setFilter(id, filter) { layers.get(id).filter = filter },
    setFeatureState() {}, removeFeatureState() {},
    hasImage(id) { return images.has(id) },
    loadImage: async () => ({ data: {} }),
    addImage(id) { images.add(id) },
    getBounds() { return { getWest: () => -180, getEast: () => 180, getNorth: () => 85, getSouth: () => -85 } },
  }
  for (const [id, source] of Object.entries(style.sources)) map.addSource(id, source)
  return map
}

const entries = ['a', 'b'].map((id, index) => ({
  id: `b_${id}`, name: id, regionId: 'test', type: 'castle', importance: 1,
  mapX: 1000 + index * 100, mapY: 1000,
}))
const semantic = {
  titles: entries.map(entry => ({ titleId: `c_${entry.name}`, name: entry.name, rank: 'county', importance: 1, mapX: entry.mapX, mapY: entry.mapY })),
  memberships: entries.map(entry => ({ locationId: entry.id, baronyId: entry.id, countyId: `c_${entry.name}` })),
}
const noPoints = []
async function controller(map, state = {}) {
  const semanticRef = { current: null }
  api.mapRepository.loadSearchIndex = async () => entries
  api.mapRepository.loadSemanticIndex = async () => semantic
  const instance = api.createMapSemanticProjectionController({
    map, manifest, semanticRef, countyInteractionRef: { current: null },
    getPresentation: () => api.mapPresentationFor({
      zoom: map.zoom, overlays: { political: true, characters: true, assets: true, roads: true }, selectedCountyId: state.county ?? null,
    }),
    getSelectedCountyId: () => state.county ?? null,
    getPoliticalStates: () => [],
    getCharacterPoints: () => state.characters ?? noPoints,
    getAssetPoints: () => noPoints,
    hasRoute: () => state.hasRoute ?? false,
    onInitializationError(value) { assert.equal(value, false) },
    onWarning(message) { assert.fail(message) },
  })
  await instance.initialize()
  return { instance, semanticRef }
}

function labelsAt(map, zoom) {
  return [...map.layers.values()].filter(layer => layer.id.endsWith('-labels')
    && layer.layout.visibility !== 'none' && zoom >= (layer.minzoom ?? 0) && zoom < (layer.maxzoom ?? 24)).map(layer => layer.id)
}

test('完整运行时样式通过 MapLibre 校验，近远景标记没有残留描边', () => {
  const map = fakeMap()
  api.addDynamicMapSubjectLayers(map)
  api.addSelectedCountyLocationLayers(map)
  api.ensureJourneyLayers(map)
  const style = api.createLocalMapStyle(manifest)
  style.layers = [...map.layers.values()]
  style.sources = Object.fromEntries([...map.sources].map(([id, { setData, ...source }]) => [id, source]))
  assert.deepEqual(validateStyleMin(style).map(error => error.message), [])
  for (const id of [api.CHARACTER_AGGREGATE_LAYER, api.ASSET_AGGREGATE_LAYER, api.CHARACTER_POINT_LAYER, api.ASSET_POINT_LAYER]) {
    assert.equal(map.layers.get(id).paint['circle-stroke-opacity'][0], 'interpolate')
  }
})

test('缩放双向跨级时标签立即切换，近景继续保留伯爵领名称', async () => {
  const map = fakeMap(1.4)
  const { instance, semanticRef } = await controller(map)
  for (const [zoom, rank] of [[1.7, 'kingdom'], [2.4, 'duchy'], [3.1, 'county'], [1.1, 'empire'], [0.5, 'hegemon']]) {
    map.zoom = zoom
    instance.syncPresentation()
    instance.syncZoom()
    assert.equal(semanticRef.current.primaryRank, rank)
    assert.deepEqual(labelsAt(map, zoom), [`agot-${rank}-labels`])
  }
  assert.deepEqual(labelsAt(map, 4.8), ['agot-county-labels'])
  instance.destroy()
})

test('近景持续显示伯爵领边界和伯爵领名称，不额外叠加省级细边界', () => {
  const style = api.createLocalMapStyle(manifest)
  const byId = new Map(style.layers.map(layer => [layer.id, layer]))
  const countyBoundary = byId.get('agot-county-boundaries')
  const countyBoundaryCasing = byId.get('agot-county-boundaries-casing')
  const countyLabel = byId.get('agot-county-labels')
  assert.equal(countyBoundary.minzoom, 2.95)
  assert.equal(countyBoundary.maxzoom, undefined)
  assert.equal(countyBoundaryCasing.maxzoom, undefined)
  assert.equal(countyLabel.minzoom, 2.95)
  assert.equal(countyLabel.maxzoom, undefined)
  assert.equal(byId.has('agot-local-province-boundaries'), false)
  assert.equal(byId.has('agot-local-province-boundaries-casing'), false)
})

test('连续 120 个同层级缩放事件不反复写样式或 GeoJSON', async () => {
  const map = fakeMap(1)
  const { instance } = await controller(map)
  map.setters = 0; map.writes.length = 0
  for (let frame = 0; frame < 120; frame++) {
    map.zoom = 1 + frame / 1000
    instance.syncPresentation()
  }
  assert.equal(map.setters, 0)
  assert.equal(map.writes.length, 0)
  console.log('map zoom budget: 120 events, 0 style writes, 0 GeoJSON writes')
  instance.destroy()
})

test('瓦片或其他 GeoJSON 正在加载时仍提交选中区域和人物更新', async () => {
  const map = fakeMap()
  const state = { county: 'c_a', characters: noPoints }
  const { instance } = await controller(map, state)
  assert.equal(map.loaded, false)
  state.county = 'c_b'
  state.characters = [{ id: 'p', characterId: 'agot:p', name: 'P', locationId: 'b_b', mapX: 1100, mapY: 1000 }]
  instance.syncSelection(); instance.refreshSubjects()
  assert.equal(map.sources.get(api.SELECTED_COUNTY_LOCATION_SOURCE).data.features[0].id, 'b_b')
  assert.equal(map.sources.get(api.CHARACTER_POINT_SOURCE).data.features[0].properties.characterId, 'agot:p')
  map.writes.length = 0
  for (let i = 0; i < 20; i++) { instance.syncSelection(); instance.refreshSubjects() }
  assert.equal(map.writes.length, 0)
  instance.destroy()
})

test('近景显示视野内全部已知人物，超出前八位的人物也能出现', () => {
  const map = fakeMap()
  const points = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, characterId: `agot:p${i}`, name: `P${i}`, locationId: 'b_a', mapX: 1000, mapY: 1000 }))
  api.syncDynamicMapSubjects(map, manifest, points, [], { minX: 900, maxX: 1100, minY: 900, maxY: 1100 }, { ...semantic, zoomState: api.semanticZoomState(4.8) })
  assert.equal(map.sources.get(api.CHARACTER_POINT_SOURCE).data.features.length, 12)
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  assert.doesNotMatch(drawer, /all(?:Character|Asset)Points\.slice\(0,/)
})

test('路线在瓦片加载期间仍能新增、更新和清除', () => {
  const map = fakeMap(); map.loaded = false
  const route = { id: 'route', legs: [{ fromPoint: entries[0], toPoint: entries[1], days: 1 }] }
  api.syncJourneyLayers(map, manifest, route, undefined)
  assert.equal(map.sources.get(api.JOURNEY_ROUTE_SOURCE).data.features.length, 1)
  api.syncJourneyLayers(map, manifest, null, undefined)
  assert.deepEqual(map.sources.get(api.JOURNEY_ROUTE_SOURCE).data, empty)
})

test('政治描边区分普通封臣关系与实际占领', () => {
  const titles = [{ baronyId: 'b_a', countyId: 'c_a', provinceId: 1 }]
  const characters = [{ id: 'agot:baron', titleIds: ['b_a'] }, { id: 'agot:count', titleIds: ['c_a'] }]
  const args = [titles, characters, { turns: [] }, { year: 298, month: 1, day: 1 }]
  assert.equal(api.projectPoliticalState(...args)[0].isContested, false)
  assert.equal(api.projectPoliticalState(...args, [], { c_a: { controllerId: 'agot:enemy' } })[0].isContested, true)
})

test('聚合复用静态索引，同时新快照能更新头衔锚点', () => {
  const input = { ...semantic, points: [{ id: 'p', characterId: 'agot:p', locationId: 'b_a', mapX: 1000, mapY: 1000 }], pixelBounds: manifest.westerosBounds }
  const first = api.aggregateCharacterPoints(input)
  assert.deepEqual(api.aggregateCharacterPoints(input), first)
  const next = api.aggregateCharacterPoints({ ...input, titles: semantic.titles.map(title => ({ ...title, mapX: 1234 })) })
  assert.equal(next[0].mapX, 1234)
  assert.equal(first[0].mapX, 1000)
})

test('空地标图层不提交 Three.js 渲染，非空保留地面阴影与模型两次绘制', () => {
  let renders = 0
  const renderer = { autoClear: false, outputColorSpace: '', shadowMap: {}, resetState() {}, render() { renders++ }, dispose() {} }
  const layer = api.createLandmarkCustomLayer({ rendererFactory: () => renderer, isWebGL2: () => true, lightingProfile: api.landmarkLightingProfile({ hardwareConcurrency: 2 }) })
  layer.onAdd({ getCanvas: () => ({ addEventListener() {}, removeEventListener() {} }), triggerRepaint() {} }, {})
  const frame = { defaultProjectionData: { mainMatrix: new Matrix4().toArray() } }
  for (let i = 0; i < 120; i++) layer.render({}, frame)
  assert.equal(renders, 0)
  layer.setObject('test', new Group(), new Matrix4())
  layer.render({}, frame)
  assert.equal(renders, 2)
  layer.clearObjects(); layer.render({}, frame)
  assert.equal(renders, 2)
  layer.onRemove()
  console.log('empty landmark budget: 120 frames, 0 Three.js render calls')
})

test('远景不加载地标清单，销毁后延迟清单不能创建 GPU 图层', async () => {
  let loads = 0
  const previous = api.landmarkRepository.loadManifest
  api.landmarkRepository.loadManifest = async () => { loads++; return { landmarks: [] } }
  try {
    const control = api.createLandmarkRuntimeController(fakeMap(2), manifest)
    await control.initialize()
    control.sync('moveend')
    assert.equal(loads, 0)
    control.destroy()
    let complete
    const gate = new Promise(resolve => { complete = resolve })
    const abort = new AbortController()
    const pending = api.createLandmarkRuntime({}, manifest, { signal: abort.signal, manifestLoader: () => gate })
    abort.abort(); complete({ landmarks: [] })
    await assert.rejects(pending, { name: 'AbortError' })
  } finally {
    api.landmarkRepository.loadManifest = previous
  }
})

test('默认阴影、像素密度和近景俯仰限制额外 GPU 开销', () => {
  const lighting = api.landmarkLightingProfile({ hardwareConcurrency: 16, deviceMemory: 16 })
  assert.equal(lighting.shadowMapSize, 1024)
  assert.equal(lighting.realtimeShadowLimit, 1)
  assert.ok(api.createCk3MapOptions(manifest, false).pixelRatio <= 1.5)
  const terrain = api.terrainCameraProfile({ zoom: 6, available: true, topDownLocked: false, terrainWasEnabled: true })
  assert.equal(terrain.terrainEnabled, true)
  assert.equal(terrain.pitch, 40)
})

test('近景材质只对真实 source 级故障永久降级，单瓦片和 Abort 保留近景能力', () => {
  const materialSource = api.MATERIAL_TERRAIN_SOURCE
  assert.equal(api.classifyTerrainSurfaceError({
    sourceId: 'agot-terrain-light',
    error: { message: `unrelated ${materialSource} text` },
  }), 'unrelated')
  assert.equal(api.classifyTerrainSurfaceError({
    sourceId: materialSource,
    tile: { id: '5/16/16' },
    error: { message: 'Image decode failed' },
  }), 'transient')
  assert.equal(api.classifyTerrainSurfaceError({
    sourceId: materialSource,
    error: { name: 'AbortError', message: 'The operation was aborted' },
  }), 'transient')
  assert.equal(api.classifyTerrainSurfaceError({
    sourceId: materialSource,
    error: { message: 'Source initialization failed' },
  }), 'fatal')

  const warnings = []
  const map = fakeMap(5)
  const surface = api.createTerrainSurfaceController(map, { onUnavailable: reason => warnings.push(reason) })
  surface.syncNow(5)
  assert.equal(surface.isAvailable(), true)
  assert.equal(surface.isNear(), true)
  assert.deepEqual(warnings, [])
  surface.destroy()
})
