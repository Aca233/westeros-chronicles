import assert from 'node:assert/strict'

import { createDefaultBody } from '../src/types/game.ts'
import { createItemCatalog } from '../src/features/items/catalog.ts'
import { migrateGameStateToCurrent } from '../src/features/items/saveVersion.ts'
import { physicalHandForEquipmentPosition } from '../src/features/items/equipment.ts'
import {
  advanceCharacterHealth,
  applyHealthHit,
  applyInjuryTreatment,
  validateHeldEquipmentAgainstHealth,
} from '../src/features/health/engine.ts'
import {
  createHealthyCharacterHealthState,
  deriveHealthCapabilities,
  migrateLegacyBodyToHealth,
} from '../src/features/health/state.ts'
import { visibleCharacterHealth } from '../src/features/health/visibility.ts'
import { deriveHealthCheckEffects } from '../src/features/health/checkEffects.ts'
import { performD20Check } from '../src/services/diceEngine.ts'
import { aggregateSelectedTraitEffects, calculateFinalAttributes } from '../src/data/characterTraits.ts'
import { advanceGameMoment } from '../src/features/time/gameClock.ts'

const playerId = 'save:health-acceptance:player'
const npcId = 'agot:Health_Test_1'
const moment = { date: { year: 298, month: 6, day: 1 }, minuteOfDay: 8 * 60 }
const location = { locationId: 'b_health_test' }

const definitions = [
  {
    id: 'test.glove', name: '测试护手', description: '', roleplayText: '', category: 'armor', subcategory: 'glove', tags: ['armor'],
    image: { type: 'library', iconName: 'armor' }, material: 'steel', baseQuality: 'common', rarity: 'common', bulk: 'small',
    stackable: false, maxStack: 1, unique: false, equippable: true, allowedPositions: [{ group: 'accessories', index: 0 }], baseValue: 1,
    effects: [
      { kind: 'protection', zones: ['right_hand'], damageTags: ['slash'], value: 2, stackGroup: 'hand-plate-a', label: '手甲外层' },
      { kind: 'protection', zones: ['right_hand'], damageTags: ['slash'], value: 1, stackGroup: 'hand-plate-b', label: '手甲内层' },
    ],
  },
  {
    id: 'test.bandage', name: '测试绷带', description: '', roleplayText: '', category: 'medicine', subcategory: 'bandage', tags: ['medicine', 'bandage', 'injury'],
    image: { type: 'library', iconName: 'medicine' }, material: 'linen', baseQuality: 'common', rarity: 'common', bulk: 'tiny',
    stackable: true, maxStack: 12, unique: false, equippable: false, allowedPositions: [], baseValue: 1, effects: [],
  },
  {
    id: 'test.food', name: '测试口粮', description: '', roleplayText: '', category: 'supply', subcategory: 'food', tags: ['supply', 'food'],
    image: { type: 'library', iconName: 'supply' }, material: 'food', baseQuality: 'common', rarity: 'common', bulk: 'tiny',
    stackable: true, maxStack: 12, unique: false, equippable: false, allowedPositions: [], baseValue: 1, effects: [],
  },
  {
    id: 'test.water', name: '测试饮水', description: '', roleplayText: '', category: 'supply', subcategory: 'water', tags: ['supply', 'water'],
    image: { type: 'library', iconName: 'supply' }, material: 'water', baseQuality: 'common', rarity: 'common', bulk: 'tiny',
    stackable: true, maxStack: 12, unique: false, equippable: false, allowedPositions: [], baseValue: 1, effects: [],
  },
]
const catalog = createItemCatalog(definitions)

function instance(instanceId, definitionId, quantity = 1, durability = 100) {
  return { instanceId, definitionId, quantity, durability, quality: 'common', renown: 0, isHeirloom: false, history: [] }
}
function emptyItems() { return { schemaVersion: 1, instances: {}, placements: {}, sites: {}, vehicles: {} } }
function context(items, at = moment) { return { characterId: playerId, location, items, catalog, moment: at, attributes: { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 } } }

