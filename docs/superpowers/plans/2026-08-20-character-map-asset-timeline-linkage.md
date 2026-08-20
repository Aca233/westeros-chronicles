# 人物、地图、资产与时间线统一联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立唯一的稀疏运行时世界状态和原子事务管线，使人物、地点、头衔、资产、旅行、正文与时间线始终投影同一份当前事实。

**Architecture:** 静态 AGOT 人物、地图、头衔和资产继续作为不可变基线；`WorldRuntimeState` 只保存发生变化的覆盖和不可变事件。自然语言与 UI 操作先转换为 `WorldIntent`，再由事务规划器生成确定性变化，原子提交后由人物卷宗、地图、资产详情、时间线和 LLM 上下文共同投影。

**Tech Stack:** React 19、TypeScript、Zustand、Zod、MapLibre GL、Dexie、Node test runner、esbuild、Vite 6、Python 离线数据脚本。

**Spec:** `docs/superpowers/specs/2026-08-20-character-map-asset-timeline-linkage-design.md`

## Global Constraints

- 不使用 Emoji；所有新增用户可见文本使用中文。
- 玩家与 NPC 使用同一套人物、装备、资产和地点投影语义。
- 法理归属、实际控制、直接保管、物理位置和装备状态必须严格分离。
- 披风继续属于 `torso.outerwear`；保留双腿和足部；主手与副手保持对称。
- 静态日常状态不得默认穿战甲或持武器；真实装备必须来自明确开局记录或已提交世界事务。
- 所有改变世界的 UI 操作进入待处理队列，并在下一次成功对话后原子结算；取消入口留在原操作位置。
- 运行时不得读取 Steam、Workshop、CK3、AGOT 游戏目录或网络；离线生成数据继续固化到项目。
- 地图继续以伯爵领为主要政治交互单位，不恢复男爵领政治操作层级。
- 不提供全局历史日期检视，只显示当前状态和对象关联事件。
- 约 11,450 名人物采用稀疏动态状态；地图和 LLM 不得全量遍历或注入全部人物。
- 测试版将存档格式直接提升到 8，拒绝旧存档，不实现兼容迁移。
- 不调用浏览器；视觉验证由用户在已经运行的 5199 开发服务器完成。
- Linux/WSL 缺少 Rollup Linux 可选包时，构建使用 Windows 命令：`/mnt/c/Windows/System32/cmd.exe /d /s /c "cd /d C:\AGOT && npm run build:code"`。
- 当前工作区包含尚未提交的地图、人物和装备改动；执行前不得从 HEAD 创建不含这些改动的工作树，也不得回滚无关文件。

## File Structure

### 新增世界核心文件

- `src/features/world/worldRuntimeTypes.ts`：稳定主体引用、动态覆盖、事件、意图、事务和提交结果类型。
- `src/features/world/worldRuntimeState.ts`：创建、克隆、校验和三态覆盖语义。
- `src/features/world/worldBaseline.ts`：把人物、地图、头衔、玩家物品和 AGOT 世界物品暴露为统一只读基线。
- `src/features/world/worldProjection.ts`：合并基线与动态覆盖，解析人物、头衔、资产和递归地图位置。
- `src/features/world/worldEventIndex.ts`：人物、地点、资产和头衔的事件反向索引。
- `src/features/world/worldTransactions.ts`：事务、变化指令、幂等和原子提交引擎。
- `src/features/world/worldAssetRules.ts`：赠予、偷窃、转移、装备、死亡遗留与容器规则。
- `src/features/world/worldTitleRules.ts`：册封、继承、剥夺、占领和争议控制规则。
- `src/features/world/worldTravelRules.ts`：把现有路线和旅程推进结果转换为统一事务变化。
- `src/features/world/worldIntentResolver.ts`：把规则模型输出的未解析意图映射为稳定人物、地点和资产引用。
- `src/features/world/worldTransactionQueue.ts`：入队、替换冲突项、取消和结算后的状态处理。
- `src/features/world/worldSelectors.ts`：供 React/Zustand 使用的按对象、地点和 revision 缓存选择器。

### 新增界面文件

- `src/components/items/WorldAssetDrawer.tsx`：资产详情抽屉及人物、地点跳转。
- `src/components/items/WorldAssetSections.tsx`：人物卷宗资产分组和统一资产卡。
- `src/features/map/CountyWorldDetails.tsx`：选中伯爵领的领主、控制者、人物、据点、车辆、资产和事件。

### 新增测试与审计

- `scripts/test-world-runtime-state.mjs`
- `scripts/test-world-projection.mjs`
- `scripts/test-world-event-index.mjs`
- `scripts/test-world-transactions.mjs`
- `scripts/test-world-asset-rules.mjs`
- `scripts/test-world-transaction-queue.mjs`
- `scripts/test-world-travel-linkage.mjs`
- `scripts/test-world-title-rules.mjs`
- `scripts/test-world-intent-resolver.mjs`
- `scripts/test-world-ui-linkage.mjs`
- `scripts/test-world-context-linkage.mjs`
- `scripts/audit-world-runtime-boundaries.mjs`

### Node 测试夹具约定

每个新增 `.mjs` 测试使用现有 esbuild `bundleModule()` 模式导入 TypeScript。涉及变化和意图的测试在文件内复制以下小型辅助函数，不能依赖未声明的全局夹具：

```js
const mutationOf = (mutations, type) => mutations.find((mutation) => mutation.type === type);
const mutationTypes = (mutations) => mutations.map((mutation) => mutation.type);
const unresolvedIntent = (kind, evidenceText, fields = {}) => ({ kind, evidenceText, ...fields });
const eventFixture = (fields = {}) => ({
  id: 'event:fixture',
  transactionId: 'tx:fixture',
  turn: 1,
  date: { year: 298, month: 5, day: 10 },
  type: 'fixture',
  actorIds: [],
  subjectRefs: [],
  reason: '测试事件',
  source: 'system_rule',
  visibility: 'public',
  ...fields,
});
```

每个测试的 Arrange 段必须显式创建 `baseline`、`runtime`、`context` 和使用到的 ID；不得以未定义的 `fixture` 或伪代码省略依赖。

### package.json 测试脚本登记表

创建对应测试文件的任务必须在运行测试前加入以下精确脚本；不得直接依赖未登记的 `npm run` 名称：

```json
{
  "test:world-runtime-state": "node scripts/test-world-runtime-state.mjs",
  "test:world-projection": "node scripts/test-world-projection.mjs",
  "test:world-event-index": "node scripts/test-world-event-index.mjs",
  "test:world-transactions": "node scripts/test-world-transactions.mjs",
  "test:world-asset-baseline": "node scripts/test-world-asset-baseline.mjs",
  "test:world-asset-rules": "node scripts/test-world-asset-rules.mjs",
  "test:world-transaction-queue": "node scripts/test-world-transaction-queue.mjs",
  "test:world-travel-linkage": "node scripts/test-world-travel-linkage.mjs",
  "test:world-title-rules": "node scripts/test-world-title-rules.mjs",
  "test:world-selectors": "node scripts/test-world-selectors.mjs",
  "test:world-ui-linkage": "node scripts/test-world-ui-linkage.mjs",
  "test:world-intent-resolver": "node scripts/test-world-intent-resolver.mjs",
  "test:world-context-linkage": "node scripts/test-world-context-linkage.mjs"
}
```

---

## Milestone 1：统一状态、基线、事件与原子事务

### Task 1: 建立 WorldRuntimeState 与存档版本 8

**Files:**
- Create: `src/features/world/worldRuntimeTypes.ts`
- Create: `src/features/world/worldRuntimeState.ts`
- Create: `scripts/test-world-runtime-state.mjs`
- Modify: `src/types/game.ts`
- Modify: `src/features/items/saveVersion.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/services/db.ts`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `scripts/test-item-save-version.mjs`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `WorldRuntimeState`, `WorldSubjectRef`, `AssetPlacement`, `WorldEvent`, `WorldIntent`, `PendingWorldTransaction`, `createWorldRuntimeState()`, `validateWorldRuntimeState()`.
- Consumes: existing `CharacterId`, `EquipmentPosition`, `ItemStateCommand`, `WorldDate`, `WorldDateAdvance`, `WorldLocationRef`.

- [ ] **Step 1: Write the failing runtime-state test**

Create `scripts/test-world-runtime-state.mjs` using the repository esbuild bundling pattern. Include these assertions:

```js
const state = createWorldRuntimeState();
assert.deepEqual(state, {
  schemaVersion: 1,
  revision: 0,
  characters: {},
  titles: {},
  assets: {},
  events: [],
  pendingTransactions: [],
});
assert.doesNotThrow(() => validateWorldRuntimeState(state));
assert.throws(() => validateWorldRuntimeState({ ...state, revision: -1 }), /世界状态修订号/);
assert.throws(() => validateWorldRuntimeState({
  ...state,
  assets: { sword: { kind: 'item', placement: { type: 'asset', assetId: 'sword' } } },
}), /资产不能直接放入自身/);
```

Update `scripts/test-location-authority.mjs` so the accepted save format is exactly `8` and format `7` is rejected.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node scripts/test-world-runtime-state.mjs
node --experimental-strip-types scripts/test-location-authority.mjs
```

Expected: the first command fails because `worldRuntimeState.ts` does not exist; the second fails because the current save format is 7.

- [ ] **Step 3: Define the exact core types**

In `worldRuntimeTypes.ts`, add:

```ts
export type WorldPrincipalRef =
  | { type: 'character'; characterId: CharacterId }
  | { type: 'dynasty'; dynastyId: string }
  | { type: 'title'; titleId: string };

export type WorldCustodianRef =
  | { type: 'character'; characterId: CharacterId }
  | { type: 'asset'; assetId: string };

export type WorldSubjectRef = WorldPrincipalRef
  | { type: 'asset'; assetId: string }
  | { type: 'location'; location: WorldLocationRef };

export type AssetPlacement =
  | { type: 'character'; characterId: CharacterId }
  | { type: 'location'; location: WorldLocationRef }
  | { type: 'asset'; assetId: string };

export interface CharacterWorldPatch {
  alive?: boolean;
  location?: WorldLocationRef | null;
  currentActivity?: 'idle' | 'travelling' | 'imprisoned' | 'missing';
}

export interface TitleWorldPatch {
  lawfulHolderId?: CharacterId | null;
  controllerId?: CharacterId | null;
  contestedByIds?: CharacterId[];
}

export interface AssetWorldPatch {
  kind: 'item' | 'site' | 'vehicle';
  lawfulOwner?: WorldPrincipalRef | null;
  controller?: WorldPrincipalRef | null;
  custodian?: WorldCustodianRef | null;
  placement?: AssetPlacement | null;
  equippedPosition?: EquipmentPosition | null;
  status?: 'normal' | 'stolen' | 'contested' | 'inheritance_pending';
}

export type WorldIntent =
  | { kind: 'mention'; actorId: CharacterId; targetRef?: WorldSubjectRef; evidenceText: string }
  | { kind: 'plan_travel' | 'start_travel' | 'advance_travel' | 'arrive' | 'move_inside_location'; actorId: CharacterId; targetRef?: WorldSubjectRef; elapsedTime?: WorldDateAdvance; evidenceText: string }
  | { kind: 'gift_asset'; actorId: CharacterId; assetId: string; recipientId: CharacterId; evidenceText: string }
  | { kind: 'steal_asset'; actorId: CharacterId; assetId: string; evidenceText: string }
  | { kind: 'transfer_asset'; actorId: CharacterId; assetId: string; placement: AssetPlacement; evidenceText: string }
  | { kind: 'equip_asset'; actorId: CharacterId; assetId: string; position: EquipmentPosition; evidenceText: string }
  | { kind: 'unequip_asset'; actorId: CharacterId; assetId: string; placement: AssetPlacement; evidenceText: string }
  | { kind: 'grant_title' | 'inherit_title' | 'settle_title_war'; actorId: CharacterId; titleId: string; recipientId: CharacterId; evidenceText: string }
  | { kind: 'revoke_title'; actorId: CharacterId; titleId: string; holderId: CharacterId; evidenceText: string }
  | { kind: 'occupy_title'; actorId: CharacterId; titleId: string; evidenceText: string };

export interface WorldRuntimeState {
  schemaVersion: 1;
  revision: number;
  characters: Record<CharacterId, CharacterWorldPatch>;
  titles: Record<string, TitleWorldPatch>;
  assets: Record<string, AssetWorldPatch>;
  events: WorldEvent[];
  pendingTransactions: PendingWorldTransaction[];
}
```

Define `WorldEvent` with `id`, `transactionId`, `turn`, `date`, `type`, `actorIds`, `subjectRefs`, optional `location`, `reason`, `source`, optional `canonicalEventId` and `visibility: 'public' | 'secret'`. Define `PendingWorldTransaction` with stable `id`, status, source, conflict keys, intents, optional `itemCommands: ItemStateCommand[]` and optional rejection reason. Use `null` only as an explicit relation clear; missing fields mean “read baseline”.

- [ ] **Step 4: Implement state creation and validation**

In `worldRuntimeState.ts`, implement:

```ts
export function createWorldRuntimeState(): WorldRuntimeState;
export function cloneWorldRuntimeState(state: WorldRuntimeState): WorldRuntimeState;
export function validateWorldRuntimeState(value: unknown): asserts value is WorldRuntimeState;
```

Validation must reject negative/non-integer revision, malformed IDs, duplicate event IDs, duplicate pending transaction IDs, direct self-containment, an equipped asset without character placement, and an equipped asset whose custodian is a different character.

- [ ] **Step 5: Add the state to GameState and new-game initialization**

Set `ITEM_SAVE_FORMAT_VERSION = 8`, change `GameState.saveFormatVersion` to literal `8`, add:

```ts
worldRuntime: WorldRuntimeState;
```

Initialize it with `createWorldRuntimeState()` in both `INITIAL_GAME_STATE` and `startNewGame`. Update database validation to reject format 7 with the existing test-version reset message.

- [ ] **Step 6: Register and run tests**

Add:

```json
"test:world-runtime-state": "node scripts/test-world-runtime-state.mjs"
```

Run:

```bash
npm run test:world-runtime-state
npm run test:location-authority
npm run test:item-save-version
```

Expected: all pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/features/world/worldRuntimeTypes.ts src/features/world/worldRuntimeState.ts src/types/game.ts src/features/items/saveVersion.ts src/store/useGameStore.ts src/services/db.ts scripts/test-world-runtime-state.mjs scripts/test-location-authority.mjs scripts/test-item-save-version.mjs scripts/test-map-integration.mjs scripts/test-map-travel.mjs scripts/test-turn-pipeline.mjs package.json
git commit -m "feat: add sparse world runtime state"
```

### Task 2: 建立静态基线适配器与三态投影

