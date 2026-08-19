import { sameWorldLocation } from '../locationResolver'
import { assertRoutePlanStartsAt } from './travelCommands'
import type { ActiveJourney, AtomicWorldPatch, JourneyWorldState } from './types'

const EPSILON = 0.000001

function cloneJourney(journey: ActiveJourney): ActiveJourney {
  return structuredClone(journey)
}

function validateJourneyWorld(world: JourneyWorldState): void {
  const journey = world.journey
  if (!journey) return
  if (!Number.isInteger(journey.currentLeg) || journey.currentLeg < 0 || journey.currentLeg > journey.routePlan.legs.length) {
    throw new Error('旅行分段游标无效')
  }
  if (!Number.isFinite(journey.progressDays) || journey.progressDays < 0) throw new Error('旅行分段进度无效')
  assertRoutePlanStartsAt(journey.routePlan, journey.routePlan.from, world.knownLocationIds)
  const currentLeg = journey.routePlan.legs[journey.currentLeg]
  if (currentLeg && journey.progressDays >= currentLeg.days) throw new Error('旅行分段进度超过该段时长')

  for (const [instanceId, placement] of Object.entries(world.itemPlacements ?? {})) {
    if (placement.type === 'vehicle' && !world.vehicles[placement.vehicleId]) {
      throw new Error(`物品 ${instanceId} 引用了不存在的运输工具：${placement.vehicleId}`)
    }
  }

  for (const vehicleId of journey.vehicleIds) {
    const vehicle = world.vehicles[vehicleId]
    if (!vehicle) throw new Error(`随行运输工具不存在：${vehicleId}`)
    if (!sameWorldLocation(vehicle.location, world.playerLocation)) throw new Error(`随行运输工具不在当前位置：${vehicleId}`)
  }

  if (world.characters) {
    const characters = new Map(world.characters.map((character) => [character.id, character]))
    for (const companionId of journey.companions) {
      const companion = characters.get(companionId)
      if (!companion) throw new Error(`同行者不在当前人物状态中：${companionId}`)
      if (!companion.alive) throw new Error(`同行者已经死亡：${companionId}`)
      if (companion.locationId !== world.playerLocation.locationId) throw new Error(`同行者不在当前位置：${companionId}`)
    }
  }
}

export function advanceJourney(world: JourneyWorldState, elapsedDays: number): AtomicWorldPatch {
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) throw new Error('旅行推进时长必须是非负数')
  validateJourneyWorld(world)

  const original = world.journey
  const basePatch: AtomicWorldPatch = {
    journey: original ? cloneJourney(original) : undefined,
    playerLocation: { ...world.playerLocation },
    vehicleLocations: {},
    characterMoves: [],
    reachedLocationIds: [],
    elapsedDays: 0,
    changed: false,
  }
  if (!original) return basePatch

  const journey = cloneJourney(original)
  basePatch.journey = journey
  if (world.interruption && journey.status === 'travelling') {
    journey.status = 'interrupted'
    journey.interruptedBy = world.interruption
    basePatch.changed = true
    return basePatch
  }
  if (journey.status !== 'travelling' || elapsedDays <= EPSILON) return basePatch

  if (!journey.routePlan.legs.length || journey.currentLeg >= journey.routePlan.legs.length) {
    journey.status = 'arrived'
    journey.currentLeg = journey.routePlan.legs.length
    journey.progressDays = 0
    basePatch.changed = original.status !== 'arrived'
    return basePatch
  }

  let remaining = elapsedDays
  let locationId = world.playerLocation.locationId
  while (remaining > EPSILON && journey.currentLeg < journey.routePlan.legs.length) {
    const leg = journey.routePlan.legs[journey.currentLeg]
    if (leg.from !== locationId) throw new Error(`旅行当前节点与路线第 ${journey.currentLeg + 1} 段不一致`)
    const needed = leg.days - journey.progressDays
    const spent = Math.min(remaining, needed)
    journey.progressDays += spent
    basePatch.elapsedDays += spent
    remaining -= spent

    if (journey.progressDays + EPSILON < leg.days) break
    locationId = leg.to
    basePatch.reachedLocationIds.push(locationId)
    journey.currentLeg += 1
    journey.progressDays = 0
  }

  const arrived = journey.currentLeg >= journey.routePlan.legs.length
  journey.status = arrived ? 'arrived' : 'travelling'
  if (arrived) delete journey.interruptedBy

  const sceneLocation = arrived ? undefined : '行于道路途中'
  basePatch.playerLocation = { locationId, ...(sceneLocation ? { sceneLocation } : {}) }
  const reachedNode = locationId !== world.playerLocation.locationId
  if (basePatch.elapsedDays > EPSILON || reachedNode) {
    journey.vehicleIds.forEach((vehicleId) => {
      basePatch.vehicleLocations[vehicleId] = { locationId, ...(sceneLocation ? { sceneLocation } : {}) }
    })
    basePatch.characterMoves = journey.companions.map((characterId) => ({
      characterId,
      locationId,
      ...(sceneLocation ? { sceneLocation } : {}),
    }))
  }
  basePatch.changed = basePatch.elapsedDays > EPSILON || reachedNode || arrived !== (original.status === 'arrived')
  return basePatch
}
