import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const EXPECTED_CONVERTER = '2249e35f80a1cc04ba4c2b8e4c650f36b18085db'
const EXPECTED = [
  ['winterfell', 'b_winterfell', 77],
  ['red-keep', 'b_the_red_keep', 4151],
  ['dragonstone', 'b_dragonstone', 4415],
  ['casterly-rock', 'b_casterly_rock', 2855],
  ['highgarden', 'b_highgarden', 3237],
  ['sunspear', 'b_sunspear', 4937],
  ['storms-end', 'b_storms_end', 4439],
  ['the-eyrie', 'b_the_eyrie', 2251],
  ['pyke', 'b_pyke', 2723],
  ['oldtown', 'b_oldtown', 3494],
  ['riverrun', 'b_riverrun', 1658],
  ['harrenhal', 'b_harrenhal', 1934],
]
const MIB = 1024 * 1024
const MAX_LOD_BYTES = [20 * MIB, 6 * MIB]
const MAX_TEXTURE_EDGE = [2048, 1024]

function parseArgs(argv) {
  const result = {
    data: 'public/data/agot-map/models',
    assets: 'public/assets/agot-map/models',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option !== '--data' && option !== '--assets') throw new Error(`未知参数：${option}`)
    const value = argv[index + 1]
    if (!value) throw new Error(`${option} 缺少路径`)
    result[option.slice(2)] = value
    index += 1
  }
  return result
}

