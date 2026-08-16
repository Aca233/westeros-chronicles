# Universal Character Dossiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the existing CK3 character window render every stable AGOT character while preserving full player-only equipment and inventory behavior.

**Architecture:** Introduce a pure dossier view-model adapter plus a loading hook for static records and per-save event projections. Refactor the window to consume a selected subject, then add stack navigation, clickable relationship cards, and dataset search without cloning player-only state into NPCs.

**Tech Stack:** React 18, TypeScript, Zustand, Dexie, Vite, Node test scripts

**Spec:** `docs/superpowers/specs/2026-08-17-universal-character-dossiers-design.md`

## Global Constraints

- No Emoji may appear in project source or generated UI copy.
- Prefer CK3/AGOT game icons; use Lucide only where a game icon does not exist.
- Education traits remain first and trait/skill icons remain visually dominant over numbers.
- NPC equipment and inventory must never reuse player state.
- Do not add the deferred interaction sidebar or titles-and-claims tab.
- Do not use subagents.

---

### Task 1: Pure NPC dossier projection

**Files:**
- Create: `src/features/characters/characterDossier.ts`
- Create: `scripts/test-character-dossier.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ResolvedCharacter`, `LordProfile`, current display year.
- Produces: `CharacterDossier`, `createPlayerDossier()`, `createNpcDossier()`, `characterAgeAtYear()`.

- [x] Write focused tests asserting age conversion, trait ordering, dynamic fields, and no player inventory fields on NPC dossiers.
- [x] Run `node --experimental-strip-types scripts/test-character-dossier.mjs` and confirm the missing module failure.
- [x] Implement the typed pure adapter with explicit player/NPC variants and truthful fallbacks.
- [x] Run the focused test and TypeScript build.

### Task 2: Lazy NPC loader and event projection

**Files:**
- Create: `src/features/characters/useCharacterDossier.ts`
- Modify: `src/features/characters/characterEventStore.ts` only if a public read interface is missing.

**Interfaces:**
- Consumes: selected `CharacterId`, dataset hash, run ID, current year.
- Produces: `{ dossier, record, status, error, reload }` and refreshes when selection or world revision changes.

- [x] Verify the event-store read API and add the narrowest missing interface if needed.
- [x] Implement cancellation-safe record, event, and related-record loading.
- [x] Project events through `resolveCharacter()` and expose deterministic states.
- [x] Run character runtime/store tests and build.

### Task 3: Refactor the CK3 window for player and NPC subjects

**Files:**
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Create: `src/components/NpcCharacterTabs.tsx` if NPC tab markup would otherwise enlarge the existing file substantially.
- Modify: `src/components/CharacterSheet.tsx` only for reusable read-only body rendering if required.

**Interfaces:**
- Consumes: `selectedCharacterId`, `onSelectCharacter`, `canGoBack`, `onBack`, `onReturnToPlayer`.
- Produces: one visually identical window with player-operable tabs and NPC read-only tabs.

- [x] Replace direct identity, portrait, trait, and skill reads from `gameState.lord` with dossier reads.
- [x] Keep the current player health/equipment/inventory components unchanged in player mode.
- [x] Add truthful NPC relationship, health, memory, and unavailable inventory states.
- [x] Reset selected trait and preserve tab behavior when switching subjects.
- [x] Run CK3 window check and build.

### Task 4: Character navigation and dataset search

**Files:**
- Create: `src/features/characters/useCharacterNavigation.ts`
- Create: `src/components/CharacterSearch.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Create: `scripts/test-character-navigation.mjs`

**Interfaces:**
- Produces navigation state `{ selectedCharacterId, history, openCharacter, goBack, returnToPlayer }`.
- Character search emits one stable `CharacterId` and never guesses among duplicate names automatically.

- [x] Add pure navigation tests for push, duplicate selection, back, and return-to-player.
- [x] Implement navigation and share it between desktop and mobile renderings.
- [x] Make populated relationship cards buttons that call `onSelectCharacter(person.id)`.
- [x] Add debounced lazy dataset search with alive/dead and dynasty disambiguation.
- [x] Run focused tests, no-Emoji/icon checks, and build.

### Task 5: Regression gates and final verification

**Files:**
- Modify: `scripts/check-ck3-character-window.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Adds universal-dossier checks to the repository-wide `verify` command.

- [x] Add checks for universal window props, relationship-card navigation, search, back, return-to-player, and player-only item behavior.
- [x] Document opening NPC dossiers and truthful unavailable fields.
- [x] Run `npm run verify`.
- [x] Inspect the built UI in the browser at desktop and mobile widths and fix visible regressions.
- [x] Re-run `npm run verify`, review the diff, and commit only project files.
