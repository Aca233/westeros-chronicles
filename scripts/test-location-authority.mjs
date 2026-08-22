import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

import {
  UNKNOWN_WESTEROS_LOCATION_ID,
  createWorldLocationRef,
  resolveLocationLabel,
  sameWorldLocation,
  validateWorldLocationRef,
} from '../src/features/map/locationResolver.ts'
import { assertSupportedGameState, ITEM_SAVE_FORMAT_VERSION } from '../src/features/items/saveVersion.ts'

const runtimeBundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/turnResolution.ts'",
      "export * from './scripts/fixtures/living-world-test.ts'",
      "export * from './src/features/characters/customRulerStart.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'location-authority-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const runtimeUrl = `data:text/javascript;base64,${Buffer.from(runtimeBundle.outputFiles[0].text).toString('base64')}`
const { createLivingWorldTestLord, createCustomRulerItemState, settleTurnDraft } = await import(runtimeUrl)

const known = new Set(['b_winterfell', 'b_castle_black', UNKNOWN_WESTEROS_LOCATION_ID])

test('世界地点引用只以稳定 locationId 为权威并允许场景细分', () => {
  const ref = createWorldLocationRef('b_winterfell', '神木林')
  assert.deepEqual(ref, { locationId: 'b_winterfell', sceneLocation: '神木林' })
  assert.equal(validateWorldLocationRef(ref, known), true)
  assert.equal(validateWorldLocationRef({ locationId: '临冬城' }, known), false)
  assert.equal(validateWorldLocationRef({ location: '临冬城' }, known), false)
  assert.equal(sameWorldLocation(ref, { locationId: 'b_winterfell', sceneLocation: '主堡大厅' }), true)
})

test('地点标签由地图仓储解析并组合具体场景', async () => {
  const repository = {
    async getLocation(id) {
      assert.equal(id, 'b_winterfell')
      return { name: '临冬城' }
    },
  }
  assert.equal(await resolveLocationLabel({ locationId: 'b_winterfell', sceneLocation: '神木林' }, repository), '临冬城 · 神木林')
  assert.equal(await resolveLocationLabel({ locationId: UNKNOWN_WESTEROS_LOCATION_ID }, repository), '所在地未查明')
})

test('测试版存档提升到版本 9 并明确拒绝版本 8', () => {
  assert.equal(ITEM_SAVE_FORMAT_VERSION, 9)
  assert.throws(() => assertSupportedGameState({ saveFormatVersion: 9 }), /测试版存档格式已更新.*重置/)
  assert.doesNotThrow(() => assertSupportedGameState({
    saveFormatVersion: 9,
    lord: {
      location: { locationId: 'b_winterfell', sceneLocation: '神木林' },
      locationLabel: '临冬城 · 神木林',
      items: { schemaVersion: 1, sites: {}, vehicles: {} },
      attributes: { diplomacy: 1 },
      traits: ['教育特质'],
    },
    worldHistory: { schemaVersion: 1 },
    worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
  }))
})

test('测试人物、据点和运输工具都保存稳定地点引用', () => {
  const lord = createLivingWorldTestLord()
  assert.equal(validateWorldLocationRef(lord.location, known), true)
  for (const site of Object.values(lord.items.sites)) {
    assert.equal(validateWorldLocationRef(site.location, known), true, site.id)
    assert.equal(typeof site.locationLabel, 'string')
  }
  for (const vehicle of Object.values(lord.items.vehicles)) {
    assert.equal(validateWorldLocationRef(vehicle.location, known), true, vehicle.id)
    assert.equal(typeof vehicle.locationLabel, 'string')
  }
  const customItems = createCustomRulerItemState()
  for (const container of [...Object.values(customItems.sites), ...Object.values(customItems.vehicles)]) {
    assert.equal(validateWorldLocationRef(container.location, known), true, container.id)
  }
})

function gameStateAtWinterfell() {
  return {
    saveFormatVersion: 9,
    currentYear: 298,
    currentMonth: 5,
    currentDay: 10,
    currentSeason: '暮春',
    turnCount: 0,
    lord: createLivingWorldTestLord(),
    turns: [],
    worldHistory: {
      schemaVersion: 1,
      startDate: { year: 298, month: 5, day: 10 },
      canonical: {},
      turns: [],
    },
    worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
    worldFlags: {},
    isGameOver: false,
  }
}

test('玩家地点命令提交前校验 ID，并把稳定地点引用写入人物状态和世界历史', () => {
  const context = { characters: [], knownLocationIds: [...known] }
  const accepted = settleTurnDraft({
    gameState: gameStateAtWinterfell(),
    actionText: '前往黑城堡内院',
    nextTurnNumber: 1,
    draft: { outcomeSummary: '抵达。', stateCommands: [{ type: 'CHANGE_LOCATION', locationId: 'b_castle_black', sceneLocation: '内院' }] },
    pendingTransactions: [],
    characterContext: context,
    timeline: [],
  })
  assert.deepEqual(accepted.updatedLord.location, { locationId: 'b_castle_black', sceneLocation: '内院' })
  assert.deepEqual(accepted.resolvedFacts.facts[0].location, { locationId: 'b_castle_black', sceneLocation: '内院' })

  for (const command of [
    { type: 'CHANGE_LOCATION', locationId: 'b_missing_place' },
    { type: 'CHANGE_LOCATION', location: '黑城堡' },
  ]) {
    const rejected = settleTurnDraft({
      gameState: gameStateAtWinterfell(),
      actionText: '尝试移动',
      nextTurnNumber: 1,
      draft: { outcomeSummary: '', stateCommands: [command] },
      pendingTransactions: [],
      characterContext: context,
      timeline: [],
    })
    assert.equal(rejected.acceptedCommands.length, 0)
    assert.equal(rejected.rejectedCommands[0].type, 'CHANGE_LOCATION')
    assert.deepEqual(rejected.updatedLord.location, { locationId: 'b_winterfell', sceneLocation: '神木林' })
  }
})
