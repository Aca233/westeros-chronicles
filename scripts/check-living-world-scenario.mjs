import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { advanceWorldDate } from '../src/features/world/worldHistory.ts'
import {
  advanceLivingWorld,
  applyLivingWorldIntent,
  knownLivingWorldActions,
  knownLivingWorldSituations,
} from '../src/features/world/livingWorldEngine.ts'
import {
  createRiverlandsCrisisInitialEvents,
  createRiverlandsCrisisLivingWorld,
  RIVERLANDS_CRISIS,
} from '../src/features/world/livingWorldScenario.ts'
import { createWorldRuntimeState, validateWorldRuntimeState } from '../src/features/world/worldRuntimeState.ts'

const startDate = { year: 300, month: 1, day: 1 }
const playerId = 'save:living-world-acceptance:player'
const remoteLocation = { locationId: RIVERLANDS_CRISIS.locations.nearbyVillage }

function initialRuntime() {
  return createWorldRuntimeState({
    livingWorld: createRiverlandsCrisisLivingWorld(startDate),
    initialEvents: createRiverlandsCrisisInitialEvents(startDate),
  })
}

function advance(runtime, fromDate, days, turn = 2, playerLocation = remoteLocation) {
  return advanceLivingWorld(runtime, fromDate, days, {
    turn,
    playerId,
    playerLocation,
    transactionId: `acceptance:${turn}`,
  })
}

const initial = initialRuntime()
validateWorldRuntimeState(initial)
assert.equal(initial.livingWorld?.scenarioId, RIVERLANDS_CRISIS.scenarioId)
assert.equal(initial.livingWorld?.actions.find((action) => action.id === RIVERLANDS_CRISIS.actions.shipment)?.status, 'active')
assert.equal(initial.livingWorld?.situations.find((situation) => situation.id === RIVERLANDS_CRISIS.situations.shortage)?.stage, 'forming')
assert.equal(knownLivingWorldSituations(initial, playerId).length, 0, '秘密局势不能提前泄漏给玩家')
assert.equal(knownLivingWorldActions(initial, playerId).length, 0, '秘密运输不能提前泄漏给玩家')
assert.ok(knownLivingWorldSituations(initial, playerId, true).length >= 2, 'debug 投影应可检查权威局势')

const day1 = advance(initial, startDate, 1, 2)
assert.equal(day1.actualDays, 1)
const blockedShipment = day1.runtime.livingWorld.actions.find((action) => action.id === RIVERLANDS_CRISIS.actions.shipment)
assert.equal(blockedShipment?.status, 'blocked', '原定运输必须被封锁道路阻断')
assert.ok(day1.events.some((event) => event.type === 'action.transport.blocked'))
assert.ok(!day1.events.some((event) => event.type === 'npc.strategy.reroute_transport'), '受阻报告抵达前 NPC 不得预知并改道')
assert.equal(day1.runtime.livingWorld.stockpiles[0].quantity, 24)
assert.ok(day1.runtime.livingWorld.information.some((message) => message.status === 'in_transit'))

const dateAfterDay1 = advanceWorldDate(startDate, { days: 1 })
const day2 = advance(day1.runtime, dateAfterDay1, 1, 3)
const reroutedShipment = day2.runtime.livingWorld.actions.find((action) => action.id === RIVERLANDS_CRISIS.actions.shipment)
assert.equal(reroutedShipment?.status, 'active')
assert.deepEqual(reroutedShipment?.routeConnectionIds, [
  RIVERLANDS_CRISIS.roads.sourceToCastle,
  RIVERLANDS_CRISIS.roads.castleToFord,
  RIVERLANDS_CRISIS.roads.fordToMarket,
])
const deliveredIndex = day2.runtime.events.findIndex((event) => event.type === 'information.delivered')
const rerouteIndex = day2.runtime.events.findIndex((event) => event.type === 'npc.strategy.reroute_transport')
assert.ok(deliveredIndex >= 0 && rerouteIndex > deliveredIndex, 'NPC 改道必须发生在受阻消息送达之后')
assert.equal(day2.runtime.livingWorld.situations.find((situation) => situation.id === RIVERLANDS_CRISIS.situations.shortage)?.stage, 'active')
assert.ok(day2.runtime.events.some((event) => event.type === 'npc.strategy.request_help'), '当地 NPC 应在确认短缺后主动求援')

