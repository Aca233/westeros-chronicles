import type { KnowledgeLevel, MapLocation, MapLocationType } from './types'

export interface KnownLocationItem {
  id: string
  label: string
  knowledge: KnowledgeLevel
  characterId?: string
  lastKnownDate?: string
}

export interface LocationRouteEstimate {
  days: number
  cost: number
  risk: number
}

export interface LocationKnowledgeProjection {
  ruler?: KnownLocationItem
  characters?: KnownLocationItem[]
  assets?: KnownLocationItem[]
  events?: KnownLocationItem[]
  routeEstimate?: LocationRouteEstimate
}

export interface LocationHierarchyEntry {
  rank: 'kingdom' | 'duchy' | 'county' | 'barony'
  rankLabel: string
  id: string
  label: string
}

export interface LocationViewModel {
  id: string
  name: string
  englishName?: string
  type: MapLocationType
  typeLabel: string
  regionId: string
  regionLabel: string
  terrainLabel: string
  description?: string
  hierarchy: LocationHierarchyEntry[]
  tags: string[]
  access: {
    coastal: boolean
    port: boolean
  }
  ruler?: KnownLocationItem
  characters: KnownLocationItem[]
  assets: KnownLocationItem[]
  events: KnownLocationItem[]
  routeEstimate?: LocationRouteEstimate
}

const TYPE_LABELS: Record<MapLocationType, string> = {
  region: '地区',
  castle: '城堡',
  city: '城市',
  town: '城镇',
  village: '村落',
  port: '港口',
  ruin: '遗迹',
  landmark: '地标',
}

const REGION_LABELS: Record<string, string> = {
  world_westeros: '维斯特洛',
  world_westeros_beyond_the_wall: '塞外',
  world_westeros_dorne: '多恩',
  world_westeros_the_crownlands: '王领',
  world_westeros_the_iron_islands: '铁群岛',
  world_westeros_the_north: '北境',
  world_westeros_the_reach: '河湾地',
  world_westeros_the_riverlands: '河间地',
  world_westeros_the_stormlands: '风暴地',
  world_westeros_the_vale: '谷地',
  world_westeros_the_wall: '绝境长城',
  world_westeros_the_westerlands: '西境',
}

const TERRAIN_LABELS: Record<string, string> = {
  land: '陆地',
  plains: '平原',
  farmlands: '农田',
  forest: '森林',
  hills: '丘陵',
  mountains: '山地',
  wetlands: '湿地',
  desert: '荒漠',
  taiga: '寒林',
  tundra: '苔原',
  floodplains: '河漫滩',
  drylands: '旱地',
  ocean: '海域',
}

const HIERARCHY_META = [
  ['kingdomId', 'kingdom', '王国'],
  ['duchyId', 'duchy', '公国'],
  ['countyId', 'county', '伯爵领'],
  ['baronyId', 'barony', '男爵领'],
] as const

function displayStableId(id: string): string {
  return id.replace(/^[a-z]_/, '').split('_').filter(Boolean).join(' ')
}

function visible(items: KnownLocationItem[] | undefined): KnownLocationItem[] {
  return (items ?? []).filter((item) => item.knowledge !== 'unknown')
}

export function minimumLocationImportance(zoom: number): number {
  if (zoom >= 5.5) return 0
  if (zoom >= 4) return 20
  if (zoom >= 2.5) return 30
  if (zoom >= 1) return 55
  return 72
}

export function shouldShowLocation(location: Pick<MapLocation, 'importance'>, zoom: number): boolean {
  return location.importance >= minimumLocationImportance(zoom)
}

export function buildLocationView(
  location: MapLocation,
  projection: LocationKnowledgeProjection = {},
): LocationViewModel {
  const hierarchy = HIERARCHY_META.flatMap(([field, rank, rankLabel]) => {
    const id = location[field]
    return id ? [{ rank, rankLabel, id, label: displayStableId(id) }] : []
  })
  const ruler = projection.ruler?.knowledge === 'unknown' ? undefined : projection.ruler

  return {
    id: location.id,
    name: location.name,
    englishName: location.englishName,
    type: location.type,
    typeLabel: TYPE_LABELS[location.type],
    regionId: location.regionId,
    regionLabel: REGION_LABELS[location.regionId] ?? displayStableId(location.regionId),
    terrainLabel: TERRAIN_LABELS[location.terrain] ?? displayStableId(location.terrain),
    description: location.description,
    hierarchy,
    tags: location.tags,
    access: { coastal: location.isCoastal, port: location.isPort },
    ruler,
    characters: visible(projection.characters),
    assets: visible(projection.assets),
    events: visible(projection.events),
    routeEstimate: projection.routeEstimate,
  }
}
