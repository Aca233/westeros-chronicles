import { access, readFile } from 'node:fs/promises';
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
try {
  [manifest, searchIndex, report] = await Promise.all([
    readJson(join(datasetRoot, 'manifest.json')),
    readJson(join(datasetRoot, 'search-index.json')),
    readJson(join(datasetRoot, 'reports/import-report.json')),
  ]);
} catch (error) {
  console.error(`AGOT character dataset is missing or invalid: ${error.message}`);
  process.exit(1);
}

if (manifest.schemaVersion !== 1) failures.push('Dataset schema version must be 1.');
if (manifest.source?.sourceId !== '2962333032') failures.push('Dataset source is not the AGOT workshop item.');
if (JSON.stringify(manifest.source).includes('Crusader Kings III/game')) failures.push('Dataset references the CK3 vanilla game directory.');
if ((manifest.counts?.totalSourceRecords ?? 0) < 100000) failures.push('Dataset source record count is unexpectedly small.');
if ((manifest.counts?.canon ?? 0) < 2000) failures.push('Dataset canon count is unexpectedly small.');
if ((manifest.counts?.semicanon ?? 0) < 3000) failures.push('Dataset semicanon count is unexpectedly small.');
if ((manifest.counts?.excludedTechnical ?? 0) < 2000) failures.push('Dataset did not exclude expected technical characters.');
if (searchIndex.length !== manifest.counts?.emittedRecords) failures.push('Search index count does not match emitted records.');
if (report.datasetHash !== manifest.datasetHash) failures.push('Import report and manifest hashes differ.');
if (searchIndex.some((entry) => entry.canonTier === 'technical')) failures.push('Technical characters leaked into search index.');
if (searchIndex.some((entry) => !entry.id?.startsWith('agot:'))) failures.push('Search index contains an invalid character ID.');

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

if (records.length !== manifest.counts?.emittedRecords) failures.push('Character shard record count does not match emitted records.');
if (records.some((record) => !record.cultureId)) failures.push('At least one character is missing culture data.');
if (records.some((record) => !record.faithId)) failures.push('At least one character is missing faith data.');

const recordsById = new Map(records.map((record) => [record.id, record]));
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
