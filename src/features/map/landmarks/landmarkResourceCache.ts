import {
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  type Group,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { createLandmarkContactShadow, createLandmarkShadowReceiver } from './landmarkContactShadow.ts'
import type { LandmarkRequest } from './landmarkVisibility.ts'
import { landmarkTextureFill } from './landmarkMaterialProfile.ts'

export class LandmarkLoadError extends Error {
  readonly key: string
  readonly cause?: unknown

  constructor(key: string, cause?: unknown) {
    super(`三维地标模型载入失败：${key}`)
    this.name = 'LandmarkLoadError'
    this.key = key
    this.cause = cause
  }
}

export interface LoadedLandmarkResource {
  key: string
  object: Group
  bytes: number
  dispose(): void
}

export type LandmarkResourceLoader = (
  request: LandmarkRequest,
  signal: AbortSignal,
) => Promise<LoadedLandmarkResource>

interface PendingRequest {
  request: LandmarkRequest
  resolve: (resource: LoadedLandmarkResource) => void
  reject: (error: unknown) => void
}

interface InFlightRequest extends PendingRequest {
  abort: AbortController
}

export interface LandmarkResourceCacheOptions {
  maxConcurrent?: number
  maxBytes: number
  loader?: LandmarkResourceLoader
}

function materialTextures(material: Material): Texture[] {
  const values: Texture[] = []
  for (const value of Object.values(material)) if (value instanceof Texture) values.push(value)
  return values
}

export function configureLandmarkMaterial(material: Material, landmarkId?: string): void {
  material.side = DoubleSide
  material.shadowSide = FrontSide
  if (material instanceof MeshStandardMaterial) {
    material.metalness = 0
    material.roughness = 0.88
    material.aoMapIntensity = 0.18
    const textureFill = landmarkTextureFill(landmarkId, material.name)
    if (textureFill > 0 && material.map) {
      material.emissive.setHex(0xd8d2c6)
      material.emissiveMap = material.map
      material.emissiveIntensity = textureFill
    }
  }
  material.needsUpdate = true
}

export function configureLandmarkRenderable(node: Object3D, landmarkId?: string): void {
  if (!(node instanceof Mesh)) return
  node.castShadow = true
  node.receiveShadow = landmarkId !== 'harrenhal'
  const materials = Array.isArray(node.material) ? node.material : [node.material]
  for (const material of materials) configureLandmarkMaterial(material, landmarkId)
}

export function disposeObject3D(object: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  object.traverse((node) => {
    const mesh = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] }
    if (mesh.geometry) geometries.add(mesh.geometry)
    const values = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of values) {
      materials.add(material)
      for (const texture of materialTextures(material)) textures.add(texture)
    }
  })
  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}

export function createGltfLandmarkLoader(): LandmarkResourceLoader {
  const loader = new GLTFLoader()
  return async (request, signal) => {
    try {
      const response = await fetch(request.lod.path, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const path = request.lod.path.slice(0, request.lod.path.lastIndexOf('/') + 1)
      const gltf = await loader.parseAsync(await response.arrayBuffer(), path)
      gltf.scene.traverse((node) => configureLandmarkRenderable(node, request.landmark.id))
      const contactShadow = createLandmarkContactShadow(gltf.scene)
      const shadowReceiver = createLandmarkShadowReceiver(gltf.scene)
      if (contactShadow) gltf.scene.add(contactShadow)
      if (shadowReceiver) gltf.scene.add(shadowReceiver)
      let disposed = false
      return {
        key: request.key,
        object: gltf.scene,
        bytes: request.lod.bytes,
        dispose() {
          if (disposed) return
          disposed = true
          disposeObject3D(gltf.scene)
        },
      }
    } catch (error) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      throw new LandmarkLoadError(request.key, error)
    }
  }
}

export class LandmarkResourceCache {
  private readonly maxConcurrent: number
  private readonly maxBytes: number
  private readonly loader: LandmarkResourceLoader
  private readonly ready = new Map<string, LoadedLandmarkResource>()
  private readonly touched = new Map<string, number>()
  private readonly inFlight = new Map<string, InFlightRequest>()
  private queue: PendingRequest[] = []
  private retained = new Set<string>()
  private clock = 0

