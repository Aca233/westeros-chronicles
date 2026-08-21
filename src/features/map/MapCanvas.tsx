import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import maplibregl, {
  type ErrorEvent as MapLibreErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type MapSourceDataEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre 默认只用 1 个 worker。按逻辑核心数分配一半并封顶 4：
// 高配设备可并行解析 PBF/DEM，双核设备则避免 worker 与主线程互相抢占。
maplibregl.setWorkerCount(Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency ?? 4) / 2))))

let mapRuntimePrewarmed = false
export function prewarmMapRuntime(): void {
  if (mapRuntimePrewarmed) return
  maplibregl.prewarm()
  mapRuntimePrewarmed = true
}

import { lngLatToMapPixel, mapPixelToLngLat } from './coordinates'
import {
  applyPoliticalFeatureStates,
  applyMapPresentation,
  addSelectedCountyLocationLayers,
  ASSET_POINT_LAYER,
  CHARACTER_POINT_LAYER,
  COUNTY_HIT_LAYER,
  JOURNEY_POSITION_SOURCE,
  JOURNEY_PROGRESS_SOURCE,
  JOURNEY_ROUTE_SOURCE,
  loadCountyLocationIcons,
  MATERIAL_TERRAIN_SOURCE,
  SELECTED_COUNTY_LOCATION_LAYER,
  syncSelectedCountyLocations,
  syncDynamicMapSubjects,
} from './mapLayers'
import { createLocalMapStyle } from './mapStyle'
import { changedTitleIds, type PoliticalFeatureState } from './politicalProjection.ts'
import { cameraAnimation, configureCk3Camera, createCk3MapOptions } from './cameraProfile.ts'
import { semanticZoomState } from './semanticZoom.ts'
import { mapRepository } from './repository'
import {
  createTerrainController,
  type TerrainController,
  type TerrainSyncInput,
} from './terrainController.ts'
import { TERRAIN_ENTER_ZOOM, terrainCameraProfile } from './terrainProfile.ts'
import {
  createTerrainSurfaceController,
  type TerrainSurfaceController,
} from './terrainSurfaceController.ts'
import {
  createWheelCameraController,
  type WheelCameraController,
} from './wheelCameraController.ts'
import type {
  MapBounds,
  MapManifest,
  SemanticMembershipIndex,
  SemanticRank,
} from './types'
import type { RoutePlan } from './routing/types'
import type { ActiveJourney } from './travel/types'
import type { MapFocusRequest, MapViewport } from './mapUiStore'
import type { MapInteractionState, MapOverlayPreferences } from './mapInteraction'
import { mapPresentationFor } from './mapPresentation'
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { CharacterId } from '../characters/types'
import { buildCountyInteractionIndex, type CountyInteractionIndex } from './countyInteraction.ts'

interface MapCanvasProps {
  manifest: MapManifest
  selectedCountyId: string | null
  selectedLocationId: string | null
  initialViewport: MapViewport | null
  focusRequest?: MapFocusRequest | null
  onSelectCounty: (countyId: string | null) => void
  onSelectLocation: (countyId: string, locationId: string) => void
  onViewportChange: (viewport: MapViewport) => void
  onWarning: (message: string | null) => void
  onTerrainAvailabilityChange: (available: boolean) => void
  overlays: MapOverlayPreferences
  interactionState: MapInteractionState
  onChooseTravelDestination: (locationId: string) => void
  topDownLocked: boolean
  northResetRequestId: number
  routePlan?: RoutePlan | null
  journey?: ActiveJourney
  politicalStates?: readonly PoliticalFeatureState[]
  characterPoints?: readonly MapCharacterPoint[]
  assetPoints?: readonly MapAssetPoint[]
  characterMarkers?: readonly MapCharacterPoint[]
  assetMarkers?: readonly MapAssetPoint[]
  onSelectCharacter: (characterId: CharacterId) => void
}

