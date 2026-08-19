import React, { useEffect, useRef, useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import maplibregl, {
  type ErrorEvent as MapLibreErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { mapPixelToLngLat } from './coordinates'
import {
  addLocationClusterLayers,
  applyMapMode,
  LOCATION_CLUSTER_LAYER,
  LOCATION_POINT_LAYER,
  zoomToCluster,
  type MapMode,
} from './mapLayers'
import { createLocalMapStyle } from './mapStyle'
import { mapRepository } from './repository'
import type { MapManifest } from './types'
import type { RoutePlan } from './routing/types'
import type { ActiveJourney } from './travel/types'
import type { MapViewport } from './mapUiStore'

interface MapCanvasProps {
  manifest: MapManifest
  selectedLocationId: string | null
  initialViewport: MapViewport | null
  onSelectLocation: (locationId: string) => void
  onViewportChange: (viewport: MapViewport) => void
  onWarning: (message: string | null) => void
  mode: MapMode
  routePlan?: RoutePlan | null
  journey?: ActiveJourney
}

const JOURNEY_ROUTE_SOURCE = 'agot-active-journey-route'
const JOURNEY_PROGRESS_SOURCE = 'agot-active-journey-progress'
const JOURNEY_POSITION_SOURCE = 'agot-active-journey-position'

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
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.4, 5, 3.2],
      'line-opacity': 0.78,
      'line-dasharray': [2, 1.25],
    },
  })
  if (!map.getLayer(JOURNEY_PROGRESS_SOURCE)) map.addLayer({
    id: JOURNEY_PROGRESS_SOURCE,
    type: 'line',
    source: JOURNEY_PROGRESS_SOURCE,
    paint: {
      'line-color': '#f0d58a',
      'line-width': ['interpolate', ['linear'], ['zoom'], 0, 2.6, 5, 5],
      'line-opacity': 0.96,
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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [initializationError, setInitializationError] = useState(false)
  const callbacksRef = useRef({ onSelectLocation, onViewportChange, onWarning })
  const modeRef = useRef(mode)
  const routeRef = useRef({ routePlan, journey })

  useEffect(() => {
    callbacksRef.current = { onSelectLocation, onViewportChange, onWarning }
  }, [onSelectLocation, onViewportChange, onWarning])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    routeRef.current = { routePlan, journey }
    const map = mapRef.current
    if (map?.isStyleLoaded()) syncJourneyLayers(map, manifest, routePlan, journey)
  }, [journey, manifest, routePlan])

  useEffect(() => {
    if (!containerRef.current) return

    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: createLocalMapStyle(manifest),
        center: initialViewport
          ? [initialViewport.longitude, initialViewport.latitude]
          : [0, 0],
        zoom: initialViewport?.zoom ?? 0,
        minZoom: manifest.minZoom,
        maxZoom: manifest.maxZoom,
        maxPitch: 0,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        attributionControl: false,
        cooperativeGestures: false,
        transformRequest: (url) => ({
          url: url.startsWith('/') ? new URL(url, window.location.href).href : url,
        }),
      })
    } catch {
      setInitializationError(true)
      callbacksRef.current.onWarning('地图画布无法初始化，正文与人物卷宗不受影响')
      return
    }
    setInitializationError(false)
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
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
    }
    const handleLocationClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.id
      if (typeof locationId === 'string') callbacksRef.current.onSelectLocation(locationId)
    }
    const handleClusterClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const clusterId = feature?.properties?.cluster_id
      const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null
      if (typeof clusterId !== 'number' || !coordinates) return
      void zoomToCluster(map, clusterId, [Number(coordinates[0]), Number(coordinates[1])])
    }
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const clearPointer = () => { map.getCanvas().style.cursor = '' }

    map.on('error', handleMapError)
    map.on('moveend', handleMoveEnd)
    map.on('click', 'agot-locations', handleLocationClick)
    map.on('mouseenter', 'agot-locations', showPointer)
    map.on('mouseleave', 'agot-locations', clearPointer)
    const initializeLocationLayers = () => {
      applyMapMode(map, modeRef.current)
      syncJourneyLayers(map, manifest, routeRef.current.routePlan, routeRef.current.journey)
      mapRepository.loadSearchIndex()
        .then((entries) => {
          if (mapRef.current !== map) return
          addLocationClusterLayers(map, entries, manifest)
          applyMapMode(map, modeRef.current)
          map.on('click', LOCATION_POINT_LAYER, handleLocationClick)
          map.on('click', LOCATION_CLUSTER_LAYER, handleClusterClick)
          map.on('mouseenter', LOCATION_POINT_LAYER, showPointer)
          map.on('mouseleave', LOCATION_POINT_LAYER, clearPointer)
          map.on('mouseenter', LOCATION_CLUSTER_LAYER, showPointer)
          map.on('mouseleave', LOCATION_CLUSTER_LAYER, clearPointer)
        })
        .catch(() => callbacksRef.current.onWarning('地点聚合索引未能载入，仍可浏览基础地图'))
    }
    map.on('load', initializeLocationLayers)

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => map.resize())
    resizeObserver?.observe(containerRef.current)

    return () => {
      resizeObserver?.disconnect()
      map.off('error', handleMapError)
      map.off('moveend', handleMoveEnd)
      map.off('click', 'agot-locations', handleLocationClick)
      map.off('mouseenter', 'agot-locations', showPointer)
      map.off('mouseleave', 'agot-locations', clearPointer)
      map.off('load', initializeLocationLayers)
      map.stop()
      map.remove()
      mapRef.current = null
    }
  }, [manifest])

  useEffect(() => {
    const map = mapRef.current
    if (map?.isStyleLoaded()) applyMapMode(map, mode)
  }, [mode])

  useEffect(() => {
    if (!selectedLocationId || !mapRef.current) return
    let cancelled = false
    mapRepository.getLocation(selectedLocationId)
      .then((location) => {
        if (cancelled || !mapRef.current) return
        callbacksRef.current.onWarning(null)
        mapRef.current.flyTo({
          center: mapPixelToLngLat(location, manifest),
          zoom: Math.max(mapRef.current.getZoom(), 4.5),
          duration: 850,
          essential: true,
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
    </>
  )
}
