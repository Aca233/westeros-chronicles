# Ordinary Item Ownership Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy ownership field from ordinary item instances and make world runtime relations the only ownership authority while preserving the current equipment and placement gameplay state.

**Architecture:** Ordinary `ItemSystemState` remains responsible for item gameplay state and placements, but no longer stores lawful ownership. Existing unified world transactions remain responsible for `lawfulOwner`, `controller`, `custodian`, and world placement. AGOT world-artifact import records remain unchanged.

**Tech Stack:** TypeScript 5.7, Node test runner, esbuild test bundles, React, Zustand.

**Spec:** `docs/superpowers/specs/2026-08-21-ordinary-item-ownership-authority-design.md`

## Global Constraints

- Do not delete or rename `WorldArtifactRecord.lawfulControllerId`.
- Do not migrate or remove `ItemSystemState.placements` in this change.
- Raise `ITEM_SAVE_FORMAT_VERSION` from 8 to 9 and reject version 8 saves.
- Do not commit, push, launch a browser, or modify map/generated assets.
- Preserve unrelated dirty workspace changes.

---

### Task 1: Lock the ordinary-item ownership boundary

**Files:**
- Create: `scripts/check-ordinary-item-ownership-authority.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: ordinary item source paths and `WorldArtifactRecord` exception boundary.
- Produces: `npm run check:item-ownership-authority`, which fails if legacy ownership appears in ordinary item types, actions, view models, or presets.

- [ ] **Step 1: Add the failing boundary check**

Read the ordinary item files and assert they do not contain `lawfulControllerId`; separately assert `src/features/items/worldArtifacts.ts` still declares it.

- [ ] **Step 2: Run the check and verify it fails**

Run: `npm run check:item-ownership-authority`
Expected: FAIL listing the existing ordinary item files.

- [ ] **Step 3: Keep the check failing while Tasks 2–3 remove the violations**

Do not weaken the exception to include ordinary item files.

### Task 2: Remove legacy ownership from ordinary item behavior

**Files:**
- Modify: `src/features/items/types.ts`
- Modify: `src/features/items/actions.ts`
- Modify: `src/features/items/viewModel.ts`
- Modify: `src/data/itemPresetState.ts`
- Modify: `scripts/test-item-actions.mjs`
- Modify: `scripts/test-item-view-model.mjs`

**Interfaces:**
- Consumes: existing world transaction gift projection.
- Produces: `ItemInstance` without `lawfulControllerId`; gift updates gameplay placement/history only.

- [ ] **Step 1: Strengthen action and view-model regression tests**

Assert a gifted/split instance has no `lawfulControllerId`, retains `{ type: 'character', characterId: recipientId }`, and records `gifted` history. Assert rendered provenance contains no `合法归属` line.

- [ ] **Step 2: Run focused tests and confirm the legacy assertions fail where applicable**

Run: `npm run test:item-actions && npm run test:item-view-model && npm run check:item-ownership-authority`
Expected: boundary check FAIL before implementation.

- [ ] **Step 3: Delete the field and all ordinary-item reads/writes**

Remove the field from `ItemInstance`, remove preset overrides, stop gift writes, remove merge comparison, and remove the provenance line.

- [ ] **Step 4: Run focused tests and boundary check**

Run: `npm run test:item-actions && npm run test:item-view-model && npm run check:item-ownership-authority`
Expected: PASS.

### Task 3: Invalidate legacy save data

**Files:**
- Modify: `src/features/items/saveVersion.ts`
- Modify: `src/types/game.ts`
- Modify: `scripts/test-item-save-version.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: versioned state fixtures in map, travel, turn, and world-context tests.

**Interfaces:**
- Produces: `ITEM_SAVE_FORMAT_VERSION = 9`, `GameState.saveFormatVersion: 9`, version 9 save-envelope contracts.

- [ ] **Step 1: Change save-version expectations to 9 and add explicit version-8 rejection**

Update current-version fixtures to 9. Keep a version-8 fixture that must throw the reset-required error or fail baseline compatibility.

- [ ] **Step 2: Run save and location tests to verify production still reports version 8**

Run: `npm run test:item-save-version && npm run test:location-authority`
Expected: FAIL until production constants/types are updated.

- [ ] **Step 3: Raise production save types and all current test fixtures to version 9**

Change only version literals representing the current format; retain old-version rejection cases.

- [ ] **Step 4: Run all directly affected save/location/map/turn tests**

Run the save-version, location-authority, map integration, map travel, turn pipeline, and world context linkage scripts.
Expected: PASS.

### Task 4: Verify unified world ownership transactions

**Files:**
- Test: `scripts/test-world-transactions.mjs`
- Test: `scripts/test-world-transaction-queue.mjs`
- Test: `scripts/test-world-asset-baseline.mjs`

**Interfaces:**
- Verifies: gifting an ordinary item still updates world asset `lawfulOwner`, `controller`, `custodian`, and `placement` through the unified transaction path.

- [ ] **Step 1: Run world ownership transaction tests**

Run: `npm run test:world-transactions && npm run test:world-transaction-queue && npm run test:world-asset-baseline`
Expected: PASS without restoring the item-instance field.

- [ ] **Step 2: Run unified-turn and linkage verification**

Run: `npm run test:unified-turn && npm run verify:world-linkage`
Expected: PASS.

### Task 5: Final static and build verification

**Files:**
- No additional production files expected.

**Interfaces:**
- Verifies the complete TypeScript and Vite code-check build.

- [ ] **Step 1: Search the final ownership boundary**

Confirm `lawfulControllerId` remains only in world-artifact import data/types/tests and not ordinary item state.

- [ ] **Step 2: Run TypeScript checking**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run code build**

Run: `npm run build:code`
Expected: PASS.

- [ ] **Step 4: Report exact verification and any unrelated failures**

Do not claim completion without fresh command output.