  constructor(options: LandmarkResourceCacheOptions) {
    this.maxConcurrent = options.maxConcurrent ?? 2
    this.maxBytes = options.maxBytes
    this.loader = options.loader ?? createGltfLandmarkLoader()
  }

  get(key: string): LoadedLandmarkResource | undefined {
    const resource = this.ready.get(key)
    if (resource) this.touched.set(key, ++this.clock)
    return resource
  }

  request(request: LandmarkRequest): Promise<LoadedLandmarkResource> {
    const cached = this.get(request.key)
    if (cached) return Promise.resolve(cached)
    const active = this.inFlight.get(request.key)
    if (active) return new Promise((resolve, reject) => {
      active.resolve = ((previous) => (resource) => { previous(resource); resolve(resource) })(active.resolve)
      active.reject = ((previous) => (error) => { previous(error); reject(error) })(active.reject)
    })
    const queued = this.queue.find((item) => item.request.key === request.key)
    if (queued) return new Promise((resolve, reject) => {
      queued.resolve = ((previous) => (resource) => { previous(resource); resolve(resource) })(queued.resolve)
      queued.reject = ((previous) => (error) => { previous(error); reject(error) })(queued.reject)
    })
    const promise = new Promise<LoadedLandmarkResource>((resolve, reject) => {
      this.queue.push({ request, resolve, reject })
    })
    this.pump()
    return promise
  }

  reconcile(desiredKeys: ReadonlySet<string>): void {
    this.retained = new Set(desiredKeys)
    for (const [key, job] of this.inFlight) if (!desiredKeys.has(key)) job.abort.abort()
    const kept: PendingRequest[] = []
    for (const job of this.queue) {
      if (desiredKeys.has(job.request.key)) kept.push(job)
      else job.reject(new DOMException('Aborted', 'AbortError'))
    }
    this.queue = kept
    this.evictToBudget()
    this.pump()
  }

  clear(): void {
    for (const job of this.inFlight.values()) job.abort.abort()
    for (const job of this.queue) job.reject(new DOMException('Aborted', 'AbortError'))
    this.queue = []
    this.inFlight.clear()
    for (const resource of this.ready.values()) resource.dispose()
    this.ready.clear()
    this.touched.clear()
    this.retained.clear()
  }

  private pump(): void {
    while (this.inFlight.size < this.maxConcurrent && this.queue.length) {
      const pending = this.queue.shift()!
      const abort = new AbortController()
      const active: InFlightRequest = { ...pending, abort }
      this.inFlight.set(pending.request.key, active)
      void this.loader(pending.request, abort.signal).then((resource) => {
        this.inFlight.delete(pending.request.key)
        if (abort.signal.aborted || !this.retained.has(resource.key)) {
          resource.dispose()
          active.reject(new DOMException('Aborted', 'AbortError'))
        } else {
          this.ready.set(resource.key, resource)
          this.touched.set(resource.key, ++this.clock)
          active.resolve(resource)
          this.evictToBudget()
        }
      }).catch((error) => {
        this.inFlight.delete(pending.request.key)
        active.reject(error)
      }).finally(() => this.pump())
    }
  }

  private evictToBudget(): void {
    let bytes = [...this.ready.values()].reduce((sum, item) => sum + item.bytes, 0)
    if (bytes <= this.maxBytes) return
    const candidates = [...this.ready.keys()]
      .filter((key) => !this.retained.has(key))
      .sort((left, right) => (this.touched.get(left) ?? 0) - (this.touched.get(right) ?? 0))
    for (const key of candidates) {
      const resource = this.ready.get(key)
      if (!resource) continue
      resource.dispose()
      this.ready.delete(key)
      this.touched.delete(key)
      bytes -= resource.bytes
      if (bytes <= this.maxBytes) break
    }
  }
}
