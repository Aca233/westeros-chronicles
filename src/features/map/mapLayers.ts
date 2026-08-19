import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import { mapPixelToLngLat } from './coordinates.ts'
import {
  filterMapPointsByPixelBounds,
  type MapAssetPoint,
  type MapCharacterPoint,
} from './dynamicMapSubjects.ts'
import type { RegisteredMapIntelType, VisibleMapSubject } from './intelligence.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type { CountyInteractionIndex } from './countyInteraction.ts'
import { semanticDetailOpacityExpression, type SemanticZoomState } from './semanticZoom.ts'
import { aggregateAssetPoints, aggregateCharacterPoints, type SemanticSubjectAggregate } from './semanticAggregation.ts'
import {
  buildPoliticalHouseLabelCollection,
  type PoliticalHouseLabelInput,
} from './semanticPoliticalLabels.ts'
import type {
  MapBounds,
  MapManifest,
  SemanticMembership,
  SemanticTitle,
} from './types'

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
      politicalRealmTitleId: state.realmTitleId ?? null,
      politicalRealmHolderId: state.realmHolderId ?? null,
      politicalRealmHouseId: state.realmHouseId ?? null,
      politicalColor: state.realmColor ?? state.color,
      politicalSigil: state.sigil ?? null,
    })
  }
}

export const JOURNEY_ROUTE_SOURCE = 'agot-active-journey-route'
export const JOURNEY_PROGRESS_SOURCE = 'agot-active-journey-progress'
export const JOURNEY_POSITION_SOURCE = 'agot-active-journey-position'
export const CHARACTER_POINT_SOURCE = 'agot-character-point-source'
export const CHARACTER_POINT_LAYER = 'agot-character-points'
export const CHARACTER_AGGREGATE_SOURCE = 'agot-character-aggregate-source'
export const CHARACTER_AGGREGATE_LAYER = 'agot-character-aggregates'
export const CHARACTER_AGGREGATE_COUNT_LAYER = 'agot-character-aggregate-counts'
export const ASSET_POINT_SOURCE = 'agot-asset-point-source'
export const ASSET_POINT_LAYER = 'agot-asset-points'
export const ASSET_AGGREGATE_SOURCE = 'agot-asset-aggregate-source'
export const ASSET_AGGREGATE_LAYER = 'agot-asset-aggregates'
export const ASSET_AGGREGATE_COUNT_LAYER = 'agot-asset-aggregate-counts'
export const POLITICAL_HOUSE_LABEL_SOURCE = 'agot-political-house-label-source'
export const POLITICAL_HOUSE_LABEL_LAYER = 'agot-political-house-labels'
export const COUNTY_HIT_LAYER = 'agot-county-hit-areas'
export const SELECTED_COUNTY_OUTLINE_LAYER = 'agot-selected-county-outline'
export const SELECTED_COUNTY_LOCATION_SOURCE = 'agot-selected-county-location-source'
export const SELECTED_COUNTY_LOCATION_LAYER = 'agot-selected-county-locations'

const GENERIC_COUNTY_LOCATION_ICONS = {
  castle: '/assets/map-icons/location-castle.webp',
  city: '/assets/map-icons/location-city.webp',
  town: '/assets/map-icons/location-town.webp',
  village: '/assets/map-icons/location-village.webp',
  port: '/assets/map-icons/location-port.webp',
  ruin: '/assets/map-icons/location-ruin.webp',
  landmark: '/assets/map-icons/location-landmark.webp',
  region: '/assets/map-icons/location-region.webp',
} as const

const SPECIAL_COUNTY_LOCATION_ICONS: Readonly<Record<string, string>> = {
  b_winterfell: '/assets/game-icons/location-winterfell.webp',
  b_sunspear: '/assets/game-icons/location-sunspear.webp',
  b_the_hightower: '/assets/game-icons/location-hightower.webp',
  b_oldtown: '/assets/game-icons/location-hightower.webp',
}

const SEMANTIC_VISIBILITY = {
  'agot-realm-boundaries': true,
  'agot-duchy-boundaries': true,
  'agot-county-boundaries': true,
  'agot-realm-labels': true,
  'agot-duchy-labels': true,
  'agot-county-labels': true,
  [SELECTED_COUNTY_OUTLINE_LAYER]: true,
} as const

const COMMON_VISIBILITY = {
  'agot-terrain': true,
  'agot-hillshade': true,
  [COUNTY_HIT_LAYER]: true,
  ...SEMANTIC_VISIBILITY,
} as const

