import { z } from 'zod'

import type {
  MapLocation,
  MapLocationSearchEntry,
  MapManifest,
  MapRouteShard,
  SemanticMembership,
  SemanticMembershipIndex,
  SemanticTitle,
} from './types'
import type { StaticPoliticalTitle } from './politicalProjection.ts'

const stableIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9_.:-]*$/i)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const localMapPathSchema = z.string().refine((value) => {
  const isAllowedRoot = value.startsWith('/data/agot-map/') || value.startsWith('/assets/agot-map/')
  const hasUnsafeContent = /(?:https?:|\\|\.\.)/i.test(value)
  return isAllowedRoot && !hasUnsafeContent
}, '必须使用项目内 AGOT 地图资源路径')
const mapSourceIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_.:-]*$/i)

const mapBoundsSchema = z.object({
  minX: z.number().finite().min(0).max(9216),
  minY: z.number().finite().min(0).max(6144),
  maxX: z.number().finite().min(0).max(9216),
  maxY: z.number().finite().min(0).max(6144),
}).strict().superRefine((bounds, context) => {
  if (bounds.minX >= bounds.maxX) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxX'], message: 'maxX 必须大于 minX' })
  }
  if (bounds.minY >= bounds.maxY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxY'], message: 'maxY 必须大于 minY' })
  }
})

const nonNegativeInteger = z.number().int().nonnegative()

export const mapManifestSchema = z.object({
  schemaVersion: z.literal(2),
  sourceId: mapSourceIdSchema,
  sourceHashes: z.record(z.string().min(1), sha256Schema),
  mapSize: z.object({
    width: z.literal(9216),
    height: z.literal(6144),
  }).strict(),
  westerosBounds: mapBoundsSchema,
  tileSize: z.literal(512),
  minZoom: nonNegativeInteger,
  maxZoom: nonNegativeInteger,
  paths: z.object({
    terrain: localMapPathSchema,
    vector: localMapPathSchema,
    dem: localMapPathSchema,
    semantic: localMapPathSchema,
    locations: localMapPathSchema,
    routes: localMapPathSchema,
    searchIndex: localMapPathSchema,
    semanticTitles: localMapPathSchema,
    semanticMembership: localMapPathSchema,
  }).strict(),
  counts: z.object({
    regions: nonNegativeInteger,
    provinces: nonNegativeInteger,
    locations: nonNegativeInteger,
    routeEdges: nonNegativeInteger,
    terrainTiles: nonNegativeInteger,
    vectorTiles: nonNegativeInteger,
    demTiles: nonNegativeInteger,
    semanticTiles: nonNegativeInteger,
    semanticRealms: nonNegativeInteger,
    semanticDuchies: nonNegativeInteger,
    semanticCounties: nonNegativeInteger,
    semanticLabels: nonNegativeInteger,
    missingSemanticLocalizations: nonNegativeInteger,
  }).strict(),
  datasetHash: sha256Schema,
  semanticHash: sha256Schema,
}).strict().superRefine((manifest, context) => {
  if (manifest.minZoom > manifest.maxZoom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxZoom'], message: 'maxZoom 必须不小于 minZoom' })
  }
})

const semanticRankSchema = z.enum(['realm', 'duchy', 'county'])

const semanticTitleSchema = z.object({
  featureId: z.number().int().positive(),
  titleId: stableIdSchema,
  rank: semanticRankSchema,
  name: z.string().trim().min(1).max(160),
  mapX: z.number().finite().min(0).max(9216),
  mapY: z.number().finite().min(0).max(6144),
  importance: z.number().int().min(0).max(100),
  regionId: stableIdSchema,
  politicalAnchorTitleId: stableIdSchema.optional(),
}).strict()

const semanticTitlesSchema = z.array(semanticTitleSchema).superRefine((titles, context) => {
  const featureIds = new Set<number>()
  const titleKeys = new Set<string>()
  titles.forEach((title, index) => {
    if (featureIds.has(title.featureId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'featureId'],
        message: `featureId 重复：${title.featureId}`,
      })
    }
    featureIds.add(title.featureId)
    const titleKey = `${title.rank}:${title.titleId}`
    if (titleKeys.has(titleKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'titleId'],
        message: `领地层级与 titleId 重复：${titleKey}`,
      })
    }
    titleKeys.add(titleKey)
  })
})

const semanticMembershipSchema = z.object({
  locationId: stableIdSchema,
  baronyId: stableIdSchema,
  countyId: stableIdSchema.optional(),
  duchyId: stableIdSchema.optional(),
  realmId: stableIdSchema,
}).strict()

const semanticMembershipsSchema = z.array(semanticMembershipSchema).superRefine((memberships, context) => {
  const locationIds = new Set<string>()
  memberships.forEach((membership, index) => {
    if (locationIds.has(membership.locationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'locationId'],
        message: `locationId 重复：${membership.locationId}`,
      })
    }
    locationIds.add(membership.locationId)
  })
})

export const mapLocationSchema = z.object({
  id: stableIdSchema,
  name: z.string().trim().min(1).max(160),
  englishName: z.string().trim().min(1).max(160).optional(),
  type: z.enum(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark']),
  mapX: z.number().finite().min(0).max(9216),
  mapY: z.number().finite().min(0).max(6144),
  provinceId: z.number().int().positive(),
  baronyId: stableIdSchema.optional(),
  countyId: stableIdSchema.optional(),
  duchyId: stableIdSchema.optional(),
  kingdomId: stableIdSchema.optional(),
  regionId: stableIdSchema,
  terrain: stableIdSchema,
  isCoastal: z.boolean(),
  isPort: z.boolean(),
  importance: z.number().int().min(0).max(100),
  tags: z.array(stableIdSchema).max(64),
  description: z.string().trim().min(1).max(1200).optional(),
}).strict().superRefine((location, context) => {
  if (location.isPort && !location.isCoastal) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['isCoastal'], message: '港口必须位于海岸' })
  }
})

