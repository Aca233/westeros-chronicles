import {
  FAR_MAP_LAYER,
  MATERIAL_TERRAIN_LAYER,
  MATERIAL_TERRAIN_SOURCE,
} from './mapLayers.ts'
import { TERRAIN_ENTER_ZOOM, TERRAIN_EXIT_ZOOM } from './terrainProfile.ts'

export interface TerrainSurfaceMapAdapter {
  isSourceLoaded(sourceId: string): boolean
  setPaintProperty(layerId: string, property: string, value: number): void
  setLayoutProperty(layerId: string, property: 'visibility', value: 'visible' | 'none'): void
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

export interface TerrainSurfaceErrorEventLike {
  sourceId?: string
  tile?: unknown
  error?: {
    name?: string
    message?: string
  }
}

export type TerrainSurfaceErrorDisposition = 'unrelated' | 'transient' | 'fatal'

export function classifyTerrainSurfaceError(event: TerrainSurfaceErrorEventLike): TerrainSurfaceErrorDisposition {
  if (event.sourceId !== MATERIAL_TERRAIN_SOURCE) return 'unrelated'

  const name = event.error?.name ?? ''
  const message = event.error?.message ?? ''
  if (/abort/i.test(name) || /\babort(?:ed|ing)?\b/i.test(message)) return 'transient'

  // Raster tile errors include the failed tile. Keep the source alive so the far-map layer can
  // show through under that one missing tile instead of permanently disabling all near detail.
  if (event.tile != null) return 'transient'

  // An error from this source without a tile is source-level and cannot recover by moving to a
  // different viewport tile, so only this class of failure permanently degrades to the far map.
  return 'fatal'
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
  let materialLayerVisible = false
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

  function setMaterialLayerVisible(visible: boolean): void {
    if (materialLayerVisible === visible) return
    map.setLayoutProperty(MATERIAL_TERRAIN_LAYER, 'visibility', visible ? 'visible' : 'none')
    materialLayerVisible = visible
  }

  function showNear(): void {
    if (nearVisible || !available || !sourceReady()) return
    setMaterialLayerVisible(true)
    // 远景保留在下方兜底:材质瓦片未就位的区域透出远景,而不是黑块
    map.setPaintProperty(MATERIAL_TERRAIN_LAYER, 'raster-opacity', 1)
    map.setPaintProperty(FAR_MAP_LAYER, 'raster-opacity', 1)
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
    setMaterialLayerVisible(zoom >= TERRAIN_EXIT_ZOOM)
    if (!nearRequested) {
      showFar()
      if (zoom < TERRAIN_EXIT_ZOOM) setMaterialLayerVisible(false)
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
    setMaterialLayerVisible(false)
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
