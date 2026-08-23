import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

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
import type {
  MapBounds,
  MapManifest,
  SemanticMembership,
  SemanticRank,
  SemanticTitle,
} from './types'
import type { MapPresentation } from './mapPresentation.ts'

export type MapInformationCategory = 'political' | 'characters' | 'roads' | 'assets'

const INTELLIGENCE_TYPES_BY_CATEGORY: Record<MapInformationCategory, ReadonlySet<RegisteredMapIntelType>> = {
  political: new Set(['garrison', 'event']),
  characters: new Set(['character-location', 'identity', 'death']),
  roads: new Set(['road-closure']),
  assets: new Set(['asset']),
}

export function visibleMapSubjectsForOverlay(
  category: MapInformationCategory,
  subjects: readonly unknown[],
): VisibleMapSubject[] {
  const allowedTypes = INTELLIGENCE_TYPES_BY_CATEGORY[category]
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
      politicalCountyHolderId: state.countyHolderId ?? null,
      politicalControllerId: state.controllerId ?? null,
      politicalControllerColor: state.controllerColor ?? null,
      politicalIsContested: state.isContested,
      politicalContestedByIds: state.contestedByIds,
      politicalHouseId: state.houseId ?? null,
      politicalRealmTitleId: state.realmTitleId ?? null,
      politicalRealmHolderId: state.realmHolderId ?? null,
      politicalRealmHouseId: state.realmHouseId ?? null,
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
export const POLITICAL_CONTESTED_BORDER_LAYER = 'agot-political-contested-borders'
export const COUNTY_HIT_LAYER = 'agot-county-hit-areas'
export const SELECTED_COUNTY_OUTLINE_LAYER = 'agot-selected-county-outline'
export const SELECTED_COUNTY_OUTLINE_GLOW_LAYER = 'agot-selected-county-outline-glow'
export const SELECTED_COUNTY_LOCATION_SOURCE = 'agot-selected-county-location-source'
export const SELECTED_COUNTY_LOCATION_LAYER = 'agot-selected-county-locations'
export const FAR_MAP_SOURCE = 'agot-flatmap'
export const FAR_MAP_LAYER = 'agot-flatmap'
export const TERRAIN_LIGHT_SOURCE = 'agot-terrain-light'
export const TERRAIN_LIGHT_LAYER = 'agot-terrain-light'
export const MATERIAL_TERRAIN_SOURCE = 'agot-material-terrain'
export const MATERIAL_TERRAIN_LAYER = 'agot-material-terrain'

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

const dynamicSourceSignatures = new WeakMap<object, Map<string, string>>()

function setDynamicSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
): void {
  let signatures = dynamicSourceSignatures.get(map)
  if (!signatures) {
    signatures = new Map()
    dynamicSourceSignatures.set(map, signatures)
  }
  const signature = JSON.stringify(data)
  if (signatures.get(sourceId) === signature) return
  ;(map.getSource(sourceId) as GeoJSONSource).setData(data)
  signatures.set(sourceId, signature)
}

export function syncDynamicMapSubjects(
  map: MapLibreMap,
  manifest: MapManifest,
  characters: readonly MapCharacterPoint[],
  assets: readonly MapAssetPoint[],
  pixelBounds: MapBounds,
  semanticContext?: SemanticSubjectContext,
  markerPoints?: { characters: readonly MapCharacterPoint[]; assets: readonly MapAssetPoint[] },
): void {
  if (!map.isStyleLoaded()) return
  addDynamicMapSubjectLayers(map)
  const zoom = semanticContext?.zoomState.zoom
  const sendsAggregates = zoom !== undefined && zoom <= 4.4
  const sendsPoints = zoom === undefined || zoom >= 4.1
  const aggregateRank = semanticContext?.zoomState.primaryRank
  {
    const visibleCharacters = sendsPoints ? filterMapPointsByPixelBounds(markerPoints?.characters ?? characters, pixelBounds) : []
    const characterAggregates = sendsAggregates && semanticContext
      ? aggregateCharacterPoints({ points: characters, pixelBounds, ...semanticContext, aggregateRank })
      : []
    const charactersCollection = dynamicPointCollection(visibleCharacters, [], manifest).characters
    setDynamicSourceData(map, CHARACTER_POINT_SOURCE, charactersCollection)
    setDynamicSourceData(map, CHARACTER_AGGREGATE_SOURCE, dynamicAggregateCollection(characterAggregates, manifest))
  }
  {
    const visibleAssets = sendsPoints ? filterMapPointsByPixelBounds(markerPoints?.assets ?? assets, pixelBounds) : []
    const assetAggregates = sendsAggregates && semanticContext
      ? aggregateAssetPoints({ points: assets, pixelBounds, ...semanticContext, aggregateRank })
      : []
    const assetsCollection = dynamicPointCollection([], visibleAssets, manifest).assets
    setDynamicSourceData(map, ASSET_POINT_SOURCE, assetsCollection)
    setDynamicSourceData(map, ASSET_AGGREGATE_SOURCE, dynamicAggregateCollection(assetAggregates, manifest))
  }
}

