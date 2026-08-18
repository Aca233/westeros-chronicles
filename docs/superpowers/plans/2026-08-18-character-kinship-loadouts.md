# Character Kinship and Baseline Loadouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project must be executed inline because the user explicitly prohibited subagents.

**Goal:** Give every eligible NPC complete child relationships and a prebuilt everyday loadout that remains synchronized with character events, dossiers, and narrative context.

**Architecture:** The character dataset gains a reverse kinship index and sharded lightweight loadout assignments. Runtime character projection expands fixed templates into stable ordinary item instances, overlays append-only item events, and merges those projected items with the existing special-item ledger for dossier and prompt views.

**Tech Stack:** Python 3 dataset builders and unittest, TypeScript 5, React 18, Zustand, Dexie, Node test scripts, Vite.

**Spec:** `docs/superpowers/specs/2026-08-18-character-kinship-loadouts-design.md`

## Global Constraints

- Do not use Emoji.
- Prefer game icons; use the existing high-quality icon library or local image assets only when no appropriate game icon exists.
- Do not read AGOT or CK3 source files at runtime.
- Ownership, custody, carrying, and actual equipment must remain distinct.
- Ordinary NPCs wear everyday clothing by default, not battle armor.
- Children must not receive adult armor or adult weapons.
- Canonical special items must not be duplicated by generic templates.
- The project is in beta; do not add old-save compatibility or migrations.
- Do not use subagents.
- Do not commit, merge, or push.

---

## File Map

**Generated data and builders**

- `scripts/agot_character_import/writer.py`: emit reverse kinship data during full character imports.
- `scripts/build_character_supplements.py`: deterministically rebuild kinship and loadout supplements from bundled public character data.
- `scripts/test_agot_character_import.py`: importer-level kinship tests.
- `scripts/test_character_supplements.py`: template assignment and generated-output tests.
- `public/data/agot-characters/kinship/<shard>.json`: reverse family lookup.
- `public/data/agot-characters/loadouts/*.json`: sharded static loadout assignments.
- `public/data/agot-characters/reports/loadout-report.json`: coverage report.

**Character domain**

- `src/features/characters/types.ts`: kinship, loadout, ordinary item, and item-event types.
- `src/features/characters/characterDatasetSchema.ts`: parsers and validation for generated kinship/loadout data.
- `src/features/characters/staticCharacterRepository.ts`: cached kinship and loadout loading.
- `src/features/characters/characterItems.ts`: template expansion and item-event projection.
- `src/features/characters/characterEventStore.ts`: include projected ordinary items.
- `src/features/characters/characterProjector.ts`: resolve baseline loadout plus item events.
- `src/features/characters/characterDossier.ts`: expose child IDs and projected ordinary items.
- `src/features/characters/useCharacterDossier.ts`: load children and loadout data.

**Definitions and rules**

- `src/data/itemDefinitions.ts`: generic regional, child, occupational, legwear, footwear, and outerwear definitions.
- `src/data/npcLoadoutTemplates.ts`: fixed template slot definitions.
- `src/data/npcLoadoutOverrides.ts`: curated major-character overrides.

**Commands, UI, and narrative**

- `src/features/characters/characterCommands.ts`: validate `CHARACTER_ITEM_*` commands and emit item events.
- `src/components/Ck3CharacterWindow.tsx`: render complete children and merged NPC equipment/assets.
- `src/features/world/worldTurnContext.ts`: add projected current equipment and separately labelled assets to AI context.
- `src/services/turnResolution.ts`: retain character item commands in the existing atomic character-event path.

**Tests and checks**

- `scripts/test-character-runtime.mjs`
- `scripts/test-character-dossier.mjs`
- `scripts/test-character-store.mjs`
- `scripts/test-character-commands.mjs`
- `scripts/test-world-turn-context.mjs`
- `scripts/test-world-history-projection.mjs`
- `scripts/check-ck3-character-window.mjs`
- `package.json`

---

### Task 1: Generate and Load the Reverse Kinship Index

