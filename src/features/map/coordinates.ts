import type { MapManifest, MapPixelPoint } from './types'

export type MapLibreLngLat = readonly [longitude: number, latitude: number]

const MAX_MERCATOR_LATITUDE = 85.05112878

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

export function mapPixelToLngLat(
  point: MapPixelPoint,
  manifest: Pick<MapManifest, 'westerosBounds'>,
): [number, number] {
  const { minX, minY, maxX, maxY } = manifest.westerosBounds
  const mapX = clamp(point.mapX, minX, maxX)
  const mapY = clamp(point.mapY, minY, maxY)
  const normalizedX = (mapX - minX) / (maxX - minX)
  const normalizedY = (mapY - minY) / (maxY - minY)
  return [
    -180 + normalizedX * 360,
    MAX_MERCATOR_LATITUDE - normalizedY * MAX_MERCATOR_LATITUDE * 2,
  ]
}

export function lngLatToMapPixel(
  lngLat: MapLibreLngLat,
  manifest: Pick<MapManifest, 'westerosBounds'>,
): MapPixelPoint {
  const { minX, minY, maxX, maxY } = manifest.westerosBounds
  const longitude = clamp(lngLat[0], -180, 180)
  const latitude = clamp(lngLat[1], -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const normalizedX = (longitude + 180) / 360
  const normalizedY = (MAX_MERCATOR_LATITUDE - latitude) / (MAX_MERCATOR_LATITUDE * 2)
  return {
    mapX: minX + normalizedX * (maxX - minX),
    mapY: minY + normalizedY * (maxY - minY),
  }
}