// 1. 精确左右手与惯用手：同一右手伤只在能力推导中出现一次，换到左手后不继承右手惩罚。
let handHealth = createHealthyCharacterHealthState(playerId, moment, 'right')
handHealth.injuries.push({
  id: 'injury:right-hand:disable', kind: 'disability', zone: 'right_hand', cause: '右手永久残缺', severity: 'critical', bleeding: 0, pain: 2, infection: 'none',
  createdAt: moment, treatment: { firstAid: true, definitive: true, immobilized: true, bleedingControlled: true },
  recovery: { stage: 'permanent', progress: 0, untreatedMinutes: 0, bleedingMinutes: 0 }, permanentEffect: 'one_hand',
})
const handCaps = deriveHealthCapabilities(handHealth)
assert.equal(physicalHandForEquipmentPosition({ group: 'mainhand' }, handHealth.dominantHand), 'right')
assert.equal(physicalHandForEquipmentPosition({ group: 'offhand' }, handHealth.dominantHand), 'left')
assert.ok(handCaps.right_grip.score < 25)
assert.equal(handCaps.left_grip.score, 100)
assert.equal(handCaps.right_grip.reasons.length, 1, '同一伤势不能在同一能力上重复计入')
assert.match(validateHeldEquipmentAgainstHealth(handHealth, 'mainhand', false) ?? '', /右手.*握持能力不足/)
assert.equal(validateHeldEquipmentAgainstHealth(handHealth, 'offhand', false), undefined, '换到左手应按左手能力校验')
assert.match(validateHeldEquipmentAgainstHealth(handHealth, 'offhand', true) ?? '', /双手协作能力不足/)

// 2. 护甲只结算一次：相同原始重伤，右手覆盖后降为轻伤；未覆盖胸部仍为重伤；同一护手耐久只扣一次。
const armorItems = emptyItems()
armorItems.instances.glove = instance('glove', 'test.glove')
armorItems.placements.glove = { type: 'equipped', position: { group: 'accessories', index: 0 } }
const baseHealth = createHealthyCharacterHealthState(playerId, moment)
const covered = applyHealthHit(baseHealth, { type: 'APPLY_HIT', zone: 'right_hand', injuryKind: 'cut_puncture', severity: 'heavy', cause: '测试斩击', damageTags: ['slash'] }, context(armorItems))
assert.equal(covered.health.injuries.length, 1)
assert.equal(covered.health.injuries[0].severity, 'minor')
assert.equal(covered.items.instances.glove.durability, 97, '同一次重伤攻击即使护具含多条防护效果，也只能扣一次护具耐久')
const uncovered = applyHealthHit(baseHealth, { type: 'APPLY_HIT', zone: 'chest', injuryKind: 'cut_puncture', severity: 'heavy', cause: '测试斩击', damageTags: ['slash'] }, context(armorItems))
assert.equal(uncovered.health.injuries[0].severity, 'heavy')
assert.equal(uncovered.items.instances.glove.durability, 100)

// 3. 包扎控制出血但不降伤；不可访问物资失败且原物品不扣。
const remoteItems = emptyItems()
remoteItems.instances.bandage = instance('bandage', 'test.bandage', 2)
remoteItems.placements.bandage = { type: 'site', siteId: 'remote-site' }
remoteItems.sites['remote-site'] = { id: 'remote-site', name: '远方医箱', type: 'room', location: { locationId: 'b_elsewhere' }, locationLabel: '远方', description: '', capacity: 10 }
assert.throws(() => applyInjuryTreatment(covered.health, { type: 'TREAT_INJURY', injuryId: covered.health.injuries[0].id, treatment: 'first_aid', supplyInstanceId: 'bandage' }, context(remoteItems)), /不可访问/)
assert.equal(remoteItems.instances.bandage.quantity, 2, '失败治疗不得扣物品')
const localItems = structuredClone(remoteItems)
localItems.sites['remote-site'].location = location
const bandaged = applyInjuryTreatment(covered.health, { type: 'TREAT_INJURY', injuryId: covered.health.injuries[0].id, treatment: 'first_aid', supplyInstanceId: 'bandage' }, context(localItems))
assert.equal(bandaged.health.injuries[0].severity, 'minor')
assert.equal(bandaged.health.injuries[0].treatment.bleedingControlled, true)
assert.equal(bandaged.items.instances.bandage.quantity, 1)

// 骨折急救不能代替固定；固定后仍保持原伤势等级。
const fracture = applyHealthHit(baseHealth, { type: 'APPLY_HIT', zone: 'left_leg', injuryKind: 'fracture', severity: 'heavy', cause: '坠落骨折', damageTags: ['blunt'] }, context(localItems))
const fractureAid = applyInjuryTreatment(fracture.health, { type: 'TREAT_INJURY', injuryId: fracture.health.injuries[0].id, treatment: 'first_aid', supplyInstanceId: 'bandage' }, context(localItems))
assert.equal(fractureAid.health.injuries[0].treatment.immobilized, false)
assert.equal(fractureAid.health.injuries[0].recovery.stage, 'acute')
const fractureFixed = applyInjuryTreatment(fractureAid.health, { type: 'TREAT_INJURY', injuryId: fractureAid.health.injuries[0].id, treatment: 'immobilize', supplyInstanceId: 'bandage' }, { ...context(fractureAid.items), items: fractureAid.items })
assert.equal(fractureFixed.health.injuries[0].treatment.immobilized, true)
assert.equal(fractureFixed.health.injuries[0].severity, 'heavy')

