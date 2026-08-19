import type { MapRouteEdge, RoutePreference, TravelMode } from '../types'

export interface EffectiveEdgeMetrics {
  days: number
  cost: number
  risk: number
}

export interface RouteCostContext {
  preference: RoutePreference
  travelMode: TravelMode
  season?: string
  maxDays: number
  maxCost: number
  maxRisk: number
  maxSpeed: number
  metricsByEdgeId: ReadonlyMap<string, EffectiveEdgeMetrics>
}

const MODE_MULTIPLIERS: Record<TravelMode, { days: number; cost: number; risk: number }> = {
  walk: { days: 1, cost: 1, risk: 0 },
  horse: { days: 0.7, cost: 1.15, risk: 0.01 },
  carriage: { days: 0.85, cost: 1.4, risk: -0.02 },
  ship: { days: 0.75, cost: 1.5, risk: 0.03 },
}

function normalizedSeason(season?: string): string {
  return season?.trim().toLocaleLowerCase('zh-CN') ?? ''
}

function isWinter(season: string): boolean {
  return /winter|冬|寒/.test(season)
}

function isFloodSeason(season: string): boolean {
  return /spring|autumn|fall|rain|flood|春|秋|雨|洪/.test(season)
}

function clampRisk(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function effectiveEdgeMetrics(
  edge: MapRouteEdge,
  travelMode: TravelMode,
  season?: string,
): EffectiveEdgeMetrics {
  const mode = MODE_MULTIPLIERS[travelMode]
  let days = edge.baseDays * mode.days
  let cost = edge.baseCost * mode.cost
  let risk = clampRisk(edge.risk + mode.risk)
  const seasonKey = normalizedSeason(season)

  if (isWinter(seasonKey) && edge.seasonTags.includes('winter_danger')) {
    days *= 1.45
    cost *= 1.15
    risk = clampRisk(risk + 0.18)
  }
  if (isFloodSeason(seasonKey) && edge.seasonTags.includes('flood_season')) {
    days *= 1.35
    cost *= 1.1
    risk = clampRisk(risk + 0.2)
  }

  return { days, cost, risk }
}

export function createRouteCostContext(
  edges: readonly MapRouteEdge[],
  preference: RoutePreference,
  travelMode: TravelMode,
  season?: string,
): RouteCostContext {
  const metricsByEdgeId = new Map<string, EffectiveEdgeMetrics>()
  let maxDays = 0
  let maxCost = 0
  let maxRisk = 0
  let maxSpeed = 0

  for (const edge of edges) {
    if (!edge.allowedModes.includes(travelMode)) continue
    const metrics = effectiveEdgeMetrics(edge, travelMode, season)
    metricsByEdgeId.set(edge.id, metrics)
    maxDays = Math.max(maxDays, metrics.days)
    maxCost = Math.max(maxCost, metrics.cost)
    maxRisk = Math.max(maxRisk, metrics.risk)
    if (metrics.days > 0) maxSpeed = Math.max(maxSpeed, edge.distance / metrics.days)
  }

  return {
    preference,
    travelMode,
    season,
    maxDays: maxDays || 1,
    maxCost: maxCost || 1,
    maxRisk: maxRisk || 1,
    maxSpeed: maxSpeed || 1,
    metricsByEdgeId,
  }
}

export function routeEdgeWeight(edge: MapRouteEdge, context: RouteCostContext): number {
  const metrics = context.metricsByEdgeId.get(edge.id)
  if (!metrics) return Number.POSITIVE_INFINITY
  const normalizedDays = metrics.days / context.maxDays
  const normalizedCost = metrics.cost / context.maxCost
  const normalizedRisk = metrics.risk / context.maxRisk
  if (context.preference === 'safest') return normalizedDays * 0.15 + normalizedRisk * 0.85
  if (context.preference === 'cheapest') return normalizedDays * 0.1 + normalizedCost * 0.9
  return normalizedDays
}

export function routeHeuristicWeight(estimatedDays: number, context: RouteCostContext): number {
  const normalizedDays = Math.max(0, estimatedDays) / context.maxDays
  if (context.preference === 'safest') return normalizedDays * 0.15
  if (context.preference === 'cheapest') return normalizedDays * 0.1
  return normalizedDays
}
