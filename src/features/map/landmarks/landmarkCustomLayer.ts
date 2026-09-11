import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from 'maplibre-gl'
import {
  AmbientLight,
  Box3,
  Camera,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  Mesh,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type ShadowMapType,
  type WebGLRendererParameters,
} from 'three'

import {
  cinematicSunSourceDirection,
  landmarkLightingProfile,
  type LandmarkLightingProfile,
  type LandmarkLightingQuality,
} from './landmarkLightingProfile.ts'
import { LANDMARK_GROUND_SHADOW_LAYER } from './landmarkContactShadow.ts'

export const LANDMARK_LAYER_ID = 'agot-landmark-models'
export const LANDMARK_SHADOW_CASTER_LAYER = 1

export type LandmarkLayerCapability = 'unsupported' | 'webgl2'

interface LandmarkRenderer {
  autoClear: boolean
  shadowMap: {
    enabled: boolean
    type: ShadowMapType
    autoUpdate: boolean
    needsUpdate: boolean
  }
  outputColorSpace: string
  renderLists?: { dispose(): void }
  resetState(): void
  render(scene: Scene, camera: Camera): void
  dispose(): void
}

export interface LandmarkCustomLayerOptions {
  lightingProfile?: LandmarkLightingProfile
  rendererFactory?: (parameters: WebGLRendererParameters) => LandmarkRenderer
  isWebGL2?: (context: WebGLRenderingContext | WebGL2RenderingContext) => boolean
  onWarning?: (message: string) => void
}

export interface LandmarkCustomLayer extends CustomLayerInterface {
  readonly renderingMode: '3d'
  setObject(key: string, object: Object3D, matrix: Matrix4): void
  removeObject(key: string): void
  clearObjects(): void
  setShadowObjects(keys: readonly string[]): void
  lightingQuality(): LandmarkLightingQuality
  capability(): LandmarkLayerCapability
  cameraProjectionMatrix(): Matrix4
  sunSourceDirection(): Vector3
}

function browserSupportsWebGL2(context: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  return typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext
}

function sameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false
  for (const key of left) if (!right.has(key)) return false
  return true
}

class SharedContextLandmarkLayer implements LandmarkCustomLayer {
  readonly id = LANDMARK_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private readonly scene = new Scene()
  private readonly camera = new Camera()
  private readonly objects = new Map<string, Object3D>()
  private readonly options: LandmarkCustomLayerOptions
  private readonly lightingProfileValue: LandmarkLightingProfile
  private readonly ambientLight: AmbientLight
  private readonly hemisphereLight: HemisphereLight
  private readonly sunLight: DirectionalLight
  private readonly sunTarget = new Object3D()
  private shadowKeys = new Set<string>()
  private effectiveQuality: LandmarkLightingQuality
  private map: MapLibreMap | null = null
  private canvas: HTMLCanvasElement | null = null
  private renderer: LandmarkRenderer | null = null
  private supported = false
  private contextLost = false
  private warnedRestore = false
  private warnedShadow = false