// 伤势只影响真正依赖该身体能力的行动；固定骨折不会凭空消除伤势惩罚。
const fractureTravel = deriveHealthCheckEffects(fractureFixed.health, '拖着伤腿徒步赶路', 'survival')
assert.equal(fractureTravel.modifier, -2)
assert.equal(fractureTravel.breakdown.length, 1)
assert.match(fractureTravel.breakdown[0].label, /左腿.*坠落骨折/)
const fractureDiplomacy = deriveHealthCheckEffects(fractureFixed.health, '坐在桌边与领主谈判', 'diplomacy')
assert.equal(fractureDiplomacy.modifier, 0, '腿伤不应污染坐着进行的外交检定')

// 同一处右手重伤同时影响握持与双手协调时，只能作为一处 injury 结算一次。
const duelHand = applyHealthHit(baseHealth, { type: 'APPLY_HIT', zone: 'right_hand', injuryKind: 'fracture', severity: 'heavy', cause: '右手骨折', damageTags: ['blunt'] }, context(emptyItems()))
const duelHandEffects = deriveHealthCheckEffects(duelHand.health, '双手持剑与敌人决斗', 'duel')
assert.equal(duelHandEffects.modifier, -2)
assert.equal(duelHandEffects.breakdown.length, 1)

// D20 总计必须真实包含身体修正，并保存可展示的身体明细。
const attrs = { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 }
const injuryCheck = performD20Check('拖着伤腿徒步赶路', attrs, emptyItems(), catalog, [], 'prowess', 10, 'survival', undefined, () => 0.45, undefined, fractureFixed.health)
assert.equal(injuryCheck.roll, 10)
assert.equal(injuryCheck.attributeModifier, 2)
assert.equal(injuryCheck.healthModifier, -2)
assert.equal(injuryCheck.total, 10)
assert.equal(injuryCheck.healthModifierBreakdown?.length, 1)

// 旧 wounded 摘要即使残留在存档 traitIds 中，也不能再修改六维或产生情境检定惩罚。
assert.deepEqual(calculateFinalAttributes(attrs, ['wounded_3']), attrs)
assert.equal(aggregateSelectedTraitEffects(['wounded_3']).checkModifiers.duel ?? 0, 0)

// 4. 连续赶路比睡眠休整更疲劳；自动吃喝只消耗实际随身补给；断水会提前中断。
const survivalItems = emptyItems()
survivalItems.instances.food = instance('food', 'test.food', 2)
survivalItems.instances.water = instance('water', 'test.water', 2)
survivalItems.placements.food = { type: 'carried' }
survivalItems.placements.water = { type: 'carried' }
let survivalHealth = createHealthyCharacterHealthState(playerId, moment)
survivalHealth.survival = { hunger: 44.9, thirst: 34.9, fatigue: 50 }
const walking = advanceCharacterHealth(survivalHealth, 360, 'walking', context(survivalItems), { autoConsume: true })
const sleeping = advanceCharacterHealth(survivalHealth, 360, 'resting', context(survivalItems), { autoConsume: true, sleep: true })
assert.ok(walking.health.survival.fatigue > 50)
assert.ok(sleeping.health.survival.fatigue < 50)
assert.ok(walking.items.instances.food?.quantity < 2 || walking.items.instances.water?.quantity < 2, '达到阈值时应实际消耗随身补给')
let dry = createHealthyCharacterHealthState(playerId, moment)
dry.survival.thirst = 91
const dryAdvance = advanceCharacterHealth(dry, 120, 'walking', context(emptyItems()), { autoConsume: true })
assert.equal(dryAdvance.interrupted, true)
assert.ok(dryAdvance.elapsedMinutes < 120)
assert.match(dryAdvance.interruptionReason ?? '', /缺水/)

