import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  filterMapPointsByPixelBounds,
  projectKnownAssetMapPoints,
  projectKnownCharacterMapPoints,
} from '../src/features/map/dynamicMapSubjects.ts'
import { assertSupportedGameState } from '../src/features/items/saveVersion.ts'

const locations = [
  { id: 'b_winterfell', name: '临冬城', mapX: 100, mapY: 100, regionId: 'world_westeros_the_north' },
  { id: 'b_riverrun', name: '奔流城', mapX: 300, mapY: 220, regionId: 'world_westeros_the_riverlands' },
]

const history = {
  turns: [{
    turn: 2,
    resolvedOn: { year: 298, month: 1, day: 2 },
    acceptedCommands: [
      { type: 'MOVE_CHARACTER', characterId: 'agot:Arya_1', locationId: 'b_riverrun' },
      { type: 'MOVE_CHARACTER', characterId: 'agot:Hidden_1', locationId: 'b_missing' },
    ],
  }],
}

test('人物位置只投影玩家和统一世界状态中已知的有效地点，并按人物去重', () => {
  const points = projectKnownCharacterMapPoints({
    player: { id: 'agot:Stark_3', name: '艾德·史塔克', locationId: 'b_winterfell' },
    characters: [
      { id: 'agot:Arya_1', alive: true, locationId: 'b_winterfell' },
      { id: 'agot:Dead_1', alive: false, locationId: 'b_winterfell' },
    ],
    history,
    names: new Map([['agot:Arya_1', '艾莉亚·史塔克']]),
  }, locations)
  assert.deepEqual(points.map((point) => point.characterId), ['agot:Arya_1', 'agot:Stark_3'])
  assert.equal(points.find((point) => point.characterId === 'agot:Arya_1').locationId, 'b_winterfell')
  assert.equal(points.some((point) => point.characterId === 'agot:Hidden_1'), false)
  assert.equal(points.some((point) => point.characterId === 'agot:Dead_1'), false)
})

test('资产模式显示有权威地点的据点和运输工具，并统计其中物品', () => {
  const points = projectKnownAssetMapPoints({
    instances: { sword: {}, cloak: {}, grain: {} },
    placements: {
      sword: { type: 'site', siteId: 'site-armory' },
      cloak: { type: 'vehicle', vehicleId: 'wagon-1' },
      grain: { type: 'vehicle', vehicleId: 'wagon-1' },
    },
    sites: {
      'site-armory': { id: 'site-armory', name: '临冬城武库', type: 'armory', location: { locationId: 'b_winterfell' } },
      hidden: { id: 'hidden', name: '未知仓库', type: 'warehouse', location: { locationId: 'b_missing' } },
    },
    vehicles: {
      'wagon-1': { id: 'wagon-1', name: '北境马车', type: 'wagon', location: { locationId: 'b_riverrun' } },
    },
  }, locations)
  assert.deepEqual(points.map((point) => [point.assetId, point.itemCount]), [
    ['site-armory', 1],
    ['wagon-1', 2],
  ])
})

test('人物与资产查询按当前像素视野裁剪，不把全世界点位塞给 MapLibre', () => {
  const points = [
    { id: 'a', mapX: 50, mapY: 50 },
    { id: 'b', mapX: 150, mapY: 100 },
    { id: 'c', mapX: 300, mapY: 200 },
  ]
  assert.deepEqual(filterMapPointsByPixelBounds(points, { minX: 0, minY: 0, maxX: 200, maxY: 150 }).map((point) => point.id), ['a', 'b'])
})

test('地图抽屉关闭后不渲染 MapLibre，故障只隔离地图子树并可局部重试', () => {
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  const boundary = readFileSync('src/features/map/MapErrorBoundary.tsx', 'utf8')
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(drawer, /if \(activeDrawer !== 'map'\) return null/)
  assert.match(drawer, /MapErrorBoundary/)
  assert.match(boundary, /componentDidCatch/)
  assert.match(boundary, /重新载入地图/)
  assert.match(app, /Ck3CharacterWindow/)
  assert.match(app, /MapDrawer/)
})

test('人物和资产图层已接入地图，人物可打开卷宗，地点详情显示已知对象', () => {
  const canvas = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const layers = readFileSync('src/features/map/mapLayers.ts', 'utf8')
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  const details = readFileSync('src/features/map/LocationDetails.tsx', 'utf8')
  assert.match(canvas, /syncDynamicMapSubjects/)
  assert.match(canvas, /onSelectCharacter/)
  assert.match(layers, /agot-character-points/)
  assert.match(layers, /agot-asset-points/)
  assert.doesNotMatch(drawer, /等待统一世界状态接入/)
  assert.match(drawer, /projectKnownCharacterMapPoints/)
  assert.match(drawer, /projectKnownAssetMapPoints/)
  assert.match(details, /onSelectCharacter/)
  assert.match(details, /当地人物/)
  assert.match(details, /当地资产/)
})

test('地点搜索只读取轻量索引，路线计算继续运行在 Worker', () => {
  const repository = readFileSync('src/features/map/repository.ts', 'utf8')
  const routeClient = readFileSync('src/features/map/routing/routeClient.ts', 'utf8')
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  const searchBody = repository.slice(repository.indexOf('async searchLocations'), repository.indexOf('async getLocation'))
  assert.match(searchBody, /loadSearchIndex/)
  assert.doesNotMatch(searchBody, /loadLocationRegion|getLocation/)
  assert.match(routeClient, /new Worker/)
  assert.match(routeClient, /routeWorker/)
  assert.match(drawer, /mapRepository\.loadSearchIndex\(\)\s*\.then\(\(locations\)/)
  assert.doesNotMatch(drawer, /Promise\.all\(\[[\s\S]*?mapRepository\.loadPoliticalTitles\(\)[\s\S]*?mapRepository\.loadSearchIndex\(\)/)
})

test('无效地点和畸形路线不能作为版本 7 存档提交', () => {
  const base = {
    saveFormatVersion: 7,
    lord: {
      location: { locationId: 'b_winterfell' },
      locationLabel: '临冬城',
      items: { schemaVersion: 1, sites: {}, vehicles: {} },
    },
    worldHistory: { schemaVersion: 1 },
  }
  assert.doesNotThrow(() => assertSupportedGameState(base))
  assert.throws(() => assertSupportedGameState({ ...base, lord: { ...base.lord, location: { locationId: '临冬城' } } }))
  assert.throws(() => assertSupportedGameState({
    ...base,
    activeJourney: {
      routePlan: { from: 'b_winterfell', to: 'b_riverrun', legs: [{ index: 0, from: 'b_winterfell', to: '错误地点', days: 2 }] },
      currentLeg: 0, progressDays: 0, status: 'travelling', companions: [], vehicleIds: [],
      startedAt: { year: 298, month: 1, day: 1 },
    },
  }))
})

test('移动端地点详情和旅程面板是地图内部底部抽屉', () => {
  const css = readFileSync('src/index.css', 'utf8')
  assert.match(css, /@media \(max-width: 640px\)/)
  assert.match(css, /\.map-location-details\s*\{[^}]*bottom:\s*0/s)
  assert.match(css, /\.map-journey-panel\.with-details/)
  assert.match(css, /\.map-drawer-panel\s*\{\s*width:\s*100vw/s)
})
