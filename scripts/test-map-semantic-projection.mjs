import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  aggregateAssetPoints,
  aggregateCharacterPoints,
} from '../src/features/map/semanticAggregation.ts'
import { createLocalMapStyle } from '../src/features/map/mapStyle.ts'

const countyTitle = {
  featureId: 5, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领',
  mapX: 1200, mapY: 900, importance: 60, regionId: 'the_north', titleColor: '#6f7f75',
}

test('头衔名称与颜色来自语义资料，不随持有人家族改变', () => {
  const manifest = {
    tileSize: 512, minZoom: 0, maxZoom: 6,
    paths: {
      terrain: '/assets/agot-map/terrain/{z}/{x}/{y}.webp',
    terrainLight: '/assets/agot-map/terrain-light/{z}/{x}/{y}.webp',
      materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
      vector: '/assets/agot-map/vector/{z}/{x}/{y}.pbf',
      dem: '/assets/agot-map/dem/{z}/{x}/{y}.png',
      semantic: '/assets/agot-map/semantic/{z}/{x}/{y}.pbf',
    },
  }
  const style = createLocalMapStyle(manifest)
  for (const rank of ['hegemon', 'empire', 'kingdom', 'duchy', 'county']) {
    const surface = style.layers.find((layer) => layer.id === `agot-${rank}-surface`)
    assert.deepEqual(surface.paint['fill-color'], ['get', 'titleColor'])
  }
  const source = readFileSync('src/features/map/mapStyle.ts', 'utf8')
  assert.doesNotMatch(source, /houseColor|politicalColor|politicalDuchyColor|politicalKingdomColor|politicalEmpireColor/)
})

test('地图不存在家族副标题数据管线', () => {
  const source = [
    readFileSync('src/features/map/mapStyle.ts', 'utf8'),
    readFileSync('src/features/map/mapLayers.ts', 'utf8'),
    readFileSync('src/features/map/MapCanvas.tsx', 'utf8'),
  ].join('\n')
  assert.doesNotMatch(source, /POLITICAL_HOUSE_LABEL|KINGDOM_HOUSE_LABEL|politicalHouseLabel|createPoliticalHouseResolver|syncPoliticalHouseLabels/)
})

