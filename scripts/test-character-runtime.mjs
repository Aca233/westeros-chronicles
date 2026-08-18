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
    '/data/manifest.json': { schemaVersion: 2, datasetHash: 'fixture', startDate: '8298.1.1', displayYear: 298, counts: {}, shards: ['ab'], source: { sourceId: '2962333032' } },
    '/data/loadouts/ab.json': {
      'agot:Stark_3': { characterId: 'agot:Stark_3', templateId: 'northern_noble', overrideId: 'eddard_stark_daily' },
      'agot:Child_1': { characterId: 'agot:Child_1', templateId: 'child' },
    },
    '/data/kinship/ab.json': {
      'agot:Stark_3': { spouseIds: [], childIds: ['agot:Child_1'], siblingIds: [], fatherId: 'agot:Ancestor_1' },
      'agot:Child_1': { spouseIds: [], childIds: [], siblingIds: [], fatherId: 'agot:Stark_3' },
      'agot:Ancestor_1': { spouseIds: [], childIds: ['agot:Stark_3'], siblingIds: [] },
    },
    '/data/title-holders.json': {
      'agot:Stark_3': [
        { id: 'e_the_north', name: '北境', tier: 'empire' },
        { id: 'k_winterfell', name: '临冬城', tier: 'kingdom' },
      ],
    },
    '/data/search-index.json': [
      { id: 'agot:Stark_3', name: '艾德', nameKey: 'Eddard', canonTier: 'canon', born: true, alive: true, shard: 'ab' },
      { id: 'agot:Ancestor_1', name: '布兰登', nameKey: 'Brandon', canonTier: 'genealogy', born: true, alive: false, shard: 'ab' },
      { id: 'agot:Child_1', name: '罗柏', nameKey: 'Robb', canonTier: 'canon', born: true, alive: true, shard: 'ab' },
    ],
    '/data/shards/ab.json': [
      { id: 'agot:Stark_3', rawId: 'Stark_3', canonTier: 'canon', name: '艾德', born: true, alive: true, baseAttributes: { diplomacy: 9 }, traits: [], spouseIds: [], relations: [], hasDna: true, source: { file: 'north.txt', line: 1 } },
      { id: 'agot:Ancestor_1', rawId: 'Ancestor_1', canonTier: 'genealogy', name: '布兰登', born: true, alive: false, baseAttributes: {}, traits: [], spouseIds: [], relations: [], hasDna: false, source: { file: 'north_ancestors.txt', line: 1 } },
      { id: 'agot:Child_1', rawId: 'Child_1', canonTier: 'canon', name: '罗柏', fatherId: 'agot:Stark_3', born: true, alive: true, baseAttributes: {}, traits: [], spouseIds: [], relations: [], hasDna: false, source: { file: 'north.txt', line: 2 } },
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

test('repository loads sharded static loadout profiles once', async () => {
  const { repo, counts } = createFixtureRepository();
  assert.equal((await repo.getLoadoutProfile('agot:Stark_3')).templateId, 'northern_noble');
  assert.equal((await repo.getLoadoutProfile('agot:Ancestor_1')), undefined);
  assert.equal(counts.get('/data/loadouts/ab.json'), 1);
});

test('repository loads reverse kinship and resolves children', async () => {
  const { repo, counts } = createFixtureRepository();
  assert.deepEqual((await repo.getKinship('agot:Stark_3')).childIds, ['agot:Child_1']);
  assert.deepEqual((await repo.getChildren('agot:Stark_3')).map((record) => record.id), ['agot:Child_1']);
  await repo.getKinship('agot:Stark_3');
  assert.equal(counts.get('/data/kinship/ab.json'), 1);
});

test('repository merges localized title holdings and loads the title map only once', async () => {
  const { repo, counts } = createFixtureRepository();
  const eddard = await repo.get('agot:Stark_3');
  const ancestor = await repo.get('agot:Ancestor_1');
  assert.deepEqual(eddard.titleIds, ['e_the_north', 'k_winterfell']);
  assert.deepEqual(eddard.titles, ['北境', '临冬城']);
  assert.deepEqual(ancestor.titleIds, []);
  assert.deepEqual(ancestor.titles, []);
  assert.equal(counts.get('/data/title-holders.json'), 1);
});

const { parseCharacterKinshipIndex, parseCharacterLoadoutShard, parseCharacterTitleHolders } = await bundleModule('src/features/characters/characterDatasetSchema.ts');

test('loadout schema validates matching AGOT IDs and template names', () => {
  assert.equal(parseCharacterLoadoutShard({
    'agot:Stark_3': { characterId: 'agot:Stark_3', templateId: 'northern_noble' },
  })['agot:Stark_3'].templateId, 'northern_noble');
  assert.throws(() => parseCharacterLoadoutShard({ 'agot:Stark_3': { characterId: 'agot:Other', templateId: 'x' } }), /装束/);
});

test('kinship schema validates AGOT IDs and family arrays', () => {
  assert.deepEqual(parseCharacterKinshipIndex({
    'agot:Stark_3': { spouseIds: [], childIds: ['agot:Child_1'], siblingIds: ['agot:Stark_4', 'agot:Stark_4'] },
  })['agot:Stark_3'].siblingIds, ['agot:Stark_4']);
  assert.throws(() => parseCharacterKinshipIndex({ Stark_3: { spouseIds: [], childIds: [], siblingIds: [] } }), /亲属/);
  assert.throws(() => parseCharacterKinshipIndex({ 'agot:Stark_3': { spouseIds: [], childIds: ['agot:Stark_3'], siblingIds: [] } }), /亲属/);
  assert.throws(() => parseCharacterKinshipIndex({ 'agot:Stark_3': { spouseIds: [], childIds: [], siblingIds: ['agot:Stark_3'] } }), /亲属/);
});

test('title holder schema rejects malformed or non-AGOT mappings', () => {
  assert.deepEqual(parseCharacterTitleHolders({
    'agot:Stark_3': [{ id: 'e_the_north', name: '北境', tier: 'empire' }],
  })['agot:Stark_3'][0].name, '北境');
  assert.throws(() => parseCharacterTitleHolders({ Stark_3: [] }), /头衔/);
  assert.throws(() => parseCharacterTitleHolders({ 'agot:Stark_3': [{ id: 'e_the_north', name: '', tier: 'empire' }] }), /头衔/);
});

test('default repository search hides genealogy but can include it explicitly', async () => {
  const { repo } = createFixtureRepository();
  assert.deepEqual((await repo.search('', {})).map((hit) => hit.id), ['agot:Stark_3', 'agot:Child_1']);
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

const { expandBaselineLoadout, projectCharacterItems } = await bundleModule('src/features/characters/characterItems.ts');

test('baseline loadout expands to stable owned and equipped ordinary items', () => {
  const profile = { characterId: 'agot:Stark_3', templateId: 'northern_noble', overrideId: 'eddard_stark_daily' };
  const first = expandBaselineLoadout(eddardBase, profile);
  const second = expandBaselineLoadout(eddardBase, profile);
  assert.deepEqual(first, second);
  assert.ok(first.some((item) => item.equippedPosition?.group === 'torso'));
  assert.ok(first.some((item) => item.equippedPosition?.group === 'legs' && item.equippedPosition.layer === 'footwear'));
  assert.ok(first.every((item) => item.ownerId === eddardBase.id && item.custody.type === 'character'));
});

test('character item events override baseline equipment deterministically', () => {
  const profile = { characterId: 'agot:Stark_3', templateId: 'northern_noble' };
  const baseItems = expandBaselineLoadout(eddardBase, profile);
  const garment = baseItems.find((item) => item.instanceId.endsWith(':garment'));
  const events = [
    { id: 'unequip', runId: 'run', characterId: eddardBase.id, turn: 1, sequence: 0, timestamp: 1, event: { type: 'ITEM_UNEQUIP', instanceId: garment.instanceId } },
    { id: 'equip', runId: 'run', characterId: eddardBase.id, turn: 2, sequence: 0, timestamp: 2, event: { type: 'ITEM_EQUIP', instanceId: garment.instanceId, position: { group: 'torso', layer: 'garment' } } },
    { id: 'lose', runId: 'run', characterId: eddardBase.id, turn: 3, sequence: 0, timestamp: 3, event: { type: 'ITEM_LOSE', instanceId: garment.instanceId } },
  ];
  assert.equal(projectCharacterItems(baseItems, events).some((item) => item.instanceId === garment.instanceId), false);
});
