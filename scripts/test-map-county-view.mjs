import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCountyViewModel } from '../src/features/map/countyViewModel.ts'

test('伯爵领投影过滤县域外人物与资产并保留主要地点', () => {
  const selectedCounty = {
    countyId: 'c_winterfell',
    duchyId: 'd_winterfell',
    kingdomId: 'k_the_north',
    empireId: 'e_the_north',
    hegemonId: 'h_the_iron_throne',
    regionId: 'the_north',
    primaryLocationId: 'b_winterfell',
    locations: [
      { id: 'b_winterfell', name: '临冬城', type: 'castle', importance: 100, regionId: 'north', mapX: 1, mapY: 2, isPrimary: true },
      { id: 'b_wintertown', name: '避冬市镇', type: 'town', importance: 40, regionId: 'north', mapX: 2, mapY: 3, isPrimary: false },
    ],
  }
  const view = buildCountyViewModel({
    countyId: 'c_winterfell',
    titles: [
      { featureId: 1, titleId: 'c_winterfell', rank: 'county', name: '临冬城', importance: 100, regionId: 'north', titleColor: '#777777', mapX: 1, mapY: 2 },
      { featureId: 2, titleId: 'd_winterfell', rank: 'duchy', name: '临冬城公国', importance: 100, regionId: 'north', titleColor: '#777777', mapX: 1, mapY: 2 },
      { featureId: 3, titleId: 'k_the_north', rank: 'kingdom', name: '北境王国', importance: 100, regionId: 'north', titleColor: '#777777', mapX: 1, mapY: 2 },
      { featureId: 4, titleId: 'e_the_north', rank: 'empire', name: '北境', importance: 100, regionId: 'north', titleColor: '#777777', mapX: 1, mapY: 2 },
      { featureId: 5, titleId: 'h_the_iron_throne', rank: 'hegemon', name: '铁王座', importance: 100, regionId: 'north', titleColor: '#777777', mapX: 1, mapY: 2 },
    ],
    selectedCounty,
    characters: [
      { id: 'character:agot:Stark_3', characterId: 'agot:Stark_3', name: '艾德', locationId: 'b_winterfell', locationName: '临冬城', regionId: 'north', mapX: 1, mapY: 2, knowledge: 'confirmed' },
      { id: 'character:agot:Lannister_6', characterId: 'agot:Lannister_6', name: '瑟曦', locationId: 'b_kings_landing', locationName: '君临', regionId: 'crownlands', mapX: 8, mapY: 9, knowledge: 'confirmed' },
    ],
    assets: [
      { id: 'asset:site:winterfell', assetId: 'winterfell', name: '临冬城', assetType: 'site', locationId: 'b_winterfell', locationName: '临冬城', regionId: 'north', mapX: 1, mapY: 2, itemCount: 3, knowledge: 'confirmed' },
    ],
  })
  assert.equal(view.id, 'c_winterfell')
  assert.equal(view.name, '临冬城伯爵领')
  assert.equal(view.primaryLocationId, 'b_winterfell')
  assert.equal(view.duchyName, '临冬城公国')
  assert.equal(view.kingdomName, '北境王国')
  assert.equal(view.empireName, '北境')
  assert.equal(view.hegemonName, '铁王座')
  assert.deepEqual(view.locations.map((entry) => entry.id), ['b_winterfell', 'b_wintertown'])
  assert.deepEqual(view.characters.map((entry) => entry.characterId), ['agot:Stark_3'])
  assert.deepEqual(view.assets.map((entry) => entry.assetId), ['winterfell'])
})
