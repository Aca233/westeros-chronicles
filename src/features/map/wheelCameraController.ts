import type { Map as MapLibreMap } from 'maplibre-gl'

export interface WheelCameraControllerInput {
  reducedMotion: boolean
  targetPitch(zoom: number): number
}

export interface WheelCameraController {
  update(input: WheelCameraControllerInput): void
  destroy(): void
}

export type WheelCameraMapAdapter = Pick<
  MapLibreMap,
  | 'scrollZoom'
  | 'getCanvas'
  | 'getZoom'
  | 'getMinZoom'
  | 'getMaxZoom'
  | 'unproject'
  | 'easeTo'
  | 'on'
  | 'off'
>

const WHEEL_ZOOM_DIVISOR = 600
const WHEEL_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false }

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  if (!Number.isFinite(deltaY)) return 0
  if (deltaMode === 1) return deltaY * 16
  if (deltaMode === 2) {
    return deltaY * Math.max(1, viewportHeight)
  }
  return deltaY
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function createWheelCameraController(
  map: WheelCameraMapAdapter,
  initialInput: WheelCameraControllerInput,
): WheelCameraController {
  const canvas = map.getCanvas()
  let input = initialInput
  let targetZoom = map.getZoom()
  let destroyed = false

  const resetTargetZoom = (): void => {
    if (!destroyed) targetZoom = map.getZoom()
  }

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (destroyed) return
    const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, canvas.clientHeight)
    if (delta === 0) return
    targetZoom = clamp(
      targetZoom - delta / WHEEL_ZOOM_DIVISOR,
      map.getMinZoom(),
      map.getMaxZoom(),
    )
    map.easeTo({
      zoom: targetZoom,
      pitch: input.targetPitch(targetZoom),
      around: map.unproject([event.offsetX, event.offsetY]),
      duration: input.reducedMotion ? 0 : 220,
      essential: !input.reducedMotion,
    })
  }

  map.scrollZoom.disable()
  canvas.addEventListener('wheel', handleWheel, WHEEL_LISTENER_OPTIONS)
  map.on('zoomend', resetTargetZoom)

  return {
    update(nextInput): void {
      input = nextInput
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      canvas.removeEventListener('wheel', handleWheel, WHEEL_LISTENER_OPTIONS)
      map.off('zoomend', resetTargetZoom)
    },
  }
}
