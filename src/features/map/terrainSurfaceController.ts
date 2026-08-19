import {
  FAR_MAP_LAYER,
  MATERIAL_TERRAIN_LAYER,
  MATERIAL_TERRAIN_SOURCE,
} from './mapLayers.ts'
import { TERRAIN_ENTER_ZOOM, TERRAIN_EXIT_ZOOM } from './terrainProfile.ts'

export interface TerrainSurfaceMapAdapter {
  isSourceLoaded(sourceId: string): boolean
  setPaintProperty(layerId: string, property: string, value: number): void
}

export interface FrameScheduler {
  request(callback: () => void): number
  cancel(id: number): void
}

export interface TerrainSurfaceController {
  requestSync(zoom: number): void
  syncNow(zoom: number): void
  handleSourceData(sourceId: string): void
  disable(reason: string): void
  destroy(): void
  isAvailable(): boolean
  isNear(): boolean
}

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
}

export function createTerrainSurfaceController(
  map: TerrainSurfaceMapAdapter,
  callbacks: { onUnavailable(reason: string): void },
  scheduler: FrameScheduler = browserFrameScheduler,
): TerrainSurfaceController {
  let nearRequested = false
  let nearVisible = false
  let available = true
  let destroyed = false
  let scheduledFrame: number | null = null
  let pendingZoom = 0

  function sourceReady(): boolean {
    try {
      return map.isSourceLoaded(MATERIAL_TERRAIN_SOURCE)
    } catch {
      return false
    }
  }

  function showNear(): void {
    if (nearVisible || !available || !sourceReady()) return
    map.setPaintProperty(MATERIAL_TERRAIN_LAYER, 'raster-opacity', 1)
    map.setPaintProperty(FAR_MAP_LAYER, 'raster-opacity', 0)
    nearVisible = true
  }

  function showFar(): void {
    if (!nearVisible) return
    map.setPaintProperty(FAR_MAP_LAYER, 'raster-opacity', 1)
    map.setPaintProperty(MATERIAL_TERRAIN_LAYER, 'raster-opacity', 0)
    nearVisible = false
  }

  function syncNow(zoom: number): void {
    if (destroyed || !available) return
    nearRequested = nearRequested ? zoom >= TERRAIN_EXIT_ZOOM : zoom >= TERRAIN_ENTER_ZOOM
    if (!nearRequested) {
      showFar()
      return
    }
    showNear()
  }

  function requestSync(zoom: number): void {
    if (destroyed || !available) return
    pendingZoom = zoom
    if (scheduledFrame !== null) return
    scheduledFrame = scheduler.request(() => {
      scheduledFrame = null
      syncNow(pendingZoom)
    })
  }

  function handleSourceData(sourceId: string): void {
    if (destroyed || !available || sourceId !== MATERIAL_TERRAIN_SOURCE || !nearRequested) return
    showNear()
  }

  function disable(reason: string): void {
    if (destroyed || !available) return
    available = false
    nearRequested = false
    if (scheduledFrame !== null) {
      scheduler.cancel(scheduledFrame)
      scheduledFrame = null
    }
    map.setPaintProperty(FAR_MAP_LAYER, 'raster-opacity', 1)
    map.setPaintProperty(MATERIAL_TERRAIN_LAYER, 'raster-opacity', 0)
    nearVisible = false
    callbacks.onUnavailable(reason)
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    if (scheduledFrame !== null) {
      scheduler.cancel(scheduledFrame)
      scheduledFrame = null
    }
  }

  return {
    requestSync,
    syncNow,
    handleSourceData,
    disable,
    destroy,
    isAvailable: () => available,
    isNear: () => nearVisible,
  }
}
