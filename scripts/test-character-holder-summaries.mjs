import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/characters/holderSummaryRepository.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { HolderSummaryRepository, materializeHolderSummary } = await import(url);

const summaries = [
  { id: 'agot:minor_holder', name: '小领主', dynastyId: 'dynn_Minor', alive: true, titleIds: ['c_minor', 'c_minor_vassal'], displayLabel: '小伯爵领' },
  { id: 'agot:dead_holder', name: '亡故领主', dynastyId: null, alive: false, titleIds: ['c_dead'], displayLabel: '旧伯爵领' },
];

const repository = new HolderSummaryRepository(async () => summaries);

test('摘要仓储按 ID 和头衔解析且不进入默认人物搜索', async () => {
  assert.equal((await repository.get('agot:minor_holder'))?.displayLabel, '小伯爵领');
  assert.equal(await repository.get('agot:unknown'), undefined);
  assert.deepEqual((await repository.findByTitleIds(['c_dead'])).map((entry) => entry.id), ['agot:dead_holder']);
  assert.deepEqual((await repository.findByTitleIds(['c_missing'])), []);
});

test('默认人物搜索不返回背景持有人摘要', async () => {
  // 摘要名称不属于完整人物索引；即便存在同名辅助人物，默认搜索也只看正典层级。
  const staticBundle = await build({
    entryPoints: ['src/features/characters/staticCharacterRepository.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  const staticUrl = `data:text/javascript;base64,${Buffer.from(staticBundle.outputFiles[0].text).toString('base64')}`;
  const { StaticCharacterRepository } = await import(staticUrl);
  const index = [
    { id: 'agot:canon_knight', name: '小领主', nameKey: 'Minor', canonTier: 'canon', born: true, alive: true, shard: '00' },
    { id: 'agot:supporting_knight', name: '小领主乙', nameKey: 'MinorB', canonTier: 'mod_supporting', born: true, alive: true, shard: '01' },
    { id: 'agot:genealogy_knight', name: '小领主丙', nameKey: 'MinorC', canonTier: 'genealogy', born: true, alive: false, shard: '02' },
  ];
  const characterRepository = new StaticCharacterRepository('/data/agot-characters', async (path) => {
    if (path.endsWith('manifest.json')) return { schemaVersion: 2, datasetHash: 'a'.repeat(64), shards: ['00', '01', '02'], source: { sourceId: '2962333032' } };
    if (path.endsWith('search-index.json')) return index;
    throw new Error(`unexpected fetch ${path}`);
  });
  const defaultHits = await characterRepository.search('小领主');
  assert.deepEqual(defaultHits.map((hit) => hit.id), ['agot:canon_knight']);
  const supportingHits = await characterRepository.search('小领主', { includeSupporting: true });
  assert.deepEqual(supportingHits.map((hit) => hit.id).sort(), ['agot:canon_knight', 'agot:supporting_knight']);
  const materializedHits = await characterRepository.search('小领主乙', { materializedIds: ['agot:supporting_knight'] });
  assert.deepEqual(materializedHits.map((hit) => hit.id), ['agot:supporting_knight']);
});

test('摘要仅在显式互动路径物化为完整人物', () => {
  const archiveRecord = {
    id: 'agot:minor_holder', rawId: 'minor_holder', canonTier: 'mod_supporting', name: '归档旧名',
    born: true, alive: false, birthDate: '8250.1.1', deathDate: null, baseAttributes: {}, traits: [],
    spouseIds: [], relations: [], titleIds: [], titles: [], hasDna: true, source: { file: 'archive', line: 1 },
  };
  const materialized = materializeHolderSummary(summaries[0], archiveRecord, []);
  assert.equal(materialized.id, 'agot:minor_holder');
  assert.equal(materialized.name, '小领主');
  assert.equal(materialized.alive, true);
  assert.deepEqual(materialized.titleIds, ['c_minor', 'c_minor_vassal']);
});