export const MODE_VISIBILITY: Record<MapMode, Record<string, boolean>> = {
  terrain: {
    ...COMMON_VISIBILITY,
    'agot-provinces': false,
    [POLITICAL_HOUSE_LABEL_LAYER]: false,
    'agot-roads': true,
    'agot-routes': false,
    [JOURNEY_ROUTE_SOURCE]: false,
    [JOURNEY_PROGRESS_SOURCE]: false,
    [JOURNEY_POSITION_SOURCE]: false,
    [CHARACTER_POINT_LAYER]: false,
    [CHARACTER_AGGREGATE_LAYER]: false,
    [CHARACTER_AGGREGATE_COUNT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
    [ASSET_AGGREGATE_LAYER]: false,
    [ASSET_AGGREGATE_COUNT_LAYER]: false,
  },
  political: {
    ...COMMON_VISIBILITY,
    'agot-provinces': true,
    [POLITICAL_HOUSE_LABEL_LAYER]: true,
    'agot-roads': false,
    'agot-routes': false,
    [JOURNEY_ROUTE_SOURCE]: false,
    [JOURNEY_PROGRESS_SOURCE]: false,
    [JOURNEY_POSITION_SOURCE]: false,
    [CHARACTER_POINT_LAYER]: false,
    [CHARACTER_AGGREGATE_LAYER]: false,
    [CHARACTER_AGGREGATE_COUNT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
    [ASSET_AGGREGATE_LAYER]: false,
    [ASSET_AGGREGATE_COUNT_LAYER]: false,
  },
  characters: {
    ...COMMON_VISIBILITY,
    'agot-provinces': false,
    [POLITICAL_HOUSE_LABEL_LAYER]: false,
    'agot-roads': false,
    'agot-routes': false,
    [JOURNEY_ROUTE_SOURCE]: false,
    [JOURNEY_PROGRESS_SOURCE]: false,
    [JOURNEY_POSITION_SOURCE]: false,
    [CHARACTER_POINT_LAYER]: true,
    [CHARACTER_AGGREGATE_LAYER]: true,
    [CHARACTER_AGGREGATE_COUNT_LAYER]: true,
    [ASSET_POINT_LAYER]: false,
    [ASSET_AGGREGATE_LAYER]: false,
    [ASSET_AGGREGATE_COUNT_LAYER]: false,
  },
  travel: {
    ...COMMON_VISIBILITY,
    'agot-provinces': false,
    [POLITICAL_HOUSE_LABEL_LAYER]: false,
    'agot-roads': true,
    'agot-routes': true,
    [JOURNEY_ROUTE_SOURCE]: true,
    [JOURNEY_PROGRESS_SOURCE]: true,
    [JOURNEY_POSITION_SOURCE]: true,
    [CHARACTER_POINT_LAYER]: false,
    [CHARACTER_AGGREGATE_LAYER]: false,
    [CHARACTER_AGGREGATE_COUNT_LAYER]: false,
    [ASSET_POINT_LAYER]: false,
    [ASSET_AGGREGATE_LAYER]: false,
    [ASSET_AGGREGATE_COUNT_LAYER]: false,
  },
  assets: {
    ...COMMON_VISIBILITY,
    'agot-provinces': false,
    [POLITICAL_HOUSE_LABEL_LAYER]: false,
    'agot-roads': false,
    'agot-routes': false,
    [JOURNEY_ROUTE_SOURCE]: false,
    [JOURNEY_PROGRESS_SOURCE]: false,
    [JOURNEY_POSITION_SOURCE]: false,
    [CHARACTER_POINT_LAYER]: false,
    [CHARACTER_AGGREGATE_LAYER]: false,
    [CHARACTER_AGGREGATE_COUNT_LAYER]: false,
    [ASSET_POINT_LAYER]: true,
    [ASSET_AGGREGATE_LAYER]: true,
    [ASSET_AGGREGATE_COUNT_LAYER]: true,
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

function dynamicAggregateCollection(
  aggregates: readonly SemanticSubjectAggregate[],
  manifest: MapManifest,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: aggregates.map((aggregate) => ({
      type: 'Feature',
      id: aggregate.id,
      geometry: { type: 'Point', coordinates: mapPixelToLngLat(aggregate, manifest) },
      properties: {
        id: aggregate.id,
        kind: aggregate.kind,
        rank: aggregate.rank,
        scopeId: aggregate.scopeId,
        count: aggregate.count,
        memberIds: aggregate.memberIds,
      },
    })),
  }
}

export function addDynamicMapSubjectLayers(map: MapLibreMap): void {
  const empty = { type: 'FeatureCollection' as const, features: [] }
  if (!map.getSource(CHARACTER_POINT_SOURCE)) map.addSource(CHARACTER_POINT_SOURCE, { type: 'geojson', data: empty })
  if (!map.getSource(ASSET_POINT_SOURCE)) map.addSource(ASSET_POINT_SOURCE, { type: 'geojson', data: empty })
  if (!map.getSource(CHARACTER_AGGREGATE_SOURCE)) map.addSource(CHARACTER_AGGREGATE_SOURCE, { type: 'geojson', data: empty })
  if (!map.getSource(ASSET_AGGREGATE_SOURCE)) map.addSource(ASSET_AGGREGATE_SOURCE, { type: 'geojson', data: empty })
  const aggregateOpacity: ExpressionSpecification = ['-', 1, semanticDetailOpacityExpression]
  if (!map.getLayer(CHARACTER_AGGREGATE_LAYER)) map.addLayer({
    id: CHARACTER_AGGREGATE_LAYER,
    type: 'circle',
    source: CHARACTER_AGGREGATE_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 8, 12, 16, 80, 24],
      'circle-color': '#d8c38b',
      'circle-stroke-color': '#302516',
      'circle-stroke-width': 2,
      'circle-opacity': aggregateOpacity,
    },
  })
  if (!map.getLayer(CHARACTER_AGGREGATE_COUNT_LAYER)) map.addLayer({
    id: CHARACTER_AGGREGATE_COUNT_LAYER,
    type: 'symbol',
    source: CHARACTER_AGGREGATE_SOURCE,
    layout: {
      visibility: 'none',
      'text-field': ['to-string', ['get', 'count']],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#241b10', 'text-opacity': aggregateOpacity },
  })
  if (!map.getLayer(ASSET_AGGREGATE_LAYER)) map.addLayer({
    id: ASSET_AGGREGATE_LAYER,
    type: 'circle',
    source: ASSET_AGGREGATE_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 8, 12, 16, 80, 24],
      'circle-color': '#8db8c4',
      'circle-stroke-color': '#1e3034',
      'circle-stroke-width': 2,
      'circle-opacity': aggregateOpacity,
    },
  })
  if (!map.getLayer(ASSET_AGGREGATE_COUNT_LAYER)) map.addLayer({
    id: ASSET_AGGREGATE_COUNT_LAYER,
    type: 'symbol',
    source: ASSET_AGGREGATE_SOURCE,
    layout: {
      visibility: 'none',
      'text-field': ['to-string', ['get', 'count']],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#13252a', 'text-opacity': aggregateOpacity },
  })
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
      'circle-opacity': ['*', 0.96, semanticDetailOpacityExpression],
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
      'circle-opacity': ['*', 0.94, semanticDetailOpacityExpression],
    },
  })
}

