import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { lngLatToMapPixel, mapPixelToLngLat } from '../coordinates';
import { JOURNEY_POSITION_SOURCE, JOURNEY_PROGRESS_SOURCE, JOURNEY_ROUTE_SOURCE } from '../mapLayers';
import type { MapBounds, MapManifest } from '../types';
import type { RoutePlan } from '../routing/types';
import type { ActiveJourney } from '../travel/types';

export function viewportPixelBounds(map: MapLibreMap, manifest: MapManifest) {
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

export function ensureJourneyLayers(map: MapLibreMap): void {
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

export function syncJourneyLayers(
  map: MapLibreMap,
  manifest: MapManifest,
  routePlan: RoutePlan | null | undefined,
  journey: ActiveJourney | undefined,
): void {
  if (!map.getSource('agot-vector')) return
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
