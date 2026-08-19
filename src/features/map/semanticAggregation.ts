import { filterMapPointsByPixelBounds, type MapAssetPoint, type MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { MapBounds, MapPixelPoint, SemanticMembership, SemanticTitle } from './types'

export interface SemanticSubjectAggregate extends MapPixelPoint {
  id: string
  kind: 'characters' | 'assets'
  rank: 'county' | 'duchy' | 'location'
  scopeId: string
  count: number
  memberIds: string[]
}

interface SemanticAggregationInput<TPoint> {
  points: readonly TPoint[]
  memberships: readonly SemanticMembership[]
  titles: readonly SemanticTitle[]
  pixelBounds: MapBounds
}

type CharacterAggregationInput = SemanticAggregationInput<MapCharacterPoint>
type AssetAggregationInput = SemanticAggregationInput<MapAssetPoint>

function stableUniquePoints<TPoint extends { id: string; locationId: string; mapX: number; mapY: number }>(
  points: readonly TPoint[],
  pixelBounds: MapBounds,
): TPoint[] {
  const sorted = [...filterMapPointsByPixelBounds(points, pixelBounds)]
    .sort((left, right) => left.id.localeCompare(right.id)
      || left.locationId.localeCompare(right.locationId)
      || left.mapX - right.mapX
      || left.mapY - right.mapY)
  const byId = new Map<string, TPoint>()
  for (const point of sorted) {
    if (!byId.has(point.id)) byId.set(point.id, point)
  }
  return [...byId.values()]
}

function aggregate(
  kind: SemanticSubjectAggregate['kind'],
  rank: SemanticSubjectAggregate['rank'],
  scopeId: string,
  anchor: MapPixelPoint,
  memberIds: readonly string[],
): SemanticSubjectAggregate {
  const uniqueMemberIds = [...new Set(memberIds)].sort()
  return {
    id: `${kind}:${rank}:${scopeId}`,
    kind,
    rank,
    scopeId,
    mapX: anchor.mapX,
    mapY: anchor.mapY,
    count: uniqueMemberIds.length,
    memberIds: uniqueMemberIds,
  }
}

export function aggregateCharacterPoints(input: CharacterAggregationInput): SemanticSubjectAggregate[] {
  const membershipByLocation = new Map(input.memberships.map((membership) => [membership.locationId, membership]))
  const titleByRankAndId = new Map(input.titles.map((title) => [`${title.rank}:${title.titleId}`, title]))
  const groups = new Map<string, { rank: 'county' | 'duchy'; scopeId: string; memberIds: string[] }>()

  for (const point of stableUniquePoints(input.points, input.pixelBounds)) {
    const membership = membershipByLocation.get(point.locationId)
    const rank = membership?.countyId ? 'county' : membership?.duchyId ? 'duchy' : undefined
    const scopeId = rank === 'county' ? membership?.countyId : membership?.duchyId
    if (!rank || !scopeId) continue
    const key = `${rank}:${scopeId}`
    const group = groups.get(key) ?? { rank, scopeId, memberIds: [] }
    group.memberIds.push(point.characterId)
    groups.set(key, group)
  }

  return [...groups.values()].flatMap((group) => {
    const anchor = titleByRankAndId.get(`${group.rank}:${group.scopeId}`)
    return anchor ? [aggregate('characters', group.rank, group.scopeId, anchor, group.memberIds)] : []
  }).sort((left, right) => left.id.localeCompare(right.id))
}

export function aggregateAssetPoints(input: AssetAggregationInput): SemanticSubjectAggregate[] {
  const points = stableUniquePoints(input.points, input.pixelBounds)
  const membershipByLocation = new Map(input.memberships.map((membership) => [membership.locationId, membership]))
  const countyTitleById = new Map(
    input.titles.filter((title) => title.rank === 'county').map((title) => [title.titleId, title]),
  )
  const locationGroups = new Map<string, MapAssetPoint[]>()
  for (const point of points) {
    const group = locationGroups.get(point.locationId) ?? []
    group.push(point)
    locationGroups.set(point.locationId, group)
  }

  const locationsByCounty = new Map<string, string[]>()
  for (const locationId of locationGroups.keys()) {
    const countyId = membershipByLocation.get(locationId)?.countyId
    if (!countyId) continue
    const locations = locationsByCounty.get(countyId) ?? []
    locations.push(locationId)
    locationsByCounty.set(countyId, locations)
  }
  const promotedCounties = new Set(
    [...locationsByCounty].filter(([, locationIds]) => new Set(locationIds).size > 8).map(([countyId]) => countyId),
  )

  const aggregates: SemanticSubjectAggregate[] = []
  for (const [locationId, group] of locationGroups) {
    const countyId = membershipByLocation.get(locationId)?.countyId
    if (countyId && promotedCounties.has(countyId)) continue
    const sorted = [...group].sort((left, right) => left.id.localeCompare(right.id))
    aggregates.push(aggregate('assets', 'location', locationId, sorted[0], sorted.map((point) => point.assetId)))
  }
  for (const countyId of [...promotedCounties].sort()) {
    const anchor = countyTitleById.get(countyId)
    if (!anchor) continue
    const countyPoints = (locationsByCounty.get(countyId) ?? [])
      .flatMap((locationId) => locationGroups.get(locationId) ?? [])
    aggregates.push(aggregate('assets', 'county', countyId, anchor, countyPoints.map((point) => point.assetId)))
  }
  return aggregates.sort((left, right) => left.id.localeCompare(right.id))
}
