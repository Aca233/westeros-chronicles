import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_OVERLAYS, EMPTY_MAP_SELECTION, clearSelectedLocation, selectCounty, selectMapLocation, selectionContainsLocation } from '../src/features/map/mapInteraction.ts'

test('选择伯爵领不会伪造具体地点', () => assert.deepEqual(selectCounty('c_winterfell'), { countyId: 'c_winterfell', locationId: null }))
test('具体地点与父伯爵领一起保存', () => {
  const selected = selectMapLocation('c_winterfell', 'b_winterfell')
  assert.equal(selectionContainsLocation(selected, 'c_winterfell'), true)
  assert.deepEqual(clearSelectedLocation(selected), { countyId: 'c_winterfell', locationId: null })
})
test('地图信息默认开启但不会改变空选择', () => {
  assert.deepEqual(DEFAULT_MAP_OVERLAYS, { characters: true, assets: true, roads: true, political: true })
  assert.deepEqual(EMPTY_MAP_SELECTION, { countyId: null, locationId: null })
})

test('Escape 依次取消选点、关闭规划、返回伯爵领并清空伯爵领', async () => {
  const { useMapUiStore } = await import('../src/features/map/mapUiStore.ts')
  useMapUiStore.setState({
    selection: { countyId: 'c_winterfell', locationId: 'b_winterfell' },
    travelTargetLocationId: 'b_riverrun',
    travelPickOriginLocationId: 'b_winterfell',
    interactionState: 'pick-travel-destination',
    routePreview: null,
  })
  const state = () => useMapUiStore.getState()
  assert.equal(state().dismissMapContext(), true)
  assert.equal(state().interactionState, 'browse')
  assert.equal(state().dismissMapContext(), true)
  assert.equal(state().travelTargetLocationId, null)
  assert.equal(state().dismissMapContext(), true)
  assert.deepEqual(state().selection, { countyId: 'c_winterfell', locationId: null })
  assert.equal(state().dismissMapContext(), true)
  assert.deepEqual(state().selection, { countyId: null, locationId: null })
  assert.equal(state().dismissMapContext(), false)
})
