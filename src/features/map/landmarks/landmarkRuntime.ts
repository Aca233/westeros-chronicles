import type { Map as MapLibreMap } from 'maplibre-gl'

import { lngLatToMapPixel } from '../coordinates.ts'
import { COUNTY_HIT_LAYER } from '../mapLayers.ts'
import type { MapBounds, MapManifest } from '../types.ts'
import {
  createLandmarkCustomLayer,
  LANDMARK_LAYER_ID,
  type LandmarkCustomLayer,
} from './landmarkCustomLayer.ts'
import { landmarkRepository } from './landmarkRepository.ts'
import {
  LandmarkResourceCache,
  type LandmarkResourceCacheOptions,
} from './landmarkResourceCache.ts'
import type { LandmarkModelManifest } from './landmarkSchemas.ts'
import { landmarkModelMatrix } from './landmarkTransform.ts'
import {
  landmarkLightingProfile,
  type LandmarkLightingProfile,
} from './landmarkLightingProfile.ts'
import {
  landmarkCacheBytes,
  type LandmarkCapability,
  type LandmarkRequest,
  visibleLandmarkRequests,
} from './landmarkVisibility.ts'

export type LandmarkSyncReason = 'manifest-ready' | 'moveend' | 'zoomend'

export interface LandmarkRuntime {
  sync(reason: LandmarkSyncReason): void
  destroy(): void
  whenIdle(): Promise<void>
  syncReasons(): readonly LandmarkSyncReason[]
}

interface HardwareProfile {
  hardwareConcurrency?: number
  deviceMemory?: number
}

interface RuntimeCache {
  reconcile(desiredKeys: ReadonlySet<string>): void
  request(request: LandmarkRequest): Promise<{ key: string; object: import('three').Object3D }>
  clear(): void
}

export interface LandmarkRuntimeOptions {
  signal?: AbortSignal
  manifestLoader?: (signal?: AbortSignal) => Promise<LandmarkModelManifest>
  layerFactory?: (profile: LandmarkLightingProfile) => LandmarkCustomLayer
  cacheFactory?: (options: LandmarkResourceCacheOptions) => RuntimeCache
  hardware?: HardwareProfile
  onWarning?: (message: string) => void
}

function runtimeViewportBounds(
  map: Pick<MapLibreMap, 'getBounds'>,
  manifest: Pick<MapManifest, 'westerosBounds'>,
): MapBounds {
  const bounds = map.getBounds()
  const first = lngLatToMapPixel([bounds.getWest(), bounds.getNorth()], manifest)
  const second = lngLatToMapPixel([bounds.getEast(), bounds.getSouth()], manifest)
  return {
    minX: Math.min(first.mapX, second.mapX),
    minY: Math.min(first.mapY, second.mapY),
    maxX: Math.max(first.mapX, second.mapX),
    maxY: Math.max(first.mapY, second.mapY),
  }
}

function browserHardware(): HardwareProfile {
  if (typeof navigator === 'undefined') return {}
  const value = navigator as Navigator & { deviceMemory?: number }
  return {
    hardwareConcurrency: value.hardwareConcurrency,
    deviceMemory: value.deviceMemory,
  }
}

function classifyCapability(layer: LandmarkCustomLayer, hardware: HardwareProfile): LandmarkCapability {
  if (layer.capability() !== 'webgl2') return 'unsupported'
  if ((hardware.hardwareConcurrency ?? Infinity) <= 4) return 'low'
  if (hardware.deviceMemory !== undefined && hardware.deviceMemory < 4) return 'low'
  return 'standard'
}

class ActiveLandmarkRuntime implements LandmarkRuntime {
  private readonly attached = new Set<string>()
  private readonly pending = new Set<Promise<void>>()
  private readonly reasons: LandmarkSyncReason[] = []
  private readonly failures = new Set<string>()
  private readonly map: MapLibreMap
  private readonly mapManifest: Pick<MapManifest, 'westerosBounds'>
  private readonly modelManifest: LandmarkModelManifest
  private readonly layer: LandmarkCustomLayer
  private readonly cache: RuntimeCache
  private readonly capability: LandmarkCapability
  private readonly lightingProfile: LandmarkLightingProfile
  private readonly onWarning?: (message: string) => void
  private desired = new Set<string>()
  private generation = 0
  private destroyed = false
  private warnedFailures = ''

