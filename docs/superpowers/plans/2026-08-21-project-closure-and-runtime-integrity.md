# Project Closure and Runtime Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有正文、人物、地图、资产、时间线与 LLM 从“功能已连接”收束为可恢复、可降级、协议真实、信息一致且完整验证通过的产品闭环。

**Architecture:** 保留静态基线、世界运行时稀疏覆盖和双阶段回合结算；新增启动协调器、模型 Provider Adapter、世界事件可见性与显示名称边界。地图继续是可选表现层，地图数据只在地点/旅行意图真正需要时成为硬依赖。

**Tech Stack:** React 18、TypeScript、Zustand、Dexie、Vite、MapLibre GL、Three.js、Zod、Node test runner、Python unittest、Vitest、Testing Library、jsdom。

**Spec:** `docs/superpowers/specs/2026-08-21-project-closure-and-runtime-integrity-design.md`

## Global Constraints

- 不新增玩法，不继续扩展 3D 地标、材质或光照。
- 不兼容旧测试版存档，但不得静默删除无效存档。
- 地图故障不得阻断普通正文回合。
- 所有状态写入仍通过现有原子提交边界。
- 不推送远端。

---

### Task 1: 启动与导入存档恢复

**Files:**
- Modify: `src/services/db.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Create: `scripts/test-save-hydration.mjs`

**Interfaces:**
- Produces: `loadLatestGameState(): Promise<GameState | null>`
- Produces: `hydrateGameState(): Promise<void>`
- Produces: `replaceGameState(gameState: GameState): void`
- Produces: `bootStatus: 'loading' | 'ready' | 'error'` and `bootError: string | null`

- [x] Write a failing test proving the newest valid snapshot is returned and invalid snapshots are rejected without deletion.
- [x] Run `node scripts/test-save-hydration.mjs` and confirm failure.
- [x] Implement `loadLatestGameState` and Store hydration/replacement actions.
- [x] Make `App` wait for hydration and provide an explicit reset action on incompatible data.
- [x] Replace import-page reload with direct Store replacement.
- [x] Run the new test, store tests, typecheck and build.
- [x] Commit `fix: restore persisted world state on startup`.

### Task 2: Provider adapters, timeout and cancellation

**Files:**
- Create: `src/services/modelProviders/types.ts`
- Create: `src/services/modelProviders/openAiCompatible.ts`
- Create: `src/services/modelProviders/anthropic.ts`
- Create: `src/services/modelProviders/index.ts`
- Modify: `src/services/api.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/components/ActionDock.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Create: `scripts/test-model-provider-adapters.mjs`

**Interfaces:**
- Produces: `getModelProviderAdapter(config: ApiConfig): ModelProviderAdapter`
- Produces: `cancelCurrentTurn(): void`
- Produces: `turnStage: 'idle' | 'resolving' | 'settling' | 'narrating'`

- [ ] Write request-shape and response-parsing tests for OpenAI-compatible and Anthropic.
- [ ] Confirm Anthropic tests fail against the current universal `/chat/completions` transport.
- [ ] Implement adapters and shared timeout/abort composition.
- [ ] Route both resolution and narration through the selected adapter.
- [ ] Add cancel action and truthful stage copy to the action dock.
- [ ] Verify failure/cancellation leaves state and pending transactions unchanged.
- [ ] Commit `fix: implement provider-specific model transports`.

### Task 3: 地图故障的真正降级路径

**Files:**
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `src/store/useGameStore.ts`
- Create: `scripts/test-map-independent-turn.mjs`

**Interfaces:**
- Produces: `WorldContextAvailability`
- Produces: optional map dataset input for `prepareWorldTurn`

- [ ] Write a failing integration test where every map fetch rejects but an ordinary dialogue action completes.
- [ ] Write a test where an explicit travel action is rejected with a map-data reason without aborting the whole turn.
- [ ] Split optional enrichment loading from map-dependent intent validation.
- [ ] Ensure narration receives accepted/rejected facts even in degraded mode.
- [ ] Run turn pipeline, unified turn and new degradation tests.
- [ ] Commit `fix: decouple ordinary turns from map availability`.

### Task 4: 世界事件可见性边界

**Files:**
- Create: `src/features/world/worldEventVisibility.ts`
- Modify: `src/features/world/worldRuntimeTypes.ts`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `src/components/TvTimelineModal.tsx`
- Modify: `src/features/map/politicalProjection.ts`
- Create: `scripts/test-world-event-visibility.mjs`

**Interfaces:**
- Produces: `selectVisibleWorldEvents(events, viewer): WorldEvent[]`

