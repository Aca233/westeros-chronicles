import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  changedTitleIds,
  projectPoliticalState,
} from '../src/features/map/politicalProjection.ts'
import { applyPoliticalFeatureStates } from '../src/features/map/mapLayers.ts'
import { MapRepository } from '../src/features/map/repository.ts'

const staticTitles = [
  {
    baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell',
    kingdomId: 'k_winterfell', provinceId: 77,
  },
  {
    baronyId: 'b_pyke', countyId: 'c_pyke', duchyId: 'd_pyke',
    kingdomId: 'k_under_islands', provinceId: 2723,
  },
]

const characters = [
  { id: 'agot:Stark_3', name: '艾德·史塔克', dynastyId: 'dynn_Stark', titleIds: ['k_winterfell'], alive: true },
  { id: 'agot:Stark_14', name: '罗柏·史塔克', dynastyId: 'dynn_Stark', titleIds: [], alive: true },
  { id: 'agot:Bolton_4', name: '卢斯·波顿', dynastyId: 'dynn_Bolton', titleIds: [], alive: true },
  { id: 'agot:Lannister_1', name: '泰温·兰尼斯特', dynastyId: 'dynn_Lannister', titleIds: [], alive: true },
  { id: 'agot:Greyjoy_5', name: '巴隆·葛雷乔伊', dynastyId: 'dynn_Greyjoy', titleIds: ['c_pyke'], alive: true },
  { id: 'agot:Secret_1', name: '秘密宣称者', dynastyId: 'dynn_Secret', titleIds: [], alive: true },
]

const history = {
  schemaVersion: 1,
  startDate: { year: 298, month: 1, day: 1 },
  canonical: {},
  turns: [
    {
      turn: 1, action: '将临冬城伯爵领授予波顿', startedOn: { year: 298, month: 1, day: 10 }, resolvedOn: { year: 298, month: 1, day: 10 },
      acceptedCommands: [{ type: 'GRANT_CHARACTER_TITLE', characterId: 'agot:Bolton_4', titleId: 'c_winterfell', commandId: 'grant-bolton' }],
      rejectedCommands: [], facts: [], canonicalTransitions: [],
    },
    {
      turn: 2, action: '撤销波顿封地', startedOn: { year: 298, month: 1, day: 20 }, resolvedOn: { year: 298, month: 1, day: 20 },
      acceptedCommands: [{ type: 'REVOKE_TITLE', characterId: 'agot:Bolton_4', titleId: 'c_winterfell', commandId: 'revoke-bolton' }],
      rejectedCommands: [], facts: [], canonicalTransitions: [],
    },
    {
      turn: 3, action: '艾德身亡', startedOn: { year: 298, month: 2, day: 1 }, resolvedOn: { year: 298, month: 2, day: 1 },
      acceptedCommands: [{ type: 'CHARACTER_DIE', characterId: 'agot:Stark_3', cause: '处决', commandId: 'death-eddard' }],
      rejectedCommands: [], facts: [], canonicalTransitions: [],
    },
    {
      turn: 4, action: '罗柏继承', startedOn: { year: 298, month: 2, day: 10 }, resolvedOn: { year: 298, month: 2, day: 10 },
      acceptedCommands: [], rejectedCommands: [], canonicalTransitions: [],
      facts: [{
        id: 'inherit-winterfell', turn: 4, date: { year: 298, month: 2, day: 10 }, source: 'system', kind: 'inheritance', title: '临冬城继承', summary: '罗柏继承临冬城',
        participantIds: ['agot:Stark_14'], commandTypes: [],
        political: { type: 'inherit-title', titleId: 'k_winterfell', holderId: 'agot:Stark_14', visibility: 'public' },
      }],
    },
    {
      turn: 5, action: '正式战争结果', startedOn: { year: 298, month: 3, day: 10 }, resolvedOn: { year: 298, month: 3, day: 10 },
      acceptedCommands: [], rejectedCommands: [], canonicalTransitions: [],
      facts: [
        {
          id: 'war-winterfell', turn: 5, date: { year: 298, month: 3, day: 10 }, source: 'system', kind: 'war_result', title: '战争结果', summary: '兰尼斯特取得临冬城',
          participantIds: ['agot:Lannister_1'], commandTypes: [],
          political: { type: 'war-result', titleId: 'k_winterfell', holderId: 'agot:Lannister_1', formal: true, visibility: 'public' },
        },
        {
          id: 'secret-claim', turn: 5, date: { year: 298, month: 3, day: 11 }, source: 'character', kind: 'claim', title: '秘密宣称', summary: '未公开',
          participantIds: ['agot:Secret_1'], commandTypes: [],
          political: { type: 'grant-title', titleId: 'k_winterfell', holderId: 'agot:Secret_1', visibility: 'secret' },
        },
        {
          id: 'informal-war', turn: 5, date: { year: 298, month: 3, day: 12 }, source: 'character', kind: 'war_result', title: '未经确认的战报', summary: '尚无正式结果',
          participantIds: ['agot:Bolton_4'], commandTypes: [],
          political: { type: 'war-result', titleId: 'k_winterfell', holderId: 'agot:Bolton_4', formal: false, visibility: 'public' },
        },
      ],
    },
  ],
}

