import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  filterMapPointsByPixelBounds,
  projectKnownAssetMapPoints,
  projectKnownCharacterMapPoints,
} from '../src/features/map/dynamicMapSubjects.ts'
import { assertSupportedGameState } from '../src/features/items/saveVersion.ts'
import { aggregateCharacterPoints } from '../src/features/map/semanticAggregation.ts'

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
  const aggregates = aggregateCharacterPoints({
    points,
    memberships: [
      { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', realmId: 'the_north' },
      { locationId: 'b_riverrun', baronyId: 'b_riverrun', countyId: 'c_riverrun', duchyId: 'd_riverrun', realmId: 'the_riverlands' },
    ],
    titles: [
      { featureId: 1, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领', mapX: 100, mapY: 100, importance: 60, regionId: 'the_north' },
      { featureId: 2, titleId: 'c_riverrun', rank: 'county', name: '奔流城伯爵领', mapX: 300, mapY: 220, importance: 60, regionId: 'the_riverlands' },
    ],
    pixelBounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
  })
  const memberIds = aggregates.flatMap((aggregate) => aggregate.memberIds)
  assert.equal(memberIds.includes('agot:Dead_1'), false)
  assert.equal(memberIds.includes('agot:Hidden_1'), false)
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
  assert.match(layers, /agot-character-aggregates/)
  assert.match(layers, /agot-asset-aggregates/)
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

test('MapCanvas 只在稳定边界或权威状态变化时刷新动态语义源', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.match(source, /semanticZoomState\(map\.getZoom\(\)\)/)
  assert.match(source, /map\.on\('zoomend'/)
  assert.match(source, /refreshPoliticalHouseLabels/)
  assert.doesNotMatch(source, /map\.on\('zoom',\s*refresh(?:Political|Semantic)/)
})

test('缩放不修改地图模式，旅程路线仍只来自原 routePlan', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.doesNotMatch(source, /setMapMode|useMapUiStore/)
  assert.match(source, /syncJourneyLayers\(map, manifest, routeRef\.current\.routePlan/)
})

test('镜头、zoomend 和 moveend 监听在地图销毁时完整解绑', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  for (const event of ['zoomend', 'moveend']) assert.match(source, new RegExp(`map\\.off\\('${event}'`))
  assert.match(source, /cameraCleanup\(\)/)
  assert.match(source, /map\.off\('sourcedata'/)
  assert.match(source, /terrainSurfaceController\.destroy\(\)/)
  assert.match(source, /wheelCameraController\.destroy\(\)/)
  assert.match(source, /mediaQuery\.removeEventListener/)
})

test('镜头持久化只保存中心与缩放，不保存 bearing 或 pitch', () => {
  const store = readFileSync('src/features/map/mapUiStore.ts', 'utf8')
  const viewport = store.match(/export interface MapViewport\s*\{[\s\S]*?\}/)?.[0] ?? ''
  assert.match(viewport, /longitude:\s*number[\s\S]*latitude:\s*number[\s\S]*zoom:\s*number/)
  assert.doesNotMatch(viewport, /\b(?:bearing|pitch)\b/)
})

test('连续地形 zoom 不触发政治人物资产重投影', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  const handler = source.match(/const handleTerrainZoom = \(\) => \{[\s\S]*?\n\s*\}/)?.[0] ?? ''
  assert.match(handler, /requestSync/)
  assert.doesNotMatch(handler, /syncDynamicMapSubjects|syncPoliticalHouseLabels|applyPoliticalFeatureStates/)
})
