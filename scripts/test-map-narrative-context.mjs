import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatNarrativeLocationContext,
  resolveNarrativeLocationContext,
} from '../src/features/map/narrativeLocationContext.ts'

const title = (titleId, rank, name) => ({
  featureId: { realm: 1, duchy: 2, county: 3 }[rank],
  titleId,
  rank,
  name,
  mapX: 10,
  mapY: 20,
  importance: 80,
  regionId: 'the_north',
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
    realmId: 'the_north',
  }],
  titles: [
    title('c_winterfell', 'county', '临冬城伯爵领'),
    title('d_winterfell', 'duchy', '临冬城公国'),
    title('the_north', 'realm', '北境'),
  ],
}

test('叙事地点只输出具体地点、伯爵领、公国和战略区域中文名', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_winterfell', sceneLocation: '神木林' },
    locations: [winterfell],
    ...hierarchy,
  })

  assert.equal(
    formatNarrativeLocationContext(context),
    '临冬城 · 神木林 · 临冬城伯爵领 · 临冬城公国 · 北境',
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