- [ ] Write tests for public, player-known and hidden secret events.
- [ ] Implement fail-closed visibility selection.
- [ ] Route all player-facing projections through the selector.
- [ ] Verify secret events remain in the authoritative ledger but disappear from every UI projection.
- [ ] Commit `fix: enforce world event visibility across projections`.

### Task 5: 玩家可见名称与事实呈现

**Files:**
- Create: `src/features/world/worldDisplayResolver.ts`
- Modify: `src/features/world/worldHistoryProjection.ts`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `src/components/TvTimelineModal.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Create: `scripts/test-world-display-resolver.mjs`

**Interfaces:**
- Produces: `resolveWorldEventDisplay(event, repositories): Promise<WorldEventDisplay>`

- [ ] Write failing tests asserting exact character/location/title/asset labels.
- [ ] Implement cached display-name resolution with natural-language fallback.
- [ ] Replace generic “查看人物/地点/资产” labels with entity names.
- [ ] Hide internal command enum names from default presentation.
- [ ] Keep raw audit data only in an opt-in disclosure.
- [ ] Commit `fix: present world facts with canonical names`.

### Task 6: 显式资产分类

**Files:**
- Modify: `scripts/agot_artifact_import/*`
- Modify: `src/features/items/worldArtifacts.ts`
- Modify: `src/features/items/worldArtifactClassification.ts`
- Regenerate: `src/data/generated/agotArtifactWorldState.ts`
- Regenerate: `public/data/items/agot-artifact-world-state.json`
- Modify: asset baseline/projection tests

**Interfaces:**
- Produces: `projectionKind: 'portable-asset' | 'political-symbol'`

- [ ] Write importer and runtime tests proving classification comes from generated data.
- [ ] Add classification during import and schema validation.
- [ ] Regenerate deterministic outputs twice and compare hashes.
- [ ] Retain the ID guard only as backward-compatible defense.
- [ ] Run artifact, asset baseline and world projection suites.
- [ ] Commit `refactor: classify political symbols outside asset projection`.

### Task 7: DOM interaction test foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/*.test.tsx`

**Interfaces:**
- Produces: `npm run test:ui`

- [ ] Add Vitest, jsdom and Testing Library.
- [ ] Test startup hydration and import replacement through rendered UI.
- [ ] Test story entity → dossier, asset → detail → return, and map error → ordinary turn.
- [ ] Keep source-string checks temporarily but stop treating them as interaction proof.
- [ ] Add `test:ui` to `verify` before production build.
- [ ] Commit `test: cover critical runtime flows in the DOM`.

### Task 8: DEM 海面与地图验证

**Files:**
- Modify: `scripts/agot_map_import/dem.py`
- Modify: `scripts/test_agot_map_import.py` only if an additional edge case is required

**Interfaces:**
- Preserves: `build_dem_tiles(...) -> TileReport`

- [ ] Preserve the existing failing ocean test as the regression test.
- [ ] Trace whether resampling introduces edge values after source flattening.
- [ ] Apply the water mask at output resolution before Terrain-RGB encoding.
- [ ] Run `npm run test:agot-map-import` and `npm run verify:map`.
- [ ] Commit `fix: keep masked ocean flat in generated dem tiles`.

### Task 9: 首屏与仓库负载整理

**Files:**
- Modify: `src/data/itemDefinitions.ts`
- Modify: item consumers as required for lazy access
- Modify: `.gitignore`
- Delete: tracked `tmp/agot-model-pilot-*`
- Modify: `vite.config.ts`
- Create/Modify: bundle budget check

**Interfaces:**
- Preserves synchronous catalog access inside settlement after an explicit preload.

- [ ] Add a bundle-budget check that fails on the current oversized entry chunk.
- [ ] Move heavy optional panels and generated catalogs behind explicit lazy boundaries.
- [ ] Remove tracked pilot duplicates and ignore the whole `tmp/` directory.
- [ ] Confirm required production map/model assets remain present.
- [ ] Run build and bundle-budget verification.
- [ ] Commit `perf: reduce startup and repository asset overhead`.

### Task 10: 文档与最终验证

**Files:**
- Modify: `README.md`
- Create: `docs/CURRENT_ARCHITECTURE.md`
- Modify: relevant spec status headers
- Modify: `package.json` only if verification orchestration needs cleanup

**Interfaces:**
- Produces one authoritative current architecture document.

- [ ] Update README to schema version 4 and five title ranks.
- [ ] Document authoritative state, projections, degradation, persistence and provider boundaries.
- [ ] Mark superseded specifications explicitly.
- [ ] Run `npm run verify`, `npm run build`, `git diff --check` and repository status checks.
- [ ] Commit `docs: align project documentation with runtime architecture`.
