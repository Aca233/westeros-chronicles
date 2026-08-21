import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const manifest = {
  tileSize: 512,
  minZoom: 0,
  maxZoom: 6,
  paths: {
    terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    terrainLight: '/assets/agot-map/terrain-light/{z}/{x}/{y}.webp',
    materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
    vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
    dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
    semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
  },
}

function layerIndex(style, id) {
  return style.layers.findIndex((layer) => layer.id === id)
}

test('生成的样式通过 MapLibre 官方样式校验', () => {
  const errors = validateStyleMin(createLocalMapStyle(manifest))
  assert.deepEqual(errors.map((error) => error.message), [])
})

test('五级语义边界都有紧邻下方的深色衬底层', () => {
  const style = createLocalMapStyle(manifest)
  for (const rank of ['hegemon', 'empire', 'kingdom', 'duchy', 'county']) {
    const mainIndex = layerIndex(style, `agot-${rank}-boundaries`)
    const casingIndex = layerIndex(style, `agot-${rank}-boundaries-casing`)
    assert.ok(mainIndex > 0, `${rank} 主线缺失`)
    assert.equal(casingIndex, mainIndex - 1, `${rank} 衬底必须紧邻主线下方`)
    const casing = style.layers[casingIndex]
    assert.equal(casing.paint['line-color'], '#17130d')
    assert.equal(casing.paint['line-opacity'][0], 'step')
    assert.equal(casing.paint['line-width'][0], 'interpolate')
  }
})

test('选中伯爵领描边带光晕且随选中同步过滤', () => {
  const style = createLocalMapStyle(manifest)
  const glowIndex = layerIndex(style, 'agot-selected-county-outline-glow')
  const outlineIndex = layerIndex(style, 'agot-selected-county-outline')
  assert.equal(glowIndex, outlineIndex - 1)
  assert.equal(style.layers[glowIndex].paint['line-blur'] > style.layers[outlineIndex].paint['line-blur'], true)
  const layers = readFileSync('src/features/map/mapLayers.ts', 'utf8')
  assert.match(layers, /SELECTED_COUNTY_OUTLINE_GLOW_LAYER[\s\S]*?setFilter/)
  assert.match(layers, /SELECTED_COUNTY_OUTLINE_GLOW_LAYER[\s\S]*?setLayoutProperty/)
})

test('道路衬底与道路由同一自动表达开关控制', () => {
  const style = createLocalMapStyle(manifest)
  assert.equal(layerIndex(style, 'agot-roads-casing'), layerIndex(style, 'agot-roads') - 1)
  const layers = readFileSync('src/features/map/mapLayers.ts', 'utf8')
  assert.match(layers, /\['agot-roads-casing', 'agot-roads'\], presentation\.roads/)
})

test('地表色彩随自动表达渐变而非跳变', () => {
  const style = createLocalMapStyle(manifest)
  for (const id of ['agot-flatmap', 'agot-material-terrain']) {
    const layer = style.layers.find((item) => item.id === id)
    assert.equal(layer.paint['raster-saturation-transition'].duration, 360)
    assert.equal(layer.paint['raster-brightness-max-transition'].duration, 360)
  }
})

test('画布覆盖暗角且不拦截交互', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const block = css.match(/\.agot-map-canvas::after\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert.match(block, /pointer-events:\s*none/)
  assert.match(block, /inset 0 0 96px/)
})

test('政治填色按 CK3 缩放层级硬切换并在近景退出', () => {
  const style = createLocalMapStyle(manifest)
  const expected = {
    hegemon: ['step', ['zoom'], 0.2, 0.85, 0],
    empire: ['step', ['zoom'], 0, 0.85, 0.2, 1.55, 0],
    kingdom: ['step', ['zoom'], 0, 1.55, 0.2, 2.25, 0],
    duchy: ['step', ['zoom'], 0, 2.25, 0.2, 2.95, 0],
    county: ['step', ['zoom'], 0, 2.95, 0.2, 4.6, 0],
  }
  for (const [rank, opacity] of Object.entries(expected)) {
    const surface = style.layers.find((layer) => layer.id === `agot-${rank}-surface`)
    assert.deepEqual(surface.paint['fill-color'], ['get', 'titleColor'])
    assert.deepEqual(surface.paint['fill-opacity'], opacity)
  }
  assert.equal(style.layers.some((layer) => layer.id === 'agot-provinces'), false)
})

test('只保留伯爵领选中描边并彻底移除家族副标题', () => {
  const style = createLocalMapStyle(manifest)
  assert.ok(style.layers.find((item) => item.id === 'agot-selected-county-outline'))
  const serialized = JSON.stringify(style)
  assert.doesNotMatch(serialized, /selected-realm|selected-duchy|political-house|kingdom-house|家族/)
})

test('点击区域直接选择伯爵领，不再逐级下钻', () => {
  const lifecycle = readFileSync('src/features/map/canvas/useMapLifecycle.ts', 'utf8')
  assert.match(lifecycle, /countyIdForBarony\(baronyId\)/)
  assert.match(lifecycle, /onSelectCounty\(countyId\)/)
  assert.doesNotMatch(lifecycle, /onExpandTitle|titleExpansion|expansionDisplayColor/)
  const store = readFileSync('src/features/map/mapUiStore.ts', 'utf8')
  assert.match(store, /selection:\s*MapSelection/)
  assert.doesNotMatch(store, /titleExpansion|expandTitle/)
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  assert.match(drawer, /selectedCountyId=\{selection\.countyId\}/)
})

test('地图内点选不飞镜头,搜索等外部选中仍飞行定位', () => {
  const cameraSync = readFileSync('src/features/map/canvas/useMapCameraSync.ts', 'utf8')
  const lifecycle = readFileSync('src/features/map/canvas/useMapLifecycle.ts', 'utf8')
  assert.match(cameraSync, /if \(!input\.focusRequest \|\| !input\.mapRef\.current\) return/)
  assert.match(cameraSync, /focusRequest!\.target\.kind === 'location'/)
  assert.match(cameraSync, /mapRef\.current\.flyTo\(\{[\s\S]*?zoom: targetZoom/)
  const countyHandler = lifecycle.slice(
    lifecycle.indexOf('const handleCountyClick'),
    lifecycle.indexOf('const handleExpandedLocationClick'),
  )
  assert.doesNotMatch(countyHandler, /flyTo/)
})

test('地形使用固定太阳方向烘焙的透明光照层而非不可见运行时 hillshade', () => {
  const style = createLocalMapStyle(manifest)
  const lighting = style.layers.find((layer) => layer.id === 'agot-terrain-light')
  assert.ok(lighting)
  assert.equal(lighting.type, 'raster')
  assert.ok(lighting.paint['raster-opacity'] >= 0.7)
  assert.equal(style.layers.some((layer) => layer.id === 'agot-hillshade'), false)
})
