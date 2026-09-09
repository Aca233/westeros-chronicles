import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const planner = await readFile('src/features/map/TravelPlanner.tsx', 'utf8')
const journeyPanel = await readFile('src/features/map/JourneyPanel.tsx', 'utf8')
const details = await readFile('src/features/map/LocationDetails.tsx', 'utf8')
const countyDetails = await readFile('src/features/map/CountyDetails.tsx', 'utf8')
const canvas = [
  await readFile('src/features/map/MapCanvas.tsx', 'utf8'),
  await readFile('src/features/map/canvas/journeyLayers.ts', 'utf8'),
].join('\n')
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
  assert.match(planner, /agot:prefill-action/)
  assert.match(planner, /写入中央行动草稿/)
})

test('活动旅程面板显示进度、下一地点、预计抵达与完整控制', () => {
  assert.match(journeyPanel, /下一地点/)
  assert.match(journeyPanel, /预计抵达/)
  assert.match(journeyPanel, /暂停旅程/)
  assert.match(journeyPanel, /继续旅程/)
  assert.match(journeyPanel, /改道/)
  assert.match(journeyPanel, /折返/)
  assert.match(journeyPanel, /pendingPause/)
  assert.match(journeyPanel, /pendingResume/)
  assert.match(journeyPanel, /prefillAction/)
})

test('原按钮负责取消待生效计划，不增加全局待处理横条', () => {
  assert.match(planner, /cancelTravelCommand/)
  assert.equal((planner.match(/取消出发/g) ?? []).length >= 1, true)
  assert.match(planner, /pendingElsewhere/)
  assert.match(planner, /先处理现有旅行调整/)
  assert.match(journeyPanel, /pendingPause \|\| pendingResume/)
  assert.match(journeyPanel, /cancelTravelCommand/)
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

test('伯爵领和地点从原位发起旅行，规划器只由地图抽屉按需打开', () => {
  assert.match(countyDetails, /前往这里/)
  assert.match(details, /前往这里/)
  assert.doesNotMatch(details, /TravelPlanner/)
  assert.match(drawer, /travelTargetLocationId &&/)
  assert.match(drawer, /<TravelPlanner/)
  assert.match(drawer, /pick-travel-destination/)
  assert.match(drawer, /正在选择目的地/)
  assert.match(drawer, /取消选择/)
  assert.match(css, /map-travel-planner-shell/)
  assert.match(css, /@media \(max-width: 640px\)/)
})


test('地图旅行操作只生成中央行动草稿，待处理状态仍只读取统一世界事务队列', () => {
  assert.match(planner, /agot:prefill-action/)
  assert.match(journeyPanel, /agot:prefill-action/)
  assert.match(planner, /pendingTravelTransactionFor/)
  assert.match(journeyPanel, /pendingTravelTransactionFor/)
  assert.match(planner, /cancelWorldTransaction/)
  assert.match(journeyPanel, /cancelWorldTransaction/)
  assert.doesNotMatch(planner, /queueWorldTransaction|queueTravelCommand/)
  assert.doesNotMatch(journeyPanel, /queueWorldTransaction|queueTravelCommand/)
  assert.doesNotMatch(store, /^\s*pendingTravelCommand:\s*/m)
  assert.doesNotMatch(store, /^\s*queueTravelCommand:\s*/m)
})

test('正文状态切片只描述权威旅程且不向模型开放旅行命令', () => {
  assert.match(prompt, /当前旅程/)
  assert.match(prompt, /地图旅行系统与统一回合结算/)
  assert.doesNotMatch(prompt, /不要重复输出 ADVANCE_TRAVEL/)
  assert.doesNotMatch(prompt, /type[^\n]+(?:PAUSE_TRAVEL|ADVANCE_TRAVEL)/)
})