**Files:**
- Modify: `scripts/agot_character_import/writer.py`
- Modify: `scripts/test_agot_character_import.py`
- Create: `scripts/build_character_supplements.py`
- Create: `scripts/test_character_supplements.py`
- Create: `public/data/agot-characters/kinship/<shard>.json`
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/characters/characterDatasetSchema.ts`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces `CharacterKinshipEntry { fatherId?, motherId?, spouseIds, childIds }`.
- Produces `StaticCharacterRepository.getKinship(id): Promise<CharacterKinshipEntry>`.
- Produces `StaticCharacterRepository.getChildren(id): Promise<StaticCharacterRecord[]>`.

- [ ] **Step 1: Add failing Python tests for reverse children and deterministic ordering**

Add fixtures where two children point to one father and one mother, then assert `kinship/<shard>.json` contains both child IDs once, sorted by character ID, and retains reciprocal spouses.

- [ ] **Step 2: Run the focused importer tests and confirm failure**

Run: `python3 -m unittest scripts.test_agot_character_import scripts.test_character_supplements -v`

Expected: failure because no kinship index is emitted.

- [ ] **Step 3: Implement `_build_kinship_index(records)` in the writer**

The function must initialize entries for every emitted character, copy father, mother, and reciprocal spouse IDs, append each child to both known parents, then sort and deduplicate every array before JSON serialization.

- [ ] **Step 4: Add the supplement builder for the already-bundled dataset**

`build_character_supplements.py` must read `public/data/agot-characters/shards/*.json`, produce the same kinship structure without reading mod sources, and write deterministic UTF-8 JSON.

- [ ] **Step 5: Add TypeScript schema validation and repository caching**

Implement `parseCharacterKinshipIndex(value): Record<CharacterId, CharacterKinshipEntry>`. Reject non-AGOT IDs, duplicate IDs, self-parent links, and non-array spouse/child fields. Cache the single kinship request in `StaticCharacterRepository`.

- [ ] **Step 6: Add and run repository tests**

Test `getKinship` and `getChildren` with a fake `fetchJson`, including a parent with more than eight children.

Run: `npm run test:character-runtime`

Expected: all character runtime tests pass.

- [ ] **Step 7: Build the bundled kinship index and inspect coverage**

Run: `python3 scripts/build_character_supplements.py --characters public/data/agot-characters --kinship-only`

Assert the report child-link count equals the number of valid father and mother references in all bundled shards.

### Task 2: Display Every Child in Character Dossiers

**Files:**
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/characters/useCharacterDossier.ts`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/check-ck3-character-window.mjs`

**Interfaces:**
- Consumes `CharacterKinshipEntry.childIds` and `StaticCharacterRepository.getKinship`.
- Produces `CharacterDossierRelations.childIds: CharacterId[]`.

- [ ] **Step 1: Add a failing dossier test for `childIds`**

Construct an NPC dossier with ten child IDs and assert `relatedCharacterIds` contains all ten plus spouses and parents without duplicates.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm run test:character-dossier`

Expected: failure because dossier relations have no child IDs.

- [ ] **Step 3: Extend dossier creation and loading**

Pass the repository kinship entry into `createNpcDossier`, store all `childIds`, and load all child records alongside existing relatives. Do not infer children from names or dynasties.

- [ ] **Step 4: Replace the flat eight-card NPC relationship list**

Render labelled groups for spouses, children, parents, and important relationships. Show the first eight children initially with a text button that expands the complete child list. Parent and spouse cards must remain visible regardless of child count.

- [ ] **Step 5: Update static UI checks and verify**

Require a `data-character-children` marker, an expansion control, and the absence of `return cards.slice(0, 8)` for NPC family relationships.

Run: `npm run test:character-dossier && npm run check:ck3-character-window`

Expected: both commands pass.

### Task 3: Add Generic Everyday Item Definitions and Fixed Templates

**Files:**
- Modify: `src/data/itemDefinitions.ts`
- Create: `src/data/npcLoadoutTemplates.ts`
- Create: `src/data/npcLoadoutOverrides.ts`
- Modify: `scripts/test-item-definitions.mjs`
- Create: `scripts/test-npc-loadout-templates.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `NPC_LOADOUT_TEMPLATES: Record<string, NpcLoadoutTemplate>`.
- Produces `NPC_LOADOUT_OVERRIDES: Partial<Record<CharacterId, NpcLoadoutOverride>>`.
- Every template slot references an existing non-unique `ITEM_CATALOG` definition and a valid `EquipmentPosition`.

- [ ] **Step 1: Add failing template integrity tests**

Test that adult everyday templates contain garment, legwear, and footwear; infant and child templates contain no `weapon` or `armor`; no template references a unique definition; and every slot position appears in the definition's `allowedPositions`.

- [ ] **Step 2: Run the template test and confirm failure**

Run: `npm run test:npc-loadout-templates`

Expected: failure because template modules and definitions do not exist.

- [ ] **Step 3: Add the required generic definitions**

Add non-unique definitions for common linen clothing, northern cold-weather clothing, iron-islands clothing, Dornish warm-weather clothing, noble court clothing, child tunics and soft shoes, infant wraps, maester robes, septon robes, plain legwear, leather turnshoes, sandals, sea boots, wool cloaks, and fur outerwear. Use existing game icons where available.

- [ ] **Step 4: Define template precedence and slot sets**

Create templates for infant, child, northern commoner, northern noble, southern commoner, southern noble, Dornish, ironborn, Night's Watch, maester, septon, and generic fallback profiles. Only explicit occupational templates may contain a weapon or tool.

- [ ] **Step 5: Add curated overrides**

Add a small explicit map for major canonical characters already covered by the bundled dataset. Overrides may select higher-quality daily clothing or a known uniform but must not duplicate special artifacts from `AGOT_ARTIFACT_WORLD_STATE`.

- [ ] **Step 6: Run item and template tests**

Run: `npm run test:item-definitions && npm run test:npc-loadout-templates && npm run check:item-images && npm run check:icons`

Expected: all commands pass.

### Task 4: Build Sharded Static Loadout Assignments

**Files:**
- Modify: `scripts/build_character_supplements.py`
- Modify: `scripts/test_character_supplements.py`
- Create: `public/data/agot-characters/loadouts/*.json`
- Create: `public/data/agot-characters/reports/loadout-report.json`
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/characters/characterDatasetSchema.ts`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces `StaticCharacterLoadoutProfile { characterId, templateId, overrideId? }`.
- Produces `StaticCharacterRepository.getLoadoutProfile(id): Promise<StaticCharacterLoadoutProfile | undefined>`.

- [ ] **Step 1: Add failing classifier tests**

Cover an infant, child, adult northerner, Dornish adult, Night's Watch member, maester, titled noble, dead character, and unborn character. Assert dead and unborn characters receive no active loadout.

- [ ] **Step 2: Run supplement tests and confirm failure**

Run: `python3 -m unittest scripts.test_character_supplements -v`

Expected: failure because no loadout classifier or shard writer exists.

- [ ] **Step 3: Implement deterministic classification**

Classify in this exact priority: curated override, explicit occupation trait, age under 3, age under 13, culture-region plus titled status, generic fallback. Write `{characterId, templateId, overrideId?}` into the same two-character shard name as the character.

- [ ] **Step 4: Emit coverage reporting**

Write counts for eligible living records, infant, child, occupational, regional, curated, fallback, and unassigned. Fail the builder when any eligible living record remains unassigned.

- [ ] **Step 5: Add TypeScript parsers and repository loading**

Validate character IDs and known non-empty template IDs. Cache each loadout shard separately and fetch it alongside the character shard.

- [ ] **Step 6: Build bundled loadout shards**

Run: `python3 scripts/build_character_supplements.py --characters public/data/agot-characters`

Expected: report shows zero eligible living records without a profile.

- [ ] **Step 7: Run repository and dataset checks**

Run: `npm run test:character-runtime && npm run check:character-dataset`

Expected: both commands pass.

### Task 5: Project Baseline Ordinary Items and Item Events

**Files:**
- Create: `src/features/characters/characterItems.ts`
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/characters/characterEventStore.ts`
- Modify: `src/features/characters/characterProjector.ts`
- Modify: `scripts/test-character-store.mjs`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Produces `expandBaselineLoadout(character, profile): CharacterItemRecord[]`.
- Produces `projectCharacterItems(baseItems, events): CharacterItemRecord[]`.
- Extends `ResolvedCharacter.items: CharacterItemRecord[]`.

- [ ] **Step 1: Add failing projection tests**

Assert stable instance IDs, correct owner and custody, equipped positions for baseline slots, deterministic order, event-driven unequip, re-equip, loss, acquire, and two-sided transfer.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm run test:character-store && npm run test:character-runtime`

Expected: failure because resolved characters have no ordinary item state.

- [ ] **Step 3: Implement stable baseline expansion**

Generate instance IDs as `npc:<rawId>:baseline:<slotId>`, set owner and character custody to the subject, copy valid template positions, and mark source as `baseline_template` or `curated_override`.

- [ ] **Step 4: Extend the authoritative `CharacterEvent` union**

Add `ITEM_ACQUIRE`, `ITEM_EQUIP`, `ITEM_UNEQUIP`, `ITEM_TRANSFER_OUT`, `ITEM_TRANSFER_IN`, and `ITEM_LOSE` events with complete typed payloads. Keep ordinary item events separate from player item state commands.

- [ ] **Step 5: Implement immutable event projection**

Sort envelopes by turn and sequence, reject impossible duplicate instance IDs during tests, and ensure loss removes both custody and equipped position while unequip only removes equipped position.

- [ ] **Step 6: Wire profile loading into character resolution**

Pass `StaticCharacterLoadoutProfile` into `resolveCharacter` and attach the projected `items` array to `ResolvedCharacter`.

- [ ] **Step 7: Run focused projection tests**

Run: `npm run test:character-store && npm run test:character-runtime`

Expected: all tests pass.

### Task 6: Validate and Settle Character Item Commands

**Files:**
- Modify: `src/features/characters/characterCommands.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-character-commands.mjs`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `scripts/test-unified-turn-integration.mjs`

**Interfaces:**
- Adds `CHARACTER_ITEM_ACQUIRE`, `CHARACTER_ITEM_EQUIP`, `CHARACTER_ITEM_UNEQUIP`, `CHARACTER_ITEM_TRANSFER`, and `CHARACTER_ITEM_LOSE` to `CharacterStateCommand`.
- Produces ordinary item events through the existing `validateCharacterCommandBatch` result.

- [ ] **Step 1: Add failing command validation tests**

Cover valid equip, unequip, loss, acquisition, and transfer; reject unknown characters, unknown instances, invalid equipment positions, transfers from a non-custodian, and duplicate acquisition IDs.

- [ ] **Step 2: Run command tests and confirm failure**

Run: `npm run test:character-commands`

Expected: failure because `CHARACTER_ITEM_*` commands are not recognized.

- [ ] **Step 3: Extend character command state and recognition**

Add projected ordinary items to `CharacterState`. Update `isCharacterStateCommand` so `CHARACTER_ITEM_*` commands remain in the character path and are never filtered as player `ITEM_*` commands.

- [ ] **Step 4: Emit atomic item events**

Equip and unequip emit one event. Transfer emits `ITEM_TRANSFER_OUT` for the source and `ITEM_TRANSFER_IN` for the recipient in one validated batch. Acquisition validates an existing catalog definition and emits a story-event item record.

- [ ] **Step 5: Verify atomic settlement and rollback**

Add an integration case where narrative generation fails after resolution; assert no character item events persist. Add a success case and assert the dossier revision increments.

Run: `npm run test:character-commands && npm run test:turn-pipeline && npm run test:unified-turn`

Expected: all commands pass.

### Task 7: Merge Ordinary Items into NPC Dossiers

**Files:**
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `src/features/world/worldHistoryProjection.ts`
- Modify: `scripts/test-world-history-projection.mjs`
- Modify: `scripts/check-ck3-character-window.mjs`

**Interfaces:**
- Consumes `dossier.character.items` and existing `WorldArtifactState`.
- Produces merged, deduplicated equipment and asset card models.

- [ ] **Step 1: Add failing projection tests for strict semantics**

Assert equipped ordinary clothing appears in health, unequipped held clothing appears only in assets, a title asset is not shown as worn, and the same special definition is not duplicated when merged.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm run test:world-history-projection && npm run check:ck3-character-window`

Expected: failure because NPC tabs only consume the special-item ledger.

- [ ] **Step 3: Add merged NPC item view models**

Create projection helpers that return `{ instanceId, definitionId, relation, equippedPosition?, source }`. Deduplicate by instance ID, never by display name, and preserve ownership/custody labels.

- [ ] **Step 4: Update NPC health and asset tabs**

Health renders only records with an equipped position or verified special `equipped` status. Assets render all records connected by ownership, custody, title, or dynasty with a visible relation label.

- [ ] **Step 5: Keep explicit empty health and asset states**

An uninjured person must still display all four body zones. A truly assetless person retains a factual empty state. Do not synthesize wealth, castles, or weapons from a title label.

- [ ] **Step 6: Run UI and projection checks**

Run: `npm run test:world-history-projection && npm run check:ck3-character-window && npm run check:item-equipment-ui`

Expected: all commands pass.

### Task 8: Feed Projected NPC Equipment into Narrative Context

**Files:**
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `scripts/test-world-turn-context.mjs`
- Modify: `src/services/promptBuilder.ts` only if shared labels are required by the existing prompt contract.

**Interfaces:**
- Consumes `ResolvedCharacter.items` and special item records.
- Produces separate prompt sections for current equipment and owned/custodied assets.

- [ ] **Step 1: Add failing prompt-context tests**

Create a scene NPC wearing daily clothing, owning an unequipped sword, and controlling a title asset. Assert only clothing appears under current equipment and the other two appear under assets with non-carrying labels.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm run test:world-turn-context`

Expected: failure because ordinary projected items are absent and existing special records are not semantically separated.

- [ ] **Step 3: Merge projected items for selected scene characters**

Format current equipment as factual worn state. Format ownership and custody separately and include the sentence that these records do not imply present carrying.

- [ ] **Step 4: Verify event updates reach the next turn**

Project a `CHARACTER_ITEM_EQUIP` event, rebuild context, and assert the newly equipped definition moves from assets to current equipment without duplicate lines.

- [ ] **Step 5: Run context and unified-turn tests**

Run: `npm run test:world-turn-context && npm run test:unified-turn`

Expected: all commands pass.

### Task 9: Full Verification and Data Audit

**Files:**
- Modify: `package.json`
- Modify: `scripts/check-character-dataset.mjs`
- Modify: `public/data/agot-characters/reports/loadout-report.json` through the deterministic builder only.

**Interfaces:**
- Adds `test:character-supplements` and `test:npc-loadout-templates` scripts.
- Adds both tests to `npm run verify`.

- [ ] **Step 1: Add dataset audit assertions**

Require `kinship/<shard>.json`, every declared loadout shard, zero eligible living characters without a profile, valid referenced template IDs, and no child-template weapon or armor definitions.

- [ ] **Step 2: Run all character, item, world, and UI checks**

Run:

```bash
python3 -m unittest scripts.test_agot_character_import scripts.test_character_supplements -v
npm run test:character-runtime
npm run test:character-dossier
npm run test:character-store
npm run test:character-commands
npm run test:item-definitions
npm run test:npc-loadout-templates
npm run test:world-history-projection
npm run test:world-turn-context
npm run test:turn-pipeline
npm run test:unified-turn
npm run check:character-dataset
npm run check:ck3-character-window
npm run check:item-equipment-ui
npm run check:item-images
npm run check:icons
npm run check:no-emoji
npx tsc --noEmit
git diff --check
```

Expected: every command exits with status 0.

- [ ] **Step 3: Run the complete project verification**

Run: `npm run verify`

Expected: exit status 0 with no failed tests or checks.

- [ ] **Step 4: Audit representative dossiers**

Inspect one major parent with several children, one ordinary northern adult, one Dornish adult, one child, one Night's Watch member, and one genuinely assetless record. Confirm relation completeness, everyday clothing, no default battle armor, correct footwear, and strict asset labels.
