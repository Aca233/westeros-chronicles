# AGOT Character AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI only the relevant, player-visible character context and apply validated character state commands by stable ID.

**Architecture:** A pure scene selector scores candidates and caps full cards at twelve. A prompt formatter consumes only resolved, knowledge-filtered character slices, while a command validator and reducer convert model requests into append-only character events after existence, life, location, and relationship checks.

**Tech Stack:** TypeScript, existing prompt builder/state reducer/store, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-16-agot-character-world-design.md`

## Global Constraints

- Requires dataset and runtime plans.
- Never send all known characters, system truths, future facts, or undiscovered secrets to AI.
- Named/speaking characters cannot be dropped by the twelve-card cap.
- AI narration cannot mutate character state without a validated ID-based command.
- Dice still affects only the declared player action.
- The repository is not a Git worktree; do not initialize Git implicitly.

---

### Task 1: Select the Current Scene Cast Deterministically

**Files:**
- Create: `src/features/characters/sceneCharacterSelector.ts`
- Create: `scripts/test-character-ai.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `selectSceneCharacters(input: SceneSelectionInput) -> SceneSelectionResult` with `full`, `compact`, and `omittedCount`.

- [ ] **Step 1: Write failing relevance and cap tests**

```js
test('directly named and speaking characters survive the twelve-card cap', () => {
  const result = selectSceneCharacters(overloadedScene);
  assert.equal(result.full.length, 12);
  assert.ok(result.full.some(c => c.id === namedCharacterId));
  assert.ok(result.full.some(c => c.id === currentSpeakerId));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-ai.mjs`
Expected: FAIL because selector is missing.

- [ ] **Step 3: Implement documented score tiers and stable tie breaking**

Score direct mention, active speaker, physical presence, event participation, strong relationship, and recent interaction. Resolve ties by stable character ID. Never include technical/genealogy records as interactive cast.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-ai.mjs`
Expected: PASS with exactly twelve full cards in overloaded scenes.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: build passes.

---

### Task 2: Format Knowledge-Safe Character Prompt Slices

**Files:**
- Create: `src/features/characters/characterPromptSlice.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `scripts/test-character-ai.mjs`

**Interfaces:**
- Produces: `buildCharacterPromptSlice(selection, viewer, date) -> string`.
- `buildChatMessages()` accepts an optional pre-resolved `characterContext`.

- [ ] **Step 1: Write failing prompt leak tests**

```js
test('prompt includes public identity and excludes secrets and future death', () => {
  const text = buildCharacterPromptSlice(selection, player, date298);
  assert.match(text, /agot:Stark_3/);
  assert.doesNotMatch(text, /真实父亲/);
  assert.doesNotMatch(text, /8299.*处决/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-ai.mjs`
Expected: FAIL because formatter is missing.

- [ ] **Step 3: Implement compact/full slices with IDs and knowledge filters**

Full cards contain stable ID, public identity, current visible traits, relationship summary, current goals, relevant memories, and location. Compact entries contain only ID, name, role, location, and relation. Omit empty sections.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-ai.mjs`
Expected: PASS and no leak markers.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: prompt builder compiles.

---

### Task 3: Define and Validate Character Commands

**Files:**
- Create: `src/features/characters/characterCommands.ts`
- Create: `src/features/characters/characterCommandValidator.ts`
- Modify: `src/types/game.ts`
- Modify: `scripts/test-character-ai.mjs`

**Interfaces:**
- Adds state commands for relationship, trait, movement, wound, death, marriage, memory, and title changes.
- Produces: `validateCharacterCommand(command, context) -> ValidationResult<CharacterEvent[]>`.

- [ ] **Step 1: Write failing legality tests**

```js
test('rejects missing, dead, and absent character mutations', async () => {
  assert.equal((await validate(moveUnknown, context)).ok, false);
  assert.equal((await validate(woundDead, context)).ok, false);
  assert.equal((await validate(marryAbsent, context)).ok, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-ai.mjs`
Expected: FAIL because commands/validator are missing.

- [ ] **Step 3: Implement discriminated commands and explicit rejection reasons**

```ts
export type CharacterStateCommand =
  | { type: 'MOVE_CHARACTER'; characterId: CharacterId; locationId: string; reason?: string }
  | { type: 'KILL_CHARACTER'; characterId: CharacterId; cause: string; killerId?: CharacterId }
  | { type: 'ADD_CHARACTER_MEMORY'; characterId: CharacterId; memory: CharacterMemoryInput };
```

Complete the remaining command variants from the spec. Validate IDs, dataset membership, life status, presence where required, reciprocal marriage, and no duplicate death.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-ai.mjs`
Expected: PASS for allowed and rejected commands.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: command union compiles with existing state commands.

---

### Task 4: Integrate Character Events With Store Submission and Rollback

**Files:**
- Modify: `src/store/useGameStore.ts`
- Modify: `src/services/stateReducer.ts`
- Modify: `src/services/db.ts`
- Modify: `scripts/test-character-ai.mjs`

**Interfaces:**
- Successful AI response validates character commands, commits the turn and character events atomically, then increments `worldRevision`.
- Failed generation or validation leaves events unapplied; rollback truncates by turn.

- [ ] **Step 1: Write failing store integration tests**

```js
test('failed generation keeps character state unchanged', async () => {
  await store.submitAction('与艾德交谈', failingApi);
  assert.deepEqual(await eventStore.eventsForRun(runId), []);
});

test('rollback removes character events from the reverted turn', async () => {
  await completeTurnWithMove();
  await store.rollback();
  assert.equal((await repository.resolve(eddardId)).locationId, originalLocation);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-ai.mjs`
Expected: FAIL before store integration.

- [ ] **Step 3: Implement transactional response application**

Reuse the existing equipment queue success/failure boundary: character events apply only after a valid response, and snapshots record the resulting `worldRevision`. Rejected character commands are listed in the turn change log without partially applying related events.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-ai.mjs`
Expected: PASS for success, API failure, validation failure, and rollback.

- [ ] **Step 5: Full AI plan gate**

Add `test:character-ai` to `verify`, then run `npm run verify`.
Expected: all tests pass; inspect a representative prompt and confirm at most twelve full character cards and no secret/future fields.
