import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const details = await readFile('src/features/map/LocationDetails.tsx', 'utf8')
const canvas = await readFile('src/features/map/MapCanvas.tsx', 'utf8')
const drawer = await readFile('src/features/map/MapDrawer.tsx', 'utf8')
const store = await readFile('src/store/useGameStore.ts', 'utf8')
const prompt = await readFile('src/services/promptBuilder.ts', 'utf8')

test('路线按钮在原位提供开始、暂停、继续和取消操作', () => {
  assert.match(details, /开始旅行/)
  assert.match(details, /取消出发/)
  assert.match(details, /暂停旅程/)
  assert.match(details, /继续旅程/)
  assert.match(details, /cancelTravelCommand/)
  assert.equal((details.match(/className="map-route-button"/g) ?? []).length, 1, '旅行取消不能另设全局待生效按钮')
})

test('开始旅行进入队列且只在成功回合后消费', () => {
  assert.match(store, /pendingTravelCommand: TravelStateCommand \| null/)
  assert.match(store, /pendingTravelCommands: submittedTravelCommand \? \[submittedTravelCommand\] : \[\]/)
  assert.match(store, /activeJourney: settled\.activeJourney/)
  assert.match(store, /pendingTravelCommand: null/)
})

test('地图画布绘制规划路线、已走进度和当前位置', () => {
  assert.match(drawer, /displayedRoute/)
  assert.match(canvas, /JOURNEY_ROUTE_SOURCE/)
  assert.match(canvas, /JOURNEY_PROGRESS_SOURCE/)
  assert.match(canvas, /JOURNEY_POSITION_SOURCE/)
  assert.match(canvas, /progressDays \/ current\.days/)
  assert.match(canvas, /line-dasharray/)
})

test('正文状态切片包含权威旅程且障碍可中断', () => {
  assert.match(prompt, /当前旅程/)
  assert.match(prompt, /PAUSE_TRAVEL/)
  assert.match(prompt, /不要重复输出 ADVANCE_TRAVEL/)
})
