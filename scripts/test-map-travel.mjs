import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/map/travel/journeyReducer.ts'",
      "export * from './src/features/map/travel/travelCommands.ts'",
      "export * from './src/services/turnResolution.ts'",
      "export * from './src/features/world/worldHistory.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'map-travel-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const travel = await import(url)

const PLAYER = 'agot:travel_player'
const COMPANION = 'agot:travel_companion'

function leg(index, from, to, days) {
  return {
    index,
    edgeId: `${from}>${to}`,
    from,
    to,
    distance: days * 40,
    days,
    cost: days,
    risk: 0.05,
    roadLevel: 'major',
    crossing: 'land',
    seasonTags: [],
    fromPoint: { x: index, y: 0 },
    toPoint: { x: index + 1, y: 0 },
  }
}

function route(id = 'route-out', legs = [leg(0, 'b_start', 'b_mid', 2), leg(1, 'b_mid', 'b_finish', 3)]) {
  return {
    ok: true,
    id,
    from: legs[0]?.from ?? 'b_start',
    to: legs.at(-1)?.to ?? 'b_start',
    preference: 'fastest',
    travelMode: 'horse',
    via: [],
    season: 'summer',
    legs,
    totalDistance: legs.reduce((sum, value) => sum + value.distance, 0),
    totalDays: legs.reduce((sum, value) => sum + value.days, 0),
    totalCost: legs.reduce((sum, value) => sum + value.cost, 0),
    totalRisk: legs.reduce((risk, value) => 1 - (1 - risk) * (1 - value.risk), 0),
    graphHash: 'a'.repeat(64),
  }
}

function activeJourney(overrides = {}) {
  return {
    routePlan: route(),
    currentLeg: 0,
    progressDays: 0,
    status: 'travelling',
    companions: [COMPANION],
    vehicleIds: ['wagon'],
    startedAt: { year: 298, month: 1, day: 1 },
    ...overrides,
  }
}

function world(journey = activeJourney()) {
  return {
    journey,
    playerLocation: { locationId: 'b_start' },
    vehicles: {
      wagon: {
        id: 'wagon', name: '辎重马车', type: 'wagon', location: { locationId: 'b_start' },
        locationLabel: '起点', capacity: 30, description: '测试车辆',
      },
    },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  }
}

function itemState() {
  return {
    schemaVersion: 1,
    instances: {
      'wagon.chest': {
        instanceId: 'wagon.chest', definitionId: 'supply.test', quantity: 1,
        durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [],
      },
      'castle.crate': {
        instanceId: 'castle.crate', definitionId: 'supply.test', quantity: 1,
        durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [],
      },
    },
    placements: {
      'wagon.chest': { type: 'vehicle', vehicleId: 'wagon' },
      'castle.crate': { type: 'site', siteId: 'castle' },
    },
    sites: {
      castle: { id: 'castle', name: '城堡库房', type: 'warehouse', location: { locationId: 'b_start' }, locationLabel: '起点', description: '不会随行' },
    },
    vehicles: world().vehicles,
  }
}

function body() {
  const zone = (key, name, fatal) => ({ key, name, level: 'intact', wounds: [], isFatalZone: fatal })
  return {
    head: zone('head', '头部与咽喉', true), torso: zone('torso', '胸膛与躯干', true),
    arms: zone('arms', '双臂与双手', false), legs: zone('legs', '双腿与下肢', false),
    isBleeding: false, isPoisoned: false, isInfected: false,
  }
}

function gameState(journey = activeJourney()) {
  const startDate = { year: 298, month: 1, day: 1 }
  return {
    saveFormatVersion: 9,
    currentYear: startDate.year, currentMonth: startDate.month, currentDay: startDate.day,
    currentSeason: 'summer', turnCount: 1,
    lord: {
      canonicalCharacterId: PLAYER,
      name: '旅行者', house: '测试家族', houseWords: '', houseSigil: '', title: '', age: 30, gender: '男',
      location: { locationId: 'b_start' }, locationLabel: '起点', body: body(), overallStatus: '强健',
      items: itemState(), goldDragons: 100, silverStags: 0, prestige: 0, dread: 0,
      attributes: { diplomacy: 5, martial: 5, stewardship: 5, intrigue: 5, learning: 5, prowess: 5 }, traits: [],
    },
    turns: [{ id: 'turn_1', turnNumber: 1, playerInput: '开始', narrate: '开始', branches: [], timestamp: 1 }],
    worldCharacters: { runId: 'run_test', datasetHash: 'hash', revision: 0 },
    worldArtifacts: { schemaVersion: 1, startDate: '298.1.1', datasetHash: 'test', artifactDatasetHash: 'test', characterDatasetHash: 'test', artifacts: {} },
    worldHistory: travel.createWorldHistoryState(startDate),
    worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
    worldFlags: {}, isGameOver: false,
    ...(journey ? { activeJourney: journey } : {}),
  }
}