  constructor(options: LandmarkCustomLayerOptions) {
    this.options = options
    this.lightingProfileValue = options.lightingProfile ?? landmarkLightingProfile({})
    this.effectiveQuality = this.lightingProfileValue.quality
    this.ambientLight = new AmbientLight(
      this.lightingProfileValue.ambientColor,
      this.lightingProfileValue.ambientIntensity,
    )
    this.hemisphereLight = new HemisphereLight(
      this.lightingProfileValue.skyColor,
      this.lightingProfileValue.groundColor,
      this.lightingProfileValue.hemisphereIntensity,
    )
    this.sunLight = new DirectionalLight(
      this.lightingProfileValue.sunColor,
      this.lightingProfileValue.sunIntensity,
    )
    this.sunLight.target = this.sunTarget
    const [sunEast, sunSouth, sunUp] = cinematicSunSourceDirection()
    this.sunLight.position.set(sunEast * 10, sunSouth * 10, sunUp * 10)
    this.sunTarget.position.set(0, 0, 0)
    this.sunLight.layers.enable(LANDMARK_GROUND_SHADOW_LAYER)
    this.sunLight.castShadow = this.lightingProfileValue.shadowMapSize > 0
    this.sunLight.shadow.camera.layers.set(LANDMARK_SHADOW_CASTER_LAYER)
    this.sunLight.shadow.bias = -0.00008
    this.sunLight.shadow.intensity = this.lightingProfileValue.shadowIntensity
    this.sunLight.shadow.radius = 2
    this.scene.add(
      this.ambientLight,
      this.hemisphereLight,
      this.sunLight,
      this.sunTarget,
    )
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    this.canvas = map.getCanvas()
    const isWebGL2 = this.options.isWebGL2 ?? browserSupportsWebGL2
    if (!isWebGL2(gl)) {
      this.supported = false
      this.options.onWarning?.('当前图形环境不支持 WebGL2，已保留二维地标')
      return
    }

    const parameters: WebGLRendererParameters = {
      canvas: this.canvas,
      context: gl,
      antialias: true,
    }
    this.renderer = this.options.rendererFactory?.(parameters) ?? new WebGLRenderer(parameters)
    this.renderer.autoClear = false
    this.renderer.outputColorSpace = SRGBColorSpace
    try {
      const realtime = this.lightingProfileValue.shadowMapSize > 0
      this.renderer.shadowMap.enabled = realtime
      this.renderer.shadowMap.type = PCFShadowMap
      this.renderer.shadowMap.autoUpdate = false
      this.renderer.shadowMap.needsUpdate = realtime
      const size = this.lightingProfileValue.shadowMapSize || 1
      this.sunLight.shadow.mapSize.set(size, size)
    } catch (error) {
      this.disableRealtimeShadows('实时建筑阴影初始化失败，已保留电影光照与接触阴影', error)
    }
    this.supported = true
    this.contextLost = false
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored)
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    options: CustomRenderMethodInput,
  ): void {
    if (!this.renderer || !this.supported || this.contextLost || this.objects.size === 0) return
    this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix)
    this.renderer.resetState()
    try {
      this.camera.layers.set(LANDMARK_GROUND_SHADOW_LAYER)
      this.renderer.render(this.scene, this.camera)
      this.camera.layers.set(0)
      this.renderer.render(this.scene, this.camera)
    } catch (error) {
      if (this.realtimeShadowsEnabled()) {
        this.disableRealtimeShadows('实时建筑阴影渲染失败，已保留电影光照与接触阴影', error)
        this.map?.triggerRepaint()
      } else {
        console.warn('[Landmarks] 三维地标渲染失败', error)
      }
    } finally {
      this.camera.layers.set(0)
      this.renderer.resetState()
    }
  }

  setObject(key: string, object: Object3D, matrix: Matrix4): void {
    const previous = this.objects.get(key)
    const unchanged = previous === object && previous.matrix.equals(matrix)
    if (unchanged) return
    if (previous) this.scene.remove(previous)
    object.matrixAutoUpdate = false
    object.matrix.copy(matrix)
    object.matrixWorldNeedsUpdate = true
    this.objects.set(key, object)
    this.scene.add(object)
    this.applyShadowLayers()
    if (this.shadowKeys.has(key)) this.refitRealtimeShadows()
    this.map?.triggerRepaint()
  }

  removeObject(key: string): void {
    const object = this.objects.get(key)
    if (!object) return
    this.objects.delete(key)
    this.scene.remove(object)
    if (this.shadowKeys.has(key)) this.refitRealtimeShadows()
    this.map?.triggerRepaint()
  }

  clearObjects(): void {
    if (!this.objects.size) return
    for (const object of this.objects.values()) this.scene.remove(object)
    this.objects.clear()
    this.refitRealtimeShadows()
    this.map?.triggerRepaint()
  }

  setShadowObjects(keys: readonly string[]): void {
    const next = new Set(keys)
    if (sameKeys(this.shadowKeys, next)) return
    this.shadowKeys = next
    this.applyShadowLayers()
    this.refitRealtimeShadows()
    this.map?.triggerRepaint()
  }

  lightingQuality(): LandmarkLightingQuality {
    return this.effectiveQuality
  }

  capability(): LandmarkLayerCapability {
    return this.supported && !this.contextLost ? 'webgl2' : 'unsupported'
  }

  cameraProjectionMatrix(): Matrix4 {
    return this.camera.projectionMatrix.clone()
  }

  sunSourceDirection(): Vector3 {
    return this.sunLight.position.clone().sub(this.sunTarget.position).normalize()
  }

  onRemove(): void {
    this.clearObjects()
    this.canvas?.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas?.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.sunLight.shadow.dispose()
    this.renderer?.renderLists?.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.canvas = null
    this.map = null
    this.supported = false
    this.contextLost = false
  }

  private realtimeShadowsEnabled(): boolean {
    return this.effectiveQuality !== 'low'
      && this.sunLight.castShadow
      && Boolean(this.renderer?.shadowMap.enabled)
  }

  private applyShadowLayers(): void {
    for (const [key, object] of this.objects) {
      const selected = this.shadowKeys.has(key)
      object.traverse((node) => {
        if (!(node instanceof Mesh)) return
        if (selected) node.layers.enable(LANDMARK_SHADOW_CASTER_LAYER)
        else node.layers.disable(LANDMARK_SHADOW_CASTER_LAYER)
      })
    }
  }

  private refitRealtimeShadows(): void {
    if (this.effectiveQuality === 'low' || !this.renderer?.shadowMap.enabled) {
      this.sunLight.castShadow = false
      return
    }
    this.scene.updateMatrixWorld(true)
    const bounds = new Box3()
    let found = false
    for (const key of this.shadowKeys) {
      const object = this.objects.get(key)
      if (!object) continue
      const objectBounds = new Box3().setFromObject(object)
      if (objectBounds.isEmpty()) continue
      bounds.union(objectBounds)
      found = true
    }
    if (!found) {
      this.sunLight.castShadow = false
      this.renderer.shadowMap.needsUpdate = true
      return
    }

    const center = bounds.getCenter(new Vector3())
    const size = bounds.getSize(new Vector3())
    const radius = Math.max(size.length() * 0.5, 1e-7)
    const [x, y, z] = cinematicSunSourceDirection()
    this.sunTarget.position.copy(center)
    this.sunLight.position.set(
      center.x + x * radius * 4,
      center.y + y * radius * 4,
      center.z + z * radius * 4,
    )
    const camera = this.sunLight.shadow.camera as OrthographicCamera
    camera.left = -radius * 1.35
    camera.right = radius * 1.35
    camera.top = radius * 1.35
    camera.bottom = -radius * 1.35
    camera.near = radius * 0.1
    camera.far = radius * 8
    camera.updateProjectionMatrix()
    this.sunLight.castShadow = true
    this.renderer.shadowMap.needsUpdate = true
  }

  private disableRealtimeShadows(message: string, error?: unknown): void {
    this.effectiveQuality = 'low'
    this.sunLight.castShadow = false
    if (this.renderer) {
      this.renderer.shadowMap.enabled = false
      this.renderer.shadowMap.needsUpdate = false
    }
    if (this.warnedShadow) return
    this.warnedShadow = true
    console.warn('[Landmarks]', message, error)
    this.options.onWarning?.(message)
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
  }

  private readonly handleContextRestored = (): void => {
    if (!this.renderer || !this.supported) {
      this.clearObjects()
      if (!this.warnedRestore) {
        this.warnedRestore = true
        this.options.onWarning?.('三维地标图形上下文未能恢复，已保留二维地图')
      }
      return
    }
    this.contextLost = false
    if (this.realtimeShadowsEnabled()) this.renderer.shadowMap.needsUpdate = true
    this.map?.triggerRepaint()
  }
}

export function createLandmarkCustomLayer(
  options: LandmarkCustomLayerOptions = {},
): LandmarkCustomLayer {
  return new SharedContextLandmarkLayer(options)
}