export const mapLocationSearchEntrySchema = z.object({
  id: stableIdSchema,
  name: z.string().trim().min(1).max(160),
  englishName: z.string().trim().min(1).max(160).optional(),
  type: z.enum(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark']),
  mapX: z.number().finite().min(0).max(9216),
  mapY: z.number().finite().min(0).max(6144),
  importance: z.number().int().min(0).max(100),
  regionId: stableIdSchema,
}).strict()

const mapRouteNodeSourceSchema = z.object({
  id: stableIdSchema,
  location_id: stableIdSchema,
  map_x: z.number().finite().min(0).max(9216),
  map_y: z.number().finite().min(0).max(6144),
  province_id: z.number().int().positive(),
  region_id: stableIdSchema,
  is_port: z.boolean(),
}).strict()

const mapRouteEdgeSchema = z.object({
  id: z.string().trim().min(1).max(360),
  from: stableIdSchema,
  to: stableIdSchema,
  distance: z.number().finite().nonnegative(),
  roadLevel: z.enum(['major', 'minor', 'none']),
  crossing: z.enum(['land', 'river', 'sea']),
  allowedModes: z.array(z.enum(['walk', 'horse', 'carriage', 'ship'])).min(1).max(4),
  baseDays: z.number().finite().nonnegative(),
  baseCost: z.number().finite().nonnegative(),
  risk: z.number().finite().min(0).max(1),
  seasonTags: z.array(stableIdSchema).max(16),
}).strict()

const mapRouteShardSourceSchema = z.object({
  nodes: z.array(mapRouteNodeSourceSchema),
  edges: z.array(mapRouteEdgeSchema),
  graphHash: sha256Schema,
}).strict()

const staticPoliticalTitleSchema = z.object({
  baronyId: stableIdSchema,
  countyId: stableIdSchema.optional(),
  duchyId: stableIdSchema.optional(),
  kingdomId: stableIdSchema.optional(),
  provinceId: z.number().int().positive(),
}).strict()

function formatSchemaError(label: string, error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('；')
  return new Error(`${label}格式无效：${details}`)
}

export function parseMapManifest(value: unknown): MapManifest {
  const result = mapManifestSchema.safeParse(value)
  if (!result.success) throw formatSchemaError('地图清单', result.error)
  return result.data
}

export function parseMapLocation(value: unknown): MapLocation {
  const result = mapLocationSchema.safeParse(value)
  if (!result.success) throw formatSchemaError('地图地点', result.error)
  return result.data
}

export function parseMapLocationSearchIndex(value: unknown): MapLocationSearchEntry[] {
  const result = z.array(mapLocationSearchEntrySchema).safeParse(value)
  if (!result.success) throw formatSchemaError('地图地点索引', result.error)
  return result.data
}

export function parseMapLocationShard(value: unknown): MapLocation[] {
  const result = z.array(mapLocationSchema).safeParse(value)
  if (!result.success) throw formatSchemaError('地图地点分片', result.error)
  return result.data
}

export function parseMapRouteShard(value: unknown): MapRouteShard {
  const result = mapRouteShardSourceSchema.safeParse(value)
  if (!result.success) throw formatSchemaError('地图路线分片', result.error)
  return {
    graphHash: result.data.graphHash,
    edges: result.data.edges,
    nodes: result.data.nodes.map((node) => ({
      id: node.id,
      locationId: node.location_id,
      mapX: node.map_x,
      mapY: node.map_y,
      provinceId: node.province_id,
      regionId: node.region_id,
      isPort: node.is_port,
    })),
  }
}

export function parseMapPoliticalTitles(value: unknown): StaticPoliticalTitle[] {
  const result = z.array(staticPoliticalTitleSchema).safeParse(value)
  if (!result.success) throw formatSchemaError('地图政治头衔', result.error)
  return result.data
}

export function parseSemanticTitles(value: unknown): SemanticTitle[] {
  const result = semanticTitlesSchema.safeParse(value)
  if (!result.success) throw formatSchemaError('地图语义标题', result.error)
  return result.data
}

export function parseSemanticMembership(value: unknown): SemanticMembership[] {
  const result = semanticMembershipsSchema.safeParse(value)
  if (!result.success) throw formatSchemaError('地图语义归属', result.error)
  return result.data
}

export function buildSemanticMembershipIndex(
  titles: readonly SemanticTitle[],
  memberships: readonly SemanticMembership[],
): SemanticMembershipIndex {
  const titleByRankAndId = new Map(titles.map((title) => [`${title.rank}:${title.titleId}`, title]))
  const titleById = new Map(titles.map((title) => [title.titleId, title]))
  const byLocationId = new Map<string, SemanticMembership>()

  for (const membership of memberships) {
    const references: Array<readonly [SemanticTitle['rank'], string | undefined]> = [
      ['county', membership.countyId],
      ['duchy', membership.duchyId],
      ['realm', membership.realmId],
    ]
    for (const [rank, titleId] of references) {
      if (titleId && !titleByRankAndId.has(`${rank}:${titleId}`)) {
        throw new Error(`地图语义归属引用不存在：${rank}:${titleId}`)
      }
    }
    byLocationId.set(membership.locationId, membership)
  }

  return { titles, memberships, byLocationId, titleById }
}