const day3 = advance(day2.runtime, advanceWorldDate(startDate, { days: 2 }), 1, 4)
assert.equal(day3.runtime.livingWorld.stockpiles[0].quantity, 8)
assert.equal(day3.runtime.livingWorld.situations.find((situation) => situation.id === RIVERLANDS_CRISIS.situations.shortage)?.stage, 'escalating')

const day4 = advance(day3.runtime, advanceWorldDate(startDate, { days: 3 }), 1, 5)
assert.equal(day4.runtime.livingWorld.actions.find((action) => action.id === RIVERLANDS_CRISIS.actions.shipment)?.status, 'completed')
assert.equal(day4.runtime.livingWorld.stockpiles[0].quantity, 24)
assert.equal(day4.runtime.livingWorld.situations.find((situation) => situation.id === RIVERLANDS_CRISIS.situations.shortage)?.stage, 'resolved')
assert.ok(day4.runtime.events.some((event) => event.type === 'action.transport.completed'))
assert.ok(day4.runtime.livingWorld.causalLinks.length > 0)

assert.throws(() => applyLivingWorldIntent(initial, {
  kind: 'reroute_transport', actorId: playerId, actionId: RIVERLANDS_CRISIS.actions.shipment, evidenceText: '我直接命令粮车改道',
}, startDate, {
  turn: 2, actorId: playerId, actorLocation: { locationId: RIVERLANDS_CRISIS.locations.ferry }, transactionId: 'acceptance:unauthorized-reroute',
}), /缺少改变该运输安排的授权/)

assert.throws(() => applyLivingWorldIntent(initial, {
  kind: 'delegate_relief', actorId: playerId, situationId: RIVERLANDS_CRISIS.situations.blockade, assigneeId: RIVERLANDS_CRISIS.actors.runnymuddHolder, evidenceText: '我让埃伦妮处理此事',
}, startDate, {
  turn: 2, actorId: playerId, actorLocation: { locationId: RIVERLANDS_CRISIS.locations.ferry }, transactionId: 'acceptance:delegate-without-consent', hasDelegationConsent: () => false,
}), /委派必须引用受任者已明确同意/)

const negotiated = applyLivingWorldIntent(initial, {
  kind: 'negotiate_access', actorId: playerId, situationId: RIVERLANDS_CRISIS.situations.blockade, evidenceText: '我在老渡口交涉有限通行许可',
}, startDate, {
  turn: 2, actorId: playerId, actorLocation: { locationId: RIVERLANDS_CRISIS.locations.ferry }, transactionId: 'acceptance:negotiate',
})
const negotiationDay = advance(negotiated.runtime, startDate, 1, 3, { locationId: RIVERLANDS_CRISIS.locations.ferry })
assert.ok(negotiationDay.runtime.livingWorld.connections.authorityLinks.some((entry) => entry.controllerId === playerId && entry.permission === 'escort' && entry.subject.locationId === RIVERLANDS_CRISIS.locations.ferry))
const playerReroute = applyLivingWorldIntent(negotiationDay.runtime, {
  kind: 'reroute_transport', actorId: playerId, actionId: RIVERLANDS_CRISIS.actions.shipment, evidenceText: '我凭刚取得的许可把粮车改经罗尼堡',
}, advanceWorldDate(startDate, { days: 1 }), {
  turn: 3, actorId: playerId, actorLocation: { locationId: RIVERLANDS_CRISIS.locations.ferry }, transactionId: 'acceptance:authorized-reroute',
})
assert.deepEqual(playerReroute.runtime.livingWorld.actions.find((action) => action.id === RIVERLANDS_CRISIS.actions.shipment)?.routeConnectionIds, [
  RIVERLANDS_CRISIS.roads.sourceToCastle,
  RIVERLANDS_CRISIS.roads.castleToFord,
  RIVERLANDS_CRISIS.roads.fordToMarket,
])

