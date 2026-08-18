import type { StyleSpecification } from 'maplibre-gl'

import type { MapManifest } from './types'

export function createLocalMapStyle(manifest: MapManifest): StyleSpecification {
  return {
    version: 8,
    name: '维斯特洛离线地图',
    sources: {
      'agot-terrain': {
        type: 'raster',
        tiles: [manifest.paths.terrain],
        tileSize: manifest.tileSize,
        minzoom: manifest.minZoom,
        maxzoom: 4,
        attribution: 'AGOT 离线地图资料',
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
    },
    layers: [
      {
        id: 'agot-background',
        type: 'background',
        paint: { 'background-color': '#101611' },
      },
      {
        id: 'agot-terrain',
        type: 'raster',
        source: 'agot-terrain',
        paint: { 'raster-saturation': -0.18, 'raster-contrast': 0.1 },
      },
      {
        id: 'agot-hillshade',
        type: 'hillshade',
        source: 'agot-dem',
        paint: {
          'hillshade-shadow-color': '#17150f',
          'hillshade-highlight-color': '#d4c39b',
          'hillshade-accent-color': '#6d5837',
          'hillshade-exaggeration': 0.32,
        },
      },
      {
        id: 'agot-provinces',
        type: 'fill',
        source: 'agot-vector',
        'source-layer': 'provinces',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': '#87683f',
          'fill-opacity': 0.22,
        },
      },
      {
        id: 'agot-borders',
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'borders',
        minzoom: 2,
        paint: {
          'line-color': '#cfbd8d',
          'line-opacity': 0.42,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.35, 6, 1.1],
        },
      },
      {
        id: 'agot-roads',
        type: 'line',
        source: 'agot-vector',
        'source-layer': 'roads',
        minzoom: 3,
        paint: {
          'line-color': '#9b7646',
          'line-opacity': 0.72,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 6, 1.8],
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
      {
        id: 'agot-locations',
        type: 'circle',
        source: 'agot-vector',
        'source-layer': 'locations',
        filter: ['>=', ['get', 'importance'], ['interpolate', ['linear'], ['zoom'], 0, 72, 3, 30, 6, 0]],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2.4, 6, 5.2],
          'circle-color': '#ead9a7',
          'circle-stroke-color': '#2c2013',
          'circle-stroke-width': 1.25,
          'circle-opacity': 0.92,
        },
      },
    ],
  }
}