test('同地点内部移动只更新具体场景，并在成功结算中留下一个世界回合', () => {
  const settled = travel.settleTurnDraft({
    gameState: gameState(null),
    actionText: '走到临冬城内的校场',
    nextTurnNumber: 2,
    draft: { outcomeSummary: '', stateCommands: [{ type: 'CHANGE_LOCATION', locationId: 'b_start', sceneLocation: '校场' }] },
    pendingTransactions: [],
    characterContext: { characters: [], knownLocationIds: ['b_start', 'b_mid', 'b_finish'] },
    timeline: [],
  })
  assert.deepEqual(settled.updatedLord.location, { locationId: 'b_start', sceneLocation: '校场' })
  assert.equal(settled.worldHistory.turns.length, 1)
})

test('短途抵达会原子移动玩家、同行者、车辆和车内物品，但据点不动', () => {
  const short = activeJourney({ routePlan: route('short', [leg(0, 'b_start', 'b_finish', 1)]) })
  const patch = travel.advanceJourney(world(short), 1)
  assert.equal(patch.journey.status, 'arrived')
  assert.deepEqual(patch.playerLocation, { locationId: 'b_finish' })
  assert.deepEqual(patch.characterMoves, [{ characterId: COMPANION, locationId: 'b_finish' }])
  assert.deepEqual(patch.vehicleLocations.wagon, { locationId: 'b_finish' })

  const state = gameState(short)
  const settled = travel.settleTurnDraft({
    gameState: state,
    actionText: '随车队前往终点',
    nextTurnNumber: 2,
    draft: { outcomeSummary: '', stateCommands: [{ type: 'ADVANCE_TIME', days: 1 }] },
    pendingTransactions: [],
    characterContext: {
      characters: [{ id: COMPANION, alive: true, locationId: 'b_start' }],
      knownLocationIds: ['b_start', 'b_mid', 'b_finish'],
    },
    timeline: [],
  })
  assert.equal(settled.activeJourney.status, 'arrived')
  assert.equal(settled.updatedLord.location.locationId, 'b_finish')
  assert.equal(settled.updatedLord.items.vehicles.wagon.location.locationId, 'b_finish')
  assert.equal(settled.updatedLord.items.sites.castle.location.locationId, 'b_start')
  assert.deepEqual(settled.updatedLord.items.placements['wagon.chest'], { type: 'vehicle', vehicleId: 'wagon' })
  assert.equal(settled.characterEvents.filter((event) => event.event.type === 'MOVE').length, 0)
  assert.deepEqual(settled.worldRuntime.characters[COMPANION].location, { locationId: 'b_finish' })
  assert.deepEqual(settled.worldRuntime.assets['vehicle:wagon'].placement, { type: 'location', location: { locationId: 'b_finish' } })
  assert.equal(settled.worldHistory.turns.length, 1)
  assert.equal(settled.worldRuntime.events.filter((event) => event.type === 'travel.arrived').length, 1)
})

test('长途跨回合推进，途中权威位置停在上一节点', () => {
  const first = travel.advanceJourney(world(), 1)
  assert.equal(first.journey.currentLeg, 0)
  assert.equal(first.journey.progressDays, 1)
  assert.equal(first.playerLocation.locationId, 'b_start')
  assert.match(first.playerLocation.sceneLocation, /途中|路上/)
  assert.deepEqual(first.vehicleLocations.wagon, { locationId: 'b_start', sceneLocation: '行于道路途中' })
  assert.deepEqual(first.characterMoves, [{ characterId: COMPANION, locationId: 'b_start', sceneLocation: '行于道路途中' }])

  const second = travel.advanceJourney({ ...world(first.journey), playerLocation: first.playerLocation }, 2)
  assert.equal(second.journey.currentLeg, 1)
  assert.equal(second.journey.progressDays, 1)
  assert.equal(second.playerLocation.locationId, 'b_mid')

  const thirdWorld = world(second.journey)
  thirdWorld.playerLocation = second.playerLocation
  thirdWorld.vehicles.wagon.location = second.vehicleLocations.wagon
  const third = travel.advanceJourney(thirdWorld, 2)
  assert.equal(third.journey.status, 'arrived')
  assert.equal(third.playerLocation.locationId, 'b_finish')
})