// 5. 长时间推进与分段推进必须一致。
const deterministic = createHealthyCharacterHealthState(playerId, moment)
const long = advanceCharacterHealth(deterministic, 120, 'walking', context(emptyItems()), { autoConsume: false })
const first = advanceCharacterHealth(deterministic, 60, 'walking', context(emptyItems()), { autoConsume: false })
const secondMoment = advanceGameMoment(moment, 60)
const second = advanceCharacterHealth(first.health, 60, 'walking', context(first.items, secondMoment), { autoConsume: false })
assert.deepEqual(second.health.survival, long.health.survival)
assert.deepEqual(second.health.injuries, long.health.injuries)
assert.deepEqual(second.items, long.items)

// 6. 旧档双臂伤只迁移为一个“侧别未知”记录，不复制成左右两处；隐藏 NPC 伤病不会投影给玩家。
const legacyBody = createDefaultBody()
legacyBody.arms.level = 'heavy'
legacyBody.arms.wounds = ['旧档手臂骨折']
const migrated = migrateLegacyBodyToHealth(playerId, legacyBody, moment, { precision: 'day_only' })
assert.equal(migrated.injuries.filter((injury) => injury.zone === 'unknown_upper_limb').length, 1)
assert.equal(migrated.injuries.filter((injury) => injury.zone === 'left_arm' || injury.zone === 'right_arm').length, 0)
const migratedDisabilities = migrateLegacyBodyToHealth(playerId, createDefaultBody(), moment, { traitIds: ['one_legged', 'one_handed', 'one_eyed'] })
const migratedDisabilityCaps = deriveHealthCapabilities(migratedDisabilities)
assert.equal(migratedDisabilityCaps.walk.score, 10, '独腿应由身体系统限制移动')
assert.equal(migratedDisabilityCaps.two_hand_coordination.score, 10, '侧别未知的独臂应禁止正常双手协作')
assert.equal(migratedDisabilityCaps.left_grip.score, 100, '旧档不知道缺失哪只手时不得擅自废掉左手')
assert.equal(migratedDisabilityCaps.right_grip.score, 100, '旧档不知道缺失哪只手时不得擅自废掉右手')
assert.equal(migratedDisabilityCaps.sight.score, 60, '独眼应造成中等视觉限制而不是等同完全失明')
const hiddenNpc = createHealthyCharacterHealthState(npcId, moment)
hiddenNpc.injuries.push({ ...covered.health.injuries[0], id: 'npc:hidden', hiddenFromPlayer: true })
const visibleNpc = visibleCharacterHealth({ schemaVersion: 1, characters: { [npcId]: hiddenNpc } }, npcId, playerId)
assert.equal(visibleNpc?.injuries.length, 0)

const legacyV10 = {
  saveFormatVersion: 10,
  currentYear: 298,
  currentMonth: 6,
  currentDay: 1,
  worldCharacters: { runId: 'health-acceptance', datasetHash: 'test', revision: 0 },
  lord: { canonicalCharacterId: playerId, body: legacyBody, traitIds: [] },
}
const legacyRaw = JSON.stringify(legacyV10)
const migratedV11 = migrateGameStateToCurrent(legacyV10)
assert.equal(legacyV10.saveFormatVersion, 10, '迁移不得原地改写旧对象')
assert.equal(JSON.stringify(legacyV10), legacyRaw)
assert.equal(migratedV11.saveFormatVersion, 11)
assert.equal(migratedV11.currentMinute, 720)
assert.equal(migratedV11.currentTimePrecision, 'day_only')
assert.equal(migratedV11.health.characters[playerId].injuries.filter((injury) => injury.zone === 'unknown_upper_limb').length, 1)

// 7. 明确无防护的致命头部打击可以直接死亡。
const lethal = applyHealthHit(baseHealth, { type: 'APPLY_HIT', zone: 'head', injuryKind: 'blunt', severity: 'critical', cause: '致命头击', damageTags: ['blunt'] }, context(emptyItems()))
assert.equal(lethal.health.alive, false)
assert.match(lethal.health.deathReason ?? '', /致命头部创伤/)

console.log('health-equipment acceptance: PASS')
console.log(JSON.stringify({
  rightGrip: handCaps.right_grip.score,
  leftGrip: handCaps.left_grip.score,
  coveredSeverity: covered.health.injuries[0].severity,
  uncoveredSeverity: uncovered.health.injuries[0].severity,
  walkingFatigue: Number(walking.health.survival.fatigue.toFixed(2)),
  sleepingFatigue: Number(sleeping.health.survival.fatigue.toFixed(2)),
  dryInterruptedAtMinutes: dryAdvance.elapsedMinutes,
  migratedUnknownUpperLimb: migrated.injuries.filter((injury) => injury.zone === 'unknown_upper_limb').length,
  migratedSaveVersion: migratedV11.saveFormatVersion,
}, null, 2))
