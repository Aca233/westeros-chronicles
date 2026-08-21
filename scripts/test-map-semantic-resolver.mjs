import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('家族副标题解析器与运行时引用已彻底删除', () => {
  assert.equal(existsSync('src/features/map/semanticPoliticalLabels.ts'), false)
  const source = [
    'src/features/map/mapStyle.ts',
    'src/features/map/mapLayers.ts',
    'src/features/map/MapCanvas.tsx',
  ].map((path) => readFileSync(path, 'utf8')).join('\n')
  assert.doesNotMatch(source, /POLITICAL_HOUSE_LABEL_SOURCE|POLITICAL_HOUSE_LABEL_LAYER/)
  assert.doesNotMatch(source, /KINGDOM_HOUSE_LABEL_SOURCE|KINGDOM_HOUSE_LABEL_LAYER/)
  assert.doesNotMatch(source, /politicalHouseLabel|createPoliticalHouseResolver|syncPoliticalHouseLabels/)
})

test('地图抽屉按需分包且空闲预热,首屏不静态引入 MapLibre', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /lazy\(\(\) => import\('\.\/features\/map\/MapDrawer'\)/)
  assert.doesNotMatch(app, /import \{ MapDrawer \} from '\.\/features\/map\/MapDrawer'/)
  assert.match(app, /requestIdleCallback/)
  assert.match(app, /activeDrawer === 'map' && \(/)
  assert.ok(app.includes('<MapDrawer onSelectCharacter={openStoryCharacter} />'), '地图人物点复用人物卷宗导航的标记不可丢')
})
