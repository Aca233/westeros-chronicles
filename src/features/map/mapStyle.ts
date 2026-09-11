import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

import {
  semanticBoundaryZoomRange,
  semanticLabelSizeExpression,
  semanticRankOpacityExpression,
  semanticRankZoomRange,
} from './semanticZoom.ts'
import {
  FAR_MAP_LAYER,
  FAR_MAP_SOURCE,
  MATERIAL_TERRAIN_LAYER,
  MATERIAL_TERRAIN_SOURCE,
  TERRAIN_LIGHT_LAYER,
  TERRAIN_LIGHT_SOURCE,
  POLITICAL_CONTESTED_BORDER_LAYER,
} from './mapLayers.ts'
import type { MapManifest } from './types'

const SEMANTIC_RANKS = ['hegemon', 'empire', 'kingdom', 'duchy', 'county'] as const

const SEMANTIC_LINE_WIDTH = {
  hegemon: [2.2, 3.4],
  empire: [1.9, 3.1],
  kingdom: [1.6, 2.8],
  duchy: [1.2, 2.5],
  county: [0.8, 2],
} as const

function semanticAdministrativeLayers(): NonNullable<StyleSpecification['layers']> {
  return SEMANTIC_RANKS.flatMap((rank) => {
    const [minimumWidth, maximumWidth] = SEMANTIC_LINE_WIDTH[rank]
    const opacity = semanticRankOpacityExpression(rank)
    return [
      {
        id: `agot-${rank}-surface`,
        ...semanticRankZoomRange(rank),
        type: 'fill' as const,
        source: 'agot-semantic',
        'source-layer': `${rank}_surfaces`,
        paint: {
          'fill-color': ['get', 'titleColor'] as ExpressionSpecification,
          'fill-opacity': semanticRankOpacityExpression(rank, 0.2, true),
        },
      },
      {
        id: `agot-${rank}-boundaries-casing`,
        ...semanticBoundaryZoomRange(rank),
        type: 'line' as const,
        source: 'agot-semantic',
        'source-layer': `${rank}_boundaries`,
        paint: {
          'line-color': '#17130d',
          'line-opacity': semanticRankOpacityExpression(rank, 0.62),
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, minimumWidth + 2.2, 6, maximumWidth + 2.8] as ExpressionSpecification,
          'line-blur': 0.8,
        },
      },
      {
        id: `agot-${rank}-boundaries`,
        ...semanticBoundaryZoomRange(rank),
        type: 'line' as const,
        source: 'agot-semantic',
        'source-layer': `${rank}_boundaries`,
        paint: {
          'line-color': '#d2bd87',
          'line-opacity': opacity,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, minimumWidth, 6, maximumWidth] as ExpressionSpecification,
          'line-blur': 0.3,
        },
      },
    ]
  })
}

function semanticTitleLayers(): NonNullable<StyleSpecification['layers']> {
  return SEMANTIC_RANKS.map((rank) => ({
    id: `agot-${rank}-labels`,
    ...(rank === 'county' ? semanticBoundaryZoomRange(rank) : semanticRankZoomRange(rank)),
    type: 'symbol' as const,
    source: 'agot-semantic',
    'source-layer': 'title_labels',
    filter: ['==', ['get', 'rank'], rank],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans CJK SC Regular'],
      'text-size': semanticLabelSizeExpression(rank),
      'text-letter-spacing': rank === 'hegemon' || rank === 'empire' ? 0.14 : 0.08,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-padding': 5,
      'symbol-sort-key': ['-', 100, ['get', 'importance']],
    },
    paint: {
      'text-color': '#eadcb6',
      'text-halo-color': '#17130d',
      'text-halo-width': rank === 'hegemon' || rank === 'empire' ? 2.2 : 1.5,
      'text-opacity': semanticRankOpacityExpression(rank),
    },
  }))
}

