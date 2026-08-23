import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { needsCharacterNameData, needsPoliticalData } from '../src/features/map/mapDataDemand.ts'

test('人物姓名在人物图层开启时即请求，不受伯爵领选择限制', () => {
  assert.equal(needsCharacterNameData({ selectedCountyId: null, charactersVisible: true }), true)
  assert.equal(needsCharacterNameData({ selectedCountyId: 'c_winterfell', charactersVisible: true }), true)
  assert.equal(needsCharacterNameData({ selectedCountyId: 'c_winterfell', charactersVisible: false }), false)
})

test('战略政治面或伯爵领详情均需要政治资料', () => {
  assert.equal(needsPoliticalData({ politicalVisible: true, selectedCountyId: null }), true)
  assert.equal(needsPoliticalData({ politicalVisible: false, selectedCountyId: 'c_winterfell' }), true)
  assert.equal(needsPoliticalData({ politicalVisible: false, selectedCountyId: null }), false)
})

test('地图抽屉的数据加载按选择和图层需求门控', () => {
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  assert.match(drawer, /needsCharacters/)
  assert.match(drawer, /needsPolitics/)
  assert.match(drawer, /selectedCountyId:\s*selection\.countyId/)
  assert.match(drawer, /charactersVisible:\s*overlays\.characters/)
  assert.match(drawer, /politicalVisible:\s*overlays\.political/)
  assert.doesNotMatch(drawer, /mapMode|setMapMode/)
})
