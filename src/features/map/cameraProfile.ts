import type {
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapMouseEvent,
  MapOptions,
} from 'maplibre-gl'

import { mapPixelToLngLat } from './coordinates.ts'
import { nextSemanticZoom } from './semanticZoom.ts'
import type { MapManifest } from './types'

export type CameraAnimationKind = 'search' | 'semantic'
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
  const maxBounds: LngLatBoundsLike = [southWest, northEast]

  return {
    zoomSnap: 0,
    minZoom: 0,
    maxZoom: 6,
    maxPitch: 0,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    maxBounds,
    reduceMotion: reducedMotion,
    fadeDuration: reducedMotion ? 0 : 300,
  }
}

export function configureCk3Camera(
  map: MapLibreMap,
  reducedMotion: boolean,
): () => void {
  map.scrollZoom.enable()
  map.scrollZoom.setWheelZoomRate(1 / 600)
  map.scrollZoom.setZoomRate(1 / 160)
  map.touchZoomRotate.enable()
  map.doubleClickZoom.disable()
  map.dragRotate.disable()
  map.touchZoomRotate.disableRotation()
  map.touchPitch.disable()
  map.keyboard.disableRotation()

  const onDoubleClick = (event: MapMouseEvent): void => {
    event.preventDefault()
    map.easeTo({
      zoom: nextSemanticZoom(map.getZoom()),
      around: event.lngLat,
      ...cameraAnimation(reducedMotion, 'semantic'),
    })
  }
  map.on('dblclick', onDoubleClick)

  return () => map.off('dblclick', onDoubleClick)
}
