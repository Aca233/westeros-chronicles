import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Json, stableJson } from './hash.mjs';
import { validateWorldSource } from './schemas.mjs';

async function readJson(path, label = path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取${label}：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readCharacterContents(contentDir) {
  const directory = join(contentDir, 'characters');
  let names = [];
  try { names = await readdir(directory); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const records = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    records.push(await readJson(join(directory, name), `人物内容 ${name}`));
  }
  return records;
}

export async function readAndValidateWorldSource(contentDir) {
  const source = {
    manifest: await readJson(join(contentDir, 'manifest.json'), '世界清单'),
    playableCharacters: await readJson(join(contentDir, 'playable-characters.json'), '可玩人物'),
    startCharacters: await readJson(join(contentDir, 'start-state', 'characters.json'), '人物起点'),
    startTitles: await readJson(join(contentDir, 'start-state', 'titles.json'), '头衔起点'),
    startAssets: await readJson(join(contentDir, 'start-state', 'assets.json'), '资产起点'),
    gameplayLocations: await readJson(join(contentDir, 'locations', 'gameplay-locations.json'), '游戏地点'),
    terminology: {
      cultures: await readJson(join(contentDir, 'terminology', 'cultures.json'), '文化术语'),
      faiths: await readJson(join(contentDir, 'terminology', 'faiths.json'), '信仰术语'),
      relationships: await readJson(join(contentDir, 'terminology', 'relationships.json'), '关系术语'),
    },
    ordinaryItems: await readJson(join(contentDir, 'items', 'ordinary-items.json'), '普通物品'),
    loadoutTemplates: await readJson(join(contentDir, 'items', 'loadout-templates.json'), '装备模板'),
    loadoutOverrides: await readJson(join(contentDir, 'items', 'loadout-overrides.json'), '装备覆盖'),
    characterContents: await readCharacterContents(contentDir),
  };
  return validateWorldSource(source);
}

async function readDatasetManifests(rootDir) {
  const characters = await readJson(join(rootDir, 'public', 'data', 'agot-characters', 'manifest.json'), '人物数据清单');
  const map = await readJson(join(rootDir, 'public', 'data', 'agot-map', 'manifest.json'), '地图数据清单');
  const artifacts = await readJson(join(rootDir, 'public', 'data', 'items', 'agot-artifact-world-state.json'), '神器世界状态');
  if (characters.schemaVersion !== 2 || typeof characters.datasetHash !== 'string') throw new Error('人物数据清单无效');
  if (map.schemaVersion !== 4 || typeof map.datasetHash !== 'string') throw new Error('地图数据清单无效');
  if (typeof artifacts.artifactDatasetHash !== 'string' || typeof artifacts.datasetHash !== 'string') throw new Error('神器世界状态无效');
  if (artifacts.characterDatasetHash && artifacts.characterDatasetHash !== characters.datasetHash) {
    throw new Error('神器世界状态与人物数据哈希不匹配');
  }
  const characterIndex = await readJson(join(rootDir, 'public', 'data', 'agot-characters', 'search-index.json'), '人物搜索索引');
  const mapIndex = await readJson(join(rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), '地图地点索引');
  if (!Array.isArray(characterIndex) || characterIndex.some((entry) => typeof entry?.id !== 'string')) throw new Error('人物搜索索引无效');
  if (!Array.isArray(mapIndex) || mapIndex.some((entry) => typeof entry?.id !== 'string')) throw new Error('地图地点索引无效');
  const holderSummariesPath = join(rootDir, 'public', 'data', 'agot-characters', 'holder-summaries.json');
  const holderSummaryDocument = await (async () => {
    try {
      return await readJson(holderSummariesPath, '持有人摘要');
    } catch (error) {
      if (/ENOENT/.test(error instanceof Error ? error.message : String(error))) return { schemaVersion: 1, holders: [] };
      throw error;
    }
  })();
  const holderSummaries = holderSummaryDocument?.holders;
  if (holderSummaryDocument.schemaVersion !== 1 || !Array.isArray(holderSummaries)) throw new Error('持有人摘要无效');
  const holderSummaryIds = new Set();
  for (const summary of holderSummaries) {
    const record = summary && typeof summary === 'object' ? summary : null;
    if (!record || typeof record.id !== 'string' || !record.id.startsWith('agot:')) throw new Error('持有人摘要条目无效');
    if (holderSummaryIds.has(record.id)) throw new Error(`持有人摘要 ID 重复：${record.id}`);
    holderSummaryIds.add(record.id);
    for (const field of ['name', 'displayLabel']) {
      if (typeof record[field] !== 'string' || !record[field].trim()) throw new Error(`持有人摘要 ${field} 无效：${record.id}`);
    }
    if (typeof record.alive !== 'boolean') throw new Error(`持有人摘要 alive 无效：${record.id}`);
    if (!Array.isArray(record.titleIds) || record.titleIds.some((titleId) => typeof titleId !== 'string' || !titleId)) {
      throw new Error(`持有人摘要 titleIds 无效：${record.id}`);
    }
    if ('dynastyId' in record && record.dynastyId !== null && typeof record.dynastyId !== 'string') {
      throw new Error(`持有人摘要 dynastyId 无效：${record.id}`);
    }
  }
  return {
    characters,
    map,
    artifacts,
    characterIds: new Set(characterIndex.map((entry) => entry.id)),
    characterIndexById: new Map(characterIndex.map((entry) => [entry.id, entry])),
    mapLocationIds: new Set(mapIndex.map((entry) => entry.id)),
    artifactDefinitions: new Map(Object.entries(artifacts.artifacts)),
    holderSummaries,
  };
}

function validateStartCharacterReferences(startCharacters, dependencies) {
  for (const record of startCharacters) {
    if (!dependencies.characterIds.has(record.characterId)) {
      throw new Error(`人物起点引用未知人物：${record.characterId}`);
    }
    if (!dependencies.mapLocationIds.has(record.location.locationId)) {
      throw new Error(`人物起点位置不在地图数据集中：${record.characterId} -> ${record.location.locationId}`);
    }
  }
}

function validateCharacterContentReferences(contents, dependencies) {
  for (const record of contents) {
    const character = dependencies.characterIndexById.get(record.characterId);
    if (!character) throw new Error(`人物内容引用未知人物：${record.characterId}`);
    if (!character.alive) throw new Error(`人物内容主体在开局不在世：${record.characterId}`);
    for (const experience of record.experiences ?? []) {
      for (const participantId of experience.participantIds ?? []) {
        if (!dependencies.characterIds.has(participantId)) {
          throw new Error(`人物内容经历参与者不存在：${record.characterId} -> ${participantId}`);
        }
      }
    }
    for (const relation of record.notableRelations ?? []) {
      if (!dependencies.characterIds.has(relation.targetId)) {
        throw new Error(`人物内容关系目标不存在：${record.characterId} -> ${relation.targetId}`);
      }
    }
  }
}

const UNKNOWN_LOCATION_SENTINEL = 'b_unknown_westeros';

function assertKnownLocationRef(location, label, dependencies) {
  if (location.locationId !== UNKNOWN_LOCATION_SENTINEL && !dependencies.mapLocationIds.has(location.locationId)) {
    throw new Error(`${label}不在地图数据集中：${location.locationId}`);
  }
}

function isUniqueDefinitionId(definitionId, dependencies) {
  return definitionId.startsWith('artifact.') || dependencies.artifactDefinitions.has(definitionId);
}

function validateStartAssetReferences(startAssets, dependencies) {
  const siteIds = new Set(startAssets.sites.map((site) => site.id));
  const vehicleIds = new Set(startAssets.vehicles.map((vehicle) => vehicle.id));
  const uniqueDefinitionOwners = new Map();
  for (const instance of startAssets.instances) {
    for (const [field, ref] of [
      ['lawfulOwner', instance.lawfulOwner],
      ['controller', instance.controller],
      ['custodian', instance.custodian],
      ['placement', instance.placement],
    ]) {
      if (!ref) continue;
      if (ref.type === 'character' && !dependencies.characterIds.has(ref.characterId)) {
        throw new Error(`资产实例引用未知人物：${instance.instanceId} ${field} ${ref.characterId}`);
      }
      if (ref.type === 'location') assertKnownLocationRef(ref.location, `资产实例 ${instance.instanceId} ${field}`, dependencies);
      if (ref.type === 'asset') {
        if (ref.assetId.startsWith('site:') && !siteIds.has(ref.assetId.slice(5))) {
          throw new Error(`保管站点不存在：${instance.instanceId} -> ${ref.assetId}`);
        }
        if (ref.assetId.startsWith('vehicle:') && !vehicleIds.has(ref.assetId.slice(8))) {
          throw new Error(`保管载具不存在：${instance.instanceId} -> ${ref.assetId}`);
        }
        if (!ref.assetId.startsWith('site:') && !ref.assetId.startsWith('vehicle:')) {
          throw new Error(`资产引用前缀无效：${instance.instanceId} -> ${ref.assetId}`);
        }
      }
    }
    if (isUniqueDefinitionId(instance.definitionId, dependencies)) {
      const controllerKey = instance.controller?.type === 'character' ? instance.controller.characterId : String(instance.controller?.type ?? 'null');
      const previous = uniqueDefinitionOwners.get(instance.definitionId);
      if (previous !== undefined) throw new Error(`唯一资产重复：${instance.definitionId}`);
      uniqueDefinitionOwners.set(instance.definitionId, controllerKey);
      const artifact = dependencies.artifactDefinitions.get(instance.definitionId);
      if (artifact && controllerKey !== artifact.lawfulControllerId) {
        throw new Error(`神器覆盖控制者不一致：${instance.definitionId}`);
      }
    }
  }
  for (const site of startAssets.sites) assertKnownLocationRef(site.location, `保管站点 ${site.id}`, dependencies);
  for (const vehicle of startAssets.vehicles) assertKnownLocationRef(vehicle.location, `载具 ${vehicle.id}`, dependencies);
}

function buildCharacterContentShards(contents) {
  const shards = {};
  const characters = {};
  for (const record of [...contents].sort((left, right) => left.characterId.localeCompare(right.characterId))) {
    const shardId = createHash('sha256').update(record.characterId).digest('hex')[0];
    (shards[shardId] ??= {})[record.characterId] = record;
    characters[record.characterId] = shardId;
  }
  const index = {
    schemaVersion: 1,
    shards: Object.fromEntries(Object.keys(shards).sort().map((shardId) => [shardId, `/data/world/character-content/${shardId}.json`])),
    characters,
  };
  return { index, shardRecords: shards };
}

function buildOutputs(source, dependencies) {
  const startState = {
    schemaVersion: 1,
    characters: source.startCharacters,
    titles: source.startTitles,
    assets: source.startAssets.instances,
    sites: source.startAssets.sites,
    vehicles: source.startAssets.vehicles,
  };
  const terminology = {
    schemaVersion: 1,
    cultures: source.terminology.cultures.labels,
    faiths: source.terminology.faiths.labels,
    relationships: source.terminology.relationships.labels,
  };
  const gameplayLocations = { schemaVersion: 1, entries: [], config: source.gameplayLocations };
  const holderSummaries = { schemaVersion: 1, holders: dependencies.holderSummaries };
  const { index: characterContentIndex, shardRecords: characterContentShards } = buildCharacterContentShards(source.characterContents);
  const payload = {
    startState,
    playableCharacters: source.playableCharacters,
    terminology,
    gameplayLocations,
    holderSummaries,
    characterContentIndex,
    ordinaryItems: source.ordinaryItems.items,
    loadouts: {
      schemaVersion: 1,
      templates: source.loadoutTemplates.templates,
      overrides: source.loadoutOverrides.overrides,
    },
  };
  const contentHash = sha256Json(payload);
  const manifest = {
    schemaVersion: 1,
    worldId: source.manifest.worldId,
    startDate: source.manifest.startDate,
    characterDatasetHash: dependencies.characters.datasetHash,
    mapDatasetHash: dependencies.map.datasetHash,
    artifactDatasetHash: dependencies.artifacts.artifactDatasetHash,
    artifactWorldStateHash: dependencies.artifacts.datasetHash,
    contentHash,
    paths: {
      startState: '/data/world/start-state.json',
      playableCharacters: '/data/world/playable-characters.json',
      characterContentIndex: '/data/world/character-content/index.json',
      terminology: '/data/world/terminology.json',
      gameplayLocations: '/data/world/gameplay-locations.json',
      holderSummaries: '/data/world/holder-summaries.json',
      ordinaryItems: '/data/world/ordinary-items.json',
      loadouts: '/data/world/loadouts.json'
    },
  };
  return { manifest, payload, contentHash, characterContentShards };
}

async function writeOutputTree(directory, outputs) {
  await mkdir(join(directory, 'character-content'), { recursive: true });
  const files = {
    'manifest.json': outputs.manifest,
    'start-state.json': outputs.payload.startState,
    'playable-characters.json': outputs.payload.playableCharacters,
    'character-content/index.json': outputs.payload.characterContentIndex,
    'terminology.json': outputs.payload.terminology,
    'gameplay-locations.json': outputs.payload.gameplayLocations,
    'holder-summaries.json': outputs.payload.holderSummaries,
    'ordinary-items.json': outputs.payload.ordinaryItems,
    'loadouts.json': outputs.payload.loadouts,
  };
  for (const [shardId, records] of Object.entries(outputs.characterContentShards)) {
    files[join('character-content', `${shardId}.json`)] = records;
  }
  for (const [name, value] of Object.entries(files)) {
    const target = join(directory, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, stableJson(value), 'utf8');
  }
}

async function listRelativeFiles(directory, prefix = '') {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listRelativeFiles(directory, relativePath));
    else files.push(relativePath);
  }
  return files;
}

