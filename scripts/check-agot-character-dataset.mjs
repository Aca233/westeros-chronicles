import { access, readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const datasetRoot = join(root, 'public/data/agot-characters');
const failures = [];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

let manifest;
let searchIndex;
let report;
let titleHolders;
let loadoutReport;
try {
  [manifest, searchIndex, report, titleHolders, loadoutReport] = await Promise.all([
    readJson(join(datasetRoot, 'manifest.json')),
    readJson(join(datasetRoot, 'search-index.json')),
    readJson(join(datasetRoot, 'reports/import-report.json')),
    readJson(join(datasetRoot, 'title-holders.json')),
    readJson(join(datasetRoot, 'reports/loadout-report.json')),
  ]);
} catch (error) {
  console.error(`AGOT character dataset is missing or invalid: ${error.message}`);
  process.exit(1);
}

const templateBundle = await build({
  stdin: {
    contents: "export { NPC_LOADOUT_TEMPLATES } from './src/data/npcLoadoutTemplates.ts'; export { ITEM_CATALOG } from './src/data/itemDefinitions.ts';",
    resolveDir: root,
    sourcefile: 'character-dataset-audit-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const templateUrl = `data:text/javascript;base64,${Buffer.from(templateBundle.outputFiles[0].text).toString('base64')}`;
const { NPC_LOADOUT_TEMPLATES, ITEM_CATALOG } = await import(templateUrl);
const knownTemplateIds = new Set(Object.keys(NPC_LOADOUT_TEMPLATES));

if (manifest.schemaVersion !== 2) failures.push('Dataset schema version must be 2.');
if (manifest.source?.sourceId !== '2962333032') failures.push('Dataset source is not the AGOT workshop item.');
if (JSON.stringify(manifest.source).includes('Crusader Kings III/game')) failures.push('Dataset references the CK3 vanilla game directory.');
if ((manifest.counts?.totalSourceRecords ?? 0) < 100000) failures.push('Dataset source record count is unexpectedly small.');
if ((manifest.counts?.projectedRecords ?? 0) < 120000) failures.push('Dataset projected source count is unexpectedly small.');
if ((manifest.counts?.prunedRecords ?? 0) < 100000) failures.push('Dataset was not pruned to the approved runtime roster.');
if ((manifest.counts?.emittedRecords ?? 0) < 10000 || (manifest.counts?.emittedRecords ?? 0) > 13000) failures.push('Runtime roster size is outside the approved range.');
if ((manifest.counts?.canon ?? 0) < 1200) failures.push('Runtime canon count is unexpectedly small.');
if ((manifest.counts?.semicanon ?? 0) < 400) failures.push('Runtime semicanon count is unexpectedly small.');
if ((manifest.counts?.excludedTechnical ?? 0) < 2000) failures.push('Dataset did not exclude expected technical characters.');
if (searchIndex.length !== manifest.counts?.emittedRecords) failures.push('Search index count does not match emitted records.');
if (report.datasetHash !== manifest.datasetHash) failures.push('Import report and manifest hashes differ.');
if (searchIndex.some((entry) => entry.canonTier === 'technical')) failures.push('Technical characters leaked into search index.');
if (searchIndex.some((entry) => !entry.id?.startsWith('agot:'))) failures.push('Search index contains an invalid character ID.');
if (!titleHolders || Array.isArray(titleHolders) || typeof titleHolders !== 'object') {
  failures.push('Title holder map is missing or invalid.');
} else {
  const titleEntries = Object.values(titleHolders).flat();
  if (Object.keys(titleHolders).length !== manifest.counts?.titleHolderCount) failures.push('Title holder count does not match manifest.');
  if (titleEntries.length !== manifest.counts?.heldTitleCount) failures.push('Held title count does not match manifest.');
  if (Object.keys(titleHolders).some((id) => !id.startsWith('agot:'))) failures.push('Title holder map contains a non-AGOT character ID.');
  if (titleEntries.some((title) => !title.id || !title.name || !title.tier)) failures.push('Title holder map contains malformed entries.');
  if (titleEntries.some((title) => title.name === title.id || /^[hekdcb]_/.test(title.name))) failures.push('A raw title ID leaked into a display name.');
  for (const [characterId, titles] of Object.entries(titleHolders)) {
    if (new Set(titles.map((title) => title.name)).size !== titles.length) {
      failures.push(`Character ${characterId} has duplicate localized holding names.`);
      break;
    }
  }
}

const records = [];
for (const shard of new Set(searchIndex.map((entry) => entry.shard))) {
  try {
    const shardPath = join(datasetRoot, 'shards', `${shard}.json`);
    await access(shardPath);
    records.push(...await readJson(shardPath));
  } catch {
    failures.push(`Missing character shard ${shard}.json.`);
  }
}

const declaredShards = [...new Set(manifest.shards ?? [])].sort();
const [kinshipFiles, loadoutFiles] = await Promise.all([
  readdir(join(datasetRoot, 'kinship')),
  readdir(join(datasetRoot, 'loadouts')),
]);
const expectedFiles = declaredShards.map((shard) => `${shard}.json`);
if (JSON.stringify(kinshipFiles.filter((name) => name.endsWith('.json')).sort()) !== JSON.stringify(expectedFiles)) {
  failures.push('Kinship shard set does not match the manifest shard set.');
}
if (JSON.stringify(loadoutFiles.filter((name) => name.endsWith('.json')).sort()) !== JSON.stringify(expectedFiles)) {
  failures.push('Loadout shard set does not match the manifest shard set.');
}

const kinship = {};
const loadouts = {};
for (const shard of declaredShards) {
  try {
    Object.assign(kinship, await readJson(join(datasetRoot, 'kinship', `${shard}.json`)));
  } catch {
    failures.push(`Missing or invalid kinship shard ${shard}.json.`);
  }
  try {
    Object.assign(loadouts, await readJson(join(datasetRoot, 'loadouts', `${shard}.json`)));
  } catch {
    failures.push(`Missing or invalid loadout shard ${shard}.json.`);
  }
}
if (Object.keys(kinship).length !== manifest.counts?.emittedRecords) failures.push('Kinship index does not cover every emitted character.');
if (loadoutReport.unassigned !== 0) failures.push('Loadout report contains eligible unassigned characters.');
if (Object.keys(loadouts).length !== loadoutReport.assigned || loadoutReport.assigned !== loadoutReport.eligibleLiving) {
  failures.push('Loadout shard count does not match complete eligible-living coverage.');
}
if (Object.values(loadoutReport.templates ?? {}).reduce((sum, count) => sum + count, 0) !== loadoutReport.assigned) {
  failures.push('Loadout report template counts do not sum to assigned count.');
}
for (const [characterId, profile] of Object.entries(loadouts)) {
  if (profile.characterId !== characterId) {
    failures.push(`Loadout profile key mismatch for ${characterId}.`);
    break;
  }
  if (!knownTemplateIds.has(profile.templateId)) {
    failures.push(`Loadout profile ${characterId} references unknown template ${profile.templateId}.`);
    break;
  }
}
for (const templateId of ['infant', 'child']) {
  const template = NPC_LOADOUT_TEMPLATES[templateId];
  for (const slot of template?.slots ?? []) {
    const definition = ITEM_CATALOG.get(slot.definitionId);
    if (!definition || definition.category === 'weapon' || definition.category === 'armor') {
      failures.push(`${templateId} template contains an invalid adult weapon or armor definition.`);
      break;
    }
  }
}

if (records.length !== manifest.counts?.emittedRecords) failures.push('Character shard record count does not match emitted records.');
if (records.some((record) => !record.cultureId)) failures.push('At least one character is missing culture data.');
if (records.some((record) => !record.faithId)) failures.push('At least one character is missing faith data.');

const expectedPrimaryTitles = new Map([
  ['agot:Baratheon_2', '铁王座'],
  ['agot:Stark_3', '北境'],
  ['agot:Arryn_3', '谷地'],
]);
for (const [characterId, expectedTitle] of expectedPrimaryTitles) {
  const actualTitle = titleHolders?.[characterId]?.[0]?.name;
  if (actualTitle !== expectedTitle) failures.push(`${characterId} primary title should be ${expectedTitle}, got ${String(actualTitle)}.`);
}
for (const characterId of ['agot:Targaryen_9', 'agot:Baratheon_5']) {
  if ((titleHolders?.[characterId]?.length ?? 0) !== 0) failures.push(`${characterId} should be landless at 8298.1.1.`);
}

const recordsById = new Map(records.map((record) => [record.id, record]));
for (const characterId of Object.keys(titleHolders)) {
  if (!recordsById.has(characterId)) failures.push(`Title holder ${characterId} is absent from the runtime roster.`);
}
for (const record of records) {
  for (const parentId of [record.fatherId, record.motherId].filter(Boolean)) {
    if (!recordsById.has(parentId)) failures.push(`Character ${record.id} references missing parent ${parentId}.`);
  }
  for (const spouseId of record.spouseIds ?? []) {
    if (!recordsById.has(spouseId)) failures.push(`Character ${record.id} references missing spouse ${spouseId}.`);
  }
}
for (const [characterId, entry] of Object.entries(kinship)) {
  if (!recordsById.has(characterId) || !Array.isArray(entry.spouseIds) || !Array.isArray(entry.childIds) || !Array.isArray(entry.siblingIds)) {
    failures.push(`Kinship entry ${characterId} is malformed.`);
    break;
  }
  if (new Set(entry.childIds).size !== entry.childIds.length
    || new Set(entry.spouseIds).size !== entry.spouseIds.length
    || new Set(entry.siblingIds).size !== entry.siblingIds.length) {
    failures.push(`Kinship entry ${characterId} contains duplicate relations.`);
    break;
  }
  if (entry.siblingIds.includes(characterId)) {
    failures.push(`Kinship entry ${characterId} lists itself as a sibling.`);
    break;
  }
  for (const childId of entry.childIds) {
    const child = recordsById.get(childId);
    if (!child || (child.fatherId !== characterId && child.motherId !== characterId)) {
      failures.push(`Kinship child link ${characterId}/${childId} has no matching parent pointer.`);
      break;
    }
  }
  for (const siblingId of entry.siblingIds) {
    const sibling = recordsById.get(siblingId);
    const sharesParent = sibling && [entry.fatherId, entry.motherId]
      .filter(Boolean)
      .some((parentId) => parentId === sibling.fatherId || parentId === sibling.motherId);
    if (!sibling || !sharesParent || !kinship[siblingId]?.siblingIds?.includes(characterId)) {
      failures.push(`Kinship sibling link ${characterId}/${siblingId} is not reciprocal or has no shared parent.`);
      break;
    }
  }
  if (failures.length >= 20) break;
}
for (const [characterId, profile] of Object.entries(loadouts)) {
  const record = recordsById.get(characterId);
  if (!record || !record.born || !record.alive) {
    failures.push(`Loadout profile ${characterId} is assigned to an ineligible character.`);
    break;
  }
}
for (const record of records) {
  for (const spouseId of record.spouseIds ?? []) {
    const spouse = recordsById.get(spouseId);
    if (!spouse) failures.push(`Character ${record.id} references missing spouse ${spouseId}.`);
    else if (!(spouse.spouseIds ?? []).includes(record.id)) failures.push(`Marriage ${record.id}/${spouseId} is not reciprocal.`);
    if (failures.length >= 20) break;
  }
  if (failures.length >= 20) break;
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${searchIndex.length} AGOT character records from dataset ${manifest.datasetHash.slice(0, 12)}.`);