function stateAt(year, month, day) {
  return projectPoliticalState(staticTitles, characters, history, { year, month, day })
}

function titleAt(states, titleId) {
  const state = states.find((entry) => entry.titleId === titleId)
  assert.ok(state, `缺少政治图块 ${titleId}`)
  return state
}

test('298 年基础持有人来自人物头衔，不保存第二份当前领主状态', () => {
  const before = JSON.stringify(history)
  const states = stateAt(298, 1, 5)
  const winterfell = titleAt(states, 'b_winterfell')
  const pyke = titleAt(states, 'b_pyke')
  assert.equal(winterfell.holderId, 'agot:Stark_3')
  assert.equal(winterfell.effectiveTitleId, 'k_winterfell')
  assert.equal(winterfell.houseId, 'stark')
  assert.equal(winterfell.sigil, 'house-stark')
  assert.match(winterfell.color, /^#[0-9a-f]{6}$/i)
  assert.equal(pyke.holderId, 'agot:Greyjoy_5')
  assert.equal(JSON.stringify(history), before)
  assert.equal('politicalState' in history, false)
})

test('授予与撤销按日期折叠，并能重建旧日期', () => {
  assert.equal(titleAt(stateAt(298, 1, 15), 'b_winterfell').holderId, 'agot:Bolton_4')
  assert.equal(titleAt(stateAt(298, 1, 15), 'b_winterfell').effectiveTitleId, 'c_winterfell')
  assert.equal(titleAt(stateAt(298, 1, 25), 'b_winterfell').holderId, 'agot:Stark_3')
  assert.equal(titleAt(stateAt(298, 1, 5), 'b_winterfell').holderId, 'agot:Stark_3')
})

test('死亡清空持有头衔，继承和正式战争结果重新指派持有人', () => {
  assert.equal(titleAt(stateAt(298, 2, 5), 'b_winterfell').holderId, undefined)
  assert.equal(titleAt(stateAt(298, 2, 20), 'b_winterfell').holderId, 'agot:Stark_14')
  assert.equal(titleAt(stateAt(298, 3, 20), 'b_winterfell').holderId, 'agot:Lannister_1')
  assert.equal(titleAt(stateAt(298, 3, 20), 'b_winterfell').sigil, 'house-lannister')
})

test('秘密政治事件和未正式确认的战争结果不会泄漏到地图', () => {
  const state = titleAt(stateAt(298, 3, 20), 'b_winterfell')
  assert.equal(state.holderId, 'agot:Lannister_1')
  assert.notEqual(state.holderId, 'agot:Secret_1')
  assert.notEqual(state.holderId, 'agot:Bolton_4')
})

test('未知家族使用稳定低饱和回退色，相同输入不会漂移', () => {
  const first = titleAt(stateAt(298, 1, 15), 'b_winterfell')
  const second = titleAt(stateAt(298, 1, 15), 'b_winterfell')
  assert.equal(first.color, second.color)
  assert.match(first.color, /^#[0-9a-f]{6}$/i)
  assert.equal(first.sigil, undefined)
})

test('changedTitleIds 只返回实际发生变化的地图头衔', () => {
  const before = stateAt(298, 1, 5)
  const after = stateAt(298, 1, 15)
  assert.deepEqual(changedTitleIds(before, after), ['b_winterfell'])
})

test('政治图层只对变化的省份写入 MapLibre feature-state', () => {
  const before = stateAt(298, 1, 5)
  const after = stateAt(298, 1, 15)
  const calls = []
  const map = {
    getSource: (id) => id === 'agot-vector' ? {} : undefined,
    setFeatureState: (target, state) => calls.push({ target, state }),
    removeFeatureState: () => { throw new Error('不应清除仍存在的省份') },
  }
  applyPoliticalFeatureStates(map, after, changedTitleIds(before, after), before)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].target, { source: 'agot-vector', sourceLayer: 'provinces', id: 77 })
  assert.equal(calls[0].state.politicalHolderId, 'agot:Bolton_4')
  assert.equal(calls[0].state.politicalColor, titleAt(after, 'b_winterfell').color)
})

