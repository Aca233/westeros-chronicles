# AGOT Artifact World State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Generate and load a deterministic 8298.1.1 world state for unique AGOT artifacts without equipping them or adding them to the player's inventory.

**Architecture:** A restricted Python projector evaluates only approved historical-script constructs and emits JSON plus a generated TypeScript snapshot. A small TypeScript world-state module clones and validates that snapshot independently of `lord.items`, and `GameState` initializes it for every run.

**Tech Stack:** Python 3 `unittest`, existing Paradox parser, TypeScript, Node.js test scripts, Zustand.

**Spec:** `docs/superpowers/specs/2026-08-18-agot-artifact-world-state-design.md`

## Global Constraints

- Do not read CK3 vanilla files; only workshop source `2962333032` and project-generated data are valid historical inputs.
- Do not use subagents.
- Do not add emoji.
- Every initial world artifact has `equipped: false` even when the source script equips it.
- Do not commit or push.
- Preserve all unrelated uncommitted workspace changes and do not touch `.claude/`.

---

### Task 1: Restricted historical projector

**Files:**
- Create: `scripts/agot_artifact_import/world_state.py`
- Create: `scripts/fixtures/agot-artifact-world-state/scenario.txt`
- Create: `scripts/fixtures/agot-artifact-world-state/landed_titles.txt`
- Create: `scripts/test_agot_artifact_world_state.py`

**Interfaces:**
- Consumes: parsed `Entry` documents, `AgotDate`, artifact effect metadata, character index rows, direct title-holder rows.
- Produces: `project_artifact_world_state(...) -> WorldStateProjection` with resolved records and structured unresolved issues.

- [x] Add focused tests for date chains, longclaw ownership before and after 8299.1.1, absent winter crowns, title-parent holder fallback, unknown conditions, duplicate unique effects, and forced `equipped: false`.
- [x] Run `python3 -m unittest scripts.test_agot_artifact_world_state -v` and confirm the missing module/API failure.
- [x] Implement scope resolution, three-state condition evaluation, first-match branch selection, helper recursion, effect mapping, and deterministic issue reporting.
- [x] Run the focused Python tests and confirm all cases pass.

### Task 2: Import pipeline and deterministic generated files

**Files:**
- Modify: `scripts/agot_artifact_import/cli.py`
- Modify: `scripts/agot_artifact_import/writer.py`
- Modify: `scripts/agot_artifact_import/model.py`
- Modify: `package.json`
- Generate: `public/data/items/agot-artifact-world-state.json`
- Generate: `public/data/items/agot-artifact-world-state-report.json`
- Generate: `src/data/generated/agotArtifactWorldState.ts`

**Interfaces:**
- Consumes: `WorldStateProjection`, deduplicated `ArtifactGroup` records, character and title snapshots.
- Produces: schema-versioned JSON, report counts/issues, and `AGOT_ARTIFACT_WORLD_STATE` plus its dataset hash.

- [x] Extend artifact metadata so every visual variant source effect maps to one definition and only unique definitions can instantiate.
- [x] Make `import_artifacts(...)` project the 8298.1.1 scenario after definitions are deduplicated, using explicit aliases for the four hand-authored weapons.
- [x] Hash the canonical world-state payload and atomically write JSON, report, and TypeScript output.
- [x] Add the focused world-state test command to `package.json` and the global `verify` chain.
- [x] Run `npm run import:agot-artifacts` twice and confirm hashes and generated files are byte-identical.

### Task 3: Runtime world-state boundary

**Files:**
- Create: `src/features/items/worldArtifacts.ts`
- Modify: `src/types/game.ts`
- Modify: `src/store/useGameStore.ts`
- Create: `scripts/test-world-artifact-state.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AGOT_ARTIFACT_WORLD_STATE` generated constant.
- Produces: `WorldArtifactState`, `WorldArtifactRecord`, and `createInitialAgotArtifactWorldState(): WorldArtifactState`.

- [x] Add runtime-focused tests that validate definition references, unique instance IDs, longclaw and iron-throne fixtures, absent winter crowns, false equipped flags, and deep-clone isolation.
- [x] Run `node --experimental-strip-types scripts/test-world-artifact-state.mjs` and confirm the missing runtime module failure.
- [x] Implement typed world records, snapshot validation, and deep-clone initialization.
- [x] Add required `worldArtifacts` to application and new-game state without placing any record in `lord.items`.
- [x] Run the Node test and nearby item/store tests.

### Task 4: Full import and verification

**Files:**
- Verify all files from Tasks 1-3.

**Interfaces:**
- Consumes: complete offline import and runtime integration.
- Produces: verified static 298 AC artifact world state with a reproducible report.

- [x] Inspect report counts and spot-check longclaw, iron throne, family weapons, unresolved effects, and duplicate-definition conflicts.
- [x] Run `npm run verify`.
- [x] Confirm `git diff --check` succeeds and review the final diff without staging, committing, or pushing.
