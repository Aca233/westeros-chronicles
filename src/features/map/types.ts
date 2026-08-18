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
}

export interface MapManifest {
  schemaVersion: 1
  sourceId: '2962333032'
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
    locations: string
    routes: string
    searchIndex: string
  }
  counts: {
    regions: number
    provinces: number
    locations: number
    routeEdges: number
    terrainTiles: number
    vectorTiles: number
    demTiles: number
  }
  datasetHash: string
}