const deterministicA = advance(initial, startDate, 2, 9)
const deterministicB = advance(initial, startDate, 2, 9)
assert.deepEqual(deterministicA.runtime, deterministicB.runtime, '同一输入的统一调度结果必须确定')
assert.equal(new Set(deterministicA.runtime.livingWorld.processedScheduleKeys).size, deterministicA.runtime.livingWorld.processedScheduleKeys.length, '调度处理键不能重复')

const longRunStartedAt = performance.now()
const longRun = advance(initial, startDate, 365, 20)
const longRunMilliseconds = performance.now() - longRunStartedAt
assert.equal(longRun.actualDays, 365, '远离需要玩家决策的地点时应能连续推进一年')
validateWorldRuntimeState(longRun.runtime)
assert.ok(longRun.runtime.livingWorld.stockpiles.every((stockpile) => stockpile.quantity >= 0), '长局库存不得出现负数')
assert.equal(new Set(longRun.runtime.events.map((event) => event.id)).size, longRun.runtime.events.length, '长局事件 ID 不得重复')
assert.equal(new Set(longRun.runtime.livingWorld.processedScheduleKeys).size, longRun.runtime.livingWorld.processedScheduleKeys.length, '长局调度键不得重复')
assert.deepEqual(JSON.parse(JSON.stringify(longRun.runtime)), longRun.runtime, '长局 runtime 同样必须完整序列化往返')

const serialized = JSON.stringify(day4.runtime)
const roundTrip = JSON.parse(serialized)
validateWorldRuntimeState(roundTrip)
assert.deepEqual(roundTrip, day4.runtime, '活世界 runtime 必须完整序列化往返')

const routeData = readFileSync('public/data/agot-map/routes/world_westeros_the_riverlands.json', 'utf8')
for (const routeId of [
  RIVERLANDS_CRISIS.roads.sourceToFerry,
  RIVERLANDS_CRISIS.roads.ferryToFord,
  RIVERLANDS_CRISIS.roads.fordToMarket,
  RIVERLANDS_CRISIS.roads.sourceToCastle,
  RIVERLANDS_CRISIS.roads.castleToFord,
]) assert.ok(routeData.includes(routeId), `示范地区道路必须来自实际河间地路线数据：${routeId}`)

const dbSource = readFileSync('src/services/db.ts', 'utf8')
assert.doesNotMatch(dbSource, /version\(4\)[\s\S]{0,900}put\(migrated\)/, '数据库升级不得静默覆写旧格式快照')
assert.match(dbSource, /assertSupportedSnapshot\(migrateSnapshotToCurrent\(snapshot\)\)/, '旧快照只允许以内存迁移投影做兼容校验')
assert.match(dbSource, /snapshots,\s*\n\s*worldRuns:/, '导出包必须继续序列化原持久化 snapshots，而非迁移副本')

console.log('living-world acceptance: PASS')
console.log(JSON.stringify({
  initialVisibility: { situations: 0, actions: 0 },
  blockedOnDay: 1,
  reroutedAfterMessageDay: 2,
  shortageStages: ['forming', 'active', 'escalating', 'resolved'],
  finalStockpile: day4.runtime.livingWorld.stockpiles[0].quantity,
  causalLinks: day4.runtime.livingWorld.causalLinks.length,
  serializedBytes: Buffer.byteLength(serialized),
  longRun: {
    days: longRun.actualDays,
    events: longRun.runtime.events.length,
    processedScheduleKeys: longRun.runtime.livingWorld.processedScheduleKeys.length,
    milliseconds: Math.round(longRunMilliseconds * 100) / 100,
  },
}, null, 2))
