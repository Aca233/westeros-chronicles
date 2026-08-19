import type { MapMode } from './mapLayers.ts'
import { terrainCameraAnimation, terrainCameraProfile } from './terrainProfile.ts'

export interface TerrainMapAdapter {
  getZoom(): number
  getSource(id: string): unknown
  setTerrain(value: { source: string; exaggeration: number } | null): void
  setPitch(value: number): void
  setBearing(value: number): void
  easeTo(value: { pitch: number; bearing: number; duration: number; essential: boolean }): void
  dragRotate: { enable(): void; disable(): void }
  touchZoomRotate: { enableRotation(): void; disableRotation(): void }
  touchPitch: { enable(): void; disable(): void }
}

export interface TerrainSyncInput {
  mode: MapMode
  topDownLocked: boolean
  reducedMotion: boolean
}

export interface TerrainController {
  requestSync(input: TerrainSyncInput, forceRecommendedPitch?: boolean): void
  syncNow(input: TerrainSyncInput, forceRecommendedPitch?: boolean): void
  resetNorth(input: TerrainSyncInput): void
  disable(reason: string): void
  destroy(): void
  isAvailable(): boolean
}

interface TerrainControllerCallbacks {
  onUnavailable(reason: string): void
}

interface FrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(id: number): void
}

const frameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}

export function createTerrainController(
  map: TerrainMapAdapter,
  callbacks: TerrainControllerCallbacks,
  scheduler: FrameScheduler = frameScheduler,
): TerrainController {
  let available = true
  let terrainAttached = false
  let lastExaggeration: number | null = null
  let destroyed = false
  let pendingFrame: number | null = null
  let pendingInput: TerrainSyncInput | null = null
  let pendingForcePitch = false

  const setGestures = (enabled: boolean): void => {
    if (enabled) {
      map.dragRotate.enable()
      map.touchZoomRotate.enableRotation()
      map.touchPitch.enable()
    } else {
      map.dragRotate.disable()
      map.touchZoomRotate.disableRotation()
      map.touchPitch.disable()
    }
  }

  const disable = (reason: string): void => {
    if (destroyed || !available) return
    available = false
    if (pendingFrame !== null) {
      scheduler.cancel(pendingFrame)
      pendingFrame = null
    }
    try {
      map.setTerrain(null)
    } catch {
      // The map remains usable as a flat raster even if terrain detachment fails.
    }
    terrainAttached = false
    lastExaggeration = null
    map.setPitch(0)
    map.setBearing(0)
    setGestures(false)
    callbacks.onUnavailable(reason)
  }

  const syncNow = (input: TerrainSyncInput, forceRecommendedPitch = false): void => {
    if (destroyed) return
    const profile = terrainCameraProfile({
      zoom: map.getZoom(),
      mode: input.mode,
      topDownLocked: input.topDownLocked,
      available,
      terrainWasEnabled: terrainAttached,
    })

    if (profile.terrainEnabled) {
      let source: unknown
      try {
        source = map.getSource('agot-dem')
      } catch {
        disable('DEM 地形资料无法读取')
        return
      }
      if (!source) {
        disable('DEM 地形资料不存在')
        return
      }
      if (!terrainAttached || lastExaggeration !== profile.terrainExaggeration) {
        try {
          map.setTerrain({ source: 'agot-dem', exaggeration: profile.terrainExaggeration })
        } catch {
          disable('三维地形无法启用')
          return
        }
        terrainAttached = true
        lastExaggeration = profile.terrainExaggeration
      }
    } else if (terrainAttached) {
      try {
        map.setTerrain(null)
      } catch {
        disable('三维地形无法关闭')
        return
      }
      terrainAttached = false
      lastExaggeration = null
    }

    setGestures(profile.rotationEnabled)
    if (!profile.rotationEnabled) {
      map.setPitch(0)
      map.setBearing(0)
    } else if (forceRecommendedPitch) {
      map.setPitch(profile.pitch)
    }
  }

  const requestSync = (input: TerrainSyncInput, forceRecommendedPitch = false): void => {
    if (destroyed) return
    pendingInput = input
    pendingForcePitch ||= forceRecommendedPitch
    if (pendingFrame !== null) return
    pendingFrame = scheduler.request(() => {
      pendingFrame = null
      const latestInput = pendingInput
      const forcePitch = pendingForcePitch
      pendingInput = null
      pendingForcePitch = false
      if (latestInput) syncNow(latestInput, forcePitch)
    })
  }

  const resetNorth = (input: TerrainSyncInput): void => {
    if (destroyed) return
    const profile = terrainCameraProfile({
      zoom: map.getZoom(),
      mode: input.mode,
      topDownLocked: input.topDownLocked,
      available,
      terrainWasEnabled: terrainAttached,
    })
    map.easeTo({
      pitch: profile.pitch,
      bearing: 0,
      ...terrainCameraAnimation(input.reducedMotion, 'reset'),
    })
  }

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    if (pendingFrame !== null) scheduler.cancel(pendingFrame)
    pendingFrame = null
    pendingInput = null
  }

  return {
    requestSync,
    syncNow,
    resetNorth,
    disable,
    destroy,
    isAvailable: () => available,
  }
}
