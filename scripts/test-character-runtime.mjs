import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { agotCharacterId, saveCharacterId, isCharacterId } = await bundleModule('src/features/characters/characterIds.ts');

test('AGOT and save IDs are stable and namespaced', () => {
  assert.equal(agotCharacterId('Stark_3'), 'agot:Stark_3');
  assert.equal(saveCharacterId('run_1', 'child_1'), 'save:run_1:child_1');
  assert.equal(isCharacterId('agot:Stark_3'), true);
  assert.equal(isCharacterId('Stark_3'), false);
});

test('character ID constructors reject empty or ambiguous segments', () => {
  assert.throws(() => agotCharacterId(''));
  assert.throws(() => agotCharacterId('Stark:3'));
  assert.throws(() => saveCharacterId('', 'child_1'));
});

const { StaticCharacterRepository } = await bundleModule('src/features/characters/staticCharacterRepository.ts');

function createFixtureRepository() {
  const counts = new Map();
  const payloads = {
    '/data/manifest.json': { schemaVersion: 1, datasetHash: 'fixture', startDate: '8298.1.1', displayYear: 298, counts: {}, shards: ['ab'], source: { sourceId: '2962333032' } },
    '/data/search-index.json': [
      { id: 'agot:Stark_3', name: '艾德', nameKey: 'Eddard', canonTier: 'canon', born: true, alive: true, shard: 'ab' },
      { id: 'agot:Ancestor_1', name: '布兰登', nameKey: 'Brandon', canonTier: 'genealogy', born: true, alive: false, shard: 'ab' },
    ],
    '/data/shards/ab.json': [
      { id: 'agot:Stark_3', rawId: 'Stark_3', canonTier: 'canon', name: '艾德', born: true, alive: true, baseAttributes: { diplomacy: 9 }, traits: [], spouseIds: [], relations: [], hasDna: true, source: { file: 'north.txt', line: 1 } },
      { id: 'agot:Ancestor_1', rawId: 'Ancestor_1', canonTier: 'genealogy', name: '布兰登', born: true, alive: false, baseAttributes: {}, traits: [], spouseIds: [], relations: [], hasDna: false, source: { file: 'north_ancestors.txt', line: 1 } },
    ],
  };
  const fetchJson = async (path) => {
    counts.set(path, (counts.get(path) ?? 0) + 1);
    if (!(path in payloads)) throw new Error(`missing fixture ${path}`);
    return structuredClone(payloads[path]);
  };
  return { repo: new StaticCharacterRepository('/data', fetchJson), counts };
}

test('repository fetches each character shard only once', async () => {
  const { repo, counts } = createFixtureRepository();
  assert.equal((await repo.get('agot:Stark_3')).name, '艾德');
  assert.equal((await repo.get('agot:Stark_3')).name, '艾德');
  assert.equal(counts.get('/data/shards/ab.json'), 1);
  assert.equal(await repo.get('agot:Missing_1'), undefined);
});

test('default repository search hides genealogy but can include it explicitly', async () => {
  const { repo } = createFixtureRepository();
  assert.deepEqual((await repo.search('', {})).map((hit) => hit.id), ['agot:Stark_3']);
  assert.deepEqual((await repo.search('Brandon', { includeGenealogy: true })).map((hit) => hit.id), ['agot:Ancestor_1']);
});

const {
  InMemoryCharacterEventStore,
  projectCharacterEvents,
} = await bundleModule('src/features/characters/characterEventStore.ts');

const eddardBase = {
  id: 'agot:Stark_3', rawId: 'Stark_3', canonTier: 'canon', name: '艾德',
  born: true, alive: true, baseAttributes: { diplomacy: 9 }, traits: ['honest'],
  spouseIds: [], relations: [], hasDna: true, source: { file: 'north.txt', line: 1 },
};

test('truncating character events after a turn restores prior projected state', async () => {
  const store = new InMemoryCharacterEventStore();
  await store.append('run_1', 1, [{ id: 'move_1', characterId: 'agot:Stark_3', event: { type: 'MOVE', locationId: 'winterfell' } }]);
  await store.append('run_1', 2, [{ id: 'death_1', characterId: 'agot:Stark_3', event: { type: 'DIE', cause: 'execution' } }]);
  assert.equal(projectCharacterEvents(eddardBase, await store.eventsForCharacter('run_1', 'agot:Stark_3')).alive, false);

  await store.truncateAfter('run_1', 1);
  const restored = projectCharacterEvents(eddardBase, await store.eventsForCharacter('run_1', 'agot:Stark_3'));
  assert.equal(restored.alive, true);
  assert.equal(restored.locationId, 'winterfell');
});