async function replaceLockedDirectoryTransactionally(outputDir, stagedDir, backup) {
  await cp(outputDir, backup, { recursive: true });
  const files = await listRelativeFiles(stagedDir);
  const manifest = files.find((name) => name === 'manifest.json');
  const payloadFiles = files.filter((name) => name !== 'manifest.json');
  try {
    for (const relativePath of [...payloadFiles, ...(manifest ? [manifest] : [])]) {
      const source = join(stagedDir, relativePath);
      const target = join(outputDir, relativePath);
      const pending = `${target}.pending-${process.pid}`;
      await mkdir(dirname(target), { recursive: true });
      await cp(source, pending);
      await rename(pending, target);
    }
    await rm(stagedDir, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await cp(backup, outputDir, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    throw error;
  }
}

async function replaceDirectoryAtomically(outputDir, stagedDir) {
  const backup = `${outputDir}.previous-${process.pid}`;
  let hadPrevious = false;
  try {
    await rename(outputDir, backup);
    hadPrevious = true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      // First publication has no previous generation.
    } else if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      return replaceLockedDirectoryTransactionally(outputDir, stagedDir, backup);
    } else {
      throw error;
    }
  }
  try {
    try {
      await rename(stagedDir, outputDir);
    } catch (error) {
      if (error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
      await cp(stagedDir, outputDir, { recursive: true });
      await rm(stagedDir, { recursive: true, force: true });
    }
    if (hadPrevious) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    if (hadPrevious) await rename(backup, outputDir);
    throw error;
  }
}

export async function compileWorldContent(options = {}) {
  const rootDir = resolve(options.rootDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const contentDir = resolve(options.contentDir ?? join(rootDir, 'content', 'world'));
  const outputDir = resolve(options.outputDir ?? join(rootDir, 'public', 'data', 'world'));
  if (relative(rootDir, contentDir).startsWith('..') || relative(rootDir, outputDir).startsWith('..')) {
    throw new Error('世界内容输入输出必须位于项目目录内');
  }
  const source = await readAndValidateWorldSource(contentDir);
  const dependencies = await readDatasetManifests(rootDir);
  validateStartCharacterReferences(source.startCharacters, dependencies);
  validateStartAssetReferences(source.startAssets, dependencies);
  validateCharacterContentReferences(source.characterContents, dependencies);
  const outputs = buildOutputs(source, dependencies);
  await mkdir(dirname(outputDir), { recursive: true });
  const temporary = await mkdtemp(join(dirname(outputDir), `.${basename(outputDir)}-`));
  try {
    await writeOutputTree(temporary, outputs);
    await replaceDirectoryAtomically(outputDir, temporary);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { worldId: source.manifest.worldId, startDate: source.manifest.startDate, contentHash: outputs.contentHash };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  compileWorldContent().then((report) => {
    console.log(`Compiled ${report.worldId} at ${report.startDate.year}-${String(report.startDate.month).padStart(2, '0')}-${String(report.startDate.day).padStart(2, '0')} (${report.contentHash.slice(0, 12)}).`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
