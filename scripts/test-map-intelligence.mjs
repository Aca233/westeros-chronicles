import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { filterMapIntelligence } from '../src/features/map/intelligence.ts'
import { buildLocationView } from '../src/features/map/locationViewModel.ts'
import { visibleMapSubjectsForMode } from '../src/features/map/mapLayers.ts'

const NOW = '298.3.12'

const dynamicSubjects = [
  {
    type: 'character-location', id: 'where-arya', characterId: 'char_arya', name: '艾莉亚·史塔克',
    locationId: 'b_kings_landing', sceneLocation: '红堡地牢', regionId: 'world_westeros_the_crownlands',
    qualitativeDescription: '有人在王领见过一个北境女孩', internalSecret: '暗道出口',
  },
  {
    type: 'garrison', id: 'garrison-red-keep', titleId: 'b_kings_landing', locationId: 'b_kings_landing',
    regionId: 'world_westeros_the_crownlands', count: 8432, quality: '精锐',
    qualitativeDescription: '城中驻军看起来很多', internalSecret: '西门守卫空缺',
  },
  {
    type: 'asset', id: 'asset-dragon-egg', assetId: 'dragon_egg_01', name: '龙蛋', assetType: 'curio',
    custodianId: 'char_secret', locationId: 'b_dragonstone', regionId: 'world_westeros_the_crownlands',
    qualitativeDescription: '王领似乎藏有一件古老奇物', internalSecret: '密室第三层',
  },
  {
    type: 'road-closure', id: 'road-neck', edgeId: 'edge_neck_01', from: 'b_moat_cailin', to: 'b_the_twins',
    regionId: 'world_westeros_the_north', closed: true, reason: '伏兵封路',
    qualitativeDescription: '颈泽南面的道路近来不太平', internalSecret: '伏兵首领姓名',
  },
  {
    type: 'identity', id: 'identity-young-griff', characterId: 'char_young_griff', claimedName: '小格里芬',
    trueIdentity: '伊耿·坦格利安', regionId: 'world_westeros_the_stormlands',
    qualitativeDescription: '此人的出身可能并非表面所说', internalSecret: '情报网代号',
  },
  {
    type: 'death', id: 'death-secret', characterId: 'char_secret_dead', name: '失踪骑士', dead: true,
    date: '298.2.4', cause: '毒杀', regionId: 'world_westeros_the_riverlands',
    qualitativeDescription: '河间地流传着一名骑士遇害的消息', internalSecret: '凶手姓名',
  },
  {
    type: 'event', id: 'event-hidden-army', eventId: 'event_hidden_army', locationId: 'b_harrenhal',
    regionId: 'world_westeros_the_riverlands', title: '秘密集结', description: '三千士兵夜间集结', date: '298.3.10',
    qualitativeDescription: '赫伦堡附近似乎有不寻常的调动', internalSecret: '进军日期',
  },
]

test('未知人物位置、驻军、资产、封路、身份、死亡和事件全部默认隐藏', () => {
  for (const subject of dynamicSubjects) {
    assert.equal(filterMapIntelligence(subject, { level: 'unknown' }, NOW, false), null, subject.type)
  }
})

test('传闻只保留模糊区域和定性描述，不序列化精确字段和值', () => {
  for (const subject of dynamicSubjects) {
    const record = {
      level: 'rumored',
      learnedAt: '298.3.1',
      source: '不公开的线人',
      value: {
        regionId: subject.regionId,
        qualitativeDescription: subject.qualitativeDescription,
      },
    }
    const visible = filterMapIntelligence(subject, record, NOW, false)
    assert.ok(visible)
    assert.deepEqual(Object.keys(visible).sort(), [
      'id', 'intelLevel', 'qualitativeDescription', 'regionId', 'type',
    ])
    const serialized = JSON.stringify(visible)
    for (const field of [
      'locationId', 'sceneLocation', 'count', 'custodianId', 'closed', 'reason', 'trueIdentity',
      'dead', 'cause', 'description', 'internalSecret', 'source', 'learnedAt',
    ]) assert.doesNotMatch(serialized, new RegExp(field), `${subject.type} 泄漏字段 ${field}`)
    for (const value of ['红堡地牢', '8432', '密室第三层', '伏兵首领姓名', '伊耿·坦格利安', '凶手姓名', '三千士兵夜间集结']) {
      assert.equal(serialized.includes(value), false, `${subject.type} 泄漏值 ${value}`)
    }
  }
})

