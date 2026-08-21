import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatNarrativeLocationContext,
  resolveNarrativeLocationContext,
} from '../src/features/map/narrativeLocationContext.ts'

const title = (titleId, rank, name) => ({
  featureId: { hegemon: 1, empire: 2, kingdom: 3, duchy: 4, county: 5 }[rank],
  titleId,
  rank,
  name,
  mapX: 10,
  mapY: 20,
  importance: 80,
  regionId: 'the_north',
  titleColor: '#777777',
})

const winterfell = {
  id: 'b_winterfell',
  name: '临冬城',
  type: 'castle',
  importance: 100,
  mapX: 10,
  mapY: 20,
  regionId: 'the_north',
}

const hierarchy = {
  memberships: [{
    locationId: 'b_winterfell',
    baronyId: 'b_winterfell',
    countyId: 'c_winterfell',
    duchyId: 'd_winterfell',
    kingdomId: 'k_the_north',
    empireId: 'e_the_north',
    hegemonId: 'h_the_iron_throne',
    regionId: 'the_north',
  }],
  titles: [
    title('c_winterfell', 'county', '临冬城伯爵领'),
    title('d_winterfell', 'duchy', '临冬城公国'),
    title('k_the_north', 'kingdom', '北境王国'),
    title('e_the_north', 'empire', '北境'),
    title('h_the_iron_throne', 'hegemon', '铁王座'),
  ],
}

test('叙事地点只输出具体地点和经过验证的五级头衔中文名', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_winterfell', sceneLocation: '神木林' },
    locations: [winterfell],
    ...hierarchy,
  })

  assert.equal(
    formatNarrativeLocationContext(context),
    '临冬城 · 神木林 · 临冬城伯爵领 · 临冬城公国 · 北境王国 · 北境 · 铁王座',
  )
  assert.doesNotMatch(JSON.stringify(context), /b_winterfell|baronyId|男爵/)
})

test('语义资料缺失时只保留已验证中文地点名', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_winterfell' },
    locations: [winterfell],
    memberships: [],
    titles: [],
  })

  assert.equal(formatNarrativeLocationContext(context), '临冬城')
})

test('无法验证的地点和内部键不能回退到模型上下文', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_unknown', sceneLocation: 'b_hidden_chamber' },
    locations: [winterfell],
    ...hierarchy,
  })

  assert.equal(formatNarrativeLocationContext(context), '')
  assert.deepEqual(context, { placeName: '' })
})
