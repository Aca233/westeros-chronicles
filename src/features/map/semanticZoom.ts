import type { ExpressionSpecification } from 'maplibre-gl'

import type { SemanticRank } from './types'

export const HEGEMON_MAX_ZOOM = 0.85
export const EMPIRE_MAX_ZOOM = 1.55
export const KINGDOM_MAX_ZOOM = 2.25
export const DUCHY_MAX_ZOOM = 2.95
export const LOCAL_MIN_ZOOM = 4.6

const DETAIL_CROSS_FADE = [4.1, 4.4] as const
const MAX_SEMANTIC_ZOOM = 6

const LABEL_SIZE_STOPS: Record<SemanticRank, ExpressionSpecification> = {
  hegemon: ['interpolate', ['linear'], ['zoom'], 0, 24, HEGEMON_MAX_ZOOM, 21],
  empire: ['interpolate', ['linear'], ['zoom'], HEGEMON_MAX_ZOOM, 22, EMPIRE_MAX_ZOOM, 19],
  kingdom: ['interpolate', ['linear'], ['zoom'], EMPIRE_MAX_ZOOM, 20, KINGDOM_MAX_ZOOM, 17],
  duchy: ['interpolate', ['linear'], ['zoom'], KINGDOM_MAX_ZOOM, 18, DUCHY_MAX_ZOOM, 15],
  county: ['interpolate', ['linear'], ['zoom'], DUCHY_MAX_ZOOM, 15, MAX_SEMANTIC_ZOOM, 12],
}

export const semanticDetailOpacityExpression: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'], DETAIL_CROSS_FADE[0], 0, DETAIL_CROSS_FADE[1], 1, MAX_SEMANTIC_ZOOM, 1,
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

function rankForZoom(zoom: number): SemanticRank {
  if (zoom < HEGEMON_MAX_ZOOM) return 'hegemon'
  if (zoom < EMPIRE_MAX_ZOOM) return 'empire'
  if (zoom < KINGDOM_MAX_ZOOM) return 'kingdom'
  if (zoom < DUCHY_MAX_ZOOM) return 'duchy'
  return 'county'
}

export function semanticZoomState(value: number): SemanticZoomState {
  const zoom = normalizedZoom(value)
  const primaryRank = rankForZoom(zoom)
  const weights: Record<SemanticRank, number> = {
    hegemon: Number(primaryRank === 'hegemon'),
    empire: Number(primaryRank === 'empire'),
    kingdom: Number(primaryRank === 'kingdom'),
    duchy: Number(primaryRank === 'duchy'),
    county: Number(primaryRank === 'county'),
  }
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

export function semanticRankOpacityExpression(
  rank: SemanticRank,
  visibleOpacity = 1,
  hideAtLocalDetail = false,
): ExpressionSpecification {
  if (rank === 'hegemon') return ['step', ['zoom'], visibleOpacity, HEGEMON_MAX_ZOOM, 0]
  if (rank === 'empire') return ['step', ['zoom'], 0, HEGEMON_MAX_ZOOM, visibleOpacity, EMPIRE_MAX_ZOOM, 0]
  if (rank === 'kingdom') return ['step', ['zoom'], 0, EMPIRE_MAX_ZOOM, visibleOpacity, KINGDOM_MAX_ZOOM, 0]
  if (rank === 'duchy') return ['step', ['zoom'], 0, KINGDOM_MAX_ZOOM, visibleOpacity, DUCHY_MAX_ZOOM, 0]
  return hideAtLocalDetail
    ? ['step', ['zoom'], 0, DUCHY_MAX_ZOOM, visibleOpacity, LOCAL_MIN_ZOOM, 0]
    : ['step', ['zoom'], 0, DUCHY_MAX_ZOOM, visibleOpacity]
}

export function semanticLabelSizeExpression(rank: SemanticRank): ExpressionSpecification {
  return LABEL_SIZE_STOPS[rank]
}

export function nextSemanticZoom(value: number): number {
  const zoom = normalizedZoom(value)
  for (const target of [HEGEMON_MAX_ZOOM, EMPIRE_MAX_ZOOM, KINGDOM_MAX_ZOOM, DUCHY_MAX_ZOOM, LOCAL_MIN_ZOOM, 6]) {
    if (zoom < target) return target
  }
  return 6
}
