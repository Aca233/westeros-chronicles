import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildLocationView,
  minimumLocationImportance,
  shouldShowLocation,
} from '../src/features/map/locationViewModel.ts'

const winterfell = {
  id: 'b_winterfell', name: '临冬城', englishName: 'Winterfell', type: 'castle',
  mapX: 1360, mapY: 1447, provinceId: 42, baronyId: 'b_winterfell',
  countyId: 'c_winterfell', duchyId: 'd_winterfell', kingdomId: 'k_the_north',
  regionId: 'world_westeros_the_north', terrain: 'land', isCoastal: false,
  isPort: false, importance: 100, tags: ['capital'],
}

test('地点重要度控制远景显示，近景显示全部地点', () => {
  assert.ok(minimumLocationImportance(0) >= 70)
  assert.equal(minimumLocationImportance(6), 0)
  assert.equal(shouldShowLocation(winterfell, 0), true)
  assert.equal(shouldShowLocation({ ...winterfell, importance: 20 }, 0), false)
  assert.equal(shouldShowLocation({ ...winterfell, importance: 20 }, 6), true)
})

test('地点详情保留身份、领地层级、地形和通行事实', () => {
  const view = buildLocationView(winterfell)
  assert.equal(view.name, '临冬城')
  assert.equal(view.englishName, 'Winterfell')
  assert.equal(view.typeLabel, '城堡')
  assert.equal(view.regionLabel, '北境')
  assert.deepEqual(view.hierarchy.map((entry) => entry.id), [
    'k_the_north', 'd_winterfell', 'c_winterfell', 'b_winterfell',
  ])
  assert.equal(view.terrainLabel, '陆地')
  assert.equal(view.access.port, false)
  assert.equal(view.access.coastal, false)
})

test('未知动态情报不会进入地点详情', () => {
  const view = buildLocationView(winterfell, {
    ruler: { id: 'char_eddard', label: '艾德·史塔克', knowledge: 'confirmed' },
    characters: [
      { id: 'char_robb', label: '罗柏·史塔克', knowledge: 'confirmed' },
      { id: 'char_secret', label: '未知访客', knowledge: 'unknown' },
    ],
    assets: [{ id: 'asset_stable', label: '主堡马厩', knowledge: 'rumored' }],
    events: [{ id: 'event_arrival', label: '国王车驾抵达', knowledge: 'stale' }],
    routeEstimate: { days: 4.5, cost: 12, risk: 0.18 },
  })
  assert.equal(view.ruler?.label, '艾德·史塔克')
  assert.deepEqual(view.characters.map((item) => item.id), ['char_robb'])
  assert.equal(view.assets.length, 1)
  assert.equal(view.events.length, 1)
  assert.equal(view.routeEstimate?.days, 4.5)
})

test('地图 UI 不提供尚未实现的战争和建设入口', () => {
  const source = [
    'src/features/map/LocationDetails.tsx',
    'src/features/map/MapToolbar.tsx',
  ].map((path) => readFileSync(path, 'utf8')).join('\n')
  assert.doesNotMatch(source, /宣战|征服|建设/)
  assert.match(source, /规划路线/)
  assert.match(readFileSync('src/features/map/LocationSearch.tsx', 'utf8'), /120/)
})
