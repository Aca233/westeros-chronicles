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
// 缺失可选等级（kingdomId 等为空）时返回 undefined，调用方按需回退到更细等级。
function scopeIdForRank(membership: SemanticMembership, rank: SemanticRank): string | undefined {
  switch (rank) {
    case 'hegemon': return membership.hegemonId
    case 'empire': return membership.empireId
    case 'kingdom': return membership.kingdomId
    case 'duchy': return membership.duchyId
    case 'county': return membership.countyId
  }
}

// 从粗到细的等级顺序，用于在目标等级缺归属时回退到更细等级。
const RANK_FINE_DOWN: readonly SemanticRank[] = ['hegemon', 'empire', 'kingdom', 'duchy', 'county']

// 按从 aggregateRank 开始逐级回退到更细等级的方式，找该地点第一个有归属的等级与 scopeId。
// 这样缺霸主归属的人物在霸主带会按其帝国/王国/…聚��，而不是消失。
function rankAndScopeWithFallback(
  membership: SemanticMembership,
  aggregateRank: SemanticRank,
): { rank: SemanticRank; scopeId: string } | undefined {
  const start = RANK_FINE_DOWN.indexOf(aggregateRank)
  if (start < 0) return undefined
  for (let i = start; i < RANK_FINE_DOWN.length; i += 1) {
    const rank = RANK_FINE_DOWN[i]
    const scopeId = scopeIdForRank(membership, rank)
    if (scopeId) return { rank, scopeId }
  }
  return undefined
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

// These arrays are immutable repository snapshots; reuse their lookup tables
// across both overlays and camera movements instead of reindexing every pan.
const membershipIndexes = new WeakMap<readonly SemanticMembership[], Map<string, SemanticMembership>>()
const titleIndexes = new WeakMap<readonly SemanticTitle[], {
  byRankAndId: Map<string, SemanticTitle>
  counties: Map<string, SemanticTitle>
}>()

function aggregationIndexes(input: Pick<CharacterAggregationInput, 'memberships' | 'titles'>) {
  let membershipByLocation = membershipIndexes.get(input.memberships)
  if (!membershipByLocation) {
    membershipByLocation = new Map(input.memberships.map((membership) => [membership.locationId, membership]))
    membershipIndexes.set(input.memberships, membershipByLocation)
  }
  let titles = titleIndexes.get(input.titles)
  if (!titles) {
    titles = {
      byRankAndId: new Map(input.titles.map((title) => [`${title.rank}:${title.titleId}`, title])),
      counties: new Map(input.titles.filter((title) => title.rank === 'county').map((title) => [title.titleId, title])),
    }
    titleIndexes.set(input.titles, titles)
  }
  return { membershipByLocation, titleByRankAndId: titles.byRankAndId, countyTitleById: titles.counties }
}

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
  const { membershipByLocation, titleByRankAndId } = aggregationIndexes(input)
  const aggregateRank = input.aggregateRank
  const groups = new Map<string, { rank: SemanticRank; scopeId: string; memberIds: string[] }>()

  for (const point of stableUniquePoints(input.points, input.pixelBounds)) {
    const membership = membershipByLocation.get(point.locationId)
    let rank: SemanticRank | undefined
    let scopeId: string | undefined
    if (aggregateRank && membership) {
      const found = rankAndScopeWithFallback(membership, aggregateRank)
      rank = found?.rank
      scopeId = found?.scopeId
    } else if (!aggregateRank) {
      // 未指定聚合等级：保留既有「有伯爵领按伯爵领，缺回退公国」行为与测试契约
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
  const { membershipByLocation, titleByRankAndId, countyTitleById } = aggregationIndexes(input)
  const aggregateRank = input.aggregateRank

  // 指定聚合等级且比 county 更粗时，按该等级头衔点聚合，不走地点→伯爵领折叠。
  // 缺该等级归属的地点逐级回退到更细等级，保证据点不会在低缩放凭空消失。
  if (aggregateRank && aggregateRank !== 'county') {
    const groups = new Map<string, { rank: SemanticRank; scopeId: string; memberIds: string[] }>()
    for (const point of points) {
      const membership = membershipByLocation.get(point.locationId)
      if (!membership) continue
      const found = rankAndScopeWithFallback(membership, aggregateRank)
      if (!found) continue
      const key = `${found.rank}:${found.scopeId}`
      const group = groups.get(key) ?? { rank: found.rank, scopeId: found.scopeId, memberIds: [] }
      group.memberIds.push(point.assetId)
      groups.set(key, group)
    }
    return [...groups.values()].flatMap((group) => {
      const anchor = titleByRankAndId.get(`${group.rank}:${group.scopeId}`)
      return anchor ? [aggregate('assets', group.rank, group.scopeId, anchor, group.memberIds)] : []
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
