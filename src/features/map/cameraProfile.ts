import type {
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapMouseEvent,
  MapOptions,
} from 'maplibre-gl'

import { mapPixelToLngLat } from './coordinates.ts'
import { nextSemanticZoom } from './semanticZoom.ts'
import { TERRAIN_MAX_PITCH } from './terrainProfile.ts'
import type { MapManifest } from './types'

export type CameraAnimationKind = 'search' | 'semantic'

const MAPLIBRE_MAX_BOUND_LONGITUDE = 180 - 1e-10

export type Ck3MapOptions = Pick<
  MapOptions,
  | 'zoomSnap'
  | 'minZoom'
  | 'maxZoom'
  | 'maxPitch'
  | 'pitchWithRotate'
  | 'dragRotate'
  | 'touchPitch'
  | 'renderWorldCopies'
  | 'maxBounds'
  | 'reduceMotion'
  | 'fadeDuration'
  | 'maxTileCacheSize'
  | 'maxTileCacheZoomLevels'
  | 'canvasContextAttributes'
  | 'refreshExpiredTiles'
>

export function cameraAnimation(
  reducedMotion: boolean,
  kind: CameraAnimationKind,
): { duration: number; essential: boolean } {
  if (reducedMotion) return { duration: 0, essential: false }
  return { duration: kind === 'search' ? 850 : 420, essential: true }
}

export function createCk3MapOptions(
  manifest: Pick<MapManifest, 'westerosBounds'>,
  reducedMotion: boolean,
): Ck3MapOptions {
  const southWest = mapPixelToLngLat({
    mapX: manifest.westerosBounds.minX,
    mapY: manifest.westerosBounds.maxY,
  }, manifest)
  const northEast = mapPixelToLngLat({
    mapX: manifest.westerosBounds.maxX,
    mapY: manifest.westerosBounds.minY,
  }, manifest)
  // MapLibre wraps both -180 and 180 to the same world coordinate. Passing
  // those exact endpoints collapses the longitude span and makes its camera
  // projection matrix singular during the first resize.
  const maxBounds: LngLatBoundsLike = [
    [Math.max(southWest[0], -MAPLIBRE_MAX_BOUND_LONGITUDE), southWest[1]],
    [Math.min(northEast[0], MAPLIBRE_MAX_BOUND_LONGITUDE), northEast[1]],
  ]

  return {
    zoomSnap: 0,
    minZoom: 0,
    maxZoom: 6,
    maxPitch: TERRAIN_MAX_PITCH,
    pitchWithRotate: true,
    dragRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    maxBounds,
    reduceMotion: reducedMotion,
    // 快速滚轮/平移时瓦片尽快显现,长淡入会放大"加载慢"的观感
    fadeDuration: reducedMotion ? 0 : 120,
    // 每个来源多留已解码瓦片,快速移动后回看不再重新请求与解码
    maxTileCacheSize: 160,
    // 多栅格/矢量来源同时存在时，默认保留 5 个缩放层会放大显存占用。
    // 三层仍覆盖连续滚轮回看，同时避免每个来源积压过多已解码瓦片。
    maxTileCacheZoomLevels: 3,
    // 烘焙瓦片内容永不变化,回看时不再做过期再校验请求
    refreshExpiredTiles: false,
    // 双显卡设备上请求高性能 GPU,避免浏览器回退到核显或软件渲染
    canvasContextAttributes: { powerPreference: 'high-performance' },
  }
}

export function configureCk3Camera(
  map: MapLibreMap,
  reducedMotion: boolean,
  targetPitch: (zoom: number) => number = () => 0,
): () => void {
  map.scrollZoom.disable()
  map.touchZoomRotate.enable()
  map.doubleClickZoom.disable()
  map.dragRotate.disable()
  map.touchZoomRotate.disableRotation()
  map.touchPitch.disable()
  map.keyboard.disableRotation()

  const onDoubleClick = (event: MapMouseEvent): void => {
    event.preventDefault()
    const targetZoom = nextSemanticZoom(map.getZoom())
    map.easeTo({
      zoom: targetZoom,
      pitch: targetPitch(targetZoom),
      around: event.lngLat,
      ...cameraAnimation(reducedMotion, 'semantic'),
    })
  }
  map.on('dblclick', onDoubleClick)

  return () => map.off('dblclick', onDoubleClick)
}