test('运行时从本地资料加载基础持有人并把投影接入地图画布', async () => {
  const requested = []
  const repository = new MapRepository(async (path) => {
    requested.push(String(path))
    return { ok: true, json: async () => staticTitles }
  })
  assert.deepEqual(await repository.loadPoliticalTitles(), staticTitles)
  assert.deepEqual(requested, ['/data/agot-map/political/titles.json'])

  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const style = readFileSync('src/features/map/mapStyle.ts', 'utf8')
  const characters = readFileSync('src/features/characters/staticCharacterRepository.ts', 'utf8')
  assert.match(drawer, /loadPoliticalTitles/)
  assert.match(drawer, /loadTitleHolderSummaries/)
  assert.match(drawer, /projectPoliticalState/)
  assert.match(canvas, /applyPoliticalFeatureStates/)
  assert.match(canvas, /changedTitleIds/)
  assert.match(style, /feature-state.*politicalColor/)
  assert.match(characters, /loadTitleHolderSummaries/)
})

test('生成的 6094 个本地政治图块能从 298 年人物资料解析真实持有人', () => {
  const generatedTitles = JSON.parse(readFileSync('public/data/agot-map/political/titles.json', 'utf8'))
  const searchIndex = JSON.parse(readFileSync('public/data/agot-characters/search-index.json', 'utf8'))
  const titleHolders = JSON.parse(readFileSync('public/data/agot-characters/title-holders.json', 'utf8'))
  const searchById = new Map(searchIndex.map((entry) => [entry.id, entry]))
  const holderCharacters = Object.entries(titleHolders).flatMap(([id, titles]) => {
    const hit = searchById.get(id)
    return hit ? [{
      id, name: hit.name, dynastyId: hit.dynastyId, alive: hit.alive,
      titleIds: titles.map((title) => title.id),
    }] : []
  })
  const baseline = projectPoliticalState(generatedTitles, holderCharacters, {
    schemaVersion: 1,
    startDate: { year: 298, month: 1, day: 1 },
    canonical: {},
    turns: [],
  }, { year: 298, month: 1, day: 1 })
  assert.equal(baseline.length, generatedTitles.length)
  assert.equal(new Set(baseline.map((entry) => entry.titleId)).size, generatedTitles.length)
  assert.ok(baseline.filter((entry) => entry.holderId).length > 3000)
  assert.equal(titleAt(baseline, 'b_winterfell').holderId, 'agot:Stark_3')
  assert.equal(titleAt(baseline, 'b_winterfell').sigil, 'house-stark')
})