test('过时情报只显示获知时快照和日期，不读取当前世界真值', () => {
  const current = dynamicSubjects[1]
  const knowledge = {
    level: 'stale',
    learnedAt: '298.1.20',
    source: '北门守卫',
    value: {
      titleId: 'b_kings_landing', locationId: 'b_kings_landing',
      regionId: 'world_westeros_the_crownlands', count: 5100, quality: '普通',
      qualitativeDescription: '两个月前城中驻军约有五千人',
    },
  }
  const visible = filterMapIntelligence(current, knowledge, NOW, false)
  assert.ok(visible)
  assert.equal(visible.count, 5100)
  assert.equal(visible.quality, '普通')
  assert.equal(visible.stale, true)
  assert.equal(visible.learnedAt, '298.1.20')
  assert.equal(visible.source, '北门守卫')
  assert.equal(JSON.stringify(visible).includes('8432'), false)
  assert.equal(JSON.stringify(visible).includes('西门守卫空缺'), false)
})

test('确认情报只通过注册类型白名单；未知类型即使调试开启也拒绝', () => {
  const confirmed = filterMapIntelligence(dynamicSubjects[0], { level: 'confirmed' }, NOW, false)
  assert.ok(confirmed)
  assert.equal(confirmed.locationId, 'b_kings_landing')
  assert.equal(confirmed.sceneLocation, '红堡地牢')
  assert.equal('internalSecret' in confirmed, false)

  const unknownType = { type: 'future-secret-system', id: 'secret-1', payload: '不能显示' }
  assert.equal(filterMapIntelligence(unknownType, { level: 'confirmed' }, NOW, false), null)
  assert.equal(filterMapIntelligence(unknownType, { level: 'unknown' }, NOW, true), null)

  const debug = filterMapIntelligence(dynamicSubjects[0], { level: 'unknown' }, NOW, true)
  assert.equal(debug?.internalSecret, '暗道出口')
  assert.equal(debug?.debug, true)
  const source = readFileSync('src/features/map/intelligence.ts', 'utf8')
  assert.doesNotMatch(source, /URLSearchParams|location\.search|window\.location/)
})

test('地图图层只接收已经过滤且与模式匹配的可见主题', () => {
  const character = filterMapIntelligence(dynamicSubjects[0], { level: 'confirmed' }, NOW, false)
  const asset = filterMapIntelligence(dynamicSubjects[2], { level: 'confirmed' }, NOW, false)
  const closure = filterMapIntelligence(dynamicSubjects[3], { level: 'confirmed' }, NOW, false)
  const unfiltered = dynamicSubjects[1]
  const subjects = [character, asset, closure, unfiltered].filter(Boolean)

  assert.deepEqual(visibleMapSubjectsForMode('characters', subjects).map((entry) => entry.id), ['where-arya'])
  assert.deepEqual(visibleMapSubjectsForMode('assets', subjects).map((entry) => entry.id), ['asset-dragon-egg'])
  assert.deepEqual(visibleMapSubjectsForMode('travel', subjects).map((entry) => entry.id), ['road-neck'])
  assert.deepEqual(visibleMapSubjectsForMode('terrain', subjects), [])
})

test('未知动态情报不影响公开海岸、道路、三级行政区域和著名城堡', () => {
  const winterfell = {
    id: 'b_winterfell', name: '临冬城', englishName: 'Winterfell', type: 'castle',
    mapX: 1360, mapY: 1447, provinceId: 42, baronyId: 'b_winterfell', countyId: 'c_winterfell',
    duchyId: 'd_winterfell', kingdomId: 'k_the_north', regionId: 'world_westeros_the_north',
    terrain: 'land', isCoastal: true, isPort: false, importance: 100, tags: ['capital', 'famous'],
  }
  const view = buildLocationView(winterfell, {
    intelligence: dynamicSubjects.map((subject) => ({ subject, knowledge: { level: 'unknown' } })),
  }, { now: NOW, debugIntelligence: false })
  assert.equal(view.name, '临冬城')
  assert.equal(view.regionLabel, '北境')
  assert.equal(view.access.coastal, true)
  assert.deepEqual(view.intelligence, [])

  const styleSource = readFileSync('src/features/map/mapStyle.ts', 'utf8')
  assert.match(styleSource, /FAR_MAP_SOURCE/)
  assert.match(styleSource, /MATERIAL_TERRAIN_SOURCE/)
  assert.match(styleSource, /agot-roads/)
  assert.match(styleSource, /agot-realm-boundaries/)
  assert.match(styleSource, /agot-duchy-boundaries/)
  assert.match(styleSource, /agot-county-boundaries/)
  assert.doesNotMatch(styleSource, /agot-borders|barony-boundaries/)
  assert.match(styleSource, /agot-county-hit-areas/)
  assert.doesNotMatch(styleSource, /id: 'agot-locations'/)
})
