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
    fadeDuration: reducedMotion ? 0 : 300,
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