export interface SemanticSubjectContext {
  titles: readonly SemanticTitle[]
  memberships: readonly SemanticMembership[]
  zoomState: SemanticZoomState
}

export function syncDynamicMapSubjects(
  map: MapLibreMap,
  manifest: MapManifest,
  characters: readonly MapCharacterPoint[],
  assets: readonly MapAssetPoint[],
  pixelBounds: MapBounds,
  semanticContext?: SemanticSubjectContext,
): void {
  if (!map.isStyleLoaded()) return
  addDynamicMapSubjectLayers(map)
  const zoom = semanticContext?.zoomState.zoom
  const sendsAggregates = zoom !== undefined && zoom >= 2.5 && zoom <= 4.4
  const sendsPoints = zoom === undefined || zoom >= 4.1
  const visibleCharacters = sendsPoints ? filterMapPointsByPixelBounds(characters, pixelBounds) : []
  const visibleAssets = sendsPoints ? filterMapPointsByPixelBounds(assets, pixelBounds) : []
  const characterAggregates = sendsAggregates && semanticContext
    ? aggregateCharacterPoints({ points: characters, pixelBounds, ...semanticContext })
    : []
  const assetAggregates = sendsAggregates && semanticContext
    ? aggregateAssetPoints({ points: assets, pixelBounds, ...semanticContext })
    : []
  const collections = dynamicPointCollection(visibleCharacters, visibleAssets, manifest)
  ;(map.getSource(CHARACTER_POINT_SOURCE) as GeoJSONSource).setData(collections.characters)
  ;(map.getSource(ASSET_POINT_SOURCE) as GeoJSONSource).setData(collections.assets)
  ;(map.getSource(CHARACTER_AGGREGATE_SOURCE) as GeoJSONSource).setData(dynamicAggregateCollection(characterAggregates, manifest))
  ;(map.getSource(ASSET_AGGREGATE_SOURCE) as GeoJSONSource).setData(dynamicAggregateCollection(assetAggregates, manifest))
}

