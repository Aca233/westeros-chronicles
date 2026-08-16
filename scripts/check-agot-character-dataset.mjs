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

for (const shard of new Set(searchIndex.map((entry) => entry.shard))) {
  try {
    await access(join(datasetRoot, 'shards', `${shard}.json`));
  } catch {
    failures.push(`Missing character shard ${shard}.json.`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${searchIndex.length} AGOT character records from dataset ${manifest.datasetHash.slice(0, 12)}.`);
