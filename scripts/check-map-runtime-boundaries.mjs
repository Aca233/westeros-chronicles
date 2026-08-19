import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

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
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

test('地图运行时代码不读取模组源目录、Workshop、Steam 或网络资源', () => {
  assert.doesNotMatch(runtimeSource, /2962333032|Workshop|Steam|\/mnt\/[a-z]|[A-Z]:\\|https?:\/\//i)
})

test('地图运行时代码不含 Emoji', () => {
  assert.doesNotMatch(runtimeSource, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})

test('真实地图导入不会进入 verify 或 verify:quick', () => {
  assert.doesNotMatch(packageJson.scripts.verify ?? '', /import:agot-map/)
  assert.doesNotMatch(packageJson.scripts['verify:quick'] ?? '', /import:agot-map/)
})

test('MapLibre、路线 Worker 与本地瓦片边界保持独立', () => {
  assert.match(runtimeSource, /maplibregl\.Map/)
  assert.match(runtimeSource, /new Worker/)
  assert.match(runtimeSource, /\/assets\/agot-map\//)
  assert.doesNotMatch(runtimeSource, /fetch\([^)]*(?:https?:|Workshop|Steam)/i)
})