test('event store is idempotent by run and event ID', async () => {
  const store = new InMemoryCharacterEventStore();
  const input = { id: 'move_1', characterId: 'agot:Stark_3', event: { type: 'MOVE', locationId: 'winterfell' } };
  await store.append('run_1', 1, [input]);
  await store.append('run_1', 1, [input]);
  assert.equal((await store.eventsForCharacter('run_1', 'agot:Stark_3')).length, 1);
});

const { generateMissingBaseAttributes } = await bundleModule('src/features/characters/attributeGenerator.ts');
const { resolveCharacter } = await bundleModule('src/features/characters/characterProjector.ts');

test('missing NPC attributes are stable while explicit AGOT values win', () => {
  const first = generateMissingBaseAttributes(eddardBase, 'dataset_v1');
  const second = generateMissingBaseAttributes(eddardBase, 'dataset_v1');
  assert.deepEqual(first, second);
  assert.equal(first.diplomacy, 9);
  for (const value of Object.values(first)) assert.ok(value >= 0 && value <= 30);
});

test('character projection orders education first and applies trait modifiers once', () => {
  const base = { ...eddardBase, traits: ['honest', 'education_martial_3'], baseAttributes: { diplomacy: 9, martial: 8, stewardship: 6, intrigue: 1, learning: 5, prowess: 9 } };
  const once = resolveCharacter(base, [], { datasetVersion: 'v1', currentYear: 8298 });
  const again = resolveCharacter(base, [], { datasetVersion: 'v1', currentYear: 8298 });
  assert.equal(once.traits[0], 'education_martial_3');
  assert.deepEqual(once.attributes, again.attributes);
  assert.deepEqual(once.baseAttributes, base.baseAttributes);
  assert.ok(once.attributes.martial > once.baseAttributes.martial);
});

const { visibleFacts } = await bundleModule('src/features/characters/characterKnowledge.ts');
const { compactMemories } = await bundleModule('src/features/characters/characterMemory.ts');
const { normalizeRelationship, relationshipSummary } = await bundleModule('src/features/characters/characterRelationships.ts');

test('future, system, and undiscovered secret facts are hidden from the player', () => {
  const facts = [
    { id: 'public', field: 'title', value: '临冬城公爵', visibility: 'public', validFrom: '8290.1.1' },
    { id: 'future', field: 'death', value: '被处决', visibility: 'public', validFrom: '8299.1.10' },
    { id: 'secret', field: 'parentage', value: '真实血统', visibility: 'secret' },
    { id: 'system', field: 'goal', value: '系统目标', visibility: 'system' },
  ];
  const visible = visibleFacts(facts, { viewerId: 'player', knownFactIds: new Set() }, '8298.1.1');
  assert.deepEqual(visible.map((fact) => fact.id), ['public']);
});

test('important memories survive deterministic compaction', () => {
  const memories = [
    { id: 'small_1', characterId: 'agot:Stark_3', turn: 1, event: '一次普通问候', importance: 1, participants: [], visibility: 'public' },
    { id: 'small_2', characterId: 'agot:Stark_3', turn: 2, event: '一次普通谈话', importance: 1, participants: [], visibility: 'public' },
    { id: 'saved_life', characterId: 'agot:Stark_3', turn: 3, event: '玩家救了他的性命', importance: 5, participants: [], visibility: 'player' },
  ];
  const compacted = compactMemories(memories, { maxDetailed: 2, importantThreshold: 4 });
  assert.ok(compacted.some((memory) => memory.id === 'saved_life'));
  assert.ok(compacted.some((memory) => memory.id.startsWith('summary:')));
});

test('relationship dimensions clamp and produce a compact summary', () => {
  const relation = normalizeRelationship({ sourceId: 'agot:Stark_3', targetId: 'save:run_1:player', opinion: 130, trust: 42, fear: -9, respect: 70, attraction: 0, obligation: 15 });
  assert.equal(relation.opinion, 100);
  assert.equal(relation.fear, 0);
  assert.match(relationshipSummary(relation), /信任 42/);
  assert.match(relationshipSummary(relation), /尊敬 70/);
});
