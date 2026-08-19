import type { ExpressionSpecification } from 'maplibre-gl'

import type { SemanticRank } from './types'

const CROSS_FADES = {
  realmToDuchy: [1.1, 1.4],
  duchyToCounty: [2.5, 2.8],
} as const
const DETAIL_CROSS_FADE = [4.1, 4.4] as const
const MAX_SEMANTIC_ZOOM = 6

const RANK_OPACITY_STOPS: Record<SemanticRank, ExpressionSpecification> = {
  realm: ['interpolate', ['linear'], ['zoom'], 0, 1, 1.1, 1, 1.4, 0],
  duchy: ['interpolate', ['linear'], ['zoom'], 1.1, 0, 1.4, 1, 2.5, 1, 2.8, 0],
  county: ['interpolate', ['linear'], ['zoom'], 2.5, 0, 2.8, 1, 6, 1],
}

const LABEL_SIZE_STOPS: Record<SemanticRank, ExpressionSpecification> = {
  realm: ['interpolate', ['linear'], ['zoom'], 0, 22, 1.4, 18],
  duchy: ['interpolate', ['linear'], ['zoom'], 1.1, 18, 2.8, 15],
  county: ['interpolate', ['linear'], ['zoom'], 2.5, 15, 6, 12],
}

export const semanticDetailOpacityExpression: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'], 4.1, 0, 4.4, 1, 6, 1,
]

export interface SemanticZoomState {
  zoom: number
  primaryRank: SemanticRank
  weights: Record<SemanticRank, number>
  detailMix: number
  characterAggregateOpacity: number
  characterPointOpacity: number
  assetAggregateOpacity: number
  assetPointOpacity: number
  roadDensity: number
  locationDensity: number
}

function rounded(value: number): number {
  return Math.round(value * 1e12) / 1e12
}

function normalizedZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0
  return Math.min(MAX_SEMANTIC_ZOOM, Math.max(0, zoom))
}

function fade(start: number, end: number, zoom: number): number {
  return rounded(Math.min(1, Math.max(0, (zoom - start) / (end - start))))
}

export function semanticZoomState(value: number): SemanticZoomState {
  const zoom = normalizedZoom(value)
  const realmToDuchy = fade(...CROSS_FADES.realmToDuchy, zoom)
  const duchyToCounty = fade(...CROSS_FADES.duchyToCounty, zoom)
  const weights = {
    realm: rounded(1 - realmToDuchy),
    duchy: rounded(realmToDuchy * (1 - duchyToCounty)),
    county: duchyToCounty,
  }
  const primaryRank: SemanticRank = weights.county >= weights.duchy && weights.county >= weights.realm
    ? 'county'
    : weights.duchy >= weights.realm
      ? 'duchy'
      : 'realm'
  const detailMix = fade(...DETAIL_CROSS_FADE, zoom)

  return {
    zoom,
    primaryRank,
    weights,
    detailMix,
    characterAggregateOpacity: rounded(1 - detailMix),
    characterPointOpacity: detailMix,
    assetAggregateOpacity: rounded(1 - detailMix),
    assetPointOpacity: detailMix,
    roadDensity: rounded(0.25 + 0.75 * detailMix),
    locationDensity: rounded(0.4 + 0.6 * detailMix),
  }
}

export function semanticRankOpacityExpression(rank: SemanticRank): ExpressionSpecification {
  return RANK_OPACITY_STOPS[rank]
}

export function semanticLabelSizeExpression(rank: SemanticRank): ExpressionSpecification {
  return LABEL_SIZE_STOPS[rank]
}

export function nextSemanticZoom(value: number): number {
  const zoom = normalizedZoom(value)
  if (zoom < 2) return 2
  if (zoom < 3.4) return 3.4
  if (zoom < 5) return 5
  return 6
}
