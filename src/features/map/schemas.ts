import { z } from 'zod'

import type { MapLocation, MapManifest } from './types'

const stableIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9_.:-]*$/i)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const localMapPathSchema = z.string().refine((value) => {
  const isAllowedRoot = value.startsWith('/data/agot-map/') || value.startsWith('/assets/agot-map/')
  const hasUnsafeContent = /(?:https?:|\\|2962333032|\.\.)/i.test(value)
  return isAllowedRoot && !hasUnsafeContent
}, '必须使用项目内 AGOT 地图资源路径')

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
  schemaVersion: z.literal(1),
  sourceId: z.literal('2962333032'),
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
    locations: localMapPathSchema,
    routes: localMapPathSchema,
    searchIndex: localMapPathSchema,
  }).strict(),
  counts: z.object({
    regions: nonNegativeInteger,
    provinces: nonNegativeInteger,
    locations: nonNegativeInteger,
    routeEdges: nonNegativeInteger,
    terrainTiles: nonNegativeInteger,
    vectorTiles: nonNegativeInteger,
    demTiles: nonNegativeInteger,
  }).strict(),
  datasetHash: sha256Schema,
}).strict().superRefine((manifest, context) => {
  if (manifest.minZoom > manifest.maxZoom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxZoom'], message: 'maxZoom 必须不小于 minZoom' })
  }
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
}).strict().superRefine((location, context) => {
  if (location.isPort && !location.isCoastal) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['isCoastal'], message: '港口必须位于海岸' })
  }
})

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