test('运输工具物品托管不一致时整段旅行拒绝而不产生部分移动', () => {
  const invalid = world()
  invalid.itemPlacements = { orphan: { type: 'vehicle', vehicleId: 'missing_wagon' } }
  assert.throws(() => travel.advanceJourney(invalid, 1), /不存在的运输工具/)
  assert.deepEqual(invalid.playerLocation, { locationId: 'b_start' })
  assert.deepEqual(invalid.vehicles.wagon.location, { locationId: 'b_start' })
})

test('暂停不推进，事件中断后也不会自行继续', () => {
  const paused = travel.advanceJourney(world(activeJourney({ status: 'paused' })), 4)
  assert.equal(paused.journey.currentLeg, 0)
  assert.equal(paused.journey.progressDays, 0)
  assert.deepEqual(paused.playerLocation, { locationId: 'b_start' })

  const interrupted = travel.advanceJourney({ ...world(), interruption: '桥梁被冲毁' }, 4)
  assert.equal(interrupted.journey.status, 'interrupted')
  assert.equal(interrupted.journey.interruptedBy, '桥梁被冲毁')
  assert.equal(interrupted.journey.progressDays, 0)
})

test('已确认的途中事件可以带原因中断旅程', () => {
  const result = travel.applyTravelCommands(activeJourney(), [{ type: 'PAUSE_TRAVEL', reason: '渡口因洪水封闭' }], {
    currentLocation: { locationId: 'b_start' },
    currentDate: { year: 298, month: 1, day: 1 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(result.journey.status, 'interrupted')
  assert.equal(result.journey.interruptedBy, '渡口因洪水封闭')
  assert.equal(result.accepted.length, 1)
})

test('改道与返回都必须从当前实际节点开始', () => {
  const progressed = travel.advanceJourney(world(), 2)
  const reroute = route('reroute', [leg(0, 'b_mid', 'b_finish', 1)])
  const changed = travel.applyTravelCommands(progressed.journey, [{ type: 'REROUTE_TRAVEL', routePlan: reroute }], {
    currentLocation: progressed.playerLocation,
    currentDate: { year: 298, month: 1, day: 3 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(changed.journey.routePlan.id, 'reroute')
  assert.equal(changed.journey.routePlan.from, 'b_mid')
  assert.equal(changed.journey.currentLeg, 0)

  const invalidReturn = travel.applyTravelCommands(changed.journey, [{ type: 'RETURN_TRAVEL', routePlan: route('bad-return') }], {
    currentLocation: progressed.playerLocation,
    currentDate: { year: 298, month: 1, day: 3 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(invalidReturn.accepted.length, 0)
  assert.match(invalidReturn.rejected[0].reason, /当前位置/)
})

test('没有有效旅程时拒绝显式推进且日期不会被偷走', () => {
  const state = gameState(null)
  const settled = travel.settleTurnDraft({
    gameState: state,
    actionText: '继续赶路',
    nextTurnNumber: 2,
    draft: { outcomeSummary: '', stateCommands: [{ type: 'ADVANCE_TRAVEL', days: 2 }] },
    pendingTransactions: [],
    characterContext: { characters: [], knownLocationIds: ['b_start', 'b_mid', 'b_finish'] },
    timeline: [],
  })
  assert.deepEqual(settled.nextDate, { year: 298, month: 1, day: 1 })
  assert.equal(settled.acceptedCommands.some((command) => command.type === 'ADVANCE_TRAVEL'), false)
  assert.ok(settled.rejectedCommands.some((command) => command.type === 'ADVANCE_TRAVEL'))
})

test('未开始的规划可取消，开始后不能用规划取消命令抹除行程', () => {
  const planned = travel.applyTravelCommands(undefined, [{ type: 'PLAN_TRAVEL', routePlan: route() }], {
    currentLocation: { locationId: 'b_start' }, currentDate: { year: 298, month: 1, day: 1 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(planned.journey.status, 'planned')
  const cancelled = travel.applyTravelCommands(planned.journey, [{ type: 'CANCEL_PLANNED_TRAVEL' }], {
    currentLocation: { locationId: 'b_start' }, currentDate: { year: 298, month: 1, day: 1 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(cancelled.journey, undefined)

  const started = travel.applyTravelCommands(undefined, [{ type: 'START_TRAVEL', routePlan: route(), companions: [], vehicleIds: [] }], {
    currentLocation: { locationId: 'b_start' }, currentDate: { year: 298, month: 1, day: 1 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  const refused = travel.applyTravelCommands(started.journey, [{ type: 'CANCEL_PLANNED_TRAVEL' }], {
    currentLocation: { locationId: 'b_start' }, currentDate: { year: 298, month: 1, day: 1 },
    knownLocationIds: new Set(['b_start', 'b_mid', 'b_finish']),
  })
  assert.equal(refused.journey.status, 'travelling')
  assert.match(refused.rejected[0].reason, /未开始/)
})
