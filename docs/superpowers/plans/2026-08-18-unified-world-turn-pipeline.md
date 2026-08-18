# Unified World Turn Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make narrative, player rules, NPC state, equipment, relationships, and the branching canon timeline share one validated turn fact pipeline.

**Architecture:** Add a persisted world-history ledger and deterministic canon scheduler, automatically assemble scene-safe character context, split model resolution from final narration, and render the timeline from actual ledger facts plus scheduled canon nodes. Existing player and character reducers remain the authoritative projectors, but every accepted change is recorded in the same `WorldTurnRecord`.

**Tech Stack:** React 18, TypeScript 5.7, Zustand, Dexie, Vite, Node test scripts, Python offline data generation.

**Spec:** `docs/superpowers/specs/2026-08-18-unified-world-turn-pipeline-design.md`

## Global Constraints

- Do not use subagents.
- Do not emit emoji in UI, prompts, generated narrative, or logs.
- Prefer game icons; use Lucide only when no game icon exists.
- Runtime must not read CK3 or AGOT Workshop files; generated data is bundled during development.
- Current beta does not require save compatibility.
- Do not modify `.claude/` or unrelated timeline-generation work.
- Do not commit or push automatically.
- Ownership, custody, accessibility, and equipped state remain distinct.

---

### Task 1: World history and calendar domain

**Files:**
- Create: `src/features/world/worldHistory.ts`
- Create: `scripts/test-world-history.mjs`
- Modify: `src/types/game.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `WorldDate`, `WorldEventFact`, `WorldTurnRecord`, `WorldHistoryState`, `compareWorldDates`, `advanceWorldDate`, `createWorldHistoryState`, `appendWorldTurn`.
- Consumes: existing `StateCommand`, `CharacterId`, and `GameState`.

- [x] Write `scripts/test-world-history.mjs` with assertions that date advancement crosses month/year boundaries, refuses backward dates, deep-clones initial history, appends one turn once, and keeps the store date consistent with the history start date.
- [x] Run `node scripts/test-world-history.mjs`; expect failure because `worldHistory.ts` does not exist.
- [x] Implement the exact interfaces in the design and add `worldHistory: WorldHistoryState` to `GameState`.
- [x] Replace manual day/month/year arithmetic in `submitAction` with `advanceWorldDate` and reject backward `SET_DATE` commands.
- [x] Initialize and reset `worldHistory` together with every new game.
- [x] Add `test:world-history` to `package.json` and run it with `npx tsc --noEmit`.

### Task 2: Generated canonical schedule and preset alignment

**Files:**
- Create: `scripts/build_canonical_timeline.py`
- Create: `src/data/generated/canonicalTimeline.ts`
- Create: `src/features/world/canonicalTimeline.ts`
- Create: `scripts/test-canonical-timeline.mjs`
- Modify: `src/data/presets.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `CANONICAL_TIMELINE`, `CanonicalTimelineEvent`, `initializeCanonicalStates(events, startDate)`, `resolveDueCanonicalEvents(history, from, to, facts)`.
- Consumes: `WorldDate`, `CanonicalEventState`, player `canonicalCharacterId`, and the existing timeline JSON.

- [x] Write a failing generator/runtime test asserting 54 unique nodes, monotonic machine dates, pre-start `historical`, future `scheduled`, one-way transitions, and the three exact preset character IDs and start dates.
- [x] Implement the Python generator. Parse `date_display` into month/day using `上旬=5`, `中旬=15`, `下旬=25`, and explicit Arabic days when present. Emit unresolved participant names without inventing IDs.
- [x] Generate `canonicalTimeline.ts` and implement canonical initialization and due-event resolution.
- [x] Add `startDate`, `season`, and `canonicalCharacterId` to `PresetScenario`; use them in `startNewGame` instead of the global 298-10-15 date.
- [x] Run generator idempotence, canonical timeline tests, TypeScript, and `git diff --check`.

### Task 3: Automatic NPC and world context assembly

