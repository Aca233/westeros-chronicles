import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const ROOTS = ['src/features/map']
// Windows 上 readdirSync/join 产出反斜杠路径,统一转成 POSIX 斜杠再过滤
const toPosix = (path) => path.replace(/\\/g, '/')
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

test('真实地图导入保持为显式开发命令，不被运行时检查间接触发', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const boundaryScripts = [
    manifest.scripts?.['check:map-runtime-boundaries'],
    manifest.scripts?.['check:world-runtime-boundaries'],
    manifest.scripts?.['check:living-world-content-boundaries'],
  ].filter(Boolean).join(' ')
  assert.doesNotMatch(boundaryScripts, /import:agot-(?:map|models)|agot_model_import\.cli convert/)
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
  const landmarkFiles = files.filter((path) => toPosix(path).includes('src/features/map/landmarks/'))
  const landmarkSource = landmarkFiles
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  const layer = readFileSync('src/features/map/landmarks/landmarkCustomLayer.ts', 'utf8')
  const contactShadow = readFileSync('src/features/map/landmarks/landmarkContactShadow.ts', 'utf8')
  const canvasRuntimeSource = files
    .filter((path) => toPosix(path).includes('src/features/map/canvas/') || toPosix(path).endsWith('src/features/map/MapCanvas.tsx'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  assert.match(runtimeSource, /setTerrain/)
  assert.match(runtimeSource, /source:\s*['"]agot-dem['"]/)
  assert.match(layer, /type\s*=\s*['"]custom['"]/)
  assert.match(layer, /renderingMode\s*=\s*['"]3d['"]/)
  assert.match(layer, /canvas:\s*this\.canvas/)
  assert.match(layer, /context:\s*gl/)
  assert.match(layer, /new WebGLRenderer\(parameters\)/)
  assert.match(canvasRuntimeSource, /import\(['"]\.\.\/landmarks\/landmarkRuntime\.ts['"]\)/)
  assert.match(runtimeSource, /map\.addLayer\(layer, COUNTY_HIT_LAYER\)/)
  assert.doesNotMatch(landmarkSource, /document\.createElement\(['"]canvas|new\s+HTMLCanvasElement|requestAnimationFrame|cancelAnimationFrame|new\s+THREE\.Raycaster|new\s+Raycaster|OrbitControls|TrackballControls|forceContextLoss/)
  assert.doesNotMatch(landmarkSource, /https?:\/\/|steamapps|Workshop/i)
  assert.match(contactShadow, /ShaderMaterial/)
  assert.doesNotMatch(contactShadow, /CanvasTexture|TextureLoader|fetch\s*\(/)
  assert.doesNotMatch(runtimeSource, /glyphs:\s*['"]https?:|fallback.*https?:/i)
})


test('连续缩放处理只更新地形镜头', () => {
  const lifecycleSource = readFileSync('src/features/map/canvas/useMapLifecycle.ts', 'utf8')
  const handler = lifecycleSource.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(handler, /requestSync/)
  assert.doesNotMatch(handler, /fetch\(|loadSemanticIndex|syncDynamicMapSubjects|syncPoliticalHouseLabels/)
})

test('地图边界检查可在已删除旧测试套件后独立运行', () => {
  const source = readFileSync('scripts/check-map-runtime-boundaries.mjs', 'utf8')
  const deletedSuitePath = ['verify/', 'suites.mjs'].join('')
  const deletedSuiteSymbol = ['VERIFICATION', '_SUITES'].join('')
  assert.ok(!source.includes(deletedSuitePath))
  assert.ok(!source.includes(deletedSuiteSymbol))
  assert.match(source, /node:test/)
})
