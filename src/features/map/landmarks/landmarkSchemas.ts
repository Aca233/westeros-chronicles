import { z } from 'zod'

export const LANDMARK_MANIFEST_PATH = '/data/agot-map/models/landmarks.json'
export const LANDMARK_CONVERTER_COMMIT = '2249e35f80a1cc04ba4c2b8e4c650f36b18085db'
export const LANDMARK_IDS = [
  'winterfell', 'red-keep', 'dragonstone', 'casterly-rock', 'highgarden', 'sunspear',
  'storms-end', 'the-eyrie', 'pyke', 'oldtown', 'riverrun', 'harrenhal',
] as const

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const finiteNumber = z.number().finite()
const positiveNumber = finiteNumber.positive()
const vector3 = z.tuple([finiteNumber, finiteNumber, finiteNumber])
const quaternion = z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber])

export const landmarkLodSchema = z.object({
  minZoom: finiteNumber,
  path: z.string().regex(/^\/assets\/agot-map\/models\/[a-z0-9-]+\/lod[01]\.glb$/),
  bytes: z.number().int().positive(),
  triangleCount: z.number().int().positive(),
  sha256: sha256Schema,
})

export const landmarkTransformSchema = z.object({
  mapX: finiteNumber,
  mapY: finiteNumber,
  elevationMeters: finiteNumber,
  rotation: quaternion,
  scale: vector3.refine((value) => value.every((item) => item > 0), 'scale 必须为正数'),
})

export const landmarkModelRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  locationId: z.string().regex(/^b_[a-z0-9_]+$/),
  provinceId: z.number().int().positive(),
  name: z.string().min(1),
  transform: landmarkTransformSchema,
  lods: z.tuple([landmarkLodSchema, landmarkLodSchema]),
  bounds: z.object({ radiusMapPixels: positiveNumber, heightMeters: positiveNumber }),
})

export const landmarkModelManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceId: z.literal('2962333032'),
  converter: z.object({
    name: z.literal('io_pdx_mesh'),
    commit: z.literal(LANDMARK_CONVERTER_COMMIT),
  }),
  assetHash: sha256Schema,
  landmarks: z.array(landmarkModelRecordSchema).length(12),
}).superRefine((manifest, context) => {
  const seenIds = new Set<string>()
  const seenLocations = new Set<string>()
  const seenProvinces = new Set<number>()
  let totalBytes = 0
  manifest.landmarks.forEach((record, index) => {
    if (record.id !== LANDMARK_IDS[index]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, 'id'], message: '地标顺序或集合无效' })
    }
    for (const [value, seen, field] of [
      [record.id, seenIds, 'id'],
      [record.locationId, seenLocations, 'locationId'],
      [record.provinceId, seenProvinces, 'provinceId'],
    ] as const) {
      if (seen.has(value as never)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, field], message: `${field} 重复` })
      seen.add(value as never)
    }
    record.lods.forEach((lod, level) => {
      const expectedPath = `/assets/agot-map/models/${record.id}/lod${level}.glb`
      if (lod.path !== expectedPath) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, 'lods', level, 'path'], message: 'LOD 路径与地标不一致' })
      if (lod.minZoom !== (level === 0 ? 5.35 : 4.60)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, 'lods', level, 'minZoom'], message: 'LOD 缩放阈值无效' })
      if (lod.bytes > (level === 0 ? 20 : 6) * 1024 * 1024) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, 'lods', level, 'bytes'], message: 'LOD 超过字节预算' })
      totalBytes += lod.bytes
    })
    const ratio = record.lods[1].triangleCount / record.lods[0].triangleCount
    if (ratio < 0.25 || ratio > 0.40) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks', index, 'lods', 1, 'triangleCount'], message: 'LOD1 三角形比例无效' })
  })
  if (totalBytes > 120 * 1024 * 1024) context.addIssue({ code: z.ZodIssueCode.custom, path: ['landmarks'], message: '模型总量超过 120 MiB' })
})

export type LandmarkLod = z.infer<typeof landmarkLodSchema>
export type LandmarkTransform = z.infer<typeof landmarkTransformSchema>
export type LandmarkModelRecord = z.infer<typeof landmarkModelRecordSchema>
export type LandmarkModelManifest = z.infer<typeof landmarkModelManifestSchema>
export type LandmarkBounds = LandmarkModelRecord['bounds']

export function parseLandmarkManifest(input: unknown): LandmarkModelManifest {
  return landmarkModelManifestSchema.parse(input)
}