function readJson(path) {
  assert.ok(existsSync(path), `文件不存在：${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function compactJsonArrayProperty(source, property) {
  const marker = `${JSON.stringify(property)}: [`
  const markerStart = source.indexOf(marker)
  assert.ok(markerStart >= 0, `JSON 缺少 ${property}`)
  const arrayStart = source.indexOf('[', markerStart)
  let depth = 0
  let inString = false
  let escaped = false
  let arrayEnd = -1
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '[') depth += 1
    else if (character === ']' && --depth === 0) {
      arrayEnd = index
      break
    }
  }
  assert.ok(arrayEnd >= arrayStart, `JSON 的 ${property} 数组未闭合`)
  const arrayText = source.slice(arrayStart, arrayEnd + 1)
  let compact = ''
  inString = false
  escaped = false
  for (const character of arrayText) {
    if (inString) {
      compact += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
    } else if (character === '"') {
      inString = true
      compact += character
    } else if (!/\s/.test(character)) {
      compact += character
    }
  }
  return compact
}


function parseGlb(buffer, path) {
  assert.ok(buffer.length >= 28, `${path} GLB 过短`)
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', `${path} GLB magic 无效`)
  assert.equal(buffer.readUInt32LE(4), 2, `${path} GLB version 无效`)
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${path} GLB 长度无效`)
  let offset = 12
  let document = null
  let binary = null
  while (offset < buffer.length) {
    assert.ok(offset + 8 <= buffer.length, `${path} chunk 头截断`)
    const length = buffer.readUInt32LE(offset)
    const kind = buffer.toString('ascii', offset + 4, offset + 8)
    offset += 8
    assert.ok(offset + length <= buffer.length, `${path} chunk 截断`)
    const chunk = buffer.subarray(offset, offset + length)
    offset += length
    if (kind === 'JSON') document = JSON.parse(chunk.toString('utf8').trim())
    if (kind === 'BIN\0') binary = chunk
  }
  assert.ok(document && binary, `${path} 缺少 JSON/BIN chunk`)
  return { document, binary }
}

function finiteVector(value, length, label) {
  assert.ok(Array.isArray(value) && value.length === length && value.every(Number.isFinite), `${label} 无效`)
}

async function inspectGlb(path) {
  const buffer = readFileSync(path)
  const { document, binary } = parseGlb(buffer, path)
  assert.equal(document.asset?.version, '2.0', `${path} glTF 版本无效`)
  assert.ok(document.extensionsUsed?.includes('EXT_texture_webp'), `${path} 未声明 WebP 扩展`)
  assert.ok(!document.buffers?.some((item) => 'uri' in item), `${path} 不得引用外部 buffer`)
  assert.ok(!document.images?.some((item) => 'uri' in item), `${path} 不得引用外部图片`)
  assert.equal(document.buffers?.length, 1, `${path} buffer 数量无效`)
  assert.ok(document.buffers[0].byteLength <= binary.length, `${path} BIN 长度无效`)

  let triangleCount = 0
  let primitiveCount = 0
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1
      const attributes = primitive.attributes ?? {}
      for (const attribute of ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0']) {
        assert.ok(Number.isInteger(attributes[attribute]), `${path} primitive 缺少 ${attribute}`)
      }
      const accessor = document.accessors?.[primitive.indices]
      assert.ok(accessor && accessor.type === 'SCALAR' && accessor.count % 3 === 0, `${path} 索引 accessor 无效`)
      triangleCount += accessor.count / 3
      const position = document.accessors?.[attributes.POSITION]
      finiteVector(position?.min, 3, `${path} POSITION min`)
      finiteVector(position?.max, 3, `${path} POSITION max`)
    }
  }
  assert.ok(primitiveCount > 0, `${path} 没有 primitive`)

  const textureSizes = []
  for (const image of document.images ?? []) {
    assert.equal(image.mimeType, 'image/webp', `${path} 贴图不是 WebP`)
    const view = document.bufferViews?.[image.bufferView]
    assert.ok(view && Number.isInteger(view.byteLength), `${path} 图片 bufferView 无效`)
    const start = view.byteOffset ?? 0
    const end = start + view.byteLength
    assert.ok(start >= 0 && end <= binary.length, `${path} 图片越界`)
    const metadata = await sharp(binary.subarray(start, end)).metadata()
    assert.ok(Number.isInteger(metadata.width) && Number.isInteger(metadata.height), `${path} WebP 尺寸无效`)
    textureSizes.push([metadata.width, metadata.height])
  }
  assert.ok(textureSizes.length > 0, `${path} 没有内嵌贴图`)
  return { buffer, triangleCount, textureSizes }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dataRoot = resolve(args.data)
  const assetRoot = resolve(args.assets)
  const manifestPath = join(dataRoot, 'landmarks.json')
  const manifestText = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestText)
  const audit = readJson(join(dataRoot, 'reports', 'audit.json'))

  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.sourceId, '2962333032')
  assert.deepEqual(manifest.converter, { name: 'io_pdx_mesh', commit: EXPECTED_CONVERTER })
  assert.match(manifest.assetHash, /^[0-9a-f]{64}$/)
  assert.equal(audit.schemaVersion, 1)
  assert.equal(audit.assetHash, manifest.assetHash)
  assert.equal(manifest.landmarks?.length, EXPECTED.length)
  assert.deepEqual(manifest.landmarks.map(({ id, locationId, provinceId }) => [id, locationId, provinceId]), EXPECTED)
  assert.deepEqual(audit.landmarks?.map(({ id }) => id), EXPECTED.map(([id]) => id))
  const canonicalRecordsText = compactJsonArrayProperty(manifestText, 'landmarks')
  assert.equal(sha256(Buffer.from(canonicalRecordsText)), manifest.assetHash, 'assetHash 与地标记录不一致')

  const serializedManifest = JSON.stringify(manifest)
  assert.doesNotMatch(serializedManifest, /Workshop|Steam|\/mnt\/|[A-Z]:\\|https?:\/\//i)

  const auditById = new Map(audit.landmarks.map((record) => [record.id, record]))
  let totalBytes = 0
  let glbCount = 0
  for (const record of manifest.landmarks) {
    assert.equal(record.lods?.length, 2, `${record.id} 必须有两个 LOD`)
    finiteVector(record.transform?.rotation, 4, `${record.id} rotation`)
    finiteVector(record.transform?.scale, 3, `${record.id} scale`)
    assert.ok(record.transform.scale.every((item) => item > 0), `${record.id} scale 必须为正数`)
    assert.ok(Number.isFinite(record.transform.mapX) && Number.isFinite(record.transform.mapY), `${record.id} 地图坐标无效`)
    assert.ok(Number.isFinite(record.transform.elevationMeters), `${record.id} 高程无效`)
    assert.ok(Number.isFinite(record.bounds?.radiusMapPixels) && record.bounds.radiusMapPixels > 0, `${record.id} 半径无效`)
    assert.ok(Number.isFinite(record.bounds?.heightMeters) && record.bounds.heightMeters > 0, `${record.id} 高度无效`)
    const auditRecord = auditById.get(record.id)
    assert.ok(auditRecord, `${record.id} 缺少审计记录`)
    if (record.id === 'sunspear') {
      assert.equal(auditRecord.correctionReason, 'AGOT 阳戟城 locator 落在影子城省份且原始占地跨越海域')
    } else {
      assert.equal(auditRecord.correctionReason, null, `${record.id} 不应包含无依据 correction`)
    }
    const placement = auditRecord.placement
    assert.ok(placement && typeof placement === 'object', `${record.id} 缺少 placement 审计`)
    assert.equal(placement.anchorProvinceId, record.provinceId, `${record.id} 锚点省份错误`)
    assert.equal(placement.anchorMatchesProvince, true, `${record.id} 锚点未落在声明省份`)
    assert.ok(Number.isInteger(placement.sampleCount) && placement.sampleCount > 0, `${record.id} placement 样本数无效`)
    assert.ok(placement.inBoundsCoverage === 1, `${record.id} 模型足迹超出地图范围`)
    assert.ok(placement.expectedProvinceCoverage >= 0.60, `${record.id} 声明省份覆盖率过低`)
    assert.ok(placement.landCoverage >= 0.70, `${record.id} 陆地覆盖率过低`)
    for (const [sourcePath, digest] of Object.entries(auditRecord.sourceHashes ?? {})) {
      assert.ok(!sourcePath.startsWith('/') && !sourcePath.includes('..') && !/^[A-Z]:\\/i.test(sourcePath), `${record.id} 源哈希路径不安全`)
      assert.doesNotMatch(sourcePath, /https?:\/\//i)
      assert.match(digest, /^[0-9a-f]{64}$/)
    }
    assert.ok(Object.keys(auditRecord.sourceHashes ?? {}).length > 0, `${record.id} 缺少源哈希`)

    for (let level = 0; level < 2; level += 1) {
      const lod = record.lods[level]
      const expectedRuntimePath = `/assets/agot-map/models/${record.id}/lod${level}.glb`
      assert.equal(lod.path, expectedRuntimePath)
      assert.equal(lod.minZoom, level === 0 ? 5.35 : 4.6)
      assert.ok(Number.isInteger(lod.bytes) && lod.bytes > 0 && lod.bytes <= MAX_LOD_BYTES[level], `${record.id}/lod${level} 超过字节预算`)
      assert.ok(Number.isInteger(lod.triangleCount) && lod.triangleCount > 0)
      assert.match(lod.sha256, /^[0-9a-f]{64}$/)
      const path = join(assetRoot, record.id, `lod${level}.glb`)
      const inspected = await inspectGlb(path)
      assert.equal(inspected.buffer.length, lod.bytes, `${record.id}/lod${level} 字节数不一致`)
      assert.equal(sha256(inspected.buffer), lod.sha256, `${record.id}/lod${level} 哈希不一致`)
      assert.equal(inspected.triangleCount, lod.triangleCount, `${record.id}/lod${level} 三角形数不一致`)
      assert.deepEqual(inspected.textureSizes, lod.textureSizes, `${record.id}/lod${level} 贴图尺寸记录不一致`)
      assert.deepEqual(auditRecord.lods[level], lod, `${record.id}/lod${level} 清单和审计不一致`)
      for (const [width, height] of inspected.textureSizes) {
        assert.ok(Math.max(width, height) <= MAX_TEXTURE_EDGE[level], `${record.id}/lod${level} 贴图超限`)
      }
      totalBytes += lod.bytes
      glbCount += 1
    }
    const ratio = record.lods[1].triangleCount / record.lods[0].triangleCount
    assert.ok(ratio >= 0.25 && ratio <= 0.40, `${record.id} LOD1 比例超限：${ratio}`)
  }
  assert.ok(totalBytes <= 120 * MIB, `总量超过 120 MiB：${totalBytes}`)

  const directories = readdirSync(assetRoot).filter((name) => statSync(join(assetRoot, name)).isDirectory()).sort()
  assert.deepEqual(directories, EXPECTED.map(([id]) => id).sort(), '最终资产目录含缺失或额外地标')
  for (const [id] of EXPECTED) {
    assert.deepEqual(readdirSync(join(assetRoot, id)).sort(), ['lod0.glb', 'lod1.glb'], `${id} 目录含缺失或额外文件`)
  }
  console.log(JSON.stringify({
    landmarkCount: EXPECTED.length,
    glbCount,
    totalBytes,
    totalMiB: Number((totalBytes / MIB).toFixed(2)),
    assetHash: manifest.assetHash,
  }))
}

main().catch((error) => {
  console.error(`AGOT 地标模型审计失败：${error.message}`)
  process.exitCode = 1
})
