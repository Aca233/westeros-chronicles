import { filterMapPointsByPixelBounds, type MapAssetPoint, type MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { MapBounds, MapPixelPoint, SemanticMembership, SemanticRank, SemanticTitle } from './types'

export interface SemanticSubjectAggregate extends MapPixelPoint {
  id: string
  kind: 'characters' | 'assets'
  rank: SemanticRank | 'location'
  scopeId: string
  count: number
  memberIds: string[]
}

// 把一个地点的归属映射到指定等级的 scopeId（与该等级头衔标签同点）。
// 缺失可选等级（kingdomId 等为空）时返回 undefined，该成员不参与本等级聚合——
// 与头衔「该等级有就显示、没有就不显示」一致，不回退到更细等级。
function scopeIdForRank(membership: SemanticMembership, rank: SemanticRank): string | undefined {
  switch (rank) {
    case 'hegemon': return membership.hegemonId
    case 'empire': return membership.empireId
    case 'kingdom': return membership.kingdomId
    case 'duchy': return membership.duchyId
    case 'county': return membership.countyId
  }
}

interface SemanticAggregationInput<TPoint> {
  points: readonly TPoint[]
  memberships: readonly SemanticMembership[]
  titles: readonly SemanticTitle[]
  pixelBounds: MapBounds
  // 指定聚合等级时，按该等级的头衔点聚合（与当前缩放带头衔标签同点）；
  // 省略则保留既有「有伯爵领按伯爵领，缺回退公国」行为。
  aggregateRank?: SemanticRank
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
  const aggregateRank = input.aggregateRank
  const groups = new Map<string, { rank: SemanticRank; scopeId: string; memberIds: string[] }>()

  for (const point of stableUniquePoints(input.points, input.pixelBounds)) {
    const membership = membershipByLocation.get(point.locationId)
    let rank: SemanticRank | undefined
    let scopeId: string | undefined
    if (aggregateRank) {
      rank = aggregateRank
      scopeId = membership ? scopeIdForRank(membership, aggregateRank) : undefined
    } else {
      // 默认：有伯爵领按伯爵领，缺则回退公国（保留既有行为与测试契约）
      rank = membership?.countyId ? 'county' : membership?.duchyId ? 'duchy' : undefined
      scopeId = rank === 'county' ? membership?.countyId : membership?.duchyId
    }
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
  const titleByRankAndId = new Map(input.titles.map((title) => [`${title.rank}:${title.titleId}`, title]))
  const countyTitleById = new Map(
    input.titles.filter((title) => title.rank === 'county').map((title) => [title.titleId, title]),
  )
  const aggregateRank = input.aggregateRank

  // 指定聚合等级且比 county 更粗时，按该等级头衔点聚合，不走地点→伯爵领折叠。
  if (aggregateRank && aggregateRank !== 'county') {
    const groups = new Map<string, { scopeId: string; memberIds: string[] }>()
    for (const point of points) {
      const membership = membershipByLocation.get(point.locationId)
      const scopeId = membership ? scopeIdForRank(membership, aggregateRank) : undefined
      if (!scopeId) continue
      const group = groups.get(scopeId) ?? { scopeId, memberIds: [] }
      group.memberIds.push(point.assetId)
      groups.set(scopeId, group)
    }
    return [...groups.values()].flatMap((group) => {
      const anchor = titleByRankAndId.get(`${aggregateRank}:${group.scopeId}`)
      return anchor ? [aggregate('assets', aggregateRank, group.scopeId, anchor, group.memberIds)] : []
    }).sort((left, right) => left.id.localeCompare(right.id))
  }

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