interface SemanticRuntimeContext extends SemanticMembershipIndex {
  primaryRank: SemanticRank
}

function viewportPixelBounds(map: MapLibreMap, manifest: MapManifest) {
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


function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function routeCoordinates(routePlan: RoutePlan, manifest: MapManifest): [number, number][] {
  if (!routePlan.legs.length) return []
  return [
    mapPixelToLngLat(routePlan.legs[0].fromPoint, manifest),
    ...routePlan.legs.map((leg) => mapPixelToLngLat(leg.toPoint, manifest)),
  ]
}

function progressCoordinates(
  routePlan: RoutePlan,
  journey: ActiveJourney | undefined,
  manifest: MapManifest,
): [number, number][] {
  if (!journey || journey.routePlan.id !== routePlan.id || !routePlan.legs.length) return []
  const completed = routePlan.legs.slice(0, journey.currentLeg)
  const coordinates: [number, number][] = [mapPixelToLngLat(routePlan.legs[0].fromPoint, manifest)]
  completed.forEach((leg) => coordinates.push(mapPixelToLngLat(leg.toPoint, manifest)))
  const current = routePlan.legs[journey.currentLeg]
  if (current && journey.progressDays > 0) {
    const ratio = Math.min(1, Math.max(0, journey.progressDays / current.days))
    coordinates.push(mapPixelToLngLat({
      mapX: current.fromPoint.mapX + (current.toPoint.mapX - current.fromPoint.mapX) * ratio,
      mapY: current.fromPoint.mapY + (current.toPoint.mapY - current.fromPoint.mapY) * ratio,
    }, manifest))
  }
  return coordinates
}

function lineCollection(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  if (coordinates.length < 2) return emptyFeatureCollection()
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    }],
  }
}

function pointCollection(coordinates: [number, number][]): GeoJSON.FeatureCollection {
  const point = coordinates.length ? coordinates[coordinates.length - 1] : undefined
  if (!point) return emptyFeatureCollection()
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } }],
  }
}

function ensureJourneyLayers(map: MapLibreMap): void {
  if (!map.getSource(JOURNEY_ROUTE_SOURCE)) map.addSource(JOURNEY_ROUTE_SOURCE, { type: 'geojson', data: emptyFeatureCollection() })
  if (!map.getSource(JOURNEY_PROGRESS_SOURCE)) map.addSource(JOURNEY_PROGRESS_SOURCE, { type: 'geojson', data: emptyFeatureCollection() })
  if (!map.getSource(JOURNEY_POSITION_SOURCE)) map.addSource(JOURNEY_POSITION_SOURCE, { type: 'geojson', data: emptyFeatureCollection() })
  if (!map.getLayer(JOURNEY_ROUTE_SOURCE)) map.addLayer({
    id: JOURNEY_ROUTE_SOURCE,
    type: 'line',
    source: JOURNEY_ROUTE_SOURCE,
    paint: {
      'line-color': '#bca765',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.2, 2.5, 1.8, 4.1, 2.6, 6, 3.6],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.58, 2.5, 0.68, 4.1, 0.78, 6, 0.9],
      'line-dasharray': [2, 1.25],
    },
  })
  if (!map.getLayer(JOURNEY_PROGRESS_SOURCE)) map.addLayer({
    id: JOURNEY_PROGRESS_SOURCE,
    type: 'line',
    source: JOURNEY_PROGRESS_SOURCE,
    paint: {
      'line-color': '#f0d58a',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 2, 2.5, 2.8, 4.1, 4, 6, 5.4],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.72, 2.5, 0.84, 4.1, 0.94, 6, 1],
    },
  })
  if (!map.getLayer(JOURNEY_POSITION_SOURCE)) map.addLayer({
    id: JOURNEY_POSITION_SOURCE,
    type: 'circle',
    source: JOURNEY_POSITION_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 5, 7],
      'circle-color': '#f0d58a',
      'circle-stroke-color': '#19150d',
      'circle-stroke-width': 2,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 2.49, 0, 2.5, 0.96, 6, 0.96],
    },
  })
}

