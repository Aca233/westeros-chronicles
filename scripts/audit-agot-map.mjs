import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

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

function runtimeRelative(path) {
  return relative(dataRoot, path).split(sep).join('/')
}

const manifest = json('manifest.json')
assert.equal(manifest.schemaVersion, 4)
assert.equal(manifest.sourceId, '2962333032')
assert.deepEqual(manifest.mapSize, { width: 9216, height: 6144 })
assert.deepEqual(manifest.paths, {
  dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
  locations: '/data/agot-map/locations',
  materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
  routes: '/data/agot-map/routes',
  searchIndex: '/data/agot-map/location-search-index.json',
  semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
  semanticMembership: '/data/agot-map/semantic/membership.json',
  semanticTitles: '/data/agot-map/semantic/titles.json',
  terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
  terrainLight: '/assets/agot-map/terrain-light/{z}/{x}/{y}.webp',
  vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
})
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
assert.equal(files(resolve(assetRoot, 'terrain-light'), '.webp').length, manifest.counts.terrainLightTiles)
assert.equal(files(resolve(assetRoot, 'material-terrain'), '.webp').length, manifest.counts.materialTerrainTiles)
assert.equal(files(resolve(assetRoot, 'vector'), '.pbf').length, manifest.counts.vectorTiles)
assert.equal(files(resolve(assetRoot, 'dem'), '.png').length, manifest.counts.demTiles)

const semanticTitles = json('semantic/titles.json')
const semanticMembership = json('semantic/membership.json')
assert.equal(semanticTitles.length, manifest.counts.semanticLabels)
assert.equal(semanticMembership.length, manifest.counts.locations)
assert.equal(new Set(semanticTitles.map((title) => title.featureId)).size, semanticTitles.length)
assert.equal(new Set(semanticTitles.map((title) => `${title.rank}:${title.titleId}`)).size, semanticTitles.length)
assert.equal(new Set(semanticMembership.map((entry) => entry.locationId)).size, semanticMembership.length)

const ranks = ['hegemon', 'empire', 'kingdom', 'duchy', 'county']
const rankCounts = Object.fromEntries(ranks.map((rank) => [
  rank,
  semanticTitles.filter((title) => title.rank === rank).length,
]))
assert.deepEqual(rankCounts, {
  hegemon: manifest.counts.semanticHegemons,
  empire: manifest.counts.semanticEmpires,
  kingdom: manifest.counts.semanticKingdoms,
  duchy: manifest.counts.semanticDuchies,
  county: manifest.counts.semanticCounties,
})
for (const rank of ranks) assert.ok(rankCounts[rank] > 0, `${rank} 语义层不能为空`)
assert.equal(semanticTitles.length, ranks.reduce((total, rank) => total + rankCounts[rank], 0))
assert.ok(
  semanticTitles.some((title) => title.rank === 'hegemon' && title.titleId === 'h_the_iron_throne'),
  '语义地图缺少铁王座霸权头衔',
)
for (const title of semanticTitles) {
  assert.ok(Number.isInteger(title.featureId) && title.featureId > 0, `语义 featureId 无效：${title.featureId}`)
  assert.match(title.name, /\p{Script=Han}/u, `语义标题缺少中文名：${title.rank}:${title.titleId}`)
  assert.match(title.titleColor, /^#[0-9a-f]{6}$/, `语义头衔颜色无效：${title.rank}:${title.titleId}`)
  assert.ok(title.regionId, `语义标题缺少地理区域：${title.rank}:${title.titleId}`)
  assert.doesNotMatch(JSON.stringify(title), /houseLabel|familyLabel|dynastyLabel/i)
}

const titleKeys = new Set(semanticTitles.map((title) => `${title.rank}:${title.titleId}`))
for (const entry of semanticMembership) {
  assert.ok(byId.has(entry.locationId), `语义地点不存在：${entry.locationId}`)
  assert.ok(entry.countyId && titleKeys.has(`county:${entry.countyId}`), `伯爵领祖先不存在：${entry.locationId}`)
  assert.ok(entry.duchyId && titleKeys.has(`duchy:${entry.duchyId}`), `公国祖先不存在：${entry.locationId}`)
  assert.ok(entry.regionId, `地理区域不存在：${entry.locationId}`)
  for (const [field, rank] of [
    ['kingdomId', 'kingdom'], ['empireId', 'empire'], ['hegemonId', 'hegemon'],
  ]) {
    if (entry[field]) assert.ok(titleKeys.has(`${rank}:${entry[field]}`), `${rank} 祖先不存在：${entry.locationId}`)
  }
  assert.equal('realmId' in entry, false, `membership 不应保留 realmId：${entry.locationId}`)
}

const semanticTiles = files(resolve(assetRoot, 'semantic'), '.pbf')
assert.equal(semanticTiles.length, manifest.counts.semanticTiles)
const semanticLayerNames = new Set()
const allowedSemanticLayers = new Set([
  'hegemon_surfaces', 'empire_surfaces', 'kingdom_surfaces', 'duchy_surfaces', 'county_surfaces',
  'hegemon_boundaries', 'empire_boundaries', 'kingdom_boundaries',
  'duchy_boundaries', 'county_boundaries', 'title_labels',
])
for (const path of semanticTiles) {
  try {
    const tile = new VectorTile(new Pbf(readFileSync(path)))
    for (const [layerName, layer] of Object.entries(tile.layers)) {
      assert.ok(allowedSemanticLayers.has(layerName), `语义瓦片含未知图层：${layerName}`)
      semanticLayerNames.add(layerName)
      for (let index = 0; index < layer.length; index += 1) layer.feature(index).loadGeometry()
    }
  } catch (error) {
    throw new Error(`语义瓦片无法解码：${relative(assetRoot, path)}`, { cause: error })
  }
}
for (const layerName of allowedSemanticLayers) {
  assert.ok(semanticLayerNames.has(layerName), `语义瓦片缺少图层：${layerName}`)
}

const semanticDigest = createHash('sha256')
for (const relativePath of ['semantic/titles.json', 'semantic/membership.json']) {
  semanticDigest.update(relativePath)
  semanticDigest.update(Buffer.from([0]))
  semanticDigest.update(readFileSync(resolve(dataRoot, relativePath)))
}
for (const path of semanticTiles) {
  const relativePath = `semantic/${relative(resolve(assetRoot, 'semantic'), path).split(sep).join('/')}`
  semanticDigest.update(relativePath)
  semanticDigest.update(Buffer.from([0]))
  semanticDigest.update(readFileSync(path))
}
assert.equal(semanticDigest.digest('hex'), manifest.semanticHash)

const runtimeFiles = files(dataRoot, '.json').filter((path) => {
  const name = runtimeRelative(path)
  // 三维地标使用独立 schema/hash，由 audit-agot-models.mjs 校验，
  // 不属于地图 schemaVersion 4 的 datasetHash。
  return name !== 'manifest.json' && !name.startsWith('reports/') && !name.startsWith('models/')
})
const digest = createHash('sha256')
for (const path of runtimeFiles) {
  const name = runtimeRelative(path)
  digest.update(name)
  digest.update(Buffer.from([0]))
  digest.update(readFileSync(path))
}
assert.equal(digest.digest('hex'), manifest.datasetHash)

console.log(`AGOT 地图数据审计通过：${locations.length} 个地点，${edges.length} 条路线边，${semanticTiles.length} 个语义瓦片。`)
