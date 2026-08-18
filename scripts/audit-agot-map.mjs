import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const dataRoot = resolve(option('--data', 'public/data/agot-map'))
const assetRoot = resolve(option('--assets', 'public/assets/agot-map'))

function json(path) {
  return JSON.parse(readFileSync(resolve(dataRoot, path), 'utf8'))
}

function files(root, suffix) {
  if (!existsSync(root)) return []
  const output = []
  for (const entry of readdirSync(root)) {
    const path = resolve(root, entry)
    if (statSync(path).isDirectory()) output.push(...files(path, suffix))
    else if (!suffix || path.endsWith(suffix)) output.push(path)
  }
  return output.sort()
}

const manifest = json('manifest.json')
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.sourceId, '2962333032')
assert.deepEqual(manifest.mapSize, { width: 9216, height: 6144 })
const serializedManifest = JSON.stringify(manifest)
assert.doesNotMatch(serializedManifest, /https?:|\\|\/mnt\/c\/agot\/2962333032/i)
for (const path of Object.values(manifest.paths)) assert.match(path, /^\/(data|assets)\/agot-map\//)

const locationFiles = files(resolve(dataRoot, 'locations'), '.json')
const locations = locationFiles.flatMap((path) => JSON.parse(readFileSync(path, 'utf8')))
assert.equal(locations.length, manifest.counts.locations)
assert.equal(new Set(locations.map((item) => item.id)).size, locations.length)
const byId = new Map(locations.map((item) => [item.id, item]))

const routeFiles = files(resolve(dataRoot, 'routes'), '.json')
const routeShards = routeFiles.map((path) => JSON.parse(readFileSync(path, 'utf8')))
const edges = routeShards.flatMap((item) => item.edges)
assert.equal(edges.length, manifest.counts.routeEdges)
for (const edge of edges) {
  assert.ok(byId.has(edge.from), `路线起点不存在：${edge.from}`)
  assert.ok(byId.has(edge.to), `路线终点不存在：${edge.to}`)
  if (edge.crossing === 'sea') {
    assert.equal(byId.get(edge.from).isPort, true)
    assert.equal(byId.get(edge.to).isPort, true)
  }
}

const political = json('political/titles.json')
for (const record of political) assert.ok(byId.has(record.baronyId), `政治地点不存在：${record.baronyId}`)
assert.equal(files(resolve(assetRoot, 'terrain'), '.webp').length, manifest.counts.terrainTiles)
assert.equal(files(resolve(assetRoot, 'vector'), '.pbf').length, manifest.counts.vectorTiles)
assert.equal(files(resolve(assetRoot, 'dem'), '.png').length, manifest.counts.demTiles)

const runtimeFiles = files(dataRoot, '.json').filter((path) => {
  const name = relative(dataRoot, path).split(sep).join('/')
  return name !== 'manifest.json' && !name.startsWith('reports/')
})
const digest = createHash('sha256')
for (const path of runtimeFiles) {
  const name = relative(dataRoot, path).split(sep).join('/')
  digest.update(name)
  digest.update(Buffer.from([0]))
  digest.update(readFileSync(path))
}
assert.equal(digest.digest('hex'), manifest.datasetHash)

console.log(`AGOT 地图数据审计通过：${locations.length} 个地点，${edges.length} 条路线边，${manifest.counts.vectorTiles} 个矢量瓦片。`)
