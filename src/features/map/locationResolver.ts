import type { MapLocation, MapLocationSearchEntry, WorldLocationRef } from './types'

export const UNKNOWN_WESTEROS_LOCATION_ID = 'b_unknown_westeros'

export interface WorldLocationRepository {
  getLocation(id: string): Promise<Pick<MapLocation, 'name'>>
}

export interface LocationLookupContext {
  locations: readonly MapLocationSearchEntry[]
  currentLocation?: WorldLocationRef
  aliasesByLocationId?: ReadonlyMap<string, readonly string[]>
  countyIdByLocationId?: ReadonlyMap<string, string>
  neighboringCountyIds?: ReadonlySet<string>
}

export interface LocationLookupInput {
  targetId?: string
  targetText?: string
}

export function createWorldLocationRef(locationId: string, sceneLocation?: string): WorldLocationRef {
  const normalizedId = locationId.trim()
  if (!/^b_[a-z0-9][a-z0-9_]*$/i.test(normalizedId)) {
    throw new Error(`地点 ID 不合法：${locationId}`)
  }
  const normalizedScene = sceneLocation?.trim()
  return {
    locationId: normalizedId,
    ...(normalizedScene ? { sceneLocation: normalizedScene } : {}),
  }
}

export function validateWorldLocationRef(value: unknown, knownLocationIds?: ReadonlySet<string>): value is WorldLocationRef {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'locationId' && key !== 'sceneLocation')) return false
  if (typeof record.locationId !== 'string' || !/^b_[a-z0-9][a-z0-9_]*$/i.test(record.locationId)) return false
  if (record.sceneLocation !== undefined && (typeof record.sceneLocation !== 'string' || !record.sceneLocation.trim())) return false
  return !knownLocationIds || knownLocationIds.has(record.locationId)
}

export function sameWorldLocation(left: WorldLocationRef, right: WorldLocationRef): boolean {
  return left.locationId === right.locationId
}

export function normalizeLocationLookupText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

function contextualLocationRank(entry: MapLocationSearchEntry, context: LocationLookupContext): number {
  const countyIds = context.countyIdByLocationId
  const currentId = context.currentLocation?.locationId
  if (!countyIds || !currentId) return 0
  const currentCountyId = countyIds.get(currentId)
  const candidateCountyId = countyIds.get(entry.id)
  if (!currentCountyId || !candidateCountyId) return 0
  if (candidateCountyId === currentCountyId) return 2
  return context.neighboringCountyIds?.has(candidateCountyId) ? 1 : 0
}

function exactLocationNames(entry: MapLocationSearchEntry, context: LocationLookupContext): string[] {
  return [
    entry.name,
    entry.englishName ?? '',
    ...(context.aliasesByLocationId?.get(entry.id) ?? []),
  ].map(normalizeLocationLookupText).filter(Boolean)
}

export function resolveUniqueLocationEntry(
  input: LocationLookupInput,
  context: LocationLookupContext,
): MapLocationSearchEntry {
  const targetId = typeof input.targetId === 'string' ? normalizeLocationLookupText(input.targetId) : ''
  const targetText = typeof input.targetText === 'string' ? normalizeLocationLookupText(input.targetText) : ''

  if (targetId) {
    const direct = context.locations.find((entry) => normalizeLocationLookupText(entry.id) === targetId)
    if (!direct) throw new Error(`地点不存在：${input.targetId}`)
    return direct
  }
  if (!targetText) throw new Error('地点意图缺少目标地点')

  const direct = context.locations.find((entry) => normalizeLocationLookupText(entry.id) === targetText)
  if (direct) return direct

  const matches = context.locations.filter((entry) => exactLocationNames(entry, context).includes(targetText))
  if (!matches.length) throw new Error(`地点无法解析：${input.targetText}`)
  if (matches.length === 1) return matches[0]

  const ranked = matches.map((entry) => ({ entry, rank: contextualLocationRank(entry, context) }))
  const highestRank = Math.max(...ranked.map(({ rank }) => rank))
  const finalists = ranked.filter(({ rank }) => rank === highestRank).map(({ entry }) => entry)
  if (finalists.length !== 1) {
    throw new Error(`地点无法唯一解析：${input.targetText}`)
  }
  return finalists[0]
}

export function fallbackLocationLabel(ref: WorldLocationRef): string {
  const location = ref.locationId === UNKNOWN_WESTEROS_LOCATION_ID ? '所在地未查明' : ref.locationId
  return ref.sceneLocation ? `${location} · ${ref.sceneLocation}` : location
}

export async function resolveLocationLabel(
  ref: WorldLocationRef,
  repository: WorldLocationRepository,
): Promise<string> {
  if (ref.locationId === UNKNOWN_WESTEROS_LOCATION_ID) return fallbackLocationLabel(ref)
  const location = await repository.getLocation(ref.locationId)
  return ref.sceneLocation ? `${location.name} · ${ref.sceneLocation}` : location.name
}