export function applyMapMode(map: MapLibreMap, mode: MapMode): void {
  for (const [layerId, visible] of Object.entries(MODE_VISIBILITY[mode])) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

type PoliticalHouseLabelMap = Pick<MapLibreMap, 'getSource' | 'getLayer' | 'setLayoutProperty'>

export function syncPoliticalHouseLabels(
  map: PoliticalHouseLabelMap,
  input: PoliticalHouseLabelInput,
  affectedTitleIds?: ReadonlySet<string>,
): 'updated' | 'skipped' | 'failed' {
  if (affectedTitleIds && !input.titles.some((title) =>
    title.rank === input.rank
    && affectedTitleIds.has(title.titleId)
    && title.mapX >= input.pixelBounds.minX
    && title.mapX <= input.pixelBounds.maxX
    && title.mapY >= input.pixelBounds.minY
    && title.mapY <= input.pixelBounds.maxY)) {
    return 'skipped'
  }
  const source = map.getSource(POLITICAL_HOUSE_LABEL_SOURCE) as GeoJSONSource | undefined
  if (!source) return 'skipped'
  try {
    source.setData(buildPoliticalHouseLabelCollection(input))
    return 'updated'
  } catch {
    try {
      source.setData({ type: 'FeatureCollection', features: [] })
    } catch {
      // The source itself is broken; layer isolation below still prevents stale labels.
    }
    if (map.getLayer(POLITICAL_HOUSE_LABEL_LAYER)) {
      map.setLayoutProperty(POLITICAL_HOUSE_LABEL_LAYER, 'visibility', 'none')
    }
    return 'failed'
  }
}

function countyLocationIconId(locationId: string, type: keyof typeof GENERIC_COUNTY_LOCATION_ICONS): string {
  return SPECIAL_COUNTY_LOCATION_ICONS[locationId]
    ? `agot-county-location-special-${locationId}`
    : `agot-county-location-${type}`
}

export async function loadCountyLocationIcons(map: MapLibreMap): Promise<void> {
  const definitions = [
    ...Object.entries(GENERIC_COUNTY_LOCATION_ICONS)
      .map(([type, path]) => [`agot-county-location-${type}`, path] as const),
    ...Object.entries(SPECIAL_COUNTY_LOCATION_ICONS)
      .map(([locationId, path]) => [`agot-county-location-special-${locationId}`, path] as const),
  ]
  await Promise.all(definitions.map(async ([imageId, path]) => {
    if (map.hasImage(imageId)) return
    const image = await map.loadImage(path)
    if (!map.hasImage(imageId)) map.addImage(imageId, image.data)
  }))
}

export function addSelectedCountyLocationLayers(map: MapLibreMap): void {
  if (!map.getSource(SELECTED_COUNTY_LOCATION_SOURCE)) {
    map.addSource(SELECTED_COUNTY_LOCATION_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(SELECTED_COUNTY_LOCATION_LAYER)) {
    map.addLayer({
      id: SELECTED_COUNTY_LOCATION_LAYER,
      type: 'symbol',
      source: SELECTED_COUNTY_LOCATION_SOURCE,
      minzoom: 3.5,
      layout: {
        'icon-image': ['get', 'iconId'],
        'icon-size': ['case', ['get', 'isPrimary'], 0.92, 0.68],
        'icon-allow-overlap': true,
        'icon-ignore-placement': false,
        'symbol-sort-key': ['case', ['get', 'isPrimary'], 10, 1],
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans CJK SC Regular'],
        'text-size': ['case', ['get', 'isPrimary'], 13, 11],
        'text-offset': [0, 2.1],
        'text-anchor': 'top',
        'text-optional': true,
        'text-allow-overlap': false,
      },
      paint: {
        'icon-opacity': 0.98,
        'text-color': '#f1e4bd',
        'text-halo-color': '#17130d',
        'text-halo-width': 1.4,
        'text-opacity': 0.96,
      },
    })
  }
}

export function syncSelectedCountyLocations(
  map: MapLibreMap,
  manifest: MapManifest,
  index: CountyInteractionIndex,
  selectedLocationId: string | null,
): void {
  addSelectedCountyLocationLayers(map)
  const source = map.getSource(SELECTED_COUNTY_LOCATION_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const selected = selectedLocationId ? index.selectedCountyForLocation(selectedLocationId) : undefined
  source.setData({
    type: 'FeatureCollection',
    features: selected?.locations.map((location) => ({
      type: 'Feature' as const,
      id: location.id,
      geometry: { type: 'Point' as const, coordinates: mapPixelToLngLat(location, manifest) },
      properties: {
        id: location.id,
        name: location.name,
        type: location.type,
        isPrimary: location.isPrimary,
        iconId: countyLocationIconId(location.id, location.type),
      },
    })) ?? [],
  })
  if (map.getLayer(SELECTED_COUNTY_OUTLINE_LAYER)) {
    map.setFilter(SELECTED_COUNTY_OUTLINE_LAYER, ['==', ['get', 'titleId'], selected?.countyId ?? ''])
    map.setLayoutProperty(SELECTED_COUNTY_OUTLINE_LAYER, 'visibility', selected ? 'visible' : 'none')
  }
}
