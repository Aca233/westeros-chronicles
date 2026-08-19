export type MapLocationType =
  | 'region'
  | 'castle'
  | 'city'
  | 'town'
  | 'village'
  | 'port'
  | 'ruin'
  | 'landmark'

export type TravelMode = 'walk' | 'horse' | 'carriage' | 'ship'
export type RoutePreference = 'fastest' | 'safest' | 'cheapest'
export type KnowledgeLevel = 'confirmed' | 'rumored' | 'stale' | 'unknown'
export type SemanticRank = 'realm' | 'duchy' | 'county'

export interface WorldLocationRef {
  locationId: string
  sceneLocation?: string
}

export interface MapPixelPoint {
  mapX: number
  mapY: number
}

export interface MapBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface SemanticTitle extends MapPixelPoint {
  featureId: number
  titleId: string
  rank: SemanticRank
  name: string
  importance: number
  regionId: string
  politicalAnchorTitleId?: string
}

export interface SemanticMembership {
  locationId: string
  baronyId: string
  countyId?: string
  duchyId?: string
  realmId: string
}

export interface SemanticMembershipIndex {
  titles: readonly SemanticTitle[]
  memberships: readonly SemanticMembership[]
  byLocationId: ReadonlyMap<string, SemanticMembership>
  titleById: ReadonlyMap<string, SemanticTitle>
}

export interface MapLocation extends MapPixelPoint {
  id: string
  name: string
  englishName?: string
  type: MapLocationType
  provinceId: number
  baronyId?: string
  countyId?: string
  duchyId?: string
  kingdomId?: string
  regionId: string
  terrain: string
  isCoastal: boolean
  isPort: boolean
  importance: number
  tags: string[]
  description?: string
}

export interface MapLocationSearchEntry extends MapPixelPoint {
  id: string
  name: string
  englishName?: string
  type: MapLocationType
  importance: number
  regionId: string
}

export interface MapRouteNode {
  id: string
  locationId: string
  mapX: number
  mapY: number
  provinceId: number
  regionId: string
  isPort: boolean
}

export interface MapRouteEdge {
  id: string
  from: string
  to: string
  distance: number
  roadLevel: 'major' | 'minor' | 'none'
  crossing: 'land' | 'river' | 'sea'
  allowedModes: TravelMode[]
  baseDays: number
  baseCost: number
  risk: number
  seasonTags: string[]
}

export interface MapRouteShard {
  nodes: MapRouteNode[]
  edges: MapRouteEdge[]
  graphHash: string
}

export interface MapManifest {
  schemaVersion: 2
  sourceId: string
  sourceHashes: Record<string, string>
  mapSize: {
    width: 9216
    height: 6144
  }
  westerosBounds: MapBounds
  tileSize: 512
  minZoom: number
  maxZoom: number
  paths: {
    terrain: string
    vector: string
    dem: string
    semantic: string
    locations: string
    routes: string
    searchIndex: string
    semanticTitles: string
    semanticMembership: string
  }
  counts: {
    regions: number
    provinces: number
    locations: number
    routeEdges: number
    terrainTiles: number
    vectorTiles: number
    demTiles: number
    semanticTiles: number
    semanticRealms: number
    semanticDuchies: number
    semanticCounties: number
    semanticLabels: number
    missingSemanticLocalizations: number
  }
  datasetHash: string
  semanticHash: string
}
