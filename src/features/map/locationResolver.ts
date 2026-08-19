import type { MapLocation, WorldLocationRef } from './types'

export const UNKNOWN_WESTEROS_LOCATION_ID = 'b_unknown_westeros'

export interface WorldLocationRepository {
  getLocation(id: string): Promise<Pick<MapLocation, 'name'>>
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
