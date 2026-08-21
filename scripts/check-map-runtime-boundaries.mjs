import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import { VERIFICATION_SUITES } from './verify/suites.mjs'

const ROOTS = ['src/features/map']
const files = []
for (const root of ROOTS) {
  const visit = (path) => {
    for (const name of readdirSync(path)) {
      const entry = join(path, name)
      if (statSync(entry).isDirectory()) visit(entry)
      else if (/\.(?:ts|tsx)$/.test(name)) files.push(entry)
    }
  }
  visit(root)
}
const runtimeSource = files.map((path) => `\n/* ${relative('.', path)} */\n${readFileSync(path, 'utf8')}`).join('')

test('地图运行时代码不读取模组源目录、Workshop、Steam 或网络资源', () => {
  assert.doesNotMatch(runtimeSource, /Workshop|Steam|\/mnt\/[a-z]|[A-Z]:\\|https?:\/\//i)
})

test('地图运行时代码不含 Emoji', () => {
  assert.doesNotMatch(runtimeSource, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})

test('真实地图导入不会进入 verify 或 verify:quick', () => {
  const full = VERIFICATION_SUITES.full.map((step) => step.script).join(' ')
  const quick = VERIFICATION_SUITES.quick.map((step) => step.script).join(' ')
  const map = VERIFICATION_SUITES.map.map((step) => step.script).join(' ')
  assert.doesNotMatch(full, /import:agot-(?:map|models)/)
  assert.doesNotMatch(quick, /import:agot-(?:map|models)/)
  assert.doesNotMatch(map, /import:agot-models|agot_model_import\.cli convert/)
})

test('MapLibre、路线 Worker 与本地瓦片边界保持独立', () => {
  assert.match(runtimeSource, /maplibregl\.Map/)
  assert.match(runtimeSource, /new Worker/)
  assert.match(runtimeSource, /\/assets\/agot-map\//)
  assert.doesNotMatch(runtimeSource, /fetch\([^)]*(?:https?:|Workshop|Steam)/i)
})

test('运行时不在连续 zoom 事件重建政治、人物或资产 GeoJSON', () => {
  assert.doesNotMatch(runtimeSource, /map\.on\(['"]zoom['"][\s\S]{0,300}(?:setData|syncDynamicMapSubjects)/)
})

test('三维地标只使用 MapLibre 共享 canvas/context 且没有第二渲染循环或交互系统', () => {
  const landmarkFiles = files.filter((path) => path.includes('src/features/map/landmarks/'))
  const landmarkSource = landmarkFiles
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  const layer = readFileSync('src/features/map/landmarks/landmarkCustomLayer.ts', 'utf8')
  const contactShadow = readFileSync('src/features/map/landmarks/landmarkContactShadow.ts', 'utf8')
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.match(runtimeSource, /setTerrain/)
  assert.match(runtimeSource, /source:\s*['"]agot-dem['"]/)
  assert.match(layer, /type\s*=\s*['"]custom['"]/)
  assert.match(layer, /renderingMode\s*=\s*['"]3d['"]/)
  assert.match(layer, /canvas:\s*this\.canvas/)
  assert.match(layer, /context:\s*gl/)
  assert.match(layer, /new WebGLRenderer\(parameters\)/)
  assert.match(canvas, /import\(['"]\.\/landmarks\/landmarkRuntime\.ts['"]\)/)
  assert.match(runtimeSource, /map\.addLayer\(layer, COUNTY_HIT_LAYER\)/)
  assert.doesNotMatch(landmarkSource, /document\.createElement\(['"]canvas|new\s+HTMLCanvasElement|requestAnimationFrame|cancelAnimationFrame|new\s+THREE\.Raycaster|new\s+Raycaster|OrbitControls|TrackballControls|forceContextLoss/)
  assert.doesNotMatch(landmarkSource, /https?:\/\/|steamapps|Workshop/i)
  assert.match(contactShadow, /ShaderMaterial/)
  assert.doesNotMatch(contactShadow, /CanvasTexture|TextureLoader|fetch\s*\(/)
  assert.doesNotMatch(runtimeSource, /glyphs:\s*['"]https?:|fallback.*https?:/i)
})


test('连续缩放处理只更新地形镜头', () => {
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const handler = canvas.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(handler, /requestSync/)
  assert.doesNotMatch(handler, /fetch\(|loadSemanticIndex|syncDynamicMapSubjects|syncPoliticalHouseLabels/)
})

test('完整地图验证包含全部语义测试且不触发真实导入', () => {
  const verifyMap = VERIFICATION_SUITES.map.map((step) => step.script).join(' ')
  assert.doesNotMatch(verifyMap, /import:agot-map/)
  assert.match(verifyMap, /test:map-semantic-zoom/)
  assert.match(verifyMap, /test:map-semantic-projection/)
  assert.match(verifyMap, /test:map-semantic-layers/)
  assert.match(verifyMap, /test:map-narrative-context/)
  for (const command of [
    'test:map-terrain-profile',
    'test:map-terrain-controller',
    'test:map-terrain-ui',
    'test:map-terrain-integration',
    'test:agot-model-import',
    'test:map-landmark-schema',
    'test:map-landmark-visibility',
    'test:map-landmark-transform',
    'test:map-landmark-lighting-profile',
    'test:map-landmark-material-profile',
    'test:map-landmark-contact-shadow',
    'test:map-landmark-cache',
    'test:map-landmark-layer',
    'test:map-landmark-integration',
    'audit:agot-models',
  ]) {
    assert.match(verifyMap, new RegExp(command))
  }
})