function syncJourneyLayers(
  map: MapLibreMap,
  manifest: MapManifest,
  routePlan: RoutePlan | null | undefined,
  journey: ActiveJourney | undefined,
): void {
  if (!map.isStyleLoaded()) return
  ensureJourneyLayers(map)
  const route = routePlan ? routeCoordinates(routePlan, manifest) : []
  const progress = routePlan ? progressCoordinates(routePlan, journey, manifest) : []
  map.setPaintProperty(JOURNEY_ROUTE_SOURCE, 'line-dasharray', journey ? [1, 0] : [2, 1.25])
  map.setPaintProperty(JOURNEY_ROUTE_SOURCE, 'line-opacity', journey
    ? ['interpolate', ['linear'], ['zoom'], 0, 0.7, 2.5, 0.8, 4.1, 0.88, 6, 0.94]
    : ['interpolate', ['linear'], ['zoom'], 0, 0.5, 2.5, 0.6, 4.1, 0.72, 6, 0.82])
  ;(map.getSource(JOURNEY_ROUTE_SOURCE) as GeoJSONSource).setData(lineCollection(route))
  ;(map.getSource(JOURNEY_PROGRESS_SOURCE) as GeoJSONSource).setData(lineCollection(progress))
  ;(map.getSource(JOURNEY_POSITION_SOURCE) as GeoJSONSource).setData(pointCollection(progress))
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  manifest,
  selectedCountyId,
  selectedLocationId,
  initialViewport,
  focusRequest,
  onSelectCounty,
  onSelectLocation,
  onViewportChange,
  onWarning,
  onTerrainAvailabilityChange,
  overlays,
  interactionState,
  onChooseTravelDestination,
  topDownLocked,
  northResetRequestId,
  routePlan,
  journey,
  politicalStates = [],
  characterPoints = [],
  assetPoints = [],
  characterMarkers = characterPoints,
  assetMarkers = assetPoints,
  onSelectCharacter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  // 样式就绪标志:只在 'load' 后置真,不随瓦片流式加载回落。
  // map.isStyleLoaded() 会在任何瓦片加载/解码期间变回 false,导致模式切换等实时更新被静默跳过,
  // 因此实时更新一律改用这个一次性就绪标志,而不是 isStyleLoaded()。
  const styleReadyRef = useRef(false)
  const [initializationError, setInitializationError] = useState(false)
  const [semanticInitializationError, setSemanticInitializationError] = useState(false)
  const callbacksRef = useRef({
    onSelectLocation,
    onSelectCharacter,
    onViewportChange,
    onWarning,
    onTerrainAvailabilityChange,
    onSelectCounty,
    onChooseTravelDestination,
  })
  const routeRef = useRef({ routePlan, journey })
  const politicalRef = useRef<readonly PoliticalFeatureState[]>(politicalStates)
  const dynamicRef = useRef({ characterPoints, assetPoints, characterMarkers, assetMarkers })
  const semanticRef = useRef<SemanticRuntimeContext | null>(null)
  const countyInteractionRef = useRef<CountyInteractionIndex | null>(null)
  const selectedCountyRef = useRef(selectedCountyId)
  const overlaysRef = useRef(overlays)
  const interactionRef = useRef(interactionState)
  const reducedMotionRef = useRef(false)
  const terrainControllerRef = useRef<TerrainController | null>(null)
  const wheelCameraControllerRef = useRef<WheelCameraController | null>(null)
  const topDownLockedRef = useRef(topDownLocked)
  const terrainAvailableRef = useRef(true)

  const terrainInput = (): TerrainSyncInput => ({
    topDownLocked: topDownLockedRef.current,
    reducedMotion: reducedMotionRef.current,
  })

  const targetTerrainPitch = (zoom: number): number => terrainCameraProfile({
    zoom,
    topDownLocked: topDownLockedRef.current,
    available: terrainAvailableRef.current,
    terrainWasEnabled: zoom >= TERRAIN_ENTER_ZOOM,
  }).pitch

  const wheelCameraInput = () => ({
    reducedMotion: reducedMotionRef.current,
    targetPitch: targetTerrainPitch,
  })

  const applyCurrentPresentation = useCallback((map: MapLibreMap): void => {
    const presentation = mapPresentationFor({
      zoom: map.getZoom(),
      overlays: overlaysRef.current,
      selectedCountyId: selectedCountyRef.current,
    })
    applyMapPresentation(
      map,
      presentation,
      Boolean(routeRef.current.routePlan || routeRef.current.journey),
      semanticZoomState(map.getZoom()).primaryRank,
    )
  }, [])

  const refreshSemanticSubjects = useCallback((pixelBounds?: MapBounds): void => {
    const map = mapRef.current
    const semantic = semanticRef.current
    const presentation = map ? mapPresentationFor({ zoom: map.getZoom(), overlays: overlaysRef.current, selectedCountyId: selectedCountyRef.current }) : null
    if (!map?.isStyleLoaded() || !semantic || !presentation || (!presentation.characters && !presentation.assets)) return
    const bounds = pixelBounds ?? viewportPixelBounds(map, manifest)
    syncDynamicMapSubjects(
      map,
      manifest,
      dynamicRef.current.characterPoints,
      dynamicRef.current.assetPoints,
      bounds,
      { ...semantic, zoomState: semanticZoomState(map.getZoom()) },
      { characters: dynamicRef.current.characterMarkers, assets: dynamicRef.current.assetMarkers },
    )
  }, [manifest])


  useEffect(() => {
    callbacksRef.current = {
      onSelectLocation,
      onSelectCharacter,
      onViewportChange,
      onWarning,
      onTerrainAvailabilityChange,
      onSelectCounty,
      onChooseTravelDestination,
    }
  }, [onChooseTravelDestination, onSelectCharacter, onSelectCounty, onSelectLocation, onTerrainAvailabilityChange, onViewportChange, onWarning])

  useEffect(() => {
    topDownLockedRef.current = topDownLocked
    terrainControllerRef.current?.requestSync(terrainInput(), true)
    wheelCameraControllerRef.current?.update(wheelCameraInput())
  }, [topDownLocked])

  useEffect(() => {
    if (northResetRequestId > 0) terrainControllerRef.current?.resetNorth(terrainInput())
  }, [northResetRequestId])

  useEffect(() => {
    selectedCountyRef.current = selectedCountyId
    overlaysRef.current = overlays
    interactionRef.current = interactionState
    const map = mapRef.current
    const index = countyInteractionRef.current
    if (map?.isStyleLoaded() && index) {
      syncSelectedCountyLocations(map, manifest, index, selectedCountyId)
      applyCurrentPresentation(map)
      refreshSemanticSubjects()
    }
  }, [applyCurrentPresentation, interactionState, manifest, overlays, refreshSemanticSubjects, selectedCountyId, selectedLocationId])

  useEffect(() => {
    routeRef.current = { routePlan, journey }
    const map = mapRef.current
    if (map?.isStyleLoaded()) syncJourneyLayers(map, manifest, routePlan, journey)
  }, [journey, manifest, routePlan])

  useEffect(() => {
    const previous = politicalRef.current
    politicalRef.current = politicalStates
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      const changedIds = changedTitleIds(previous, politicalStates)
      applyPoliticalFeatureStates(map, politicalStates, changedIds, previous)
    }
  }, [politicalStates])

  useEffect(() => {
    dynamicRef.current = { characterPoints, assetPoints, characterMarkers, assetMarkers }
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      refreshSemanticSubjects()
    }
  }, [assetMarkers, assetPoints, characterMarkers, characterPoints, refreshSemanticSubjects])

  useEffect(() => {
    if (!containerRef.current) return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mediaQuery.matches
    let cameraCleanup = () => {}
    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches
      if (mapRef.current) {
        cameraCleanup()
        cameraCleanup = configureCk3Camera(mapRef.current, event.matches, targetTerrainPitch)
        terrainControllerRef.current?.requestSync(terrainInput(), true)
        wheelCameraControllerRef.current?.update(wheelCameraInput())
      }
    }
    mediaQuery.addEventListener('change', handleReducedMotionChange)

    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: createLocalMapStyle(manifest),
        center: initialViewport
          ? [initialViewport.longitude, initialViewport.latitude]
          : [0, 0],
        zoom: initialViewport?.zoom ?? 0,
        ...createCk3MapOptions(manifest, reducedMotionRef.current),
        localIdeographFontFamily: 'Noto Sans CJK SC, Microsoft YaHei, sans-serif',
        attributionControl: false,
        cooperativeGestures: false,
        transformRequest: (url) => ({
          url: url.startsWith('/') ? new URL(url, window.location.href).href : url,
        }),
      })
    } catch (error) {
      mediaQuery.removeEventListener('change', handleReducedMotionChange)
      setInitializationError(true)
      console.error('[MapCanvas] 地图画布初始化失败', error)
      callbacksRef.current.onWarning('地图画布无法初始化，正文与人物卷宗不受影响')
      return
    }
    setInitializationError(false)
    mapRef.current = map
    cameraCleanup = configureCk3Camera(map, reducedMotionRef.current, targetTerrainPitch)
    const wheelCameraController = createWheelCameraController(map, wheelCameraInput())
    wheelCameraControllerRef.current = wheelCameraController
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    let terrainController: TerrainController | null = null
    let terrainSurfaceController: TerrainSurfaceController | null = null
    let landmarkRuntime: import('./landmarks/landmarkRuntime.ts').LandmarkRuntime | null = null
    let landmarksCancelled = false
    let materialSurfaceFailed = false
    const handleMapError = (event: MapLibreErrorEvent) => {
      const terrainEvent = event as MapLibreErrorEvent & { sourceId?: string }
      const message = event.error?.message ?? ''
      if (terrainEvent.sourceId === MATERIAL_TERRAIN_SOURCE || /agot-material-terrain/i.test(message)) {
        materialSurfaceFailed = true
        terrainSurfaceController?.disable('近景地形材质不可用')
        return
      }
      if (terrainEvent.sourceId === 'agot-dem' || /agot-dem|terrain(?:-rgb)?\s+(?:decode|tile)/i.test(message)) {
        terrainControllerRef.current?.disable('DEM 地形不可用')
        return
      }
      if (/404|not found/i.test(message)) return
      callbacksRef.current.onWarning('部分地图图块未能载入，可继续浏览其他区域')
    }
    const handleMoveEnd = () => {
      const center = map.getCenter()
      callbacksRef.current.onViewportChange({
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
      })
      const pixelBounds = viewportPixelBounds(map, manifest)
      refreshSemanticSubjects(pixelBounds)
      landmarkRuntime?.sync('moveend')
    }
    const handleZoomEnd = (event?: { agotWheelCamera?: boolean }) => {
      landmarkRuntime?.sync('zoomend')
      if (event?.agotWheelCamera) {
        // 滚轮缩放动画已携带目标倾角:滚轮结束不再强制写相机,避免顶掉进行中的滚轮动画
        terrainControllerRef.current?.requestSync(terrainInput())
      } else {
        terrainControllerRef.current?.requestSync(terrainInput(), true)
      }
      const semantic = semanticRef.current
      if (!semantic) return
      const state = semanticZoomState(map.getZoom())
      if (state.primaryRank === semantic.primaryRank) return
      semantic.primaryRank = state.primaryRank
      refreshSemanticSubjects()
    }
    const handleCountyClick = (event: MapLayerMouseEvent) => {
      const foregroundLayers = [CHARACTER_POINT_LAYER, ASSET_POINT_LAYER, SELECTED_COUNTY_LOCATION_LAYER]
        .filter((layerId) => Boolean(map.getLayer(layerId)))
      if (foregroundLayers.length && map.queryRenderedFeatures(event.point, { layers: foregroundLayers }).length) return
      const baronyId = event.features?.[0]?.properties?.baronyId
      if (typeof baronyId !== 'string') return
      const index = countyInteractionRef.current
      const countyId = index?.countyIdForBarony(baronyId)
      if (!index || !countyId) return
      callbacksRef.current.onSelectCounty(countyId)
      if (interactionRef.current === 'pick-travel-destination') {
        const destinationId = index.primaryLocationForCounty(countyId)
        if (destinationId) callbacksRef.current.onChooseTravelDestination(destinationId)
      }
    }
    const handleExpandedLocationClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.id
      if (typeof locationId !== 'string') return
      const selected = countyInteractionRef.current?.selectedCountyForLocation(locationId)
      if (selected) {
        callbacksRef.current.onSelectLocation(selected.countyId, locationId)
      }
    }
    const handleBlankMapClick = (event: MapMouseEvent) => {
      const interactiveLayers = [COUNTY_HIT_LAYER, SELECTED_COUNTY_LOCATION_LAYER, CHARACTER_POINT_LAYER, ASSET_POINT_LAYER]
        .filter((layerId) => Boolean(map.getLayer(layerId)))
      if (interactiveLayers.length && map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length === 0) {
        callbacksRef.current.onSelectCounty(null)
      }
    }
    const handleCharacterClick = (event: MapLayerMouseEvent) => {
      const characterId = event.features?.[0]?.properties?.characterId
      if (typeof characterId === 'string' && (characterId.startsWith('agot:') || characterId.startsWith('save:'))) {
        callbacksRef.current.onSelectCharacter(characterId as CharacterId)
      }
    }
    const handleAssetClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.locationId
      if (typeof locationId !== 'string') return
      const selected = countyInteractionRef.current?.selectedCountyForLocation(locationId)
      if (selected) {
        callbacksRef.current.onSelectLocation(selected.countyId, locationId)
      }
    }
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const clearPointer = () => { map.getCanvas().style.cursor = '' }
    const handleTerrainZoom = () => {
      terrainController?.requestSync(terrainInput())
      terrainSurfaceController?.requestSync(map.getZoom())
      applyCurrentPresentation(map)
    }
    const handleSourceData = (event: MapSourceDataEvent) => {
      terrainSurfaceController?.handleSourceData(event.sourceId)
    }

    map.on('error', handleMapError)
    map.on('sourcedata', handleSourceData)
    map.on('moveend', handleMoveEnd)
    map.on('zoomend', handleZoomEnd)
    map.on('click', handleBlankMapClick)
    map.on('click', COUNTY_HIT_LAYER, handleCountyClick)
    map.on('mouseenter', COUNTY_HIT_LAYER, showPointer)
    map.on('mouseleave', COUNTY_HIT_LAYER, clearPointer)
    const initializeLocationLayers = () => {
      styleReadyRef.current = true
      const handleTerrainUnavailable = () => {
        terrainAvailableRef.current = false
        callbacksRef.current.onTerrainAvailabilityChange(false)
        callbacksRef.current.onWarning('当前使用二维地图')
      }
      terrainController = createTerrainController(map, { onUnavailable: handleTerrainUnavailable })
      terrainControllerRef.current = terrainController
      terrainSurfaceController = createTerrainSurfaceController(map, {
        onUnavailable: (reason) => callbacksRef.current.onWarning(`${reason}，已保留远景地图`),
      })
      map.on('zoom', handleTerrainZoom)
      terrainController.syncNow(terrainInput(), true)
      if (materialSurfaceFailed) terrainSurfaceController.disable('近景地形材质不可用')
      else terrainSurfaceController.syncNow(map.getZoom())
      addSelectedCountyLocationLayers(map)
      map.on('click', SELECTED_COUNTY_LOCATION_LAYER, handleExpandedLocationClick)
      map.on('mouseenter', SELECTED_COUNTY_LOCATION_LAYER, showPointer)
      map.on('mouseleave', SELECTED_COUNTY_LOCATION_LAYER, clearPointer)
      const locationIconsReady = loadCountyLocationIcons(map)
        .catch(() => callbacksRef.current.onWarning('伯爵领内部地点图标未能载入，其他地图内容不受影响'))
      applyPoliticalFeatureStates(map, politicalRef.current)
      syncJourneyLayers(map, manifest, routeRef.current.routePlan, routeRef.current.journey)
      applyCurrentPresentation(map)
      map.on('click', CHARACTER_POINT_LAYER, handleCharacterClick)
      map.on('click', ASSET_POINT_LAYER, handleAssetClick)
      map.on('mouseenter', CHARACTER_POINT_LAYER, showPointer)
      map.on('mouseleave', CHARACTER_POINT_LAYER, clearPointer)
      map.on('mouseenter', ASSET_POINT_LAYER, showPointer)
      map.on('mouseleave', ASSET_POINT_LAYER, clearPointer)
      void import('./landmarks/landmarkRuntime.ts')
        .then(({ createLandmarkRuntime }) => createLandmarkRuntime(map, manifest))
        .then((runtime) => {
          if (landmarksCancelled) runtime.destroy()
          else landmarkRuntime = runtime
        })
        .catch((error) => console.warn('[Landmarks] 三维地标不可用，保留二维地图', error))
      Promise.all([mapRepository.loadSearchIndex(), mapRepository.loadSemanticIndex(), locationIconsReady])
        .then(([entries, semantic]) => {
          if (mapRef.current !== map) return
          const primaryRank = semanticZoomState(map.getZoom()).primaryRank
          semanticRef.current = { ...semantic, primaryRank }
          countyInteractionRef.current = buildCountyInteractionIndex(entries, semantic)
                syncSelectedCountyLocations(map, manifest, countyInteractionRef.current, selectedCountyRef.current)
          setSemanticInitializationError(false)
          refreshSemanticSubjects()
          applyCurrentPresentation(map)
                })
        .catch(() => {
          if (mapRef.current !== map) return
          semanticRef.current = null
          countyInteractionRef.current = null
          setSemanticInitializationError(true)
          callbacksRef.current.onWarning('地图语义资料未能载入，请重新载入地图')
        })
    }
    map.on('load', initializeLocationLayers)

    let resizeFrame: number | null = null
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          resizeFrame ??= requestAnimationFrame(() => {
            resizeFrame = null
            map.resize()
          })
        })
    resizeObserver?.observe(containerRef.current)

    return () => {
      resizeObserver?.disconnect()
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      mediaQuery.removeEventListener('change', handleReducedMotionChange)
      cameraCleanup()
      map.off('error', handleMapError)
      map.off('sourcedata', handleSourceData)
      map.off('zoom', handleTerrainZoom)
      map.off('moveend', handleMoveEnd)
      map.off('zoomend', handleZoomEnd)
      map.off('click', handleBlankMapClick)
      map.off('click', COUNTY_HIT_LAYER, handleCountyClick)
      map.off('mouseenter', COUNTY_HIT_LAYER, showPointer)
      map.off('mouseleave', COUNTY_HIT_LAYER, clearPointer)
      map.off('click', SELECTED_COUNTY_LOCATION_LAYER, handleExpandedLocationClick)
      map.off('mouseenter', SELECTED_COUNTY_LOCATION_LAYER, showPointer)
      map.off('mouseleave', SELECTED_COUNTY_LOCATION_LAYER, clearPointer)
      map.off('click', CHARACTER_POINT_LAYER, handleCharacterClick)
      map.off('click', ASSET_POINT_LAYER, handleAssetClick)
      map.off('mouseenter', CHARACTER_POINT_LAYER, showPointer)
      map.off('mouseleave', CHARACTER_POINT_LAYER, clearPointer)
      map.off('mouseenter', ASSET_POINT_LAYER, showPointer)
      map.off('mouseleave', ASSET_POINT_LAYER, clearPointer)
      map.off('load', initializeLocationLayers)
      styleReadyRef.current = false
      landmarksCancelled = true
      landmarkRuntime?.destroy()
      landmarkRuntime = null
      if (terrainSurfaceController) terrainSurfaceController.destroy()
      if (terrainController) terrainController.destroy()
      terrainControllerRef.current = null
      wheelCameraController.destroy()
      wheelCameraControllerRef.current = null
      map.stop()
      map.remove()
      mapRef.current = null
      semanticRef.current = null
      countyInteractionRef.current = null
    }
  }, [applyCurrentPresentation, manifest, refreshSemanticSubjects])

  useEffect(() => {
    const map = mapRef.current
    if (map && styleReadyRef.current) {
      applyCurrentPresentation(map)
      refreshSemanticSubjects()
    }
  }, [applyCurrentPresentation, overlays, refreshSemanticSubjects, selectedCountyId])

  useEffect(() => {
    if (!focusRequest || !mapRef.current) return
    let cancelled = false
    const resolveLocationId = async (): Promise<string | null> => {
      if (focusRequest.target.kind === 'location') return focusRequest.target.locationId
      const [entries, semantic] = await Promise.all([
        mapRepository.loadSearchIndex(),
        mapRepository.loadSemanticIndex(),
      ])
      return buildCountyInteractionIndex(entries, semantic).primaryLocationForCounty(focusRequest.target.countyId) ?? null
    }
    resolveLocationId().then(async (locationId) => {
      if (!locationId || cancelled || !mapRef.current) return
      const location = await mapRepository.getLocation(locationId)
      if (cancelled || !mapRef.current) return
      callbacksRef.current.onWarning(null)
      const targetZoom = focusRequest.target.kind === 'county' ? 3.8 : 4.8
      const profile = terrainCameraProfile({
        zoom: targetZoom,
        topDownLocked: topDownLockedRef.current,
        available: terrainAvailableRef.current,
        terrainWasEnabled: targetZoom >= TERRAIN_ENTER_ZOOM,
      })
      mapRef.current.flyTo({
        center: mapPixelToLngLat(location, manifest),
        zoom: targetZoom,
        pitch: profile.pitch,
        ...cameraAnimation(reducedMotionRef.current, 'search'),
      })
    }).catch(() => {
      if (!cancelled) callbacksRef.current.onWarning('未能定位所选地图目标')
    })
    return () => { cancelled = true }
  }, [focusRequest, manifest])

  return (
    <>
      <div ref={containerRef} className="agot-map-canvas" aria-label="维斯特洛地图画布" />
      {initializationError && (
        <div className="map-canvas-error" role="alert">
          <MapIcon className="h-7 w-7 text-gold" aria-hidden="true" />
          <strong>地图画布无法初始化</strong>
          <span>请确认浏览器已启用图形加速，或稍后重新打开地图。</span>
        </div>
      )}
      {semanticInitializationError && !initializationError && (
        <div className="map-canvas-error" role="alert">
          <MapIcon className="h-7 w-7 text-gold" aria-hidden="true" />
          <strong>地图语义资料未能载入</strong>
          <span>请重新载入地图；正文与人物卷宗仍可正常使用。</span>
        </div>
      )}
    </>
  )
}
