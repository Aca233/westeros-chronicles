import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import { mapPixelToLngLat } from './coordinates'
import type { MapLocationSearchEntry, MapManifest } from './types'

export type MapMode = 'terrain' | 'political' | 'characters' | 'travel' | 'assets'

export const JOURNEY_ROUTE_SOURCE = 'agot-active-journey-route'
export const JOURNEY_PROGRESS_SOURCE = 'agot-active-journey-progress'
export const JOURNEY_POSITION_SOURCE = 'agot-active-journey-position'

export const LOCATION_CLUSTER_SOURCE = 'agot-location-cluster-source'
export const LOCATION_CLUSTER_LAYER = 'agot-location-clusters'
export const LOCATION_POINT_LAYER = 'agot-location-points'

const MODE_VISIBILITY: Record<MapMode, Record<string, boolean>> = {
  terrain: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': true,
    'agot-routes': false,
  },
  political: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': true,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
  },
  characters: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
  },
  travel: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': true,
    'agot-routes': true,
  },
  assets: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
  },
}

export function applyMapMode(map: MapLibreMap, mode: MapMode): void {
  for (const [layerId, visible] of Object.entries(MODE_VISIBILITY[mode])) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

export function addLocationClusterLayers(
  map: MapLibreMap,
  entries: MapLocationSearchEntry[],
  manifest: MapManifest,
): void {
  if (map.getSource(LOCATION_CLUSTER_SOURCE)) return
  const data = {
    type: 'FeatureCollection' as const,
    features: entries.map((entry) => ({
      type: 'Feature' as const,
      id: entry.id,
      geometry: { type: 'Point' as const, coordinates: mapPixelToLngLat(entry, manifest) },
      properties: {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        importance: entry.importance,
        regionId: entry.regionId,
      },
    })),
  }
  map.addSource(LOCATION_CLUSTER_SOURCE, {
    type: 'geojson',
    data,
    cluster: true,
    clusterMaxZoom: 4,
    clusterRadius: 70,
    clusterProperties: {
      maxImportance: ['max', ['get', 'importance']],
    },
  })
  map.addLayer({
    id: LOCATION_CLUSTER_LAYER,
    type: 'circle',
    source: LOCATION_CLUSTER_SOURCE,
    filter: [
      'all',
      ['has', 'point_count'],
      ['>=', ['get', 'maxImportance'], ['interpolate', ['linear'], ['zoom'], 0, 72, 1, 55, 2.5, 30, 4, 20]],
    ],
    paint: {
      'circle-color': '#c6aa68',
      'circle-stroke-color': '#342618',
      'circle-stroke-width': 1.4,
      'circle-opacity': 0.82,
      'circle-radius': ['step', ['get', 'point_count'], 8, 12, 10, 60, 13, 240, 16],
    },
  })
  map.addLayer({
    id: LOCATION_POINT_LAYER,
    type: 'circle',
    source: LOCATION_CLUSTER_SOURCE,
    filter: [
      'all',
      ['!', ['has', 'point_count']],
      ['>=', ['get', 'importance'], ['interpolate', ['linear'], ['zoom'], 0, 72, 1, 55, 2.5, 30, 4, 20, 5.5, 0]],
    ],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3.2, 6, 6.2],
      'circle-color': [
        'match', ['get', 'type'],
        'port', '#8db8c4',
        'ruin', '#8e8579',
        'landmark', '#d5bd78',
        '#ead9a7',
      ],
      'circle-stroke-color': '#2c2013',
      'circle-stroke-width': 1.4,
      'circle-opacity': 0.94,
    },
  })
  if (map.getLayer('agot-locations')) map.setLayoutProperty('agot-locations', 'visibility', 'none')
}

export async function zoomToCluster(map: MapLibreMap, clusterId: number, coordinates: [number, number]): Promise<void> {
  const source = map.getSource(LOCATION_CLUSTER_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const zoom = await source.getClusterExpansionZoom(clusterId)
  map.easeTo({ center: coordinates, zoom, duration: 500 })
}
