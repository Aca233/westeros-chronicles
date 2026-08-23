import assert from 'node:assert/strict'
import test from 'node:test'
import { mapPresentationFor } from '../src/features/map/mapPresentation.ts'
const overlays = { characters: true, assets: true, roads: true, political: true }
test('远景显示政治战略表达和道路，人物与据点在战略级别隐藏', () => assert.deepEqual(mapPresentationFor({ zoom: 2, overlays, selectedCountyId: null }), { band: 'strategic', politicalSurface: true, countyLabels: false, internalLocations: false, roads: true, characters: false, assets: false }))
test('动态图层不受伯爵领选择限制', () => {
  assert.equal(mapPresentationFor({ zoom: 3.5, overlays, selectedCountyId: null }).characters, true)
  assert.equal(mapPresentationFor({ zoom: 3.5, overlays, selectedCountyId: null }).assets, true)
  assert.deepEqual(mapPresentationFor({ zoom: 3.5, overlays, selectedCountyId: 'c_winterfell' }), { band: 'county', politicalSurface: true, countyLabels: true, internalLocations: false, roads: true, characters: true, assets: true })
})
test('近景只为选中伯爵领展开内部地点', () => {
  assert.equal(mapPresentationFor({ zoom: 4.6, overlays, selectedCountyId: 'c_winterfell' }).politicalSurface, false)
  assert.equal(mapPresentationFor({ zoom: 5, overlays, selectedCountyId: null }).internalLocations, false)
  assert.equal(mapPresentationFor({ zoom: 5, overlays, selectedCountyId: 'c_winterfell' }).internalLocations, true)
})
