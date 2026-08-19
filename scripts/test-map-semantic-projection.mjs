import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPoliticalHouseLabelCollection,
  resolveSemanticPoliticalHouse,
  semanticTitlesAffectedByChanges,
} from '../src/features/map/semanticPoliticalLabels.ts'

const countyTitle = {
  featureId: 3, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领',
  mapX: 1200, mapY: 900, importance: 80, regionId: 'the_north',
  politicalAnchorTitleId: 'c_winterfell',
}
const otherCountyTitle = {
  ...countyTitle, featureId: 4, titleId: 'c_dreadfort', name: '恐怖堡伯爵领', mapX: 4200,
  politicalAnchorTitleId: 'c_dreadfort',
}
const realmTitle = {
  ...countyTitle, featureId: 1, titleId: 'the_north', rank: 'realm', name: '北境',
  politicalAnchorTitleId: undefined,
}
const memberships = [
  { locationId: 'b_one', baronyId: 'b_one', countyId: 'c_winterfell', duchyId: 'd_winterfell', realmId: 'the_north' },
  { locationId: 'b_two', baronyId: 'b_two', countyId: 'c_dreadfort', duchyId: 'd_dreadfort', realmId: 'the_north' },
]

function state(titleId, effectiveTitleId, houseId, houseLabel, holderId = 'agot:Ned_1') {
  return {
    titleId, provinceId: titleId === 'b_one' ? 1 : 2, effectiveTitleId,
    houseId, houseLabel, holderId, color: '#6f7f75',
  }
}

test('政治副标题优先直接公开持有人之家族', () => {
  const result = resolveSemanticPoliticalHouse(countyTitle, [
    state('b_one', 'c_winterfell', 'stark', '史塔克家族'),
    state('b_two', 'd_winterfell', 'bolton', '波顿家族'),
  ], memberships)
  assert.deepEqual(result, { houseId: 'stark', houseLabel: '史塔克家族', holderId: 'agot:Ned_1' })
})

test('战略区域无直接锚点时按公开省份多数并以稳定家族 ID 破同票', () => {
  const tiedStates = [
    state('b_one', 'c_winterfell', 'bolton', '波顿家族', 'agot:Roose_1'),
    state('b_two', 'c_dreadfort', 'arryn', '艾林家族', 'agot:Jon_1'),
  ]
  assert.equal(resolveSemanticPoliticalHouse(realmTitle, tiedStates, memberships).houseId, 'arryn')
})

test('没有公开且经过核验的家族名时不生成替代标签', () => {
  const secretOnlyStates = [state('b_one', 'c_winterfell', 'stark', undefined)]
  assert.equal(resolveSemanticPoliticalHouse(countyTitle, secretOnlyStates, memberships), undefined)
})

test('副标题集合只包含当前视野和当前主要语义层', () => {
  const collection = buildPoliticalHouseLabelCollection({
    rank: 'county',
    titles: [realmTitle, countyTitle, otherCountyTitle],
    states: [state('b_one', 'c_winterfell', 'stark', '史塔克家族')],
    memberships,
    pixelBounds: { minX: 1000, minY: 700, maxX: 2000, maxY: 1200 },
    manifest: { westerosBounds: { minX: 0, minY: 0, maxX: 5000, maxY: 5000 } },
  })
  assert.deepEqual(collection.features.map((feature) => feature.properties.titleId), ['c_winterfell'])
  assert.equal(collection.features[0].properties.politicalHouseLabel, '史塔克家族')
})

test('内部地点变化只影响其伯爵领、公国和战略区域', () => {
  assert.deepEqual(
    [...semanticTitlesAffectedByChanges(['b_one'], memberships)].sort(),
    ['c_winterfell', 'd_winterfell', 'the_north'],
  )
  assert.equal(semanticTitlesAffectedByChanges(['c_winterfell'], memberships).has('c_winterfell'), true)
  assert.equal(semanticTitlesAffectedByChanges(['b_one'], memberships).has('c_dreadfort'), false)
})