**Files:**
- Create: `src/features/world/worldBaseline.ts`
- Create: `src/features/world/worldProjection.ts`
- Create: `scripts/test-world-projection.mjs`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldRuntimeState` from Task 1; existing `StaticCharacterRecord`, `CharacterProjection`, `WorldArtifactState`, `ItemSystemState`, map location and political title records.
- Produces: `WorldBaselineRequest`, `WorldBaselineRepository.loadSnapshot()`, `WorldBaselineSnapshot`, `projectWorldCharacter()`, `projectWorldTitle()`, `projectWorldAsset()`, `resolveAssetMapLocation()`.

- [ ] **Step 1: Write failing projection tests**

Cover missing/`null`/concrete override semantics and recursive containers:

```js
const baseline = createWorldBaselineSnapshot({
  characters: [{ id: 'agot:Stark_3', alive: true, location: { locationId: 'b_winterfell' } }],
  titles: [{ id: 'c_winterfell', lawfulHolderId: 'agot:Stark_3', controllerId: 'agot:Stark_3', contestedByIds: [] }],
  assets: [
    { id: 'wagon', kind: 'vehicle', lawfulOwner: null, controller: null, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' },
    { id: 'sword', kind: 'item', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' },
  ],
  knownLocationIds: ['b_winterfell'],
});
const emptyState = createWorldRuntimeState();
const withVacancy = { ...emptyState, titles: { c_winterfell: { lawfulHolderId: null } } };
const cyclicBaseline = createWorldBaselineSnapshot({
  characters: [],
  titles: [],
  assets: [
    { id: 'wagon', kind: 'vehicle', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'sword' }, placement: { type: 'asset', assetId: 'sword' }, equippedPosition: null, status: 'normal' },
    { id: 'sword', kind: 'item', lawfulOwner: null, controller: null, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' },
  ],
  knownLocationIds: [],
});
assert.equal(projectWorldTitle(baseline, emptyState, 'c_winterfell').lawfulHolderId, 'agot:Stark_3');
assert.equal(projectWorldTitle(baseline, withVacancy, 'c_winterfell').lawfulHolderId, null);
assert.deepEqual(resolveAssetMapLocation(baseline, emptyState, 'sword'), { locationId: 'b_winterfell' });
assert.throws(() => resolveAssetMapLocation(cyclicBaseline, emptyState, 'sword'), /资产容器形成循环/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-projection.mjs`

Expected: FAIL because `worldProjection.ts` is missing.

- [ ] **Step 3: Define the baseline snapshot**

In `worldBaseline.ts`, define complete current-state records rather than patches:

```ts
export interface WorldCharacterBaseline {
  id: CharacterId;
  alive: boolean;
  location: WorldLocationRef | null;
}

export interface WorldTitleBaseline {
  id: string;
  lawfulHolderId: CharacterId | null;
  controllerId: CharacterId | null;
  contestedByIds: CharacterId[];
}

export interface WorldAssetBaseline {
  id: string;
  kind: 'item' | 'site' | 'vehicle';
  lawfulOwner: WorldPrincipalRef | null;
  controller: WorldPrincipalRef | null;
  custodian: WorldCustodianRef | null;
  placement: AssetPlacement | null;
  equippedPosition: EquipmentPosition | null;
  status: 'normal' | 'stolen' | 'contested' | 'inheritance_pending';
}

export interface WorldBaselineSnapshot {
  characters: ReadonlyMap<CharacterId, WorldCharacterBaseline>;
  titles: ReadonlyMap<string, WorldTitleBaseline>;
  assets: ReadonlyMap<string, WorldAssetBaseline>;
  knownLocationIds: ReadonlySet<string>;
}
```

Provide `createWorldBaselineSnapshot(input)` accepting arrays for `characters`, `titles`, `assets` and `knownLocationIds`; convert them to readonly maps/sets and reject duplicate IDs.

- [ ] **Step 4: Implement on-demand baseline loading**

Define:

```ts
export interface WorldBaselineRequest {
  characterIds: CharacterId[];
  titleIds: string[];
  assetIds: string[];
  locationIds: string[];
}

export interface WorldBaselineRepositoryDependencies {
  characters: StaticCharacterRepository;
  map: typeof mapRepository;
  loadAssets: (assetIds: readonly string[]) => Promise<WorldAssetBaseline[]>;
}

export class WorldBaselineRepository {
  constructor(dependencies: WorldBaselineRepositoryDependencies);
  loadSnapshot(request: WorldBaselineRequest): Promise<WorldBaselineSnapshot>;
}
```

`loadSnapshot()` loads only requested character shards and map records, plus directly referenced containers and owners needed to resolve those assets. Add a test repository counter and assert requesting one character never calls the full character search/index enumeration path.

- [ ] **Step 5: Implement projection and recursive position resolution**

Implement:

```ts
export function projectWorldCharacter(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  characterId: CharacterId,
): WorldCharacterBaseline | undefined;

export function projectWorldTitle(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  titleId: string,
): WorldTitleBaseline | undefined;

export function projectWorldAsset(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  assetId: string,
): WorldAssetBaseline | undefined;

export function resolveAssetMapLocation(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  assetId: string,
): WorldLocationRef | null;
```

Use own-property checks, not nullish coalescing, so missing and explicit `null` remain different. Resolve character placement through `projectWorldCharacter`; resolve asset containers recursively with a visited set.

- [ ] **Step 6: Register and run tests**

Add `test:world-projection` to `package.json`, then run:

```bash
npm run test:world-projection
npm run test:world-runtime-state
```

Expected: all pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/features/world/worldBaseline.ts src/features/world/worldProjection.ts src/features/characters/staticCharacterRepository.ts src/features/map/repository.ts scripts/test-world-projection.mjs package.json
git commit -m "feat: project world baseline overrides"
```

### Task 3: 统一世界事件和对象索引

**Files:**
- Create: `src/features/world/worldEventIndex.ts`
- Create: `scripts/test-world-event-index.mjs`
- Modify: `src/features/world/worldHistory.ts`
- Modify: `src/features/world/worldHistoryProjection.ts`
- Modify: `src/features/world/canonicalTimeline.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/features/map/politicalProjection.ts`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `src/services/db.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `scripts/test-world-history.mjs`
- Modify: `scripts/test-world-history-projection.mjs`
- Modify: `scripts/test-map-political-projection.mjs`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `scripts/test-unified-turn-integration.mjs`
- Modify: `scripts/test-world-turn-context.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldRuntimeState.events` and `WorldEvent` from Task 1.
- Produces: `WorldEventIndex`, `buildWorldEventIndex()`, `eventsForCharacter()`, `eventsForLocation()`, `eventsForAsset()`, `eventsForTitle()`.

- [ ] **Step 1: Write failing index tests**

```js
const events = [
  eventFixture({ id: 'e1', actorIds: ['agot:Stark_3'], subjectRefs: [{ type: 'asset', assetId: 'ice' }], location: { locationId: 'b_winterfell' } }),
  eventFixture({ id: 'e2', actorIds: [], subjectRefs: [{ type: 'title', titleId: 'c_winterfell' }] }),
];
const index = buildWorldEventIndex(events);
assert.deepEqual(eventsForCharacter(events, index, 'agot:Stark_3').map((event) => event.id), ['e1']);
assert.deepEqual(eventsForAsset(events, index, 'ice').map((event) => event.id), ['e1']);
assert.deepEqual(eventsForLocation(events, index, 'b_winterfell').map((event) => event.id), ['e1']);
assert.deepEqual(eventsForTitle(events, index, 'c_winterfell').map((event) => event.id), ['e2']);
```

Also assert that duplicate event IDs and index references to absent IDs throw.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-event-index.mjs`

Expected: FAIL because the index module does not exist.

- [ ] **Step 3: Implement one canonical event index**

Define:

```ts
export interface WorldEventIndex {
  byCharacterId: Map<CharacterId, string[]>;
  byLocationId: Map<string, string[]>;
  byAssetId: Map<string, string[]>;
  byTitleId: Map<string, string[]>;
}
```

Deduplicate each event within an index even when the same character appears as both actor and subject. Preserve global event order.

- [ ] **Step 4: Replace persisted duplicate facts with event IDs**

Change `WorldTurnRecord` to store:

```ts
eventIds: string[];
```

Remove persisted `facts`. Keep `ResolvedTurnFacts.facts` as an ephemeral narration view until Task 10. Update history projection functions to accept the canonical event array or index rather than reading duplicated facts from turns.

- [ ] **Step 5: Run history and index tests**

```bash
npm run test:world-event-index
npm run test:world-history
npm run test:world-history-projection
```

Expected: all pass and no persisted turn contains a `facts` property.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/features/world/worldEventIndex.ts src/features/world/worldHistory.ts src/features/world/worldHistoryProjection.ts src/features/world/canonicalTimeline.ts src/features/world/worldTurnContext.ts src/features/map/politicalProjection.ts src/components/StoryFeed.tsx src/services/db.ts src/services/turnResolution.ts src/store/useGameStore.ts scripts/test-world-event-index.mjs scripts/test-world-history.mjs scripts/test-world-history-projection.mjs scripts/test-map-political-projection.mjs scripts/test-map-travel.mjs scripts/test-turn-pipeline.mjs scripts/test-unified-turn-integration.mjs scripts/test-world-turn-context.mjs package.json
git commit -m "refactor: index canonical world events"
```

### Task 4: 建立幂等原子事务引擎

**Files:**
- Create: `src/features/world/worldTransactions.ts`
- Create: `scripts/test-world-transactions.mjs`
- Modify: `src/features/world/worldRuntimeTypes.ts`
- Modify: `src/features/world/worldRuntimeState.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldBaselineSnapshot`, projections from Task 2, `WorldRuntimeState`, `ItemSystemState`, `ActiveJourney`, `WorldDate`.
- Produces: `WorldMutation`, `WorldTransaction`, `WorldCommitSlice`, `WorldTransactionResult`, `commitWorldTransaction()`.

- [ ] **Step 1: Write failing atomicity and idempotency tests**

```js
const transaction = {
  id: 'tx:gift-ice',
  source: 'player_input',
  reason: '艾德正式把寒冰赠予琼恩',
  mutations: [
    { type: 'asset.set-lawful-owner', assetId: 'ice', owner: { type: 'character', characterId: 'agot:Stark_7' } },
    { type: 'asset.place', assetId: 'ice', placement: { type: 'character', characterId: 'agot:Stark_7' } },
  ],
};
const first = commitWorldTransaction(input, baseline, transaction);
assert.equal(first.ok, true);
assert.equal(first.state.runtime.revision, 1);
assert.equal(first.state.runtime.events[0].transactionId, 'tx:gift-ice');
const second = commitWorldTransaction(first.state, baseline, transaction);
assert.equal(second.ok, true);
assert.equal(second.state.runtime.revision, 1);
assert.equal(second.state.runtime.events.length, 1);

const transactionWithUnknownAsset = {
  ...transaction,
  id: 'tx:unknown',
  mutations: [{ type: 'asset.place', assetId: 'missing', placement: null }],
};
const rejected = commitWorldTransaction(input, baseline, transactionWithUnknownAsset);
assert.equal(rejected.ok, false);
assert.deepEqual(rejected.state, input);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-transactions.mjs`

Expected: FAIL because `commitWorldTransaction` is missing.

- [ ] **Step 3: Define mutation and commit contracts**

Add these mutation families:

```ts
export type WorldMutation =
  | { type: 'character.move'; characterId: CharacterId; location: WorldLocationRef; activity?: CharacterWorldPatch['currentActivity'] }
  | { type: 'character.set-alive'; characterId: CharacterId; alive: boolean }
  | { type: 'title.set-holder'; titleId: string; holderId: CharacterId | null }
  | { type: 'title.set-controller'; titleId: string; controllerId: CharacterId | null; contestedByIds?: CharacterId[] }
  | { type: 'asset.set-lawful-owner'; assetId: string; owner: WorldPrincipalRef | null }
  | { type: 'asset.set-controller'; assetId: string; controller: WorldPrincipalRef | null }
  | { type: 'asset.set-custodian'; assetId: string; custodian: WorldCustodianRef | null }
  | { type: 'asset.place'; assetId: string; placement: AssetPlacement | null }
  | { type: 'asset.equip'; assetId: string; characterId: CharacterId; position: EquipmentPosition }
  | { type: 'asset.unequip'; assetId: string }
  | { type: 'asset.set-status'; assetId: string; status: AssetWorldPatch['status'] }
  | { type: 'asset.delete-runtime-patch'; assetId: string };
```

Define:

```ts
export interface WorldCommitSlice {
  runtime: WorldRuntimeState;
  items: ItemSystemState;
  journey?: ActiveJourney;
  date: WorldDate;
}

export interface WorldTransaction {
  id: string;
  turn: number;
  source: WorldEvent['source'];
  reason: string;
  intents: WorldIntent[];
  mutations: WorldMutation[];
  dateAdvance?: WorldDateAdvance;
  itemCommands?: ItemStateCommand[];
  nextJourney?: ActiveJourney | null;
  eventDrafts: Array<Omit<WorldEvent, 'id' | 'transactionId' | 'turn' | 'date' | 'source'>>;
}

export type WorldTransactionResult =
  | { ok: true; state: WorldCommitSlice; transactionId: string; duplicate: boolean; events: WorldEvent[] }
  | { ok: false; state: WorldCommitSlice; transactionId: string; reason: string };

export function commitWorldTransaction(
  state: WorldCommitSlice,
  baseline: WorldBaselineSnapshot,
  transaction: WorldTransaction,
): WorldTransactionResult;
```

- [ ] **Step 4: Implement validate-then-apply on clones**

The function must:

1. Return the existing committed result without changes when `transaction.id` already appears in an event.
2. Clone runtime, item state and journey before mutation.
3. Apply intrinsic `itemCommands` to the cloned `ItemSystemState`, rebuild the item-derived asset baseline, and keep the original baseline untouched.
4. Validate all IDs, placement targets, equipment relationships and final container graph against the rebuilt baseline.
5. Apply all world mutations to the clone.
6. Append deterministic event records only after every validation passes.
7. Increment revision once per transaction, not per mutation.
8. Return the original input references on failure.

- [ ] **Step 5: Run transaction and projection tests**

```bash
npm run test:world-transactions
npm run test:world-projection
npm run test:world-runtime-state
```

Expected: all pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/features/world/worldTransactions.ts src/features/world/worldRuntimeTypes.ts src/features/world/worldRuntimeState.ts scripts/test-world-transactions.mjs package.json
git commit -m "feat: commit atomic world transactions"
```

## Milestone 2：资产、队列、旅行与确定性连锁

### Task 5: 把现有玩家物品和 AGOT 世界物品适配为统一资产基线

**Files:**
- Modify: `src/features/world/worldBaseline.ts`
- Modify: `src/features/items/worldArtifacts.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `src/features/items/types.ts`
- Create: `scripts/test-world-asset-baseline.mjs`
- Modify: `scripts/test-world-history-projection.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ItemSystemState`, `WorldArtifactState`, player `CharacterId` and map locations.
- Produces: `buildWorldAssetBaseline()`, `createWorldAssetBaselineLoader()`, stable asset IDs for items, sites and vehicles; wires the loader into `WorldBaselineRepository`.

- [ ] **Step 1: Write failing baseline-isolation tests**

Test one equipped player item, one item in a wagon, one AGOT world item held by an NPC, and one title-held site asset. Assert:

```js
assert.deepEqual(assets.get('player:item:cloak').placement, { type: 'character', characterId: playerId });
assert.deepEqual(assets.get('player:item:cloak').equippedPosition, { group: 'torso', layer: 'outerwear' });
assert.deepEqual(assets.get('player:item:book').placement, { type: 'asset', assetId: 'vehicle:wagon-1' });
assert.equal(assets.get('agot-artifact:longclaw').equippedPosition, null);
assert.equal(assets.get('agot-artifact:longclaw').custodian.characterId, 'agot:Mormont_2');
```

Also assert that mere lawful control never creates an equipped position.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-asset-baseline.mjs`

Expected: FAIL because `buildWorldAssetBaseline` is missing.

- [ ] **Step 3: Implement stable asset adapters**

Use these namespaces:

```text
item:<instanceId>
site:<siteId>
vehicle:<vehicleId>
world-item:<worldArtifactInstanceId>
```

Map existing `ItemPlacement` to `AssetPlacement`; convert item sites and vehicles into assets; convert every map `castle`、`city`、`village` location into `site:<locationId>` and preserve its location placement so county membership can be resolved through the map repository; convert `WorldArtifactRecord` lawful controller, placement and explicit equipped position without guessing `allowedPositions[0]`.

`createWorldAssetBaselineLoader(getItemState, getWorldArtifacts, mapRepository)` returns the `loadAssets(assetIds)` dependency defined in Task 2. It may index all current player item instances and the few hundred generated world artifacts once per `worldRuntime.revision`, but it must return only requested asset records and their direct container chain.

- [ ] **Step 4: Remove asset-relation semantics from item intrinsic state**

Keep `ItemInstance.quantity`, charges, durability, quality, custom name, renown and item-specific history. Mark `lawfulControllerId` as deprecated in type comments and stop reading it in new projections. Do not delete it until Task 15 removes parallel reads.

- [ ] **Step 5: Run asset, item and world projection tests**

```bash
npm run test:world-asset-baseline
npm run test:item-equipment
npm run test:item-custody
npm run test:world-history-projection
```

Expected: all pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/features/world/worldBaseline.ts src/features/items/worldArtifacts.ts src/features/items/types.ts src/features/map/repository.ts scripts/test-world-asset-baseline.mjs scripts/test-world-history-projection.mjs package.json
git commit -m "feat: adapt items into world assets"
```

### Task 6: 实现赠予、偷窃、转移、装备和死亡遗留规则

**Files:**
- Create: `src/features/world/worldAssetRules.ts`
- Create: `scripts/test-world-asset-rules.mjs`
- Modify: `src/features/world/worldRuntimeTypes.ts`
- Modify: `src/features/world/worldTransactions.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: projections and transaction contracts from Tasks 2 and 4.
- Produces: `planAssetIntent()`, `planCharacterDeathAssets()`.

- [ ] **Step 1: Write failing rule tests**

Cover these exact outcomes:

```js
const gift = planAssetIntent(giftIntent, context);
assert.deepEqual(mutationTypes(gift), [
  'asset.set-lawful-owner',
  'asset.set-controller',
  'asset.set-custodian',
  'asset.place',
  'asset.set-status',
]);

const theft = planAssetIntent(theftIntent, context);
assert.equal(mutationOf(theft, 'asset.set-lawful-owner'), undefined);
assert.equal(mutationOf(theft, 'asset.set-status').status, 'stolen');

const equip = planAssetIntent(equipIntent, context);
assert.deepEqual(mutationOf(equip, 'asset.equip').position, { group: 'mainhand' });
assert.throws(() => planAssetIntent(remoteEquipIntent, context), /不在人物直接保管范围/);

const death = planCharacterDeathAssets(deadCharacterId, context);
assert.ok(death.some((mutation) => mutation.type === 'asset.unequip'));
assert.ok(death.some((mutation) => mutation.type === 'asset.set-status' && mutation.status === 'inheritance_pending'));
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-asset-rules.mjs`

Expected: FAIL because rule planners do not exist.

- [ ] **Step 3: Implement asset intents**

Support these resolved intent payloads:

```ts
type AssetWorldIntent = Extract<WorldIntent, {
  kind: 'gift_asset' | 'steal_asset' | 'transfer_asset' | 'equip_asset' | 'unequip_asset'
}>;
```

Gift changes all four relations; theft never changes lawful owner; transfer changes placement and direct custodian but not lawful owner unless the intent is gift; equip requires character placement and custodian match.

- [ ] **Step 4: Implement death cascade**

For every asset whose resolved placement is the dead character:

- emit `asset.unequip` when equipped;
- keep vehicle-contained assets in the vehicle;
- place directly carried assets at the death `WorldLocationRef`;
- set inheritable lawful assets to `inheritance_pending`;
- do not choose an heir in this transaction.

- [ ] **Step 5: Run relevant tests**

```bash
npm run test:world-asset-rules
npm run test:world-transactions
npm run test:health-and-equipment-unified
npm run test:item-equipment
```

Expected: all pass.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/features/world/worldAssetRules.ts src/features/world/worldRuntimeTypes.ts src/features/world/worldTransactions.ts scripts/test-world-asset-rules.mjs package.json
git commit -m "feat: add deterministic world asset rules"
```

### Task 7: 用统一待处理事务替换物品和旅行的平行队列

**Files:**
- Create: `src/features/world/worldTransactionQueue.ts`
- Create: `scripts/test-world-transaction-queue.mjs`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/features/items/itemActionQueue.ts`
- Modify: `src/features/map/JourneyPanel.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/TravelPlanner.tsx`
- Modify: `src/components/ActionDock.tsx`
- Modify: `src/components/items/EquipmentPanel.tsx`
- Modify: `src/components/items/ItemManagementPanel.tsx`
- Modify: `src/services/api.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-character-store.mjs`
- Modify: `scripts/test-equipment-queue-store.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `scripts/test-unified-turn-integration.mjs`
- Modify: `scripts/test-item-action-queue.mjs`
- Modify: `scripts/check-item-equipment-ui.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PendingWorldTransaction`, existing `PendingItemAction`, `TravelStateCommand`.
- Produces: `enqueueWorldTransaction()`, `cancelWorldTransaction()`, `settleWorldTransactionStatus()`, `itemActionToWorldIntent()`, `travelCommandToWorldIntent()`.

- [ ] **Step 1: Write failing queue tests**

```js
const queued = enqueueWorldTransaction([], equipTx);
assert.equal(queued[0].status, 'pending');
const replaced = enqueueWorldTransaction(queued, unequipSameAssetTx);
assert.deepEqual(replaced.map((entry) => entry.id), [unequipSameAssetTx.id]);
const cancelled = cancelWorldTransaction(replaced, unequipSameAssetTx.id);
assert.equal(cancelled[0].status, 'cancelled');
assert.equal(cancelled[0].rejectionReason, undefined);
assert.throws(() => cancelWorldTransaction(cancelled, unequipSameAssetTx.id), /只能取消待处理事务/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-transaction-queue.mjs`

Expected: FAIL because the queue module is missing.

- [ ] **Step 3: Implement conflict keys and cancellation**

Use stable conflict keys:

```text
asset:<assetId>
equipment:<characterId>:<serializedPosition>
journey:<characterId>
title:<titleId>
```

A new pending transaction removes only older pending entries sharing a conflict key. Committed, rejected and cancelled entries are immutable.

- [ ] **Step 4: Replace Zustand local queue fields**

Remove `pendingItemActions` and `pendingTravelCommand` from `GameStore`. Add:

```ts
queueWorldTransaction: (transaction: PendingWorldTransaction) => void;
cancelWorldTransaction: (transactionId: string) => void;
```

Store the queue at `gameState.worldRuntime.pendingTransactions`, so save/reload preserves pending operations.

- [ ] **Step 5: Adapt existing item and journey UI**

Keep current buttons and dialogs. Convert their existing actions into world intents at the boundary. The original action location must render “取消” while pending; do not add a global “1 项调整待生效” cancellation bar.

Use this conversion table so no existing item action bypasses the transaction:

| Existing action | Pending transaction payload |
|---|---|
| `acquire` | `ITEM_CREATE` plus a transfer relation intent for the newly created asset |
| `equip` / `unequip` | equip/unequip relation intent |
| `transfer` / `gift` / `discard` | transfer/gift relation intent; discard clears placement and custodian |
| `split` | `ITEM_SPLIT` plus copied lawful/control/custody relations for the new asset and its requested placement |
| `merge` | `ITEM_MERGE` plus `asset.delete-runtime-patch` for the consumed asset |
| `use` / `repair` / `damage` / `mark_heirloom` | intrinsic item command plus a world event draft; no fabricated ownership change |

- [ ] **Step 6: Run queue and UI tests**

```bash
npm run test:world-transaction-queue
npm run test:item-action-queue
npm run check:item-equipment-ui
npm run check:map-travel-ui
```

Expected: all pass and structural checks find no `pendingItemActions` or `pendingTravelCommand` store fields.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/features/world/worldTransactionQueue.ts src/store/useGameStore.ts src/features/items/itemActionQueue.ts src/features/map/JourneyPanel.tsx src/features/map/MapDrawer.tsx src/features/map/TravelPlanner.tsx src/components/ActionDock.tsx src/components/items/EquipmentPanel.tsx src/components/items/ItemManagementPanel.tsx src/services/api.ts src/services/promptBuilder.ts src/services/turnResolution.ts scripts/test-world-transaction-queue.mjs scripts/test-item-action-queue.mjs scripts/test-character-store.mjs scripts/test-equipment-queue-store.mjs scripts/test-location-authority.mjs scripts/test-map-travel.mjs scripts/test-turn-pipeline.mjs scripts/test-unified-turn-integration.mjs scripts/check-item-equipment-ui.mjs package.json
git commit -m "refactor: unify pending world actions"
```

### Task 8: 让旅行原子移动人物、同行者、车辆和容器资产

**Files:**
- Create: `src/features/world/worldTravelRules.ts`
- Create: `scripts/test-world-travel-linkage.mjs`
- Modify: `src/features/map/travel/journeyReducer.ts`
- Modify: `src/features/map/travel/travelCommands.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `advanceJourney()`, `AtomicWorldPatch`, `WorldTransaction`, baseline/projections.
- Produces: `planJourneyTransaction()`, `planExplicitArrivalTransaction()`.

- [ ] **Step 1: Write failing linkage tests**

Create a journey from Winterfell to Castle Black with player, companion, wagon and a book in the wagon. Assert after one committed arrival:

```js
assert.equal(projectWorldCharacter(baseline, runtime, playerId).location.locationId, 'b_castle_black');
assert.equal(projectWorldCharacter(baseline, runtime, companionId).location.locationId, 'b_castle_black');
assert.deepEqual(resolveAssetMapLocation(baseline, runtime, 'vehicle:wagon'), { locationId: 'b_castle_black' });
assert.deepEqual(resolveAssetMapLocation(baseline, runtime, 'item:book'), { locationId: 'b_castle_black' });
assert.equal(result.state.date.day, expectedArrivalDay);
assert.equal(result.state.runtime.revision, 1);
```

Also assert an invalid companion location rejects the entire transaction without moving the player.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-travel-linkage.mjs`

Expected: FAIL because journey patches are not world transactions.

- [ ] **Step 3: Convert AtomicWorldPatch to mutations**

Implement:

```ts
export function planJourneyTransaction(
  patch: AtomicWorldPatch,
  context: WorldTravelRuleContext,
): WorldTransaction;
```

Emit one `character.move` for player and each companion, one `asset.place` for each vehicle, and no per-item move for vehicle contents. Advance date once using `patch.elapsedDays` in the commit result.

- [ ] **Step 4: Implement explicit jump-time arrival**

`planExplicitArrivalTransaction()` must route from the current projected location, compare declared elapsed time against `RoutePlan.totalDays`, and either:

- commit full arrival when sufficient;
- advance only legal route progress when the player explicitly departed but time is insufficient;
- reject movement when the input only asserts arrival with no valid journey or elapsed time.

- [ ] **Step 5: Integrate turn resolution**

Make `settleTurnDraft` collect pending travel intents, call the existing route engine, convert the result into one world transaction, and commit it before narration. Remove direct writes that independently change `lord.location`, companion events and vehicle locations.

- [ ] **Step 6: Run travel and location tests**

```bash
npm run test:world-travel-linkage
npm run test:map-travel
npm run test:map-integration
npm run test:location-authority
```

Expected: all pass.

- [ ] **Step 7: Commit Task 8**

```bash
git add src/features/world/worldTravelRules.ts src/features/map/travel/journeyReducer.ts src/features/map/travel/travelCommands.ts src/services/turnResolution.ts scripts/test-world-travel-linkage.mjs scripts/test-map-travel.mjs scripts/test-map-integration.mjs package.json
git commit -m "feat: link travel to world entities"
```

### Task 9: 实现头衔法理归属、实际控制和争议状态

**Files:**
- Create: `src/features/world/worldTitleRules.ts`
- Create: `scripts/test-world-title-rules.mjs`
- Modify: `src/features/map/politicalProjection.ts`
- Modify: `src/features/world/worldHistory.ts`
- Modify: `scripts/test-map-political-projection.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: title projections and transactions.
- Produces: `planTitleIntent()`, `projectPoliticalState()` support for lawful holder and controller.

- [ ] **Step 1: Write failing title-rule tests**

```js
const occupation = planTitleIntent({ kind: 'occupy_title', titleId: 'c_winterfell', actorId: boltonId, evidenceText: '我军已经控制临冬城' }, context);
assert.equal(mutationOf(occupation, 'title.set-holder'), undefined);
assert.equal(mutationOf(occupation, 'title.set-controller').controllerId, boltonId);

const grant = planTitleIntent({ kind: 'grant_title', titleId: 'c_winterfell', actorId: kingId, recipientId: starkId, evidenceText: '国王正式册封史塔克' }, context);
assert.equal(mutationOf(grant, 'title.set-holder').holderId, starkId);
assert.equal(mutationOf(grant, 'title.set-controller').controllerId, starkId);
assert.deepEqual(mutationOf(grant, 'title.set-controller').contestedByIds, []);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-title-rules.mjs`

Expected: FAIL because title rule planner is missing.

- [ ] **Step 3: Implement title intents**

Support:

```ts
type TitleWorldIntent = Extract<WorldIntent, {
  kind: 'grant_title' | 'inherit_title' | 'revoke_title' | 'occupy_title' | 'settle_title_war'
}>;
```

Only formal grant, inheritance, revocation and formal war settlement alter lawful holder. Occupation changes controller and contested IDs.
Site assets keep a title principal reference rather than copying the current holder ID; changing a title controller therefore changes effective site control through projection without emitting one mutation per castle, city or village.

- [ ] **Step 4: Update political projection**

Political fill uses lawful holder style. Expose controller style and `isContested` separately for a border layer. Never replace lawful fill with controller fill.

- [ ] **Step 5: Run title and map tests**

```bash
npm run test:world-title-rules
npm run test:map-political-projection
npm run test:map-semantic-projection
```

Expected: all pass.

- [ ] **Step 6: Commit Task 9**

```bash
git add src/features/world/worldTitleRules.ts src/features/map/politicalProjection.ts src/features/world/worldHistory.ts scripts/test-world-title-rules.mjs scripts/test-map-political-projection.mjs package.json
git commit -m "feat: separate title ownership and control"
```

## Milestone 3：人物卷宗、地图和资产界面共享投影

### Task 10: 建立缓存选择器和人物资产分组

**Files:**
- Create: `src/features/world/worldSelectors.ts`
- Create: `src/components/items/WorldAssetSections.tsx`
- Create: `scripts/test-world-selectors.mjs`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/characters/useCharacterDossier.ts`
- Modify: `src/components/items/HealthAndEquipmentPanel.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-health-and-equipment-unified.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: baseline, runtime, event index and map UI navigation.
- Produces: `selectCharacterWorldView()`, `selectCharacterAssetGroups()`, `selectActualEquipment()`, `selectWorldAssetView()`, `WorldAssetSections`.

- [ ] **Step 1: Write failing selector tests**

For one character with an equipped sword, carried book, owned remote castle, controlled disputed warehouse and wagon, assert exact groups:

```js
assert.deepEqual(view.equipment.map(id), ['item:sword']);
assert.deepEqual(view.carried.map(id), ['item:book']);
assert.deepEqual(view.ownedElsewhere.map(id), ['site:castle']);
assert.deepEqual(view.controlled.map(id), ['site:warehouse']);
assert.deepEqual(view.vehicles.map(id), ['vehicle:wagon']);
assert.equal(view.location.locationId, 'b_winterfell');
```

Assert the sword never appears in both equipment and carried groups, and a lawfully owned but remote asset never appears as actual equipment.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-selectors.mjs`

Expected: FAIL because selectors do not exist.

- [ ] **Step 3: Implement revision-keyed selectors**

Cache by `(runtime.revision, characterId)` and expose immutable arrays. Build groups from relationship fields, not item category names.

- [ ] **Step 4: Update the dossier projection**

Add to the dossier view model:

```ts
worldLocation: WorldLocationRef | null;
worldActivity: CharacterWorldPatch['currentActivity'];
assetGroups: CharacterAssetGroups;
worldEvents: WorldEvent[];
```

Current titles must be reverse-projected from `lawfulHolderId`; do not store a second title list in character runtime patches.

- [ ] **Step 5: Replace health/equipment and asset tab reads**

`HealthAndEquipmentPanel` reads only `selectActualEquipment()`. `WorldAssetSections` renders current carry, custody, remote ownership, control, site and vehicle groups. Each card receives explicit `onOpenCharacter`, `onOpenLocation` and `onOpenAsset` callbacks.

- [ ] **Step 6: Run dossier and equipment tests**

```bash
npm run test:world-selectors
npm run test:character-dossier
npm run test:health-and-equipment-unified
npm run check:ck3-character-window
```

Expected: all pass and player/NPC use the same selectors.

- [ ] **Step 7: Commit Task 10**

```bash
git add src/features/world/worldSelectors.ts src/components/items/WorldAssetSections.tsx src/features/characters/characterDossier.ts src/features/characters/useCharacterDossier.ts src/components/items/HealthAndEquipmentPanel.tsx src/components/Ck3CharacterWindow.tsx scripts/test-world-selectors.mjs scripts/test-character-dossier.mjs scripts/test-health-and-equipment-unified.mjs package.json
git commit -m "feat: project linked character assets"
```

### Task 11: 增加资产详情抽屉和人物—地点—资产跳转

**Files:**
- Create: `src/components/items/WorldAssetDrawer.tsx`
- Create: `scripts/test-world-ui-linkage.mjs`
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `src/components/items/WorldAssetSections.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `selectWorldAssetView(assetId)`, existing character navigation and `openMap(locationId)`.
- Produces: `openAsset(assetId)`, `selectedAssetId`, asset drawer UI.

- [ ] **Step 1: Write failing UI structure tests**

Assert source contains:

```js
assert.match(mapUiStore, /'asset'/);
assert.match(mapUiStore, /openAsset/);
assert.match(app, /WorldAssetDrawer/);
assert.match(assetDrawer, /法理所有者/);
assert.match(assetDrawer, /实际控制者/);
assert.match(assetDrawer, /当前保管者/);
assert.match(assetDrawer, /物理位置/);
assert.match(characterWindow, /onOpenLocation/);
assert.match(characterWindow, /onOpenAsset/);
```

Also import the store and assert `openAsset('item:ice')` sets `activeDrawer: 'asset'` and `selectedAssetId: 'item:ice'`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-ui-linkage.mjs`

Expected: FAIL because the asset drawer does not exist.

- [ ] **Step 3: Extend drawer navigation state**

Change:

```ts
export type ActiveDrawer = 'map' | 'character' | 'asset' | null;
```

Add `selectedAssetId`, `openAsset(assetId)`, and `returnDrawer` so opening an asset from a dossier can return to that dossier without losing selected character history.

- [ ] **Step 4: Implement the asset drawer**

Render definition image and name, relation rows, resolved location, status and recent events. Unknown references render `资料未能解析` within the affected row; they must not throw the whole drawer.

- [ ] **Step 5: Connect cross-navigation**

- Dossier location row calls `openMap(locationId)`.
- Dossier asset card calls `openAsset(assetId)`.
- Asset character relation calls existing `openStoryCharacter(characterId)`.
- Asset location calls `openMap(locationId)`.
- Asset container calls `openAsset(containerAssetId)`.

- [ ] **Step 6: Run UI linkage and build checks**

```bash
npm run test:world-ui-linkage
npm run check:ck3-character-window
npm run check:map-drawer
```

Expected: all pass.

- [ ] **Step 7: Commit Task 11**

```bash
git add src/components/items/WorldAssetDrawer.tsx src/features/map/mapUiStore.ts src/App.tsx src/components/Ck3CharacterWindow.tsx src/components/items/WorldAssetSections.tsx scripts/test-world-ui-linkage.mjs package.json
git commit -m "feat: link character and asset drawers"
```

### Task 12: 让伯爵领详情显示当前人物、据点、车辆、资产和事件

**Files:**
- Create: `src/features/map/CountyWorldDetails.tsx`
- Modify: `src/features/world/worldSelectors.ts`
- Modify: `src/features/map/LocationDetails.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/dynamicMapSubjects.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `src/features/map/mapStyle.ts`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `scripts/test-map-political-projection.mjs`
- Modify: `scripts/test-world-ui-linkage.mjs`

**Interfaces:**
- Consumes: location/county selectors, title projections, event index and drawer callbacks.
- Produces: `selectCountyWorldView(countyId)`, `CountyWorldDetails`.

- [ ] **Step 1: Extend failing integration tests**

Build a county view with lawful Stark holder, Bolton controller, two important characters, one castle, one wagon and one recent event. Assert:

```js
assert.equal(view.lawfulHolderId, starkId);
assert.equal(view.controllerId, boltonId);
assert.equal(view.isContested, true);
assert.deepEqual(view.characterIds, [starkId, boltonId]);
assert.deepEqual(view.siteAssetIds, ['site:winterfell']);
assert.deepEqual(view.vehicleAssetIds, ['vehicle:wagon']);
assert.deepEqual(view.eventIds, ['event:occupation']);
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm run test:map-integration
npm run test:world-ui-linkage
```

Expected: FAIL because county world view and component are absent.

- [ ] **Step 3: Implement county-scoped selection**

Use location membership to collect only objects whose resolved location belongs to the selected county. Filter characters through the existing importance/current-scene rules; never enumerate all character shards from a map render.

- [ ] **Step 4: Render county details and navigation**

Show lawful lord, actual controller, current important people, castles/cities/villages, vehicles, important assets and recent events. Wire character and asset clicks to App callbacks.

- [ ] **Step 5: Add contested border styling**

Add a dedicated controller/contested line layer. Keep political fill based on lawful holder. Do not restore barony points until a county is selected; existing county-first visibility remains authoritative.

- [ ] **Step 6: Run map verification**

```bash
npm run test:map-integration
npm run test:map-political-projection
npm run test:map-semantic-layers
npm run check:map-drawer
```

Expected: all pass.

- [ ] **Step 7: Commit Task 12**

```bash
git add src/features/map/CountyWorldDetails.tsx src/features/world/worldSelectors.ts src/features/map/LocationDetails.tsx src/features/map/MapDrawer.tsx src/features/map/dynamicMapSubjects.ts src/features/map/mapLayers.ts src/features/map/mapStyle.ts scripts/test-map-integration.mjs scripts/test-map-political-projection.mjs scripts/test-world-ui-linkage.mjs
git commit -m "feat: show linked county world state"
```

## Milestone 4：自然语言、回合结算、LLM 上下文与边界审计

### Task 13: 解析直接和隐含地点意图

**Files:**
- Create: `src/features/world/worldIntentResolver.ts`
- Create: `scripts/test-world-intent-resolver.mjs`
- Modify: `src/services/turnResolution.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/services/api.ts`
- Modify: `src/features/map/locationResolver.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: model-produced `UnresolvedWorldIntent`, map repository search entries, current world slice and route planner.
- Produces: `resolveWorldIntent()`, `resolveWorldIntents()`, updated `TurnResolutionDraft.worldIntents`.

- [ ] **Step 1: Write failing semantic tests**

Use structured model outputs rather than keyword matching:

```js
assert.equal(resolveWorldIntent(unresolvedIntent('mention', '我想起了君临', { targetText: '君临' }), context).kind, 'mention');
assert.equal(resolveWorldIntent(unresolvedIntent('plan_travel', '我准备明日去君临', { targetText: '君临' }), context).kind, 'plan_travel');
assert.equal(resolveWorldIntent(unresolvedIntent('start_travel', '我骑马赶往君临', { targetText: '君临' }), context).kind, 'start_travel');
assert.equal(resolveWorldIntent(unresolvedIntent('arrive', '半个月后，我推开红堡议事厅的门', { targetText: '红堡', sceneLocation: '议事厅', elapsedTime: { days: 15 } }), context).targetRef.location.locationId, 'b_red_keep');
assert.equal(resolveWorldIntent(unresolvedIntent('move_inside_location', '我从大厅走进神木林', { targetText: '临冬城', sceneLocation: '神木林' }), context).targetRef.location.sceneLocation, '神木林');
assert.throws(() => resolveWorldIntent(unresolvedIntent('arrive', '我已经到了君临', { targetText: '君临' }), impossibleContext), /没有可验证的旅程或时间流逝/);
assert.throws(() => resolveWorldIntent(unresolvedIntent('arrive', '我到了城堡', { targetText: '城堡' }), ambiguousContext), /地点无法唯一解析/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-intent-resolver.mjs`

Expected: FAIL because resolver types and functions are missing.

- [ ] **Step 3: Add unresolved model intent schema**

```ts
export interface UnresolvedWorldIntent {
  kind: WorldIntent['kind'];
  actorId?: CharacterId;
  targetText?: string;
  targetId?: string;
  sceneLocation?: string;
  elapsedTime?: WorldDateAdvance;
  evidenceText: string;
}
```

Parse `<world_intent>` JSON alongside `<state_cmd>`. Reject empty evidence and unknown intent kinds. Do not infer movement from raw location words inside application code.

- [ ] **Step 4: Update the resolution prompt**

Give the model the exact distinction table for mention, desire, plan, departure, progress, arrival and internal scene movement. Require it to emit secondary location facts even when conversation, combat or gifting is the primary request.

- [ ] **Step 5: Resolve names to stable references**

Prefer exact stable ID, then alias match, then current/neighboring county context. If multiple candidates remain tied, return a rejected intent and preserve other actions.

- [ ] **Step 6: Run parser, prompt and intent tests**

```bash
npm run test:world-intent-resolver
npm run test:character-prompt
npm run test:map-narrative-context
```

Expected: all pass.

- [ ] **Step 7: Commit Task 13**

```bash
git add src/features/world/worldIntentResolver.ts src/services/turnResolution.ts src/services/promptBuilder.ts src/services/api.ts src/features/map/locationResolver.ts scripts/test-world-intent-resolver.mjs package.json
git commit -m "feat: resolve implicit world intents"
```

### Task 14: 把统一事务接入先结算后叙述和 LLM 世界切片

**Files:**
- Create: `scripts/test-world-context-linkage.mjs`
- Modify: `src/services/turnResolution.ts`
- Modify: `src/services/turnNarration.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/features/characters/sceneCharacterSelector.ts`
- Modify: `src/features/world/worldHistory.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `src/components/TvTimelineModal.tsx`
- Modify: `src/App.tsx`
- Modify: `scripts/test-world-history.mjs`
- Modify: `scripts/test-character-prompt.mjs`
- Modify: `scripts/test-world-ui-linkage.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: resolved intents, pending transactions, transaction planners and world selectors.
- Produces: one committed world result per successful turn; bounded `WorldTurnContext` based on committed projections.

- [ ] **Step 1: Write failing end-to-end settlement test**

Create a turn where the player text primarily greets the king but secondarily states arrival at the Red Keep after sufficient elapsed time. Assert:

```js
assert.equal(settled.worldRuntime.revision, 1);
assert.equal(settled.worldLocation.locationId, 'b_red_keep');
assert.equal(settled.worldRuntime.events.every((event) => event.transactionId === settled.transactionId), true);
assert.equal(settled.worldHistory.turns[0].eventIds.length > 0, true);
assert.match(settled.narrationContext, /红堡/);
assert.doesNotMatch(settled.narrationContext, /b_[a-z0-9_]+/);
```

Add a rejected asset transfer in the same attempted transaction and assert no character, vehicle, date or asset state changes.

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-world-context-linkage.mjs`

Expected: FAIL because turn settlement still commits separate state paths.

- [ ] **Step 3: Build one transaction batch per turn**

Add an asynchronous preparation boundary before the synchronous commit:

```ts
export async function prepareWorldTurn(input: PrepareWorldTurnInput): Promise<PreparedWorldTurn>;
export function settleTurnDraft(input: SettleTurnDraftInput & { preparedWorld: PreparedWorldTurn }): SettledTurn;
```

`prepareWorldTurn` resolves location candidates, collects referenced character/title/asset/location IDs and calls `WorldBaselineRepository.loadSnapshot()` once. `settleTurnDraft` must then:

1. validate legacy non-world commands;
2. resolve model world intents;
3. merge pending UI transactions;
4. expand travel, asset, title and death rules;
5. commit one ordered transaction batch to cloned state;
6. append event IDs to the turn record;
7. mark pending entries committed/rejected;
8. return committed projections for narration.

Use deterministic ordering: time/travel, character life/location, title, asset relations, equipment, event append.
`useGameStore.sendMessage` must `await prepareWorldTurn(...)` before calling the synchronous settlement function; tests that call `settleTurnDraft` directly construct `PreparedWorldTurn` with the same baseline factory.

- [ ] **Step 4: Build LLM context only after commit**

`buildWorldTurnContext` reads current location, nearby county, current-scene characters, actual equipment, accessible assets, title conflicts, active journey, pending entries and recent indexed events from selectors. Apply explicit caps:

```ts
const WORLD_CONTEXT_LIMITS = {
  characters: 12,
  assets: 20,
  events: 12,
  neighboringLocations: 8,
} as const;
```

- [ ] **Step 5: Remove narration authority over state**

The narration request receives committed `WorldEvent` summaries and cannot emit additional state commands. A narration retry reuses the same transaction ID and does not re-run settlement.

- [ ] **Step 6: Link timeline event subjects**

Render `WorldEvent.subjectRefs` in `StoryFeed` and `TvTimelineModal`. Character subjects call `openStoryCharacter`, location subjects call `openMap`, and asset subjects call `openAsset`. Timeline interactions are read-only and must not enqueue transactions or alter the current date.

- [ ] **Step 7: Run settlement, prompt and timeline tests**

```bash
npm run test:world-context-linkage
npm run test:world-history
npm run test:character-prompt
npm run test:world-history-projection
npm run test:item-action-queue
npm run test:world-ui-linkage
```

Expected: all pass.

- [ ] **Step 8: Commit Task 14**

```bash
git add src/services/turnResolution.ts src/services/turnNarration.ts src/features/world/worldTurnContext.ts src/features/characters/sceneCharacterSelector.ts src/features/world/worldHistory.ts src/store/useGameStore.ts src/components/StoryFeed.tsx src/components/TvTimelineModal.tsx src/App.tsx scripts/test-world-context-linkage.mjs scripts/test-world-history.mjs scripts/test-character-prompt.mjs scripts/test-world-ui-linkage.mjs package.json
git commit -m "feat: settle linked world turns atomically"
```

### Task 15: 消除平行状态权威并加入性能边界审计

**Files:**
- Create: `scripts/audit-world-runtime-boundaries.mjs`
- Modify: `src/services/stateReducer.ts`
- Modify: `src/features/characters/characterProjector.ts`
- Modify: `src/features/map/dynamicMapSubjects.ts`
- Modify: `src/features/world/worldHistoryProjection.ts`
- Modify: `src/features/items/viewModel.ts`
- Modify: `src/components/CharacterSheet.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed runtime, transaction and projection APIs.
- Produces: no new public domain API; enforces the single-authority boundary.

- [ ] **Step 1: Write the failing boundary audit**

The audit must fail when first-party runtime code outside approved adapters:

- reads `worldArtifacts.artifacts` directly for UI;
- treats `lord.location` as current authority;
- mutates `ItemSystemState.placements` for equip/transfer without a world transaction;
- derives title holder directly from static characters after runtime changes;
- loops through all static character shards from map rendering;
- constructs `WorldEventFact` independently from canonical `WorldEvent`.

Use an explicit allowlist limited to `worldBaseline.ts`, offline import/generated modules and migration rejection code.

- [ ] **Step 2: Run the audit to verify RED**

Run: `node scripts/audit-world-runtime-boundaries.mjs`

Expected: FAIL and list the remaining parallel reads/writes.

- [ ] **Step 3: Replace each reported runtime path**

- `stateReducer` delegates world-related commands to intent/transaction planning.
- character projector reads location and titles from world selectors.
- dynamic map subjects use county/location selectors.
- world history projection reads canonical events and unified asset projections.
- item view model receives projected relationship fields.
- legacy `CharacterSheet` either consumes unified selectors or remains unused without a world-state import.

- [ ] **Step 4: Add performance assertions**

Instrument selector tests with counters and assert:

```js
assert.equal(mapSelection.staticCharacterShardReads <= 1, true);
assert.equal(mapSelection.scannedDynamicCharacters <= Object.keys(runtime.characters).length, true);
assert.equal(context.characters.length <= 12, true);
assert.equal(context.assets.length <= 20, true);
assert.equal(context.events.length <= 12, true);
```

- [ ] **Step 5: Register the audit and aggregate verification**

Add:

```json
"check:world-runtime-boundaries": "node scripts/audit-world-runtime-boundaries.mjs",
"verify:world-linkage": "npm run test:world-runtime-state && npm run test:world-projection && npm run test:world-event-index && npm run test:world-transactions && npm run test:world-asset-baseline && npm run test:world-asset-rules && npm run test:world-transaction-queue && npm run test:world-travel-linkage && npm run test:world-title-rules && npm run test:world-selectors && npm run test:world-ui-linkage && npm run test:world-intent-resolver && npm run test:world-context-linkage && npm run check:world-runtime-boundaries"
```

- [ ] **Step 6: Run focused and repository verification**

```bash
npm run verify:world-linkage
npm run test:character-runtime
npm run test:character-dossier
npm run test:health-and-equipment-unified
npm run test:item-equipment
npm run test:item-custody
npm run test:world-history
npm run verify:map
npm run check:no-emoji
/mnt/c/Windows/System32/cmd.exe /d /s /c "cd /d C:\AGOT && npm run build:code"
git diff --check
```

Expected: every command exits 0. The Vite build may print the existing chunk-size warning, but TypeScript and build must complete successfully.

- [ ] **Step 7: Commit Task 15**

```bash
git add scripts/audit-world-runtime-boundaries.mjs src/services/stateReducer.ts src/features/characters/characterProjector.ts src/features/map/dynamicMapSubjects.ts src/features/world/worldHistoryProjection.ts src/features/items/viewModel.ts src/components/CharacterSheet.tsx package.json
git commit -m "refactor: enforce unified world authority"
```

## Final Acceptance Checklist

- [ ] A character move updates dossier location, map marker, nearby cast, vehicle position, container asset location and event timeline in one revision.
- [ ] A gift changes owner, controller, custodian and placement; theft keeps lawful owner and marks the asset stolen.
- [ ] A remote or merely owned item never appears as actual equipment.
- [ ] Occupation changes controller and contested border without changing lawful political fill.
- [ ] Explicit jump-time arrival advances at least the legal route duration; ordinary place mentions never move anyone.
- [ ] Every UI world action can be cancelled at its original control before the next successful conversation.
- [ ] Failed transactions leave character, title, asset, date, journey and history references unchanged.
- [ ] Player and NPC dossier panels use the same selectors and components.
- [ ] Map selection stays county-first and does not show all barony points by default.
- [ ] Runtime reads no Steam, Workshop or game directories and performs no network data import.
- [ ] Unchanged static characters are absent from `worldRuntime.characters`.
- [ ] All new source and public metadata contain no Emoji.

## Spec Coverage Matrix

| Spec requirement | Implemented by |
|---|---|
| Sparse runtime state and save reset | Tasks 1, 2, 15 |
| Canonical events without four copied timelines | Tasks 3, 14, 15 |
| Atomic and idempotent world transactions | Tasks 4, 14 |
| Owner/control/custody/location/equipment separation | Tasks 2, 5, 6 |
| Existing items, sites, vehicles and AGOT world items | Tasks 5, 6, 7 |
| Pending UI operations and in-place cancellation | Task 7 |
| Character, companion, vehicle and cargo travel | Task 8 |
| Lawful title holder versus occupation control | Task 9 |
| Shared player/NPC dossier and actual equipment | Task 10 |
| Character, map and asset cross-navigation | Tasks 11, 12, 14 |
| County-first map details and contested styling | Task 12 |
| Direct and implicit natural-language location intent | Task 13 |
| Jump-time minimum travel validation | Tasks 8, 13 |
| Settle before narration and bounded LLM context | Task 14 |
| Missing-reference containment and performance audit | Tasks 11, 13, 15 |
| No historical date inspection, no runtime game-file reads | Global constraints and Tasks 14, 15 |
