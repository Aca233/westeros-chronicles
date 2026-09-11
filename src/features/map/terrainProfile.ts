export const TERRAIN_ENTER_ZOOM = 3.25
export const TERRAIN_EXIT_ZOOM = 3.05
export const TERRAIN_TRANSITION_START = 3.2
export const TERRAIN_TRANSITION_END = 4.8
export const TERRAIN_MAX_PITCH = 55

// The cropped AGOT map is projected across a complete WebMercator world, so
// one DEM pixel spans several kilometres. Real-world 1x elevations become
// sub-pixel relief at our playable zooms; CK3-style terrain therefore needs a
// deliberately stylised vertical scale to remain legible.
export const TERRAIN_VISUAL_SCALE = 32

const TERRAIN_PROFILE = { pitch: 40, exaggeration: TERRAIN_VISUAL_SCALE } as const

export interface TerrainProfileInput {
  zoom: number
  topDownLocked: boolean
  available: boolean
  terrainWasEnabled: boolean
}

export interface TerrainCameraProfile {
  terrainEnabled: boolean
  pitch: number
  maxPitch: number
  terrainExaggeration: number
  rotationEnabled: boolean
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
}

export function terrainCameraProfile(input: TerrainProfileInput): TerrainCameraProfile {
  const allowed = input.available && !input.topDownLocked
  const threshold = input.terrainWasEnabled ? TERRAIN_EXIT_ZOOM : TERRAIN_ENTER_ZOOM
  const terrainEnabled = allowed && input.zoom >= threshold
  const progress = allowed
    ? smoothstep((input.zoom - TERRAIN_TRANSITION_START) / (TERRAIN_TRANSITION_END - TERRAIN_TRANSITION_START))
    : 0
  return {
    terrainEnabled,
    pitch: Math.round(TERRAIN_PROFILE.pitch * progress * 100) / 100,
    maxPitch: TERRAIN_PROFILE.pitch,
    terrainExaggeration: TERRAIN_PROFILE.exaggeration,
    rotationEnabled: terrainEnabled,
  }
}

export type TerrainAnimationKind = 'automatic' | 'reset' | 'search'

export function terrainCameraAnimation(
  reducedMotion: boolean,
  kind: TerrainAnimationKind,
): { duration: number; essential: boolean } {
  if (reducedMotion) return { duration: 0, essential: false }
  const duration = kind === 'search' ? 850 : kind === 'reset' ? 360 : 180
  return { duration, essential: true }
}