export function applyMapPresentation(
  map: MapLibreMap,
  presentation: MapPresentation,
  hasRoute: boolean,
  primaryRank: SemanticRank,
): void {
  const visibility = (visible: boolean) => visible ? 'visible' : 'none'
  const setVisible = (layerIds: readonly string[], visible: boolean) => {
    for (const layerId of layerIds) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility(visible))
    }
  }
  setVisible([FAR_MAP_LAYER, TERRAIN_LIGHT_LAYER, COUNTY_HIT_LAYER], true)
  setVisible([POLITICAL_CONTESTED_BORDER_LAYER], presentation.politicalSurface)
  setVisible(['hegemon', 'empire', 'kingdom', 'duchy', 'county'].map((rank) => `agot-${rank}-surface`), presentation.politicalSurface)
  setVisible(['agot-roads-casing', 'agot-roads'], presentation.roads)
  setVisible(['agot-routes'], hasRoute)
  setVisible([CHARACTER_POINT_LAYER, CHARACTER_AGGREGATE_LAYER, CHARACTER_AGGREGATE_COUNT_LAYER], presentation.characters)
  setVisible([ASSET_POINT_LAYER, ASSET_AGGREGATE_LAYER, ASSET_AGGREGATE_COUNT_LAYER], presentation.assets)
  setVisible([SELECTED_COUNTY_LOCATION_LAYER], presentation.internalLocations)
  setVisible([JOURNEY_ROUTE_SOURCE, JOURNEY_PROGRESS_SOURCE, JOURNEY_POSITION_SOURCE], hasRoute)
  for (const rank of ['hegemon', 'empire', 'kingdom', 'duchy', 'county'] as const) {
    setVisible([`agot-${rank}-boundaries-casing`, `agot-${rank}-boundaries`], true)
    setVisible([`agot-${rank}-labels`], rank === primaryRank)
  }
  const surfacePaint = presentation.politicalSurface
    ? { saturation: -0.12, brightness: 0.9 }
    : { saturation: 0, brightness: 1 }
  for (const layerId of [FAR_MAP_LAYER, MATERIAL_TERRAIN_LAYER]) {
    if (!map.getLayer(layerId)) continue
    map.setPaintProperty(layerId, 'raster-saturation', surfacePaint.saturation)
    map.setPaintProperty(layerId, 'raster-brightness-max', surfacePaint.brightness)
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
      minzoom: 4.6,
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
  selectedCountyId: string | null,
): void {
  addSelectedCountyLocationLayers(map)
  const source = map.getSource(SELECTED_COUNTY_LOCATION_SOURCE) as GeoJSONSource | undefined
  if (!source) return
  const selected = selectedCountyId ? index.locationsForCounty(selectedCountyId) : undefined
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
  if (map.getLayer(SELECTED_COUNTY_OUTLINE_GLOW_LAYER)) {
    map.setFilter(SELECTED_COUNTY_OUTLINE_GLOW_LAYER, ['==', ['get', 'titleId'], selected?.countyId ?? ''])
    map.setLayoutProperty(SELECTED_COUNTY_OUTLINE_GLOW_LAYER, 'visibility', selected ? 'visible' : 'none')
  }
  if (map.getLayer(SELECTED_COUNTY_OUTLINE_LAYER)) {
    map.setFilter(SELECTED_COUNTY_OUTLINE_LAYER, ['==', ['get', 'titleId'], selected?.countyId ?? ''])
    map.setLayoutProperty(SELECTED_COUNTY_OUTLINE_LAYER, 'visibility', selected ? 'visible' : 'none')
  }
}
