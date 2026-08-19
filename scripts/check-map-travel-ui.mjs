import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const planner = await readFile('src/features/map/TravelPlanner.tsx', 'utf8')
const journeyPanel = await readFile('src/features/map/JourneyPanel.tsx', 'utf8')
const details = await readFile('src/features/map/LocationDetails.tsx', 'utf8')
const canvas = await readFile('src/features/map/MapCanvas.tsx', 'utf8')
const drawer = await readFile('src/features/map/MapDrawer.tsx', 'utf8')
const store = await readFile('src/store/useGameStore.ts', 'utf8')
const prompt = await readFile('src/services/promptBuilder.ts', 'utf8')
const css = await readFile('src/index.css', 'utf8')


test('独立规划器提供三种偏好、四种交通方式与途经点', () => {
  assert.match(planner, /最快/)
  assert.match(planner, /最安全/)
  assert.match(planner, /最省钱/)
  for (const mode of ['步行', '骑马', '马车', '航船']) assert.match(planner, new RegExp(mode))
  assert.match(planner, /途经点/)
  assert.match(planner, /via/)
})

test('规划结果明确预览时间、费用、风险并二次确认', () => {
  assert.match(planner, /totalDays/)
  assert.match(planner, /totalCost/)
  assert.match(planner, /totalRisk/)
  assert.match(planner, /开始旅行/)
  assert.match(planner, /取消出发/)
  assert.match(planner, /queueTravelCommand/)
})

test('活动旅程面板显示进度、下一地点、预计抵达与完整控制', () => {
  assert.match(journeyPanel, /下一地点/)
  assert.match(journeyPanel, /预计抵达/)
  assert.match(journeyPanel, /暂停旅程/)
  assert.match(journeyPanel, /继续旅程/)
  assert.match(journeyPanel, /改道/)
  assert.match(journeyPanel, /返回/)
  assert.match(journeyPanel, /PAUSE_TRAVEL/)
  assert.match(journeyPanel, /RESUME_TRAVEL/)
  assert.match(journeyPanel, /RETURN_TRAVEL/)
})

test('原按钮负责取消待生效计划，不增加全局待处理横条', () => {
  assert.match(planner, /cancelTravelCommand/)
  assert.equal((planner.match(/取消出发/g) ?? []).length >= 1, true)
  assert.match(planner, /pendingElsewhere/)
  assert.match(planner, /先处理现有旅行调整/)
  assert.match(journeyPanel, /!pendingReturn && currentLocation\.locationId === journey\.routePlan\.from/)
  assert.doesNotMatch(drawer, /待处理横条|pending-travel-banner/)
})

test('地图画布绘制规划虚线、已走实线和当前位置', () => {
  assert.match(drawer, /displayedRoute/)
  assert.match(canvas, /JOURNEY_ROUTE_SOURCE/)
  assert.match(canvas, /JOURNEY_PROGRESS_SOURCE/)
  assert.match(canvas, /JOURNEY_POSITION_SOURCE/)
  assert.match(canvas, /progressDays \/ current\.days/)
  assert.match(canvas, /line-dasharray/)
})

test('地点详情和旅程面板在移动端堆叠为内部底部抽屉', () => {
  assert.match(css, /map-journey-panel/)
  assert.match(css, /map-journey-panel\.with-details/)
  assert.match(css, /@media \(max-width: 640px\)/)
  assert.match(drawer, /JourneyPanel/)
  assert.match(details, /TravelPlanner/)
})

test('正文状态切片包含权威旅程且障碍可中断', () => {
  assert.match(prompt, /当前旅程/)
  assert.match(prompt, /PAUSE_TRAVEL/)
  assert.match(prompt, /不要重复输出 ADVANCE_TRAVEL/)
})