  constructor(
    map: MapLibreMap,
    mapManifest: Pick<MapManifest, 'westerosBounds'>,
    modelManifest: LandmarkModelManifest,
    layer: LandmarkCustomLayer,
    cache: RuntimeCache,
    capability: LandmarkCapability,
    lightingProfile: LandmarkLightingProfile,
    onWarning?: (message: string) => void,
  ) {
    this.map = map
    this.mapManifest = mapManifest
    this.modelManifest = modelManifest
    this.layer = layer
    this.cache = cache
    this.capability = capability
    this.lightingProfile = lightingProfile
    this.onWarning = onWarning
  }

  sync(reason: LandmarkSyncReason): void {
    if (this.destroyed) return
    this.reasons.push(reason)
    if (this.reasons.length > 32) this.reasons.shift()
    const requests = visibleLandmarkRequests(
      this.modelManifest.landmarks,
      runtimeViewportBounds(this.map, this.mapManifest),
      this.map.getZoom(),
      this.capability,
    )
    this.layer.setShadowObjects(
      requests.slice(0, this.lightingProfile.realtimeShadowLimit).map(({ key }) => key),
    )
    const desired = new Set(requests.map((request) => request.key))
    const generation = ++this.generation
    this.desired = desired
    this.cache.reconcile(desired)
    for (const key of this.attached) {
      if (desired.has(key)) continue
      this.layer.removeObject(key)
      this.attached.delete(key)
    }
    for (const request of requests) {
      if (this.attached.has(request.key)) continue
      const task = this.attach(request, generation)
      this.pending.add(task)
      void task.finally(() => this.pending.delete(task))
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.generation += 1
    this.desired.clear()
    this.cache.reconcile(this.desired)
    this.layer.setShadowObjects([])
    this.layer.clearObjects()
    this.attached.clear()
    this.cache.clear()
    if (this.map.getLayer(LANDMARK_LAYER_ID)) this.map.removeLayer(LANDMARK_LAYER_ID)
  }

  async whenIdle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending])
  }

  syncReasons(): readonly LandmarkSyncReason[] {
    return [...this.reasons]
  }

  private async attach(request: LandmarkRequest, generation: number): Promise<void> {
    try {
      const resource = await this.cache.request(request)
      if (this.destroyed || generation !== this.generation || !this.desired.has(request.key)) return
      this.layer.setObject(
        request.key,
        resource.object,
        landmarkModelMatrix(request.landmark, this.mapManifest),
      )
      this.attached.add(request.key)
    } catch (error) {
      if (this.destroyed || (error instanceof DOMException && error.name === 'AbortError')) return
      this.failures.add(request.landmark.id)
      this.reportFailures(error)
    }
  }

  private reportFailures(error: unknown): void {
    const ids = [...this.failures].sort()
    const signature = ids.join(',')
    if (signature === this.warnedFailures) return
    this.warnedFailures = signature
    const message = `三维地标载入失败（${ids.join('、')}），二维地点仍可正常使用`
    console.warn('[Landmarks]', message, error)
    this.onWarning?.(message)
  }
}

export async function createLandmarkRuntime(
  map: MapLibreMap,
  mapManifest: Pick<MapManifest, 'westerosBounds'>,
  options: LandmarkRuntimeOptions = {},
): Promise<LandmarkRuntime> {
  // The repository promise is shared across map instances; cancel only this
  // consumer, never another instance's manifest request.
  const modelManifest = await (options.manifestLoader
    ? options.manifestLoader(options.signal)
    : landmarkRepository.loadManifest())
  options.signal?.throwIfAborted()
  const hardware = options.hardware ?? browserHardware()
  const lightingProfile = landmarkLightingProfile(hardware)
  const layer = options.layerFactory?.(lightingProfile) ?? createLandmarkCustomLayer({
    lightingProfile,
    onWarning: (message) => {
      console.warn('[Landmarks]', message)
      options.onWarning?.(message)
    },
  })
  if (!map.getLayer(LANDMARK_LAYER_ID)) map.addLayer(layer, COUNTY_HIT_LAYER)
  const capability = classifyCapability(layer, hardware)
  const cacheOptions: LandmarkResourceCacheOptions = {
    maxConcurrent: 2,
    maxBytes: landmarkCacheBytes(capability),
  }
  const cache = options.cacheFactory?.(cacheOptions) ?? new LandmarkResourceCache(cacheOptions)
  const runtime = new ActiveLandmarkRuntime(
    map,
    mapManifest,
    modelManifest,
    layer,
    cache,
    capability,
    lightingProfile,
    options.onWarning,
  )
  runtime.sync('manifest-ready')
  return runtime
}
