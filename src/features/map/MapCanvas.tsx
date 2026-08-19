import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import maplibregl, {
  type ErrorEvent as MapLibreErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { lngLatToMapPixel, mapPixelToLngLat } from './coordinates'
import {
  applyPoliticalFeatureStates,
  applyMapMode,
  addSelectedCountyLocationLayers,
  ASSET_POINT_LAYER,
  CHARACTER_POINT_LAYER,
  COUNTY_HIT_LAYER,
  POLITICAL_HOUSE_LABEL_LAYER,
  JOURNEY_POSITION_SOURCE,
  JOURNEY_PROGRESS_SOURCE,
  JOURNEY_ROUTE_SOURCE,
  loadCountyLocationIcons,
  SELECTED_COUNTY_LOCATION_LAYER,
  syncSelectedCountyLocations,
  syncPoliticalHouseLabels,
  syncDynamicMapSubjects,
  type MapMode,
} from './mapLayers'
import { createLocalMapStyle } from './mapStyle'
import { changedTitleIds, type PoliticalFeatureState } from './politicalProjection.ts'
import { semanticTitlesAffectedByChanges } from './semanticPoliticalLabels.ts'
import { cameraAnimation, configureCk3Camera, createCk3MapOptions } from './cameraProfile.ts'
import { semanticZoomState } from './semanticZoom.ts'
import { mapRepository } from './repository'
import type {
  MapBounds,
  MapManifest,
  SemanticMembershipIndex,
  SemanticRank,
} from './types'
import type { RoutePlan } from './routing/types'
import type { ActiveJourney } from './travel/types'
import type { MapViewport } from './mapUiStore'
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { CharacterId } from '../characters/types'
import { buildCountyInteractionIndex, type CountyInteractionIndex } from './countyInteraction.ts'

interface MapCanvasProps {
  manifest: MapManifest
  selectedLocationId: string | null
  initialViewport: MapViewport | null
  onSelectLocation: (locationId: string | null) => void
  onViewportChange: (viewport: MapViewport) => void
  onWarning: (message: string | null) => void
  mode: MapMode
  routePlan?: RoutePlan | null
  journey?: ActiveJourney
  politicalStates?: readonly PoliticalFeatureState[]
  characterPoints?: readonly MapCharacterPoint[]
  assetPoints?: readonly MapAssetPoint[]
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
  selectedLocationId,
  initialViewport,
  onSelectLocation,
  onViewportChange,
  onWarning,
  mode,
  routePlan,
  journey,
  politicalStates = [],
  characterPoints = [],
  assetPoints = [],
  onSelectCharacter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [initializationError, setInitializationError] = useState(false)
  const [semanticInitializationError, setSemanticInitializationError] = useState(false)
  const callbacksRef = useRef({ onSelectLocation, onSelectCharacter, onViewportChange, onWarning })
  const modeRef = useRef(mode)
  const routeRef = useRef({ routePlan, journey })
  const politicalRef = useRef<readonly PoliticalFeatureState[]>(politicalStates)
  const dynamicRef = useRef({ characterPoints, assetPoints })
  const semanticRef = useRef<SemanticRuntimeContext | null>(null)
  const countyInteractionRef = useRef<CountyInteractionIndex | null>(null)
  const selectedLocationRef = useRef(selectedLocationId)
  const reducedMotionRef = useRef(false)

  const refreshSemanticSubjects = useCallback((pixelBounds?: MapBounds): void => {
    const map = mapRef.current
    const semantic = semanticRef.current
    if (!map?.isStyleLoaded() || !semantic) return
    const bounds = pixelBounds ?? viewportPixelBounds(map, manifest)
    syncDynamicMapSubjects(
      map,
      manifest,
      dynamicRef.current.characterPoints,
      dynamicRef.current.assetPoints,
      bounds,
      { ...semantic, zoomState: semanticZoomState(map.getZoom()) },
    )
  }, [manifest])

  const refreshPoliticalHouseLabels = useCallback((
    affectedTitleIds?: ReadonlySet<string>,
    pixelBounds?: MapBounds,
  ): void => {
    const map = mapRef.current
    const semantic = semanticRef.current
    if (!map?.isStyleLoaded() || !semantic || modeRef.current !== 'political') return
    const result = syncPoliticalHouseLabels(map, {
      rank: semantic.primaryRank,
      titles: semantic.titles,
      memberships: semantic.memberships,
      states: politicalRef.current,
      pixelBounds: pixelBounds ?? viewportPixelBounds(map, manifest),
      manifest,
    }, affectedTitleIds)
    if (result === 'updated' && map.getLayer(POLITICAL_HOUSE_LABEL_LAYER)) {
      map.setLayoutProperty(POLITICAL_HOUSE_LABEL_LAYER, 'visibility', 'visible')
    }
    if (result === 'failed') callbacksRef.current.onWarning('政治家族标签未能更新，其他地图内容不受影响')
  }, [manifest])

  useEffect(() => {
    callbacksRef.current = { onSelectLocation, onSelectCharacter, onViewportChange, onWarning }
  }, [onSelectCharacter, onSelectLocation, onViewportChange, onWarning])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    selectedLocationRef.current = selectedLocationId
    const map = mapRef.current
    const index = countyInteractionRef.current
    if (map?.isStyleLoaded() && index) {
      syncSelectedCountyLocations(map, manifest, index, selectedLocationId)
      applyMapMode(map, modeRef.current)
    }
  }, [manifest, selectedLocationId])

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
      const semantic = semanticRef.current
      if (semantic) {
        refreshPoliticalHouseLabels(semanticTitlesAffectedByChanges(changedIds, semantic.memberships))
      }
    }
  }, [politicalStates, refreshPoliticalHouseLabels])

  useEffect(() => {
    dynamicRef.current = { characterPoints, assetPoints }
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      refreshSemanticSubjects()
      applyMapMode(map, modeRef.current)
    }
  }, [assetPoints, characterPoints, refreshSemanticSubjects])

  useEffect(() => {
    if (!containerRef.current) return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mediaQuery.matches
    let cameraCleanup = () => {}
    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches
      if (mapRef.current) {
        cameraCleanup()
        cameraCleanup = configureCk3Camera(mapRef.current, event.matches)
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
    cameraCleanup = configureCk3Camera(map, reducedMotionRef.current)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    const handleMapError = (event: MapLibreErrorEvent) => {
      if (/404|not found/i.test(event.error.message)) return
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
      applyMapMode(map, modeRef.current)
      refreshSemanticSubjects(pixelBounds)
      refreshPoliticalHouseLabels(undefined, pixelBounds)
    }
    const handleZoomEnd = () => {
      const semantic = semanticRef.current
      if (!semantic) return
      const state = semanticZoomState(map.getZoom())
      if (state.primaryRank === semantic.primaryRank) return
      semantic.primaryRank = state.primaryRank
      refreshSemanticSubjects()
      refreshPoliticalHouseLabels()
    }
    const handleCountyClick = (event: MapLayerMouseEvent) => {
      const foregroundLayers = [CHARACTER_POINT_LAYER, ASSET_POINT_LAYER, SELECTED_COUNTY_LOCATION_LAYER]
        .filter((layerId) => Boolean(map.getLayer(layerId)))
      if (foregroundLayers.length && map.queryRenderedFeatures(event.point, { layers: foregroundLayers }).length) return
      const baronyId = event.features?.[0]?.properties?.baronyId
      if (typeof baronyId !== 'string') return
      const locationId = countyInteractionRef.current?.primaryLocationForBarony(baronyId)
      if (locationId) callbacksRef.current.onSelectLocation(locationId)
    }
    const handleExpandedLocationClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.id
      if (typeof locationId === 'string') callbacksRef.current.onSelectLocation(locationId)
    }
    const handleBlankMapClick = (event: MapMouseEvent) => {
      const interactiveLayers = [
        COUNTY_HIT_LAYER,
        SELECTED_COUNTY_LOCATION_LAYER,
        CHARACTER_POINT_LAYER,
        ASSET_POINT_LAYER,
      ].filter((layerId) => Boolean(map.getLayer(layerId)))
      if (!interactiveLayers.length) return
      if (map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length === 0) {
        callbacksRef.current.onSelectLocation(null)
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
      if (typeof locationId === 'string') callbacksRef.current.onSelectLocation(locationId)
    }
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const clearPointer = () => { map.getCanvas().style.cursor = '' }

    map.on('error', handleMapError)
    map.on('moveend', handleMoveEnd)
    map.on('zoomend', handleZoomEnd)
    map.on('click', handleBlankMapClick)
    map.on('click', COUNTY_HIT_LAYER, handleCountyClick)
    map.on('mouseenter', COUNTY_HIT_LAYER, showPointer)
    map.on('mouseleave', COUNTY_HIT_LAYER, clearPointer)
    const initializeLocationLayers = () => {
      addSelectedCountyLocationLayers(map)
      map.on('click', SELECTED_COUNTY_LOCATION_LAYER, handleExpandedLocationClick)
      map.on('mouseenter', SELECTED_COUNTY_LOCATION_LAYER, showPointer)
      map.on('mouseleave', SELECTED_COUNTY_LOCATION_LAYER, clearPointer)
      const locationIconsReady = loadCountyLocationIcons(map)
        .catch(() => callbacksRef.current.onWarning('伯爵领内部地点图标未能载入，其他地图内容不受影响'))
      applyPoliticalFeatureStates(map, politicalRef.current)
      syncJourneyLayers(map, manifest, routeRef.current.routePlan, routeRef.current.journey)
      applyMapMode(map, modeRef.current)
      map.on('click', CHARACTER_POINT_LAYER, handleCharacterClick)
      map.on('click', ASSET_POINT_LAYER, handleAssetClick)
      map.on('mouseenter', CHARACTER_POINT_LAYER, showPointer)
      map.on('mouseleave', CHARACTER_POINT_LAYER, clearPointer)
      map.on('mouseenter', ASSET_POINT_LAYER, showPointer)
      map.on('mouseleave', ASSET_POINT_LAYER, clearPointer)
      Promise.all([mapRepository.loadSearchIndex(), mapRepository.loadSemanticIndex(), locationIconsReady])
        .then(([entries, semantic]) => {
          if (mapRef.current !== map) return
          const primaryRank = semanticZoomState(map.getZoom()).primaryRank
          semanticRef.current = { ...semantic, primaryRank }
          countyInteractionRef.current = buildCountyInteractionIndex(entries, semantic)
          syncSelectedCountyLocations(map, manifest, countyInteractionRef.current, selectedLocationRef.current)
          setSemanticInitializationError(false)
          applyMapMode(map, modeRef.current)
          refreshSemanticSubjects()
          refreshPoliticalHouseLabels()
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

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => map.resize())
    resizeObserver?.observe(containerRef.current)

    return () => {
      resizeObserver?.disconnect()
      mediaQuery.removeEventListener('change', handleReducedMotionChange)
      cameraCleanup()
      map.off('error', handleMapError)
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
      map.stop()
      map.remove()
      mapRef.current = null
      semanticRef.current = null
      countyInteractionRef.current = null
    }
  }, [manifest, refreshPoliticalHouseLabels, refreshSemanticSubjects])

  useEffect(() => {
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      applyMapMode(map, mode)
      if (mode === 'political') refreshPoliticalHouseLabels()
    }
  }, [mode, refreshPoliticalHouseLabels])

  useEffect(() => {
    if (!selectedLocationId || !mapRef.current) return
    let cancelled = false
    mapRepository.getLocation(selectedLocationId)
      .then((location) => {
        if (cancelled || !mapRef.current) return
        callbacksRef.current.onWarning(null)
        mapRef.current.flyTo({
          center: mapPixelToLngLat(location, manifest),
          zoom: 4.8,
          ...cameraAnimation(reducedMotionRef.current, 'search'),
        })
      })
      .catch(() => {
        if (!cancelled) callbacksRef.current.onWarning('未能定位所选地点')
      })
    return () => { cancelled = true }
  }, [manifest, selectedLocationId])

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
