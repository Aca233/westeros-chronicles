import type { MapMode } from './mapLayers.ts'

export const TERRAIN_ENTER_ZOOM = 3.25
export const TERRAIN_EXIT_ZOOM = 3.05
export const TERRAIN_TRANSITION_START = 3.2
export const TERRAIN_TRANSITION_END = 4.8
export const TERRAIN_MAX_PITCH = 55

const MODE_PROFILE: Record<MapMode, { pitch: number; exaggeration: number }> = {
  terrain: { pitch: 52, exaggeration: 0.9 },
  political: { pitch: 42, exaggeration: 0.78 },
  characters: { pitch: 34, exaggeration: 0.65 },
  travel: { pitch: 34, exaggeration: 0.65 },
  assets: { pitch: 34, exaggeration: 0.65 },
}

export interface TerrainProfileInput {
  zoom: number
  mode: MapMode
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
  const mode = MODE_PROFILE[input.mode]
  const allowed = input.available && !input.topDownLocked
  const threshold = input.terrainWasEnabled ? TERRAIN_EXIT_ZOOM : TERRAIN_ENTER_ZOOM
  const terrainEnabled = allowed && input.zoom >= threshold
  const progress = allowed
    ? smoothstep((input.zoom - TERRAIN_TRANSITION_START) / (TERRAIN_TRANSITION_END - TERRAIN_TRANSITION_START))
    : 0
  return {
    terrainEnabled,
    pitch: Math.round(mode.pitch * progress * 100) / 100,
    maxPitch: mode.pitch,
    terrainExaggeration: mode.exaggeration,
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