const aggregationTitles = [
  { ...countyTitle, mapX: 120, mapY: 90 },
  { ...countyTitle, featureId: 5, titleId: 'd_the_neck', rank: 'duchy', name: '颈泽公国', mapX: 180, mapY: 140 },
]
const aggregationMemberships = [
  { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', regionId: 'the_north' },
  { locationId: 'b_godswood', baronyId: 'b_godswood', countyId: 'c_winterfell', duchyId: 'd_winterfell', regionId: 'the_north' },
  { locationId: 'b_greywater', baronyId: 'b_greywater', duchyId: 'd_the_neck', regionId: 'the_north' },
]
const characterPoints = [
  { id: 'character:agot:Ned_1', characterId: 'agot:Ned_1', locationId: 'b_winterfell', mapX: 110, mapY: 85 },
  { id: 'character:agot:Arya_1', characterId: 'agot:Arya_1', locationId: 'b_godswood', mapX: 125, mapY: 95 },
  { id: 'character:agot:Howland_1', characterId: 'agot:Howland_1', locationId: 'b_greywater', mapX: 180, mapY: 140 },
]
const aggregationBounds = { minX: 0, minY: 0, maxX: 300, maxY: 200 }

test('人物中景按伯爵领聚合，缺少伯爵领时回退公国', () => {
  const groups = aggregateCharacterPoints({
    points: characterPoints,
    memberships: aggregationMemberships,
    titles: aggregationTitles,
    pixelBounds: aggregationBounds,
  })
  assert.deepEqual(groups, [
    {
      id: 'characters:county:c_winterfell', kind: 'characters', rank: 'county',
      scopeId: 'c_winterfell', mapX: 120, mapY: 90, count: 2,
      memberIds: ['agot:Arya_1', 'agot:Ned_1'],
    },
    {
      id: 'characters:duchy:d_the_neck', kind: 'characters', rank: 'duchy',
      scopeId: 'd_the_neck', mapX: 180, mapY: 140, count: 1,
      memberIds: ['agot:Howland_1'],
    },
  ])
})

test('资产先按地点聚合，县内超过八个地点时提升为伯爵领聚合', () => {
  const denseMemberships = Array.from({ length: 9 }, (_, index) => ({
    locationId: `b_dense_${index}`, baronyId: `b_dense_${index}`,
    countyId: 'c_winterfell', duchyId: 'd_winterfell', regionId: 'the_north',
  }))
  const denseAssets = denseMemberships.map((membership, index) => ({
    id: `asset:site:${index}`, assetId: `site-${index}`, locationId: membership.locationId,
    mapX: 100 + index, mapY: 80 + index,
  }))
  const groups = aggregateAssetPoints({
    points: denseAssets,
    memberships: denseMemberships,
    titles: aggregationTitles,
    pixelBounds: aggregationBounds,
  })
  assert.equal(groups[0].id, 'assets:county:c_winterfell')
  assert.equal(groups[0].count, denseAssets.length)
})

test('反向输入、重复输入和视野外输入不会改变聚合结果', () => {
  const base = {
    points: characterPoints,
    memberships: aggregationMemberships,
    titles: aggregationTitles,
    pixelBounds: aggregationBounds,
  }
  const reversedDuplicatedAndOffscreen = {
    ...base,
    points: [
      { ...characterPoints[0], id: 'character:agot:Offscreen_1', characterId: 'agot:Offscreen_1', mapX: 900, mapY: 900 },
      ...characterPoints.toReversed(),
      characterPoints[0],
    ],
  }
  assert.deepEqual(aggregateCharacterPoints(base), aggregateCharacterPoints(reversedDuplicatedAndOffscreen))
})

test('aggregateRank=kingdom 时按王国头衔点聚合，缺王国归属回退到更细等级', () => {
  const kingdomTitles = [
    { ...countyTitle, featureId: 9, titleId: 'k_north', rank: 'kingdom', name: '北境王国', mapX: 150, mapY: 100 },
    { ...countyTitle, featureId: 10, titleId: 'd_the_neck', rank: 'duchy', name: '颈泽公国', mapX: 180, mapY: 140 },
  ]
  const kingdomMemberships = [
    { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', kingdomId: 'k_north', regionId: 'the_north' },
    { locationId: 'b_godswood', baronyId: 'b_godswood', countyId: 'c_winterfell', duchyId: 'd_winterfell', kingdomId: 'k_north', regionId: 'the_north' },
    { locationId: 'b_greywater', baronyId: 'b_greywater', duchyId: 'd_the_neck', regionId: 'the_north' },
  ]
  const groups = aggregateCharacterPoints({
    points: characterPoints,
    memberships: kingdomMemberships,
    titles: kingdomTitles,
    pixelBounds: aggregationBounds,
    aggregateRank: 'kingdom',
  })
  // b_winterfell/b_godswood 聚到王国 k_north；b_greywater 缺王国归属，回退到其公国 d_the_neck。
  // 输出按 id 字典序：characters:duchy:* 排在 characters:kingdom:* 之前。
  assert.deepEqual(groups, [
    {
      id: 'characters:duchy:d_the_neck', kind: 'characters', rank: 'duchy',
      scopeId: 'd_the_neck', mapX: 180, mapY: 140, count: 1,
      memberIds: ['agot:Howland_1'],
    },
    {
      id: 'characters:kingdom:k_north', kind: 'characters', rank: 'kingdom',
      scopeId: 'k_north', mapX: 150, mapY: 100, count: 2,
      memberIds: ['agot:Arya_1', 'agot:Ned_1'],
    },
  ])
})

test('人物与资产先按伯爵领限域，完整列表与独立标记预算分离', async () => {
  const { scopeMapSubjects } = await import('../src/features/map/dynamicMapSubjects.ts')
  const countyIdByLocationId = new Map([
    ['b_winterfell', 'c_winterfell'],
    ['b_kings_landing', 'c_kings_landing'],
  ])
  const characters = Array.from({ length: 9 }, (_, index) => ({
    id: `character:agot:Stark_${index}`,
    characterId: `agot:Stark_${index}`,
    name: `史塔克 ${index}`,
    locationId: 'b_winterfell', locationName: '临冬城', regionId: 'the_north',
    mapX: 1200 + index, mapY: 900, knowledge: 'confirmed',
  }))
  characters.push({
    id: 'character:agot:Lannister_6', characterId: 'agot:Lannister_6', name: '瑟曦',
    locationId: 'b_kings_landing', locationName: '君临', regionId: 'crownlands',
    mapX: 5000, mapY: 3000, knowledge: 'confirmed',
  })
  const assets = [
    { id: 'asset:site:winterfell', assetId: 'winterfell', name: '临冬城', assetType: 'site', locationId: 'b_winterfell', locationName: '临冬城', regionId: 'the_north', mapX: 1200, mapY: 900, itemCount: 3, knowledge: 'confirmed' },
    { id: 'asset:site:red_keep', assetId: 'red_keep', name: '红堡', assetType: 'site', locationId: 'b_kings_landing', locationName: '君临', regionId: 'crownlands', mapX: 5000, mapY: 3000, itemCount: 4, knowledge: 'confirmed' },
  ]
  assert.deepEqual(scopeMapSubjects({ countyId: null, countyIdByLocationId, characters, assets }), {
    characters: [], assets: [], characterPoints: [], assetPoints: [],
  })
  const scoped = scopeMapSubjects({ countyId: 'c_winterfell', countyIdByLocationId, characters, assets })
  assert.equal(scoped.characters.length, 9)
  assert.equal(scoped.characterPoints.length, 8)
  assert.deepEqual(scoped.assets.map((entry) => entry.assetId), ['winterfell'])
  assert.equal(scoped.characters.some((entry) => entry.locationId === 'b_kings_landing'), false)
})
