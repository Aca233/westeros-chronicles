import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/map/routing/pathfinder.ts'",
      "export * from './src/features/map/routing/routeClient.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'map-routing-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const { findRoute, RouteClient } = await import(url)

const nodes = [
  ['b_start', 0, 0, false],
  ['b_fast', 1, 0, false],
  ['b_safe', 0, 1, false],
  ['b_cheap', 1, 1, false],
  ['b_finish', 2, 0, false],
  ['b_road', 1, -1, false],
  ['b_port_a', 4, 0, true],
  ['b_port_b', 6, 0, true],
].map(([id, mapX, mapY, isPort], index) => ({
  id,
  locationId: id,
  mapX,
  mapY,
  provinceId: index + 1,
  regionId: 'test_region',
  isPort,
}))

function edge(from, to, { days, cost, risk, modes = ['walk', 'horse'], roadLevel = 'none', crossing = 'land', seasonTags = [] }) {
  return {
    id: `${from}>${to}`,
    from,
    to,
    distance: days * 40,
    roadLevel,
    crossing,
    allowedModes: modes,
    baseDays: days,
    baseCost: cost,
    risk,
    seasonTags,
  }
}

const directed = [
  edge('b_start', 'b_fast', { days: 1, cost: 8, risk: 0.9, seasonTags: ['winter_danger'] }),
  edge('b_fast', 'b_finish', { days: 1, cost: 8, risk: 0.9, seasonTags: ['winter_danger'] }),
  edge('b_start', 'b_safe', { days: 3, cost: 8, risk: 0.05 }),
  edge('b_safe', 'b_finish', { days: 3, cost: 8, risk: 0.05 }),
  edge('b_start', 'b_cheap', { days: 2, cost: 1, risk: 0.4 }),
  edge('b_cheap', 'b_finish', { days: 2, cost: 1, risk: 0.4 }),
  edge('b_start', 'b_road', { days: 1.4, cost: 3, risk: 0.2, modes: ['walk', 'horse', 'carriage'], roadLevel: 'major' }),
  edge('b_road', 'b_finish', { days: 1.4, cost: 3, risk: 0.2, modes: ['walk', 'horse', 'carriage'], roadLevel: 'major' }),
  edge('b_port_a', 'b_port_b', { days: 2, cost: 6, risk: 0.15, modes: ['ship'], crossing: 'sea' }),
]
const edges = directed.flatMap((entry) => [entry, { ...entry, id: `${entry.to}>${entry.from}`, from: entry.to, to: entry.from }])
const graph = { nodes, edges, graphHash: 'a'.repeat(64) }

function assertPlan(result) {
  assert.equal(result.ok, true, result.reason)
  return result
}

test('最快、最安全和最省钱会选择不同路径', () => {
  const base = { from: 'b_start', to: 'b_finish', travelMode: 'walk', via: [], season: 'summer' }
  const fastest = assertPlan(findRoute(graph, { ...base, preference: 'fastest' }))
  const safest = assertPlan(findRoute(graph, { ...base, preference: 'safest' }))
  const cheapest = assertPlan(findRoute(graph, { ...base, preference: 'cheapest' }))
  assert.deepEqual(fastest.legs.map((leg) => leg.to), ['b_fast', 'b_finish'])
  assert.deepEqual(safest.legs.map((leg) => leg.to), ['b_safe', 'b_finish'])
  assert.deepEqual(cheapest.legs.map((leg) => leg.to), ['b_cheap', 'b_finish'])
})

test('途经点严格按请求顺序串联，重复请求产生相同路线 ID', () => {
  const request = {
    from: 'b_fast',
    to: 'b_safe',
    via: ['b_finish', 'b_cheap', 'b_start'],
    preference: 'fastest',
    travelMode: 'walk',
    season: 'summer',
  }
  const first = assertPlan(findRoute(graph, request))
  const second = assertPlan(findRoute(graph, structuredClone(request)))
  const visited = [request.from, ...first.legs.map((leg) => leg.to)]
  let cursor = -1
  for (const waypoint of [...request.via, request.to]) {
    cursor = visited.indexOf(waypoint, cursor + 1)
    assert.notEqual(cursor, -1, `missing ordered waypoint ${waypoint}`)
  }
  assert.equal(first.id, second.id)
})

