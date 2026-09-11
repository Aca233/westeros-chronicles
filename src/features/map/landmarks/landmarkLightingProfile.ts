export const CINEMATIC_SUN_AZIMUTH_DEGREES = 310
export const CINEMATIC_SUN_ALTITUDE_DEGREES = 35

export type LandmarkLightingQuality = 'high' | 'medium' | 'low'

export interface LandmarkLightingHardware {
  hardwareConcurrency?: number
  deviceMemory?: number
}

export interface LandmarkLightingProfile {
  quality: LandmarkLightingQuality
  shadowMapSize: 0 | 1024 | 2048
  realtimeShadowLimit: 0 | 1 | 2
  sunColor: number
  sunIntensity: number
  skyColor: number
  groundColor: number
  hemisphereIntensity: number
  ambientColor: number
  ambientIntensity: number
  shadowIntensity: number
}

export function cinematicSunSourceDirection(): readonly [number, number, number] {
  const azimuth = CINEMATIC_SUN_AZIMUTH_DEGREES * Math.PI / 180
  const altitude = CINEMATIC_SUN_ALTITUDE_DEGREES * Math.PI / 180
  const horizontal = Math.cos(altitude)
  return [
    Math.sin(azimuth) * horizontal,
    -Math.cos(azimuth) * horizontal,
    Math.sin(altitude),
  ]
}

export function landmarkLightingProfile(
  hardware: LandmarkLightingHardware,
): LandmarkLightingProfile {
  const low = (hardware.hardwareConcurrency ?? Infinity) <= 4
    || (hardware.deviceMemory !== undefined && hardware.deviceMemory < 4)
  // CPU count and system RAM do not identify GPU capability. Default to one
  // modest shadow map; retain the sunlight and contact shadows on every tier.
  const quality: LandmarkLightingQuality = low ? 'low' : 'medium'
  return {
    quality,
    shadowMapSize: quality === 'medium' ? 1024 : 0,
    realtimeShadowLimit: quality === 'medium' ? 1 : 0,
    sunColor: 0xffe3c2,
    sunIntensity: 2.45,
    skyColor: 0xc9d7e6,
    groundColor: 0x625548,
    hemisphereIntensity: 0.46,
    ambientColor: 0xe8e1d5,
    ambientIntensity: 0.17,
    shadowIntensity: 0.24,
  }
}
