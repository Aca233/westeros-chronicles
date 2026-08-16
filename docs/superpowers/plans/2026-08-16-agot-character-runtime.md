# AGOT Character Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load static AGOT character shards in the browser and maintain compact, rollback-safe per-save character changes, attributes, knowledge, relationships, and memories.

**Architecture:** Static records remain immutable and are fetched by a repository. Dexie stores campaign metadata, append-only character events, and a rebuildable materialized cache; game snapshots store only a world revision reference. Pure projectors merge static records with dated source state and save events.

**Tech Stack:** TypeScript 5.7, Dexie 4, Node test runner with esbuild bundling, Zustand 5.

**Spec:** `docs/superpowers/specs/2026-08-16-agot-character-world-design.md`

## Global Constraints

- Requires the dataset schema produced by `2026-08-16-agot-character-dataset.md`.
- Static data is never copied into `GameState.turns` or each `GameSnapshot`.
- Save events override static data; old saves lock their dataset manifest hash.
- No future source-history event is scheduled after campaign start.
- The repository is not a Git worktree; do not initialize Git implicitly.

---

### Task 1: Define Focused Character Domain Types

**Files:**
- Create: `src/features/characters/types.ts`
- Create: `src/features/characters/characterIds.ts`
- Create: `scripts/test-character-runtime.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `CharacterId`, `StaticCharacterRecord`, `ResolvedCharacter`, `CharacterEvent`, `CharacterKnowledge`, `CharacterMemory`, `CharacterRelationship`, `CharacterDatasetManifest`.
- Produces: `agotCharacterId(rawId: string): CharacterId` and `saveCharacterId(saveId, localId)`.

- [ ] **Step 1: Write failing ID and runtime invariant tests**

```js
test('AGOT and save IDs are stable and namespaced', () => {
  assert.equal(agotCharacterId('Stark_3'), 'agot:Stark_3');
  assert.equal(saveCharacterId('run_1', 'child_1'), 'save:run_1:child_1');
  assert.throws(() => agotCharacterId(''));
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node scripts/test-character-runtime.mjs`
Expected: FAIL because runtime modules do not exist.

- [ ] **Step 3: Implement narrow domain types and ID constructors**

```ts
export type CharacterId = `agot:${string}` | `save:${string}:${string}`;
export type CharacterCanonTier = 'canon' | 'semicanon' | 'mod_supporting' | 'genealogy';
export type KnowledgeVisibility = 'public' | 'player' | 'restricted' | 'rumor' | 'secret' | 'system';
```

Keep source facts, projected static state, and save mutations as separate types; do not add the roster to `GameState`.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node scripts/test-character-runtime.mjs`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: TypeScript and Vite build pass.

---

### Task 2: Load Manifest, Search Index, and Character Shards

**Files:**
- Create: `src/features/characters/staticCharacterRepository.ts`
- Create: `src/features/characters/characterDatasetSchema.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces: `StaticCharacterRepository` with `loadManifest()`, `search(query, filters)`, `get(characterId)`, and `getMany(ids)`.
- Uses injectable `fetchJson(path)` for deterministic tests.

- [ ] **Step 1: Write failing repository cache and shard tests**

```js
test('repository fetches each shard once and never returns technical records', async () => {
  const repo = fixtureRepository();
  await repo.get('agot:Stark_3');
  await repo.get('agot:Stark_3');
  assert.equal(repo.fetchCount('shards/ab.json'), 1);
  assert.equal(await repo.get('agot:Dummy_1'), undefined);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node scripts/test-character-runtime.mjs`
Expected: FAIL because repository is missing.

- [ ] **Step 3: Implement schema validation, shard cache, and lightweight search**

```ts
export class StaticCharacterRepository {
  constructor(private readonly baseUrl: string, private readonly fetchJson: FetchJson = defaultFetchJson) {}
  loadManifest(): Promise<CharacterDatasetManifest>;
  search(query: string, filters?: CharacterSearchFilters): Promise<CharacterSearchHit[]>;
  get(id: CharacterId): Promise<StaticCharacterRecord | undefined>;
  getMany(ids: readonly CharacterId[]): Promise<StaticCharacterRecord[]>;
}
```

Reject incompatible schema versions with a Chinese user-facing error and keep genealogy hidden unless explicitly requested.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node scripts/test-character-runtime.mjs`
Expected: PASS including one-fetch shard caching.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: build passes.

---

### Task 3: Add Dexie Campaign, Character Event, and Cache Tables

**Files:**
- Modify: `src/services/db.ts`
- Modify: `src/types/game.ts`
- Create: `src/features/characters/characterEventStore.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Dexie version 2 tables: `worldRuns`, `characterEvents`, `characterStateCache`.
- Produces: `appendCharacterEvents(runId, turn, events)`, `eventsForCharacter()`, `truncateCharacterEventsAfter()`, and `rebuildCharacterCache()`.
- Adds `GameState.worldCharacters?: WorldCharacterStateRef` where `WorldCharacterStateRef` contains `runId`, `datasetHash`, and `revision`.

- [ ] **Step 1: Write failing append and rollback tests with fake-indexeddb-compatible adapter**

```js
test('truncating after turn restores the prior character state', async () => {
  await store.append(runId, 1, [move('agot:Stark_3', '临冬城')]);
  await store.append(runId, 2, [kill('agot:Stark_3')]);
  await store.truncateAfter(runId, 1);
  assert.equal((await store.resolve('agot:Stark_3')).alive, true);
});
```

Use an in-memory store implementation for unit tests if no IndexedDB shim is installed; test the same interface used by Dexie.

- [ ] **Step 2: Run test and verify RED**

Run: `node scripts/test-character-runtime.mjs`
Expected: FAIL because event store is missing.

- [ ] **Step 3: Implement append-only events and rebuildable cache**

```ts
export interface WorldCharacterStateRef {
  runId: string;
  datasetHash: string;
  revision: number;
}

export interface CharacterEventEnvelope {
  id: string;
  runId: string;
  turn: number;
  sequence: number;
  characterId: CharacterId;
  event: CharacterEvent;
  timestamp: number;
}
```

Dexie writes events and cache updates in one transaction. Truncation deletes later events and rebuilds only affected character IDs.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node scripts/test-character-runtime.mjs`
Expected: PASS for append order, idempotency, and rollback.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: database migration and build pass.

---

### Task 4: Resolve Attributes and Time-Aware Traits Exactly Once

**Files:**
- Create: `src/features/characters/characterProjector.ts`
- Create: `src/features/characters/attributeGenerator.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces: `generateMissingBaseAttributes(record, datasetVersion) -> LordAttributes`.
- Produces: `resolveCharacter(staticRecord, events, context) -> ResolvedCharacter`.

- [ ] **Step 1: Write failing stability and no-double-application tests**

```js
test('missing attributes are stable while explicit values win', () => {
  assert.deepEqual(generateMissingBaseAttributes(record, 'v1'), generateMissingBaseAttributes(record, 'v1'));
  assert.equal(resolveCharacter(eddard, [], context).baseAttributes.diplomacy, 9);
});

test('trait modifiers apply once and education traits sort first', () => {
  const resolved = resolveCharacter(recordWithTraits, [], context);
  assert.equal(resolved.attributes.martial, resolved.baseAttributes.martial + expectedBonus);
  assert.match(resolved.traits[0].id, /^education_/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node scripts/test-character-runtime.mjs`
Expected: FAIL because projector/generator are missing.

- [ ] **Step 3: Implement hash-seeded bounded generation and trait projection**

Use a platform-stable string hash, age band, education trait, title rank, and known trait adjustments. Clamp base skills to documented CK3-like ranges. Preserve unknown AGOT traits without numeric effects and call the existing trait resolver only once.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node scripts/test-character-runtime.mjs`
Expected: PASS for deterministic values and no repeated bonuses.

- [ ] **Step 5: Checkpoint**

Run: `npm run test:trait-effects && npm run test:character-trait-display && npm run build`
Expected: existing player trait behavior and new NPC projection pass.

---

### Task 5: Add Knowledge-Safe Facts, Relationships, and Memories

**Files:**
- Create: `src/features/characters/characterKnowledge.ts`
- Create: `src/features/characters/characterMemory.ts`
- Create: `src/features/characters/characterRelationships.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces: `visibleFacts(character, viewerContext, date)`.
- Produces: `appendMemory()`, `compactMemories()`, and `relationshipSummary()`.

- [ ] **Step 1: Write failing visibility and memory compaction tests**

```js
test('future and secret facts are hidden from the player', () => {
  const visible = visibleFacts(character, playerContext, date298);
  assert.equal(visible.some(f => f.visibility === 'system'), false);
  assert.equal(visible.some(f => f.validFrom.year > 8298), false);
});

test('important memories survive compaction', () => {
  const compacted = compactMemories([...smallTalk, savedLifeMemory], limits);
  assert.ok(compacted.some(m => m.id === savedLifeMemory.id));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node scripts/test-character-runtime.mjs`
Expected: FAIL because knowledge and memory services are missing.

- [ ] **Step 3: Implement viewer/date filters and deterministic memory compaction**

Never pass `system` or undiscovered `secret` facts to UI/AI selectors. Compact only low-importance old memories into a source-linked summary; retain high-importance events verbatim.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node scripts/test-character-runtime.mjs`
Expected: PASS.

- [ ] **Step 5: Full runtime plan gate**

Add `test:character-runtime` to `package.json` and `verify`, then run `npm run verify`.
Expected: all old and new checks pass, and a saved snapshot contains only `worldRunId/worldRevision`, not static character records.