test('交通方式过滤非法边，无法抵达时返回中文原因', () => {
  const carriage = assertPlan(findRoute(graph, {
    from: 'b_start', to: 'b_finish', via: [], preference: 'fastest', travelMode: 'carriage', season: 'summer',
  }))
  assert.deepEqual(carriage.legs.map((leg) => leg.to), ['b_road', 'b_finish'])

  const ship = assertPlan(findRoute(graph, {
    from: 'b_port_a', to: 'b_port_b', via: [], preference: 'fastest', travelMode: 'ship', season: 'summer',
  }))
  assert.equal(ship.legs[0].crossing, 'sea')

  const noRoad = findRoute(graph, {
    from: 'b_port_a', to: 'b_port_b', via: [], preference: 'fastest', travelMode: 'walk', season: 'summer',
  })
  assert.equal(noRoad.ok, false)
  assert.match(noRoad.reason, /无法|没有|路线/)
})

test('季节标签只修正成本，不修改路线几何', () => {
  const base = { from: 'b_start', to: 'b_fast', via: [], preference: 'fastest', travelMode: 'walk' }
  const summer = assertPlan(findRoute(graph, { ...base, season: 'summer' }))
  const winter = assertPlan(findRoute(graph, { ...base, season: 'winter' }))
  assert.deepEqual(winter.legs.map((leg) => [leg.from, leg.to]), summer.legs.map((leg) => [leg.from, leg.to]))
  assert.ok(winter.totalDays > summer.totalDays)
  assert.ok(winter.totalRisk > summer.totalRisk)
})

test('未知端点和空图返回可读失败结果而不是抛异常', () => {
  const missing = findRoute(graph, {
    from: 'b_missing', to: 'b_finish', via: [], preference: 'fastest', travelMode: 'walk', season: 'summer',
  })
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /起点.*不存在/)
  const empty = findRoute({ nodes: [], edges: [], graphHash: 'b'.repeat(64) }, {
    from: 'b_start', to: 'b_finish', via: [], preference: 'fastest', travelMode: 'walk', season: 'summer',
  })
  assert.equal(empty.ok, false)
})

test('RouteClient 会取消过期请求并忽略迟到结果', async () => {
  class FakeWorker {
    messages = []
    messageListeners = new Set()
    errorListeners = new Set()
    postMessage(message) { this.messages.push(message) }
    addEventListener(type, listener) { (type === 'message' ? this.messageListeners : this.errorListeners).add(listener) }
    removeEventListener(type, listener) { (type === 'message' ? this.messageListeners : this.errorListeners).delete(listener) }
    terminate() {}
    emit(data) { this.messageListeners.forEach((listener) => listener({ data })) }
  }
  const worker = new FakeWorker()
  const client = new RouteClient(() => worker)
  const request = { from: 'b_start', to: 'b_finish', via: [], preference: 'fastest', travelMode: 'walk', season: 'summer' }
  const stale = client.plan(request)
  const latest = client.plan({ ...request, preference: 'safest' })
  await assert.rejects(stale, (error) => error.name === 'AbortError')
  assert.equal(worker.messages.some((message) => message.type === 'cancel' && message.requestId === 'route-request-1'), true)

  const latestRequest = worker.messages.findLast((message) => message.type === 'plan')
  const result = assertPlan(findRoute(graph, latestRequest.request))
  worker.emit({ type: 'result', requestId: latestRequest.requestId, result })
  assert.equal((await latest).preference, 'safest')

  worker.emit({ type: 'result', requestId: 'route-request-1', result })
  client.dispose()
})
