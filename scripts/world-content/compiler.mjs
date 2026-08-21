import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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
  return { characters, map, artifacts };
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
  const holderSummaries = { schemaVersion: 1, holders: [] };
  const characterContentIndex = { schemaVersion: 1, shards: {}, characters: {} };
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
  return { manifest, payload, contentHash };
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
  for (const [name, value] of Object.entries(files)) {
    const target = join(directory, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, stableJson(value), 'utf8');
  }
}

async function replaceDirectoryAtomically(outputDir, stagedDir) {
  const parent = dirname(outputDir);
  const backup = `${outputDir}.previous-${process.pid}`;
  let hadPrevious = false;
  try {
    await rename(outputDir, backup);
    hadPrevious = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
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
  const outputs = buildOutputs(source, dependencies);
  await mkdir(dirname(outputDir), { recursive: true });
  const temporary = await mkdtemp(join(dirname(outputDir), `.${outputDir.split('/').at(-1)}-`));
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
