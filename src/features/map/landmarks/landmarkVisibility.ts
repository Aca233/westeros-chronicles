import type { MapBounds } from '../types.ts'
import type { LandmarkLod, LandmarkModelRecord } from './landmarkSchemas.ts'

export type LandmarkCapability = 'unsupported' | 'low' | 'standard'

export interface LandmarkRequest {
  key: string
  landmark: LandmarkModelRecord
  lodLevel: 0 | 1
  lod: LandmarkLod
}

export function landmarkLodFor(zoom: number, capability: LandmarkCapability): 0 | 1 | null {
  if (capability === 'unsupported' || zoom < 4.60) return null
  if (capability === 'low' || zoom < 5.35) return 1
  return 0
}

export function retainedLimit(capability: LandmarkCapability): number {
  return capability === 'standard' ? 6 : capability === 'low' ? 2 : 0
}

export function landmarkCacheBytes(capability: LandmarkCapability): number {
  return capability === 'standard' ? 120 * 1024 * 1024 : capability === 'low' ? 12 * 1024 * 1024 : 0
}

function intersects(record: LandmarkModelRecord, bounds: MapBounds): boolean {
  const radius = record.bounds.radiusMapPixels
  const { mapX, mapY } = record.transform
  return mapX + radius >= bounds.minX && mapX - radius <= bounds.maxX
    && mapY + radius >= bounds.minY && mapY - radius <= bounds.maxY
}

export function visibleLandmarkRequests(
  records: readonly LandmarkModelRecord[],
  bounds: MapBounds,
  zoom: number,
  capability: LandmarkCapability,
): LandmarkRequest[] {
  const lodLevel = landmarkLodFor(zoom, capability)
  if (lodLevel === null) return []
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  return records
    .filter((record) => intersects(record, bounds))
    .sort((left, right) => {
      const leftDistance = (left.transform.mapX - centerX) ** 2 + (left.transform.mapY - centerY) ** 2
      const rightDistance = (right.transform.mapX - centerX) ** 2 + (right.transform.mapY - centerY) ** 2
      return leftDistance - rightDistance || left.id.localeCompare(right.id)
    })
    .slice(0, retainedLimit(capability))
    .map((landmark) => {
      const lod = landmark.lods[lodLevel]
      return { key: `${landmark.id}:lod${lodLevel}`, landmark, lodLevel, lod }
    })
}
