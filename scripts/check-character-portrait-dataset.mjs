import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rosterRoot = join(root, 'public/data/agot-characters');
const portraitRoot = join(root, 'public/data/agot-character-portraits');
const assetRoot = join(root, 'public/assets/character-portraits');
const failures = [];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function fail(message) {
  if (failures.length < 100) failures.push(message);
}

function isRealWebP(bytes) {
  if (bytes.length < 16) return false;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return false;
  if (!['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return false;
  return bytes.readUInt32LE(4) + 8 === bytes.length;
}

let rosterIndex;
let manifest;
let attribution;
let importReport;
let acceptedReport;
try {
  [rosterIndex, manifest, attribution, importReport, acceptedReport] = await Promise.all([
    readJson(join(rosterRoot, 'search-index.json')),
    readJson(join(portraitRoot, 'manifest.json')),
    readJson(join(portraitRoot, 'attribution.json')),
    readJson(join(portraitRoot, 'reports/import-report.json')),
    readJson(join(portraitRoot, 'reports/accepted.json')),
  ]);
} catch (error) {
  console.error(`人物头像数据缺失或 JSON 无效：${error.message}`);
  process.exit(1);
}

const rosterIds = new Set(rosterIndex.map((entry) => entry.id));
const expectedShardNames = Array.from({ length: 256 }, (_, value) => `${value.toString(16).padStart(2, '0')}.json`);
const shardNames = (await readdir(join(portraitRoot, 'shards'))).filter((name) => name.endsWith('.json')).sort();
if (JSON.stringify(shardNames) !== JSON.stringify(expectedShardNames)) {
  fail(`头像分片必须完整包含 00.json 至 ff.json，当前为 ${shardNames.length} 个。`);
}

const refs = new Map();
for (const shardName of shardNames) {
  const shard = await readJson(join(portraitRoot, 'shards', shardName));
  if (!shard || Array.isArray(shard) || typeof shard !== 'object') {
    fail(`头像分片 ${shardName} 不是对象。`);
    continue;
  }
  for (const [characterId, ref] of Object.entries(shard)) {
    if (refs.has(characterId)) fail(`人物头像重复映射：${characterId}。`);
    refs.set(characterId, ref);
    if (!rosterIds.has(characterId)) fail(`头像人物不在精简运行时名单中：${characterId}。`);
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) || ref.characterId !== characterId) {
      fail(`头像映射格式错误：${characterId}。`);
      continue;
    }
    if (!/^\/assets\/character-portraits\/[a-z0-9][a-z0-9._-]*\.webp$/i.test(ref.assetPath ?? '')) {
      fail(`头像使用了非本地 WebP 路径：${characterId}。`);
    }
    if (typeof ref.attributionId !== 'string' || !attribution[ref.attributionId]) {
      fail(`头像署名无法解析：${characterId} / ${String(ref.attributionId)}。`);
    }
  }
}

const referencedAssets = new Set();
const referencedAttribution = new Set();
const attributionOwners = new Map();
for (const [characterId, ref] of refs) {
  if (!ref || typeof ref !== 'object') continue;
  const filename = basename(ref.assetPath ?? '');
  if (filename) {
    if (referencedAssets.has(filename)) fail(`同一个头像资源被多个人物使用：${filename}。`);
    referencedAssets.add(filename);
    try {
      const bytes = await readFile(join(assetRoot, filename));
      if (!isRealWebP(bytes)) fail(`头像资源不是真实完整的 WebP：${filename}。`);
    } catch (error) {
      fail(`头像资源缺失：${filename}（${error.message}）。`);
    }
  }
  if (ref.attributionId) {
    referencedAttribution.add(ref.attributionId);
    const owners = attributionOwners.get(ref.attributionId) ?? [];
    owners.push(characterId);
    attributionOwners.set(ref.attributionId, owners);
  }
}
for (const [attributionId, owners] of attributionOwners) {
  if (owners.length > 1) fail(`同一个 Wiki 页面被绑定给多个人物：${attributionId} -> ${owners.join('、')}。`);
}

const assetNames = (await readdir(assetRoot)).filter((name) => name.endsWith('.webp')).sort();
for (const filename of assetNames) {
  if (!referencedAssets.has(filename)) fail(`存在孤立头像资源：${filename}。`);
}
for (const filename of referencedAssets) {
  if (!assetNames.includes(filename)) fail(`映射引用了目录中不存在的头像：${filename}。`);
}

const pageOwners = new Map();
for (const [attributionId, entry] of Object.entries(attribution)) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.id !== attributionId) {
    fail(`署名条目格式错误：${attributionId}。`);
    continue;
  }
  if (!referencedAttribution.has(attributionId)) fail(`存在孤立头像署名：${attributionId}。`);
  if (typeof entry.pageTitle !== 'string' || !entry.pageTitle.trim()) fail(`署名缺少 Wiki 页面标题：${attributionId}。`);
  if (!/^https:\/\/awoiaf\.westeros\.org\//.test(entry.pageUrl ?? '')) fail(`署名页面来源无效：${attributionId}。`);
  if (!/^https:\/\//.test(entry.originalUrl ?? '')) fail(`署名原图来源无效：${attributionId}。`);
  const normalizedPage = String(entry.pageTitle ?? '').trim().toLocaleLowerCase('en-US');
  if (normalizedPage) {
    const previous = pageOwners.get(normalizedPage);
    if (previous && previous !== attributionId) fail(`Wiki 页面标题重复绑定：${entry.pageTitle}。`);
    pageOwners.set(normalizedPage, attributionId);
  }
}
for (const attributionId of referencedAttribution) {
  if (!Object.hasOwn(attribution, attributionId)) fail(`映射引用了不存在的署名：${attributionId}。`);
}

if (manifest.schemaVersion !== 1) fail('头像清单 schemaVersion 必须为 1。');
if (manifest.datasetHash !== importReport.dataset_hash) fail('头像清单与导入报告的数据哈希不一致。');
if (manifest.counts?.accepted !== refs.size || importReport.accepted !== refs.size) fail('头像清单、导入报告与分片中的成功数量不一致。');
if (Object.keys(acceptedReport).length !== refs.size) fail('成功匹配报告数量与头像映射数量不一致。');
if (Object.keys(attribution).length !== refs.size) fail('头像署名数量与头像映射数量不一致。');
if (assetNames.length !== refs.size) fail('头像资源数量与头像映射数量不一致。');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`已验证 ${refs.size} 个本地人物头像、${shardNames.length} 个分片与 ${assetNames.length} 个 WebP 资源。`);