export function createLocalMapStyle(manifest: MapManifest): StyleSpecification {
  return {
    version: 8,
    name: '维斯特洛离线地图',
    sources: {
      [FAR_MAP_SOURCE]: {
        type: 'raster',
        tiles: [manifest.paths.terrain],
        tileSize: manifest.tileSize,
        minzoom: manifest.minZoom,
        maxzoom: 4,
        attribution: 'AGOT 离线地图资料',
      },
      [MATERIAL_TERRAIN_SOURCE]: {
        type: 'raster',
        tiles: [manifest.paths.materialTerrain],
        tileSize: manifest.tileSize,
        minzoom: manifest.minZoom,
        maxzoom: 5,
        attribution: 'AGOT 离线地形材质',
      },
      [TERRAIN_LIGHT_SOURCE]: {
        type: 'raster',
        tiles: [manifest.paths.terrainLight],
        tileSize: manifest.tileSize,
        minzoom: manifest.minZoom,
        maxzoom: 5,
        attribution: 'AGOT 离线地形光照',
      },
      'agot-vector': {
        type: 'vector',
        tiles: [manifest.paths.vector],
        minzoom: manifest.minZoom,
        maxzoom: manifest.maxZoom,
      },
      'agot-dem': {
        type: 'raster-dem',
        tiles: [manifest.paths.dem],
        tileSize: manifest.tileSize,
        minzoom: manifest.minZoom,
        maxzoom: 4,
        encoding: 'mapbox',
      },
      'agot-semantic': {
        type: 'vector',
        tiles: [manifest.paths.semantic],
        minzoom: manifest.minZoom,
        maxzoom: manifest.maxZoom,
      },
    },
    layers: [
      {
        id: 'agot-background',
        type: 'background',
        paint: { 'background-color': '#101611' },
      },
      {
        id: FAR_MAP_LAYER,
        type: 'raster',
        source: FAR_MAP_SOURCE,
        paint: {
          'raster-opacity': 1,
          'raster-saturation': 0,
          'raster-brightness-max': 1,
          'raster-contrast': 0.1,
          'raster-saturation-transition': { duration: 360, delay: 0 },
          'raster-brightness-max-transition': { duration: 360, delay: 0 },
        },
      },
      {
        id: MATERIAL_TERRAIN_LAYER,
        type: 'raster',
        source: MATERIAL_TERRAIN_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          'raster-opacity': 0,
          'raster-saturation': 0,
          'raster-brightness-max': 1,
          'raster-contrast': 0.06,
          'raster-saturation-transition': { duration: 360, delay: 0 },
          'raster-brightness-max-transition': { duration: 360, delay: 0 },
        },
      },
      {
        id: TERRAIN_LIGHT_LAYER,
        type: 'raster',
        source: TERRAIN_LIGHT_SOURCE,
        paint: {
          'raster-opacity': 0.78,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
        },
      },
      {
        id: POLITICAL_CONTESTED_BORDER_LAYER,
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'provinces',
        layout: { visibility: 'none' },
        paint: {
          'line-color': ['coalesce', ['feature-state', 'politicalControllerColor'], '#b4432f'],
          'line-opacity': ['case', ['boolean', ['feature-state', 'politicalIsContested'], false], 0.92, 0],
          'line-width': ['interpolate', ['linear'], ['zoom'], 2.5, 1.4, 6, 3.2],
          'line-dasharray': [2, 1.25],
        },
      },
      {
        id: 'agot-county-hit-areas',
        type: 'fill',
        source: 'agot-vector',
        'source-layer': 'provinces',
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.001,
        },
      },
      ...semanticAdministrativeLayers(),
      {
        id: 'agot-selected-county-outline-glow',
        type: 'line',
        source: 'agot-semantic',
        'source-layer': 'county_boundaries',
        minzoom: 3.5,
        filter: ['==', ['get', 'titleId'], ''],
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#f0d58a',
          'line-opacity': 0.38,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3.5, 5.6, 6, 10.5],
          'line-blur': 2.6,
        },
      },
      {
        id: 'agot-selected-county-outline',
        type: 'line',
        source: 'agot-semantic',
        'source-layer': 'county_boundaries',
        minzoom: 3.5,
        filter: ['==', ['get', 'titleId'], ''],
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#f0d58a',
          'line-opacity': 0.96,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3.5, 2.2, 6, 4.2],
          'line-blur': 0.2,
        },
      },
      {
        id: 'agot-roads-casing',
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'roads',
        paint: {
          'line-color': '#241b10',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 1.09, 0, 1.1, 0.1, 4.1, 0.19, 4.4, 0.4, 6, 0.47],
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.5, 1.1, 1.55, 4.1, 1.85, 4.4, 2.4, 6, 3.1],
        },
      },
      {
        id: 'agot-roads',
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'roads',
        paint: {
          'line-color': '#9b7646',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 1.09, 0, 1.1, 0.18, 4.1, 0.35, 4.4, 0.72, 6, 0.86],
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.2, 1.1, 0.25, 4.1, 0.55, 4.4, 1.1, 6, 1.8],
        },
      },
      {
        id: 'agot-routes',
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'routes',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#d7b969',
          'line-opacity': 0.6,
          'line-width': 1.2,
          'line-dasharray': [2, 1.5],
        },
      },
      ...semanticTitleLayers(),
    ],
  }
}
