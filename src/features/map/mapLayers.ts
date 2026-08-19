import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import { mapPixelToLngLat } from './coordinates.ts'
import {
  filterMapPointsByPixelBounds,
  type MapAssetPoint,
  type MapCharacterPoint,
} from './dynamicMapSubjects.ts'
import type { RegisteredMapIntelType, VisibleMapSubject } from './intelligence.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type { MapBounds, MapLocationSearchEntry, MapManifest } from './types'

export type MapMode = 'terrain' | 'political' | 'characters' | 'travel' | 'assets'

const INTELLIGENCE_TYPES_BY_MODE: Record<MapMode, ReadonlySet<RegisteredMapIntelType>> = {
  terrain: new Set(),
  political: new Set(['garrison', 'event']),
  characters: new Set(['character-location', 'identity', 'death']),
  travel: new Set(['road-closure']),
  assets: new Set(['asset']),
}

export function visibleMapSubjectsForMode(
  mode: MapMode,
  subjects: readonly unknown[],
): VisibleMapSubject[] {
  const allowedTypes = INTELLIGENCE_TYPES_BY_MODE[mode]
  return subjects.filter((subject): subject is VisibleMapSubject => {
    if (!subject || typeof subject !== 'object') return false
    const candidate = subject as Partial<VisibleMapSubject>
    return typeof candidate.id === 'string'
      && typeof candidate.type === 'string'
      && allowedTypes.has(candidate.type as RegisteredMapIntelType)
      && (candidate.intelLevel === 'confirmed' || candidate.intelLevel === 'rumored' || candidate.intelLevel === 'stale')
  })
}

type PoliticalFeatureMap = Pick<MapLibreMap, 'getSource' | 'setFeatureState' | 'removeFeatureState'>

export function applyPoliticalFeatureStates(
  map: PoliticalFeatureMap,
  states: readonly PoliticalFeatureState[],
  titleIds: readonly string[] = states.map((state) => state.titleId),
  previous: readonly PoliticalFeatureState[] = [],
): void {
  if (!map.getSource('agot-vector')) return
  const currentById = new Map(states.map((state) => [state.titleId, state]))
  const previousById = new Map(previous.map((state) => [state.titleId, state]))
  for (const titleId of [...new Set(titleIds)].sort()) {
    const state = currentById.get(titleId)
    const oldState = previousById.get(titleId)
    const provinceId = state?.provinceId ?? oldState?.provinceId
    if (provinceId === undefined) continue
    const target = { source: 'agot-vector', sourceLayer: 'provinces', id: provinceId }
    if (!state) {
      map.removeFeatureState(target)
      continue
    }
    map.setFeatureState(target, {
      politicalTitleId: state.titleId,
      politicalEffectiveTitleId: state.effectiveTitleId ?? null,
      politicalHolderId: state.holderId ?? null,
      politicalHouseId: state.houseId ?? null,
      politicalColor: state.color,
      politicalSigil: state.sigil ?? null,
    })
  }
}

export const JOURNEY_ROUTE_SOURCE = 'agot-active-journey-route'
export const JOURNEY_PROGRESS_SOURCE = 'agot-active-journey-progress'
export const JOURNEY_POSITION_SOURCE = 'agot-active-journey-position'
export const CHARACTER_POINT_SOURCE = 'agot-character-point-source'
export const CHARACTER_POINT_LAYER = 'agot-character-points'
export const ASSET_POINT_SOURCE = 'agot-asset-point-source'
export const ASSET_POINT_LAYER = 'agot-asset-points'

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
    [CHARACTER_POINT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
  },
  political: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': true,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
    [CHARACTER_POINT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
  },
  characters: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
    [CHARACTER_POINT_LAYER]: true,
    [ASSET_POINT_LAYER]: false,
  },
  travel: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': true,
    'agot-routes': true,
    [CHARACTER_POINT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
  },
  assets: {
    'agot-terrain': true,
    'agot-hillshade': true,
    'agot-provinces': false,
    'agot-borders': true,
    'agot-roads': false,
    'agot-routes': false,
    [CHARACTER_POINT_LAYER]: false,
    [ASSET_POINT_LAYER]: true,
  },
}

function dynamicPointCollection(
  characters: readonly MapCharacterPoint[],
  assets: readonly MapAssetPoint[],
  manifest: MapManifest,
): { characters: GeoJSON.FeatureCollection; assets: GeoJSON.FeatureCollection } {
  return {
    characters: {
      type: 'FeatureCollection',
      features: characters.map((point) => ({
        type: 'Feature',
        id: point.id,
        geometry: { type: 'Point', coordinates: mapPixelToLngLat(point, manifest) },
        properties: {
          id: point.id,
          characterId: point.characterId,
          name: point.name,
          locationId: point.locationId,
        },
      })),
    },
    assets: {
      type: 'FeatureCollection',
      features: assets.map((point) => ({
        type: 'Feature',
        id: point.id,
        geometry: { type: 'Point', coordinates: mapPixelToLngLat(point, manifest) },
        properties: {
          id: point.id,
          assetId: point.assetId,
          assetType: point.assetType,
          name: point.name,
          locationId: point.locationId,
          itemCount: point.itemCount,
        },
      })),
    },
  }
}

export function addDynamicMapSubjectLayers(map: MapLibreMap): void {
  const empty = { type: 'FeatureCollection' as const, features: [] }
  if (!map.getSource(CHARACTER_POINT_SOURCE)) map.addSource(CHARACTER_POINT_SOURCE, { type: 'geojson', data: empty })
  if (!map.getSource(ASSET_POINT_SOURCE)) map.addSource(ASSET_POINT_SOURCE, { type: 'geojson', data: empty })
  if (!map.getLayer(CHARACTER_POINT_LAYER)) map.addLayer({
    id: CHARACTER_POINT_LAYER,
    type: 'circle',
    source: CHARACTER_POINT_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 6, 9],
      'circle-color': '#d8c38b',
      'circle-stroke-color': '#302516',
      'circle-stroke-width': 2,
      'circle-opacity': 0.96,
    },
  })
  if (!map.getLayer(ASSET_POINT_LAYER)) map.addLayer({
    id: ASSET_POINT_LAYER,
    type: 'circle',
    source: ASSET_POINT_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4.5, 6, 8],
      'circle-color': '#8db8c4',
      'circle-stroke-color': '#1e3034',
      'circle-stroke-width': 2,
      'circle-opacity': 0.94,
    },
  })
}

export function syncDynamicMapSubjects(
  map: MapLibreMap,
  manifest: MapManifest,
  characters: readonly MapCharacterPoint[],
  assets: readonly MapAssetPoint[],
  pixelBounds: MapBounds,
): void {
  if (!map.isStyleLoaded()) return
  addDynamicMapSubjectLayers(map)
  const visibleCharacters = filterMapPointsByPixelBounds(characters, pixelBounds)
  const visibleAssets = filterMapPointsByPixelBounds(assets, pixelBounds)
  const collections = dynamicPointCollection(visibleCharacters, visibleAssets, manifest)
  ;(map.getSource(CHARACTER_POINT_SOURCE) as GeoJSONSource).setData(collections.characters)
  ;(map.getSource(ASSET_POINT_SOURCE) as GeoJSONSource).setData(collections.assets)
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
