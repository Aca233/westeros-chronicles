import maplibregl, { type MercatorCoordinate } from 'maplibre-gl'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { mapPixelToLngLat } from '../coordinates.ts'
import { TERRAIN_VISUAL_SCALE } from '../terrainProfile.ts'
import type { MapManifest } from '../types.ts'
import type { LandmarkModelRecord } from './landmarkSchemas.ts'

// PDX uses X east, Y up and Z north, while WebMercator Y grows south.
// Negating source Z preserves handedness; a plain Y/Z swap would mirror faces
// and make back-face culling present otherwise solid buildings as flat sheets.
const MODEL_TO_MAP_BASIS = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
)

export function landmarkAnchor(
  record: LandmarkModelRecord,
  manifest: Pick<MapManifest, 'westerosBounds'>,
  terrainScale = TERRAIN_VISUAL_SCALE,
): MercatorCoordinate {
  return maplibregl.MercatorCoordinate.fromLngLat(
    mapPixelToLngLat(record.transform, manifest),
    record.transform.elevationMeters * terrainScale,
  )
}

export function landmarkModelMatrix(
  record: LandmarkModelRecord,
  manifest: Pick<MapManifest, 'westerosBounds'>,
  terrainScale = TERRAIN_VISUAL_SCALE,
): Matrix4 {
  const anchor = landmarkAnchor(record, manifest, terrainScale)
  const mapWidth = manifest.westerosBounds.maxX - manifest.westerosBounds.minX
  const mapHeight = manifest.westerosBounds.maxY - manifest.westerosBounds.minY
  const quaternion = new Quaternion(...record.transform.rotation)
  const modelScale = new Vector3(...record.transform.scale)
  // Landmark mesh units come from CK3 map-object space, not real-world metres.
  // Keep the vertical model axis on the same visual scale as east/west while
  // using the crop height only for the horizontal north/south map axis.
  const mapUnits = new Matrix4().makeScale(
    1 / mapWidth,
    1 / mapHeight,
    1 / mapWidth,
  )
  return new Matrix4()
    .makeTranslation(anchor.x, anchor.y, anchor.z)
    .multiply(mapUnits)
    .multiply(MODEL_TO_MAP_BASIS)
    .multiply(new Matrix4().makeRotationFromQuaternion(quaternion))
    .scale(modelScale)
}