**Files:**
- Create: `src/features/world/worldTurnContext.ts`
- Create: `scripts/test-world-turn-context.mjs`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Modify: `src/features/characters/characterPromptSlice.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `BuildWorldTurnContextInput`, `WorldTurnContext`, `buildWorldTurnContext(input)`, and `formatWorldTurnContext(context)`.
- Consumes: current player canonical ID, action text, recent world facts, due timeline nodes, `StaticCharacterRepository`, projected character events, and world equipment placements.

- [x] Write a failing test with an in-memory repository proving direct mentions, player relatives, recent participants, and due-event participants are selected; genealogy/technical records and secrets are excluded.
- [x] Add a repository method that matches direct mentions from the canon/semicanon index without exposing the full index to prompts.
- [x] Build the context automatically in `submitAction`; remove `characterTurnContext` as a required UI-fed mechanism.
- [x] Extend `buildStateSlice` with formatted NPC cards, reciprocal relationships, known memories, current timeline pressures, and visible world-equipment facts.
- [x] Run context, character prompt, character scene, prompt builder, and TypeScript checks.

### Task 4: Two-stage validated turn resolution

**Files:**
- Create: `src/services/turnResolution.ts`
- Create: `src/services/turnNarration.ts`
- Create: `scripts/test-turn-pipeline.mjs`
- Modify: `src/services/api.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/types/game.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `TurnResolutionDraft`, `SettledTurn`, `ResolvedTurnFacts`, `requestTurnResolution`, `settleTurnDraft`, `buildSettledNarrativeMessages`, `streamSettledNarrative`.
- Consumes: D20 result, pending item actions, player reducer, character validator, calendar result, canon transitions, and `WorldTurnContext`.

- [x] Write a failing pipeline test where the draft narratively proposes a marriage and injury but the validator rejects them; assert rejected facts never reach narration messages or the committed `WorldTurnRecord`.
- [x] Split the API protocol: resolution response contains `<resolution>` and `<state_cmd>` only; final response contains `<think>`, `<narrate>`, and `<branch>` only.
- [x] Move command merging, validation, player reduction, character-event conversion, time advancement, and canon scheduling into `settleTurnDraft`.
- [x] Build final narration messages exclusively from `ResolvedTurnFacts`; include D20 outcome boundaries and accepted item/trait effects.
- [x] Refactor `submitAction` to resolve, settle, narrate, atomically commit, then update Zustand. A failed narration call must not commit state or consume queued item actions.
- [x] Make the offline demo use the same resolution and narration interfaces.
- [x] Run turn-pipeline, state reducer, character commands, item queue, dice, prompt, TypeScript, and production build checks.

### Task 5: Unified projections for dossiers, equipment, and actual history

**Files:**
- Create: `src/features/world/worldHistoryProjection.ts`
- Create: `scripts/test-world-history-projection.mjs`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `src/components/TvTimelineModal.tsx`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `projectActualTimeline(history)`, `projectCanonicalTimeline(history, schedule)`, `factsForCharacter(history, characterId)`, and `visibleEquipmentForCharacter(...)`.
- Consumes: committed world history, projected character records, player items, and world artifact placements.

- [x] Write failing projection tests proving a marriage appears reciprocally, a death appears in the dossier and actual timeline, an owned-but-unworn item does not appear under equipment, and a diverged canon node displays its reason.
- [x] Add actual-history and canon-node view models without parsing story prose.
- [x] Make NPC health/equipment read only actual equipped records; custody and location records remain outside equipment.
- [x] Make the timeline modal default to actual history and offer a canon schedule switch with `historical`, `scheduled`, `occurred`, `diverged`, and `suppressed` labels.
- [x] Add stable story-to-fact and story-to-character links so opening a highlighted person shows the same projected state used for narration.
- [x] Run projection, dossier, navigation, CK3 window, story-link, TypeScript, and production build checks.

### Task 6: Atomicity, rollback, and full integration verification

**Files:**
- Create: `scripts/test-unified-turn-integration.mjs`
- Modify: `src/services/db.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-18-unified-world-turn-pipeline-design.md`

**Interfaces:**
- Consumes all prior interfaces.
- Produces a verified end-to-end invariant: one action creates one committed world turn whose narrative, player state, NPC projections, item effects, date, and timeline transitions agree.

- [x] Write an end-to-end test covering a named NPC interaction, D20 result, queued equipment action, accepted relationship change, rejected impossible death, date advancement across a canon node, and rollback.
- [x] Extend atomic commit and rollback checks so `GameState.worldHistory`, character events, item queue consumption, and snapshot turn number cannot diverge.
- [x] Add `test:unified-turn` and include Tasks 1–5 tests in `npm run verify`.
- [ ] Run `npm run verify`, all Python import/timeline tests, `git diff --check`, and a local browser smoke test on port 5199.（自动化、构建与 HTTP 检查已通过；桌面视觉检查受浏览器路径映射阻断。）
- [x] Re-read the design invariants and record the exact verification commands and any intentionally deferred map-only presentation work in the design document.
