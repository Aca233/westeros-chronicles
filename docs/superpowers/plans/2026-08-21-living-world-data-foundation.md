# 活世界数据基础与硬编码收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将项目收敛为从 298 AC 5 月 10 日启动的唯一世界，把人物入口、起点事实、人物叙事、术语、普通物品、NPC 装备与游戏地点迁出运行时代码，并用引用闭包缩减无职责人物，同时保持现有存档、地图视觉和玩法规则兼容。

**Architecture:** `content/world/` 是唯一人工编辑源，离线编译器在临时目录中完成跨人物、地图、神器数据集校验，再原子发布 `public/data/world/`；浏览器通过一个带数据集哈希校验的仓储读取编译产物。运行时继续以既有命令、事件、世界基线与存档为权威，只把静态起点和展示内容改为数据驱动；人物完整档案、轻量持有人摘要、视觉省份、旅行节点和游戏地点分别承担不同职责。

**Tech Stack:** TypeScript 5.7、Node.js ESM、Python 3 unittest、React 18、Zustand、Zod 3、Dexie、MapLibre GL 5、Vite 6、Vitest、Git。

**Spec:** `docs/superpowers/specs/2026-08-21-living-world-data-foundation-design.md`

## Global Constraints

- 产品只存在一个 `worldId = "agot-298"` 的世界，产品新局开始日期固定为 `298 AC 5 月 10 日`。
- 玩家选择人物只改变控制主体和知识视角，不得创建 `scenarios/`、任务线或人物专属世界副本。
- `scenarioId` 仅保留为旧存档元数据兼容字段，不扩展为新架构概念。
- `saveFormatVersion` 必须保持 `9`，旧版本 9 存档必须继续恢复。
- 地图 manifest `schemaVersion` 必须保持 `4`。
- 生产入口 JavaScript 预算必须保持不超过 `750 KiB`。
- 不删除、降采样或重新解释 6,094 个正式地图视觉省份、瓦片、地形、路线和五级头衔数据。
- 不改变现有稳定人物 ID、地点 ID、头衔 ID 和资产 ID。
- 运行时规则、D20、装备、容量、旅行、伤势、事务校验、原子提交、回滚和知识可见性继续留在代码中。
- AGOT 神器继续由现有离线导入管线生成，不与普通手写物品使用同一编辑来源。
- 不在浏览器中编译 `content/world/`，不访问网络、Steam、Workshop 或真实 AGOT 模组目录。
- 所有生成过程必须确定性排序、哈希可复现，并在失败时保留上一份完整产物。
- 不改变地图、人物窗口或资产界面的视觉布局与稳定按钮/页签文案。
- 本阶段不实现完整世界脉冲、NPC AI、经济、人口、军队或建设系统。
- 直接在 `/mnt/c/agot` 当前工作区执行；不创建 worktree；每项任务独立提交；不推送远端。

---

## 文件结构与责任边界

完成后主要结构如下：

```text
content/world/
├── manifest.json                       # 唯一世界、固定日期、依赖数据集
├── playable-characters.json            # 视角资格和选择卡文案，不重复人物事实
├── start-state/
│   ├── characters.json                 # 人物位置、场景位置、活动、必要状态覆盖
│   ├── titles.json                     # 头衔持有人/控制例外
│   └── assets.json                     # 普通物品实例、站点、载具、保管和装备
├── characters/*.json                   # 仅人工增强人物，一人一文件
├── items/
│   ├── ordinary-items.json             # 普通物品声明
│   ├── loadout-templates.json          # NPC 装备模板
│   └── loadout-overrides.json          # 人物装备覆盖
├── locations/gameplay-locations.json   # 自动候选规则、显式允许与排除
└── terminology/
    ├── cultures.json
    ├── faiths.json
    └── relationships.json

scripts/world-content/
├── compiler.mjs                        # 编译编排、交叉校验、原子发布
├── schemas.mjs                         # 编辑源验证
├── hash.mjs                            # 稳定 JSON 与 SHA-256
└── migrate-character-supplements.mjs   # 一次性人物补充资料迁移器

public/data/world/
├── manifest.json                       # 世界内容哈希和依赖哈希
├── start-state.json                    # 合并后的唯一世界起点
├── playable-characters.json            # 已解析的可玩人物卡
├── character-content/index.json        # 人物到内容分片的映射
├── character-content/*.json            # 少量确定性分片
├── terminology.json
├── gameplay-locations.json
└── holder-summaries.json

src/features/world-content/
├── types.ts                             # 运行时内容合同
├── schemas.ts                           # Zod 解析器
└── repository.ts                        # 哈希一致性检查和按需加载

src/features/world/
├── createLivingWorldGame.ts             # 唯一世界新局组装
└── worldStartState.ts                   # 起点状态到既有世界/物品状态投影
```

`src/data/presets.ts`、`src/data/itemPresetState.ts`、`src/data/npcLoadoutTemplates.ts`、`src/data/npcLoadoutOverrides.ts` 在对应兼容调用迁移完毕后删除；`src/data/itemDefinitions.ts` 保留目录装配和神器懒加载，不再保存普通物品正文。

---

### Task 1: 建立唯一世界内容 Schema、确定性编译器与原子发布

**Files:**
- Create: `content/world/manifest.json`
- Create: `content/world/playable-characters.json`
- Create: `content/world/start-state/characters.json`
- Create: `content/world/start-state/titles.json`
- Create: `content/world/start-state/assets.json`
- Create: `content/world/locations/gameplay-locations.json`
- Create: `content/world/terminology/cultures.json`
- Create: `content/world/terminology/faiths.json`
- Create: `content/world/terminology/relationships.json`
- Create: `content/world/items/ordinary-items.json`
- Create: `content/world/items/loadout-templates.json`
- Create: `content/world/items/loadout-overrides.json`
- Create: `scripts/world-content/hash.mjs`
- Create: `scripts/world-content/schemas.mjs`
- Create: `scripts/world-content/compiler.mjs`
- Create: `scripts/test-world-content-compiler.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/data/agot-characters/manifest.json`, `public/data/agot-map/manifest.json`, `public/data/items/agot-artifact-world-state.json`，以及 `content/world/**`。
- Produces: `compileWorldContent({ rootDir, outputDir }): Promise<WorldContentCompileReport>`、`stableJson(value): string`、`sha256Json(value): string`。
- Produces: `npm run build:world-content` 和 `npm run test:world-content-compiler`。
- Preserves: 编译失败不得删除或部分覆盖既有 `public/data/world/`。

- [x] **Step 1: 写失败测试，锁定唯一清单、固定日期、确定性哈希和原子发布**

在 `scripts/test-world-content-compiler.mjs` 使用临时 fixture，测试以下真实合同：

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compileWorldContent } from './world-content/compiler.mjs';

const manifest = {
  schemaVersion: 1,
  worldId: 'agot-298',
  startDate: { year: 298, month: 5, day: 10 },
  characterDataset: 'agot-characters',
  mapDataset: 'agot-map',
  artifactDataset: 'agot-artifacts',
};

test('相同输入生成相同内容哈希且固定唯一世界日期', async () => {
  const fixture = await createWorldFixture(manifest);
  const first = await compileWorldContent(fixture);
  const firstBytes = await readFile(join(fixture.outputDir, 'manifest.json'));
  const second = await compileWorldContent(fixture);
  const secondBytes = await readFile(join(fixture.outputDir, 'manifest.json'));
  assert.equal(first.worldId, 'agot-298');
  assert.deepEqual(first.startDate, { year: 298, month: 5, day: 10 });
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(firstBytes, secondBytes);
});

test('校验失败保留上一份完整产物', async () => {
  const fixture = await createWorldFixture(manifest);
  await mkdir(fixture.outputDir, { recursive: true });
  await writeFile(join(fixture.outputDir, 'sentinel.txt'), 'keep');
  await writeFile(join(fixture.contentDir, 'manifest.json'), '{ invalid json');
  await assert.rejects(compileWorldContent(fixture));
  assert.equal(await readFile(join(fixture.outputDir, 'sentinel.txt'), 'utf8'), 'keep');
});
```

`createWorldFixture()` 必须在测试文件中写出最小人物、地图、神器 manifest 以及空内容数组；不得读取真实模组目录。

- [x] **Step 2: 运行测试，确认编译器尚不存在**

Run:

```bash
node scripts/test-world-content-compiler.mjs
```

Expected: FAIL，错误指出 `scripts/world-content/compiler.mjs` 不存在。

- [x] **Step 3: 实现稳定 JSON、源 Schema 和编译器骨架**

`scripts/world-content/hash.mjs` 固定导出：

```js
export function stableJson(value) {
  return `${JSON.stringify(sortRecursively(value), null, 2)}\n`;
}

export function sha256Json(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
```

`scripts/world-content/compiler.mjs` 固定导出并使用同目录临时文件夹：

```js
export async function compileWorldContent({ rootDir, contentDir, outputDir }) {
  const source = await readAndValidateWorldSource(contentDir);
  const dependencies = await readDatasetManifests(rootDir);
  const outputs = buildWorldOutputs(source, dependencies);
  const contentHash = sha256Json(outputs);
  await writeDirectoryAtomically(outputDir, { ...outputs, contentHash });
  return { worldId: source.manifest.worldId, startDate: source.manifest.startDate, contentHash };
}
```

初始编辑源使用以下非重复形状，后续任务只填充内容：

```json
{
  "schemaVersion": 1,
  "worldId": "agot-298",
  "startDate": { "year": 298, "month": 5, "day": 10 },
  "characterDataset": "agot-characters",
  "mapDataset": "agot-map",
  "artifactDataset": "agot-artifacts"
}
```

编译器必须拒绝第二个世界清单、其他产品日期、重复 ID、未知顶层字段和绝对路径；输出 manifest 记录 `characterDatasetHash`、`mapDatasetHash`、`artifactDatasetHash`、`contentHash` 和所有产物相对路径。

- [x] **Step 4: 接入 package scripts 并验证正式空骨架产物**

`package.json` 增加：

```json
{
  "scripts": {
    "build:world-content": "node scripts/world-content/compiler.mjs",
    "test:world-content-compiler": "node scripts/test-world-content-compiler.mjs"
  }
}
```

Run:

```bash
npm run test:world-content-compiler
npm run build:world-content
node -e "const m=require('./public/data/world/manifest.json'); if(m.worldId!=='agot-298'||m.startDate.year!==298||m.startDate.month!==5||m.startDate.day!==10) process.exit(1)"
```

Expected: 全部 PASS，且 `public/data/world/` 中只出现完整、可解析的产物。

- [x] **Step 5: 提交编译基础**

```bash
git add content/world scripts/world-content scripts/test-world-content-compiler.mjs package.json public/data/world
git commit -m "feat: establish living world content compiler"
```

---

### Task 2: 建立浏览器世界内容合同、仓储和数据集哈希门禁

**Files:**
- Create: `src/features/world-content/types.ts`
- Create: `src/features/world-content/schemas.ts`
- Create: `src/features/world-content/repository.ts`
- Create: `scripts/test-world-content-runtime.mjs`
- Modify: `package.json`
- Modify: `scripts/verify/suites.mjs`

**Interfaces:**
- Consumes: `/data/world/manifest.json` 及该清单列出的相对产物。
- Produces: `WorldContentRepository.loadManifest()`、`loadPlayableCharacters()`、`loadStartState()`、`loadTerminology()`、`loadGameplayLocations()`、`loadHolderSummaries()`、`loadCharacterContent(characterId)`。
- Produces: `assertWorldDatasetCompatibility(world, characterManifest, mapManifest, artifactState): void`。
- Preserves: 大型人物基础记录继续由 `StaticCharacterRepository` 哈希分片加载；人物叙事内容最多按 16 个两位十六进制分片请求。

- [x] **Step 1: 写失败测试，锁定解析、缓存、分片和哈希不匹配错误**

在 `scripts/test-world-content-runtime.mjs` 中通过 esbuild bundle TypeScript 模块并注入 fetcher：

```js
test('仓储缓存清单并按索引只读取人物内容分片', async () => {
  const calls = [];
  const repository = new WorldContentRepository(async (path) => {
    calls.push(path);
    return fixtureByPath[path];
  });
  const first = await repository.loadCharacterContent('agot:Stark_3');
  const second = await repository.loadCharacterContent('agot:Stark_3');
  assert.equal(first?.characterId, 'agot:Stark_3');
  assert.deepEqual(second, first);
  assert.equal(calls.filter((path) => path.endsWith('/manifest.json')).length, 1);
  assert.equal(calls.filter((path) => path.includes('/character-content/0a.json')).length, 1);
});

test('依赖哈希不一致时拒绝组合世界', () => {
  assert.throws(() => assertWorldDatasetCompatibility(
    worldManifest,
    { datasetHash: 'different' },
    { datasetHash: worldManifest.mapDatasetHash },
    { datasetHash: worldManifest.artifactDatasetHash },
  ), /人物数据哈希不匹配/);
});
```

- [x] **Step 2: 运行测试，确认运行时合同尚不存在**

Run:

```bash
node scripts/test-world-content-runtime.mjs
```

Expected: FAIL，错误指出 `src/features/world-content/repository.ts` 不存在。

- [x] **Step 3: 定义精确运行时类型与 Zod 解析器**

`src/features/world-content/types.ts` 至少导出：

```ts
export interface LivingWorldManifest {
  schemaVersion: 1;
  worldId: 'agot-298';
  startDate: WorldDate;
  characterDatasetHash: string;
  mapDatasetHash: string;
  artifactDatasetHash: string;
  contentHash: string;
  paths: {
    startState: string;
    playableCharacters: string;
    characterContentIndex: string;
    terminology: string;
    gameplayLocations: string;
    holderSummaries: string;
  };
}

export interface PlayableCharacterEntry {
  characterId: CharacterId;
  enabled: boolean;
  difficulty: 'normal' | 'hard' | 'epic';
  focus: string[];
  card: { title: string; tagline: string; background: string; avatarIcon: string };
}

export interface LivingWorldStartState {
  schemaVersion: 1;
  characters: WorldCharacterStartRecord[];
  titles: WorldTitleStartRecord[];
  assets: WorldAssetStartRecord[];
  sites: ItemStorageSite[];
  vehicles: ItemTransport[];
}
```

人物内容、术语、游戏地点和持有人摘要类型必须引用既有 `CharacterId`、`WorldLocationRef`、`EquipmentPosition`、`ItemDefinition`，不得复制规则枚举。

- [x] **Step 4: 实现仓储、清单依赖校验和缓存**

`src/features/world-content/repository.ts` 使用统一 `FetchJson = (path: string) => Promise<unknown>`，所有路径必须从 world manifest 解析；`clear()` 清空失败缓存，404 人物内容返回 `undefined`，其他 Schema 或哈希错误必须向调用方传播。

Run:

```bash
npm run test:world-content-runtime
npm run build:code
```

Expected: PASS，TypeScript 无错误。

- [x] **Step 5: 加入验证套件并提交**

把 `test:world-content-runtime` 加入 `STRUCTURE_GUARDS`，然后运行：

```bash
npm run test:verification-suites
npm run verify:quick
git add src/features/world-content scripts/test-world-content-runtime.mjs scripts/verify/suites.mjs package.json
git commit -m "feat: add living world content runtime"
```

Expected: 验证通过并生成独立提交。

---

### Task 3: 将三个预设剧本改为唯一世界的可玩人物入口

**Files:**
- Modify: `content/world/playable-characters.json`
- Create: `src/features/world/createLivingWorldGame.ts`
- Create: `scripts/test-living-world-start.mjs`
- Modify: `src/components/menu/NewGameScreen.tsx`
- Modify: `src/components/menu/LoadGameScreen.tsx`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/components/CharacterCreator.tsx`
- Modify: `package.json`
- Modify: `scripts/check-character-creator.mjs`
- Modify: `scripts/test-canonical-timeline.mjs`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-character-prompt.mjs`
- Modify: `scripts/test-character-trait-display.mjs`
- Modify: `scripts/test-item-dice-integration.mjs`
- Modify: `scripts/test-item-save-version.mjs`
- Modify: `scripts/test-item-state-commands.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `scripts/test-map-independent-turn.mjs`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `scripts/test-world-context-linkage.mjs`
- Delete: `src/data/presets.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldContentRepository`, `StaticCharacterRepository`, `createLordFromExistingCharacter()` 和统一世界 manifest。
- Produces: `loadPlayableCharacterCards(): Promise<PlayableCharacterCard[]>`、`createLivingWorldGame(characterId, dependencies): Promise<LivingWorldNewGame>`。
- Produces: `LivingWorldNewGame = { lord: LordProfile; opening: StoryOpening; worldId: 'agot-298'; startDate: WorldDate; season: string; legacyScenarioId?: string }`。
- Preserves: `SaveSlotMeta.scenarioId` 可读取旧值 `ned_stark`、`jon_snow`、`daenerys_targaryen`；新存档不依赖该字段决定世界状态。

- [x] **Step 1: 写失败测试，证明所有入口共享同一世界事实**

`scripts/test-living-world-start.mjs` 必须覆盖三个入口：

```js
test('三个可玩人物入口只改变控制者', async () => {
  const starts = await Promise.all([
    'agot:Stark_3', 'agot:Stark_7', 'agot:Targaryen_9',
  ].map((id) => createLivingWorldGame(id, fixtureDependencies)));
  assert.deepEqual(starts.map((entry) => entry.worldId), ['agot-298', 'agot-298', 'agot-298']);
  assert.deepEqual(starts.map((entry) => entry.startDate), Array(3).fill({ year: 298, month: 5, day: 10 }));
  assert.equal(new Set(starts.map((entry) => entry.lord.canonicalCharacterId)).size, 3);
  assert.deepEqual(starts.map((entry) => entry.worldStartState), Array(3).fill(starts[0].worldStartState));
});

test('可玩人物源不重复基础人物事实', async () => {
  const source = JSON.parse(await readFile('content/world/playable-characters.json', 'utf8'));
  for (const entry of source) {
    for (const forbidden of ['name', 'age', 'house', 'title', 'attributes', 'traits', 'location', 'items']) {
      assert.equal(Object.hasOwn(entry, forbidden), false, `${entry.characterId} 重复字段 ${forbidden}`);
    }
  }
});
```

- [x] **Step 2: 运行测试，确认仍依赖 `PRESET_SCENARIOS`**

Run:

```bash
node scripts/test-living-world-start.mjs
```

Expected: FAIL，`createLivingWorldGame` 尚不存在或入口仍生成不同世界起点。

- [x] **Step 3: 填充可玩人物源并实现唯一世界新局工厂**

`content/world/playable-characters.json` 只保留三个人物 ID、启用状态、难度、关注点和选择卡文案；不保存姓名、年龄、家族、头衔、属性、特质、地点、装备、长篇开场或固定分支。

`createLivingWorldGame()` 必须：

```ts
export async function createLivingWorldGame(
  characterId: CharacterId,
  dependencies: LivingWorldStartDependencies = defaultDependencies,
): Promise<LivingWorldNewGame> {
  const [manifest, playable, record, startState, artifacts] = await dependencies.load(characterId);
  if (!playable.enabled || !record.born) throw new Error('该人物不能用于当前开局');
  assertWorldDatasetCompatibility(manifest, dependencies.characterManifest, dependencies.mapManifest, artifacts);
  const resolved = resolveCharacter(record, [], { datasetVersion: manifest.characterDatasetHash, currentYear: 298, loadoutProfile: await dependencies.loadout(characterId) });
  return projectLivingWorldNewGame(manifest, playable, resolved, startState, artifacts);
}
```

开场只生成中性起点说明和三个通用行动建议；`focus` 作为提示上下文，不转成任务、胜利条件或强制事件。

- [x] **Step 4: 替换菜单和 Store 调用，保留旧存档显示兼容**

`NewGameScreen` 异步读取卡片并调用 `createLivingWorldGame`；`useGameStore.startNewGame` 改收 `LivingWorldNewGame`，不允许传入任意产品开始日期。`CharacterCreator` 的现成人物入口也使用相同 manifest 日期；自定义统治者继续存在，但放入相同 `agot-298` 世界，不再使用 `298-10-15`。

`LoadGameScreen` 将旧 `scenarioId` 显示映射留在局部常量：

```ts
const LEGACY_SCENARIO_LABELS: Readonly<Record<string, string>> = {
  ned_stark: '艾德·史塔克',
  jon_snow: '琼恩·雪诺',
  daenerys_targaryen: '丹妮莉丝·坦格利安',
};
```

删除 `PRESET_SCENARIOS` 后，将测试 fixture 改为 `createLivingWorldTestState('agot:Stark_3')` 或直接构造最小 `LordProfile`，不得在测试中重建第二套产品预设表。

- [x] **Step 5: 验证入口与存档兼容并提交**

Run:

```bash
npm run build:world-content
npm run test:living-world-start
npm run check:character-creator
npm run test:item-save-version
npm run test:save-hydration
npm run test:canonical-timeline
npm run verify:quick
git add content/world/playable-characters.json public/data/world src/components/menu src/components/CharacterCreator.tsx src/store/useGameStore.ts src/features/world/createLivingWorldGame.ts scripts package.json
git rm src/data/presets.ts
git commit -m "refactor: replace scenarios with living world viewpoints"
```

Expected: 三个入口日期均为 `298-05-10`，版本 9 存档测试通过，菜单视觉结构不变。

---

### Task 4: 迁移人物起点位置、活动和状态覆盖

**Files:**
- Modify: `content/world/start-state/characters.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Create: `src/features/world/worldStartState.ts`
- Create: `scripts/test-world-start-characters.mjs`
- Modify: `src/features/world/characterWorldFacts.ts`
- Modify: `src/features/characters/useCharacterDossier.ts`
- Modify: `src/features/world/createLivingWorldGame.ts`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-world-history-projection.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `LivingWorldStartState.characters`。
- Produces: `WorldCharacterStartRecord = { characterId; location: WorldLocationRef; currentActivity; aliveOverride?; wounds? }`。
- Produces: `getStartCharacterState(characterId): WorldCharacterStartRecord | undefined` 和 `projectStartCharacterFacts(character, startState, runtime): ResolvedCharacter`。
- Precedence: AGOT 基础记录 → 固定起点记录 → 已提交 runtime patch；runtime patch 始终优先。

- [x] **Step 1: 写失败测试，锁定开局人物位置与运行时覆盖优先级**

```js
test('开局人物位置来自统一起点且与玩家视角无关', async () => {
  const nedWorld = await fixtureStart('agot:Stark_3');
  const danyWorld = await fixtureStart('agot:Targaryen_9');
  assert.deepEqual(nedWorld.character('agot:Stark_7').location, { locationId: 'b_winterfell' });
  assert.deepEqual(danyWorld.character('agot:Stark_7').location, { locationId: 'b_winterfell' });
});

test('已提交移动覆盖固定起点位置', () => {
  const projected = projectStartCharacterFacts(record, startState, {
    characters: { 'agot:Stark_7': { location: { locationId: 'b_castle_black' }, currentActivity: 'travelling' } },
  });
  assert.equal(projected.locationId, 'b_castle_black');
});
```

- [x] **Step 2: 运行测试，确认位置仍来自硬编码表**

Run:

```bash
node scripts/test-world-start-characters.mjs
```

Expected: FAIL，起点读取接口不存在。

- [x] **Step 3: 将 `OPENING_CHARACTER_LOCATIONS` 全量迁入起点内容**

每个记录采用：

```json
{
  "characterId": "agot:Stark_3",
  "location": { "locationId": "b_winterfell", "sceneLocation": "神木林" },
  "currentActivity": "idle"
}
```

编译器必须校验：人物 ID 存在、位置属于游戏地点、活动值属于既有四值联合、同一人物不重复；`aliveOverride` 和 `wounds` 仅在确有导入资料纠正时出现。

- [x] **Step 4: 接入角色投影并删除日期/位置硬编码**

删除 `OPENING_SNAPSHOT_DATE`、`OPENING_CHARACTER_LOCATIONS`、`openingLocation()`；`projectResolvedCharacterWorldFacts()` 增加 `startCharacters` 参数，并按固定优先级合并。角色面板、世界上下文和新局工厂共用同一编译产物，不再自行判断 `298-05-10`。

Run:

```bash
npm run build:world-content
npm run test:world-start-characters
npm run test:character-dossier
npm run test:world-history-projection
npm run test:location-authority
```

Expected: PASS，原有公开人物地点不发生无依据变化。

- [x] **Step 5: 提交人物起点迁移**

```bash
git add content/world/start-state/characters.json public/data/world src/features/world src/features/characters/useCharacterDossier.ts scripts
git commit -m "refactor: centralize living world character start facts"
```

---

### Task 5: 统一头衔、资产、装备、保管站点和载具起点

**Files:**
- Modify: `content/world/start-state/titles.json`
- Modify: `content/world/start-state/assets.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Modify: `src/features/world/worldStartState.ts`
- Modify: `src/features/world/createLivingWorldGame.ts`
- Modify: `src/features/items/worldArtifacts.ts`
- Modify: `src/features/world/worldBaseline.ts`
- Create: `scripts/test-world-start-assets.mjs`
- Modify: `scripts/test-item-definitions.mjs`
- Modify: `scripts/test-world-artifact-state.mjs`
- Modify: `scripts/test-world-asset-baseline.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `package.json`
- Delete: `src/data/itemPresetState.ts`

**Interfaces:**
- Consumes: `WorldTitleStartRecord[]`、`WorldAssetStartRecord[]`、现有 `AGOT_ARTIFACT_WORLD_STATE`。
- Produces: `createInitialLivingWorldItems(characterId, startState, catalog): ItemSystemState`。
- Produces: `createLivingWorldBaseline(startState, artifacts): WorldBaselineSnapshotInput`。
- Authority: 唯一神器定义和归属仍来自神器管线；`start-state/assets.json` 只声明普通实例和明确覆盖，不复制生成神器定义。

- [x] **Step 1: 写失败测试，锁定视角无关的资产世界与玩家装备投影**

```js
test('不同控制者读取同一资产基线', async () => {
  const ned = await createFixtureStart('agot:Stark_3');
  const jon = await createFixtureStart('agot:Stark_7');
  assert.deepEqual(ned.worldBaseline.assets, jon.worldBaseline.assets);
  assert.equal(ned.lord.items.instances['ned.ice'].definitionId, 'artifact.ice');
  assert.equal(jon.lord.items.instances['jon.castle_sword'].definitionId, 'weapon.castle_bastard_sword');
});

test('编译器拒绝唯一资产重复和悬空保管引用', async () => {
  await assert.rejects(() => compileFixture({ duplicateUniqueAsset: true }), /唯一资产重复/);
  await assert.rejects(() => compileFixture({ missingSite: true }), /保管站点不存在/);
});
```

- [x] **Step 2: 运行测试，确认资产仍按预设工厂创建**

Run:

```bash
node scripts/test-world-start-assets.mjs
```

Expected: FAIL，`createInitialLivingWorldItems` 尚不存在。

- [x] **Step 3: 迁移现有三名人物与自定义统治者之外的正式起点资产**

`assets.json` 使用统一记录：

```json
{
  "instances": [{
    "instanceId": "ned.ice",
    "definitionId": "artifact.ice",
    "lawfulOwner": { "type": "character", "characterId": "agot:Stark_3" },
    "controller": { "type": "character", "characterId": "agot:Stark_3" },
    "custodian": { "type": "character", "characterId": "agot:Stark_3" },
    "placement": { "type": "character", "characterId": "agot:Stark_3" },
    "equippedPosition": { "group": "mainhand" },
    "status": "normal"
  }],
  "sites": [],
  "vehicles": []
}
```

保留现有实例 ID、站点 ID、载具 ID、装备位置、charges、renown 和自定义名称。自定义统治者的即时默认包继续由代码工厂创建，因为它是用户创建规则，不属于 298 AC 固定人物事实；将该工厂移到 `src/features/characters/customRulerStart.ts`。

- [x] **Step 4: 用统一起点组装玩家物品和世界基线**

实现必须先合并神器世界状态，再应用经校验的普通资产记录；同一资产只能有一个权威所有者、控制者、保管者和位置。玩家 `LordProfile.items` 只是统一世界资产的装备/携带投影，不成为第二份权威。

Run:

```bash
npm run build:world-content
npm run test:world-start-assets
npm run test:item-definitions
npm run test:world-artifact-state
npm run test:world-asset-baseline
npm run test:location-authority
```

Expected: PASS，奈德、琼恩、丹妮莉丝现有开局装备结果保持一致。

- [x] **Step 5: 删除旧预设物品工厂并提交**

```bash
git add content/world/start-state public/data/world src/features/world src/features/items src/features/characters/customRulerStart.ts scripts
git rm src/data/itemPresetState.ts
git commit -m "refactor: unify living world start assets"
```

---

### Task 6: 将现有人物叙事补充迁为一人一 JSON 并按分片加载

**Files:**
- Create: `content/world/characters/*.json`（由迁移器生成，恰好对应现有补充人物 ID）
- Create: `scripts/world-content/migrate-character-supplements.mjs`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Modify: `src/features/world-content/repository.ts`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/characters/useCharacterDossier.ts`
- Modify: `scripts/test_character_supplements.py`
- Modify: `scripts/test-character-dossier.mjs`
- Delete: `scripts/data/character-dossier/raw_supplements_part1.mjs`
- Delete: `scripts/data/character-dossier/raw_supplements_part2.mjs`
- Delete: `scripts/data/character-dossier/raw_supplements_part3.mjs`
- Delete: `scripts/data/character-dossier/raw_supplements_part4.mjs`
- Delete: `scripts/data/character-dossier/raw_supplements_part5.mjs`
- Delete: `scripts/compile_dossier_supplements.mjs`
- Delete: `src/data/generated/characterDossierSupplements.ts`

**Interfaces:**
- Consumes: `content/world/characters/<safe-character-id>.json`，其中安全文件名由 `characterId.replace(/[^a-z0-9_-]/gi, '_')` 生成。
- Produces: `CharacterContentRecord` 和 `WorldContentRepository.loadCharacterContent(characterId)`。
- Produces: `projectCharacterDossier(base, content, start, runtime, knowledge): CharacterDossier`；无内容文件时 `content` 为 `undefined`。
- Preserves: 当前补充人物数、人物 ID、叙事文本、经历、关系和来源 URL 一字不丢；不新增其余人物文件。

- [x] **Step 1: 写失败测试，锁定一人一文件和禁止动态事实字段**

```python
class CharacterContentMigrationTests(unittest.TestCase):
    def test_each_existing_supplement_becomes_one_character_json(self):
        legacy = load_legacy_supplements()
        migrated = load_character_json_files(ROOT / "content/world/characters")
        self.assertEqual(set(migrated), set(legacy))
        self.assertEqual(migrated, legacy)

    def test_character_content_rejects_runtime_facts(self):
        forbidden = {"name", "gender", "birthDate", "age", "alive", "location", "titleIds", "titles", "items", "equipment"}
        for path, record in character_content_records():
            self.assertFalse(forbidden.intersection(record), path.name)
```

Node 运行时测试另加：

```js
test('无人工内容仍可从 AGOT 基础记录生成卷宗', () => {
  const dossier = createNpcDossier(baseCharacterWithoutContent, 298, emptyKinship, undefined);
  assert.equal(dossier.name, baseCharacterWithoutContent.name);
  assert.equal(dossier.summary, '暂无可靠的公开生平摘要。');
});
```

- [x] **Step 2: 运行测试，确认 JSON 人物目录尚不存在**

Run:

```bash
python3 -m unittest scripts.test_character_supplements -v
node scripts/test-character-dossier.mjs
```

Expected: 新迁移合同 FAIL，现有旧生成路径仍通过旧断言。

- [x] **Step 3: 实现一次性无损迁移器并生成 113 个独立文件**

迁移器从五个旧模块导入 `RAW_SUPPLEMENTS`，对每条记录移除仅用于旧编译检查的 `subjectNameKey`、`participantNameKeys`、`targetNameKey`，将 `sourceUrls` 规范为 `sources`，稳定排序后写入独立 JSON。执行：

```bash
node scripts/world-content/migrate-character-supplements.mjs
npm run build:world-content
```

迁移器必须比较迁移前后允许字段的深等值；发现重复 ID、空来源、非法参与者或覆盖已有不同文件时立即失败。

- [x] **Step 4: 改为异步内容投影并删除旧生成源**

`createNpcDossier()` 接收可选 `CharacterContentRecord`，`useCharacterDossier()` 与基础人物、亲属、装备、地图一起加载该人物内容；没有文件不报错。编译器把约 113 条内容按 `sha256(characterId)[0]` 分为最多 16 个分片，并输出 `index.json`，避免每人一个浏览器请求。

Run:

```bash
npm run test:world-content-compiler
npm run test:world-content-runtime
npm run test:character-dossier
python3 -m unittest scripts.test_character_supplements -v
npm run build:code
```

Expected: PASS，运行时代码不再导入 `characterDossierSupplements.ts`。

- [x] **Step 5: 删除旧来源并提交**

```bash
git add content/world/characters public/data/world scripts/world-content src/features/world-content src/features/characters scripts/test_character_supplements.py scripts/test-character-dossier.mjs
git rm scripts/data/character-dossier/raw_supplements_part{1,2,3,4,5}.mjs scripts/compile_dossier_supplements.mjs src/data/generated/characterDossierSupplements.ts
git commit -m "refactor: move character narratives to world content"
```

---

### Task 7: 集中文化、信仰和关系显示术语，保持角色面板动态投影

**Files:**
- Modify: `content/world/terminology/cultures.json`
- Modify: `content/world/terminology/faiths.json`
- Modify: `content/world/terminology/relationships.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Create: `src/features/world-content/terminology.ts`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/characters/existingCharacterStart.ts`
- Modify: `src/components/character-window/relationshipCards.ts`
- Create: `scripts/test-world-terminology.mjs`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldTerminology = { cultures; faiths; relationships }`。
- Produces: `formatWorldCulture(id, terminology)`、`formatWorldFaith(id, terminology)`、`formatWorldRelationship(kind, terminology)`。
- Preserves: 页签、按钮和区块标题继续由 React 组件拥有；术语表只解析数据值。

- [x] **Step 1: 写失败测试，锁定词典键、回退和 UI 文案边界**

```js
test('共享术语解析已知值并安全回退未知值', () => {
  assert.equal(formatWorldCulture('northman', terms), '北境人');
  assert.equal(formatWorldFaith('old_gods_wnw', terms), '森林旧神');
  assert.equal(formatWorldRelationship('friend', terms), '朋友');
  assert.equal(formatWorldCulture('custom_culture', terms), 'custom culture');
});

test('人物内容和术语源不包含固定界面标签', async () => {
  const source = await readWorldContentText();
  for (const label of ['关系与家族', '健康与装备', '点击查看']) assert.doesNotMatch(source, new RegExp(label));
});
```

- [x] **Step 2: 运行测试，确认术语仍硬编码在投影模块**

Run:

```bash
node scripts/test-world-terminology.mjs
```

Expected: FAIL，格式化接口不存在。

- [x] **Step 3: 迁移现有词典并实现纯格式化器**

JSON 形状统一为稳定映射：

```json
{
  "schemaVersion": 1,
  "labels": {
    "northman": "北境人"
  }
}
```

编译器拒绝 trim 后重复键、空标签和 `__proto__` 等危险键；格式化器对未知 snake_case 值执行空格化回退，对空值分别返回“文化未记录”“信仰未记录”“关系未记录”。

- [x] **Step 4: 将角色面板和现成人物开局接到同一术语投影**

从 `characterDossier.ts` 删除 `CULTURE_LABELS`、`FAITH_LABELS`；`relationshipCards.ts` 不再维护数据关系称谓表。投影顺序必须保持：基础记录 → 人物内容 → 固定起点 → 当前存档 → 知识过滤 → ViewModel。

Run:

```bash
npm run build:world-content
npm run test:world-terminology
npm run test:character-dossier
npm run test:existing-character-start
npm run check:ck3-character-window
```

Expected: PASS，人物窗口布局和稳定文案无变化。

- [x] **Step 5: 提交术语迁移**

```bash
git add content/world/terminology public/data/world src/features/world-content src/features/characters src/components/character-window scripts
git commit -m "refactor: centralize living world terminology"
```

---

### Task 8: 用可复现引用闭包裁剪人物并生成轻量持有人摘要

**Files:**
- Modify: `scripts/agot_character_import/roster.py`
- Modify: `scripts/prune_bundled_character_dataset.py`
- Modify: `scripts/agot_character_import/writer.py`
- Modify: `scripts/test_character_roster.py`
- Modify: `scripts/test_prune_bundled_character_dataset.py`
- Modify: `scripts/world-content/compiler.mjs`
- Modify: `scripts/test-world-content-compiler.mjs`
- Modify: `public/data/agot-characters/**`（仅由离线裁剪器原子重建）
- Modify: `public/data/world/holder-summaries.json`

**Interfaces:**
- Consumes: `RosterReferences = { playable_ids; content_ids; start_state_ids; artifact_holder_ids; title_holders; kinship }`。
- Produces: `select_runtime_character_ids(records, references) -> set[str]`。
- Produces: `build_holder_summaries(records, title_holders, retained_ids) -> list[dict]`，每条含 `id`、`name`、`dynastyId`、`alive`、`titleIds`、`displayLabel`。
- Retention: 完整保留 `canon`、`semicanon`、所有正式引用种子及这些种子一层已出生亲属；未进入完整集合但仍持有头衔者进入摘要。

- [x] **Step 1: 扩充失败测试，锁定正式引用闭包而非固定数量**

```python
def test_reference_closure_keeps_explicit_seeds_and_one_born_kinship_hop(self):
    refs = RosterReferences(
        playable_ids={"agot:playable"},
        content_ids={"agot:curated"},
        start_state_ids={"agot:start"},
        artifact_holder_ids={"agot:artifact"},
        title_holders={"agot:holder": [{"id": "c_keep"}]},
        kinship=self.kinship,
    )
    retained = select_runtime_character_ids(self.records, refs)
    self.assertTrue({"agot:canon", "agot:semicanon", "agot:playable", "agot:curated", "agot:start", "agot:artifact"}.issubset(retained))
    self.assertNotIn("agot:isolated_fill", retained)

def test_unretained_title_holder_becomes_summary_not_full_record(self):
    full_ids, summaries = partition_runtime_characters(self.records, self.references)
    self.assertNotIn("agot:minor_holder", full_ids)
    self.assertEqual(summaries["agot:minor_holder"]["titleIds"], ["c_minor"])
```

再测试：被排除人物的 loadout 不输出；保留人物亲属引用可解析；technical/dummy/placeholder 永不进入完整记录或摘要；算法不包含 `5553`、`799` 等盘点常量。

- [x] **Step 2: 运行人物裁剪测试，确认旧逻辑把所有在世持有人当完整种子**

Run:

```bash
python3 -m unittest scripts.test_character_roster scripts.test_prune_bundled_character_dataset -v
```

Expected: 新摘要和引用集合断言 FAIL。

- [x] **Step 3: 实现引用集合、完整档案/摘要分区与引用审计**

Python 数据结构固定为：

```python
@dataclass(frozen=True)
class RosterReferences:
    playable_ids: frozenset[str]
    content_ids: frozenset[str]
    start_state_ids: frozenset[str]
    artifact_holder_ids: frozenset[str]
    title_holders: Mapping[str, Any]
    kinship: Mapping[str, Mapping[str, Any]]
```

完整种子不再因“持有任意头衔”自动保留；持有人若没有其他保留理由，则从原始投影生成摘要。裁剪报告增加 `fullRecordCount`、`holderSummaryCount`、`excludedUnreferencedModSupporting`、`excludedUnreferencedGenealogy`、`removedLoadoutCount` 和按保留理由分类的计数。

- [x] **Step 4: 对现有已生成数据执行离线、原子裁剪并审计结果**

只读取仓库内 `public/data` 与 `content/world`：

```bash
npm run build:world-content
npm run build:character-roster
npm run build:world-content
npm run test:character-roster
npm run check:character-dataset
node -e "const m=require('./public/data/agot-characters/manifest.json'); if(m.schemaVersion!==2||m.counts.emittedRecords>=11450) process.exit(1)"
```

Expected: 完整人物数减少；所有正式引用解析；持有人摘要覆盖被降级在位领主；人物 manifest schema 仍为 2。若实际闭包恰好未减少，检查报告必须明确列出每个保留理由，不能通过硬编码阈值伪造结果。

- [x] **Step 5: 提交人物裁剪与摘要生成**

```bash
git add scripts/agot_character_import scripts/prune_bundled_character_dataset.py scripts/test_character_roster.py scripts/test_prune_bundled_character_dataset.py scripts/world-content scripts/test-world-content-compiler.mjs public/data/agot-characters public/data/world
git commit -m "refactor: prune characters by living world references"
```

---

### Task 9: 让搜索、头衔和地图使用完整人物与持有人摘要的明确边界

**Files:**
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/characters/characterDatasetSchema.ts`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Create: `src/features/characters/holderSummaryRepository.ts`
- Modify: `src/features/map/politicalProjection.ts`
- Modify: `src/features/map/mapPresentation.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/components/CharacterCreator.tsx`
- Create: `scripts/test-character-holder-summaries.mjs`
- Modify: `scripts/test-character-runtime.mjs`
- Modify: `scripts/test-map-political-projection.mjs`
- Modify: `scripts/test-world-turn-context.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/data/world/holder-summaries.json`。
- Produces: `HolderSummaryRepository.get(id)`、`findByTitleIds(titleIds)`。
- Search default: `StaticCharacterRepository.search()` 默认只返回 `canon`、`semicanon` 与传入的 `materializedIds`；`includeGenealogy` 仍只供族谱调用。
- Produces: `materializeHolderSummary(summary, archiveRecord, events): ResolvedCharacter` 的兼容边界；本阶段仅允许显式直接互动路径调用，不加入自动世界脉冲。

- [x] **Step 1: 写失败测试，锁定摘要只在政治上下文出现**

```js
test('默认人物搜索不返回背景持有人摘要', async () => {
  assert.deepEqual(await characterRepository.search('小领主'), []);
  assert.equal((await holderRepository.findByTitleIds(['c_minor']))[0].id, 'agot:minor_holder');
});

test('世界上下文不把摘要自动送入 LLM 人物候选', async () => {
  const context = await buildWorldTurnContext(fixtureInputWithMinorHolder);
  assert.equal(context.characters.some((entry) => entry.id === 'agot:minor_holder'), false);
});
```

- [x] **Step 2: 运行测试，确认摘要尚无独立运行时边界**

Run:

```bash
node scripts/test-character-holder-summaries.mjs
```

Expected: FAIL，摘要仓储不存在。

- [x] **Step 3: 实现摘要仓储和政治投影回退**

地图头衔显示解析顺序为：当前 runtime holder → 完整人物搜索记录 → 持有人摘要 → “持有人未记录”。摘要不提供装备、目标、记忆、完整角色面板或默认搜索命中。

- [x] **Step 4: 限制默认搜索和 LLM 人物候选**

`CharacterSearchFilters` 增加：

```ts
export interface CharacterSearchFilters {
  includeGenealogy?: boolean;
  includeSupporting?: boolean;
  materializedIds?: readonly CharacterId[];
  alive?: boolean;
  canonTiers?: CharacterCanonTier[];
  limit?: number;
}
```

默认 `includeSupporting = false`；已进入存档 `worldRuntime.characters` 的 ID 通过 `materializedIds` 可搜索。`worldTurnContext` 只加载直接点名且完整存在、强关系、近期互动和正式事件参与者，不展开摘要。

Run:

```bash
npm run test:character-holder-summaries
npm run test:character-runtime
npm run test:map-political-projection
npm run test:world-turn-context
npm run test:character-prompt
```

Expected: PASS，地图不因裁剪丢失背景领主持有人名，LLM 上下文不遍历摘要。

- [x] **Step 5: 提交运行时人物分级**

```bash
git add src/features/characters src/features/map src/features/world/worldTurnContext.ts src/components/CharacterCreator.tsx scripts package.json
git commit -m "feat: separate holder summaries from simulated characters"
```

---

### Task 10: 区分视觉省份、隐藏旅行节点和数百级游戏地点

**Files:**
- Modify: `content/world/locations/gameplay-locations.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Modify: `src/features/world-content/types.ts`
- Modify: `src/features/world-content/schemas.ts`
- Modify: `src/features/world-content/repository.ts`
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `src/features/map/JourneyPanel.tsx`
- Modify: `src/features/map/TravelPlanner.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/countyInteraction.ts`
- Modify: `src/features/map/narrativeLocationContext.ts`
- Modify: `src/features/world/storyEntityLinks.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/features/world/worldBaseline.ts`
- Create: `scripts/test-gameplay-locations.mjs`
- Modify: `scripts/test-map-runtime.mjs`
- Modify: `scripts/test-map-routing.mjs`
- Modify: `scripts/test-map-narrative-context.mjs`
- Modify: `scripts/test-location-authority.mjs`
- Modify: `scripts/test-world-context-linkage.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 全量地图 `location-search-index.json`、语义 membership/titles、路线节点、固定起点引用、资产引用和内容显式 allow/exclude。
- Produces: `GameplayLocationEntry extends MapLocationSearchEntry { reasons: GameplayLocationReason[] }`。
- Produces: `MapRepository.loadGameplayLocations()`、`searchGameplayLocations(query, limit)`；`loadSearchIndex()` 保留为内部全量空间/绘制入口。
- Authority: 人物/资产新位置、正文实体链接、地点详情、玩家搜索和 LLM 地点候选只接受 `GameplayLocationEntry`；路线算法仍可经过隐藏节点。

- [x] **Step 1: 写失败测试，锁定语义隔离和路线可达性**

```js
test('隐藏中转节点不可搜索但路线仍可经过', async () => {
  assert.deepEqual(await repository.searchGameplayLocations('无名渡口'), []);
  const route = await routePlanner.plan('b_winterfell', 'b_the_red_keep');
  assert.equal(route.nodes.some((node) => node.locationId === 'b_hidden_crossing'), true);
});

test('起点人物和资产位置必须是游戏地点', async () => {
  await assert.rejects(() => compileFixture({ startLocation: 'b_visual_only' }), /不是游戏地点/);
});

test('地图视觉清单和 schema 不因语义裁剪变化', async () => {
  const map = JSON.parse(await readFile('public/data/agot-map/manifest.json', 'utf8'));
  assert.equal(map.schemaVersion, 4);
  assert.equal(map.counts.locations, 6094);
});
```

- [x] **Step 2: 运行测试，确认所有 6,094 地点仍进入搜索语义**

Run:

```bash
node scripts/test-gameplay-locations.mjs
```

Expected: FAIL，`searchGameplayLocations` 尚不存在。

- [x] **Step 3: 实现候选规则、显式允许/排除和编译审计**

`gameplay-locations.json` 采用：

```json
{
  "schemaVersion": 1,
  "include": ["b_winterfell", "b_castle_black", "b_the_red_keep"],
  "exclude": [],
  "rules": {
    "minimumImportance": 45,
    "types": ["castle", "city", "town", "port", "ruin", "landmark"],
    "includePoliticalCenters": true,
    "includeStartReferences": true,
    "includeEventReferences": true,
    "includeMajorRoutePorts": true
  }
}
```

编译器为每个地点记录至少一个 `reasons` 值，输出总数和按原因计数；目标应落在数百级。不得删除全量地图 search index、地点分片或路线节点。

- [x] **Step 4: 将玩家可见/LLM 入口改用游戏地点，保留内部路线数据**

`MapDrawer` 的空间绘制、命中和伯爵领展开可继续用全量地点；搜索框、旅行起终点选择、人物地点链接、资产位置选择、`storyEntityLinks`、`worldTurnContext` 和详情入口改用 `loadGameplayLocations()`。旧版本 9 存档中的非游戏地点仍可通过 `getLocation(id)` 解析和显示，但新的 MOVE/TRANSFER 候选不得选择它。

Run:

```bash
npm run build:world-content
npm run test:gameplay-locations
npm run test:map-runtime
npm run test:map-routing
npm run test:map-narrative-context
npm run test:location-authority
npm run test:world-context-linkage
npm run verify:map
```

Expected: PASS，地图 schema 4、6,094 地点和 31,724 路线边保持不变。

- [x] **Step 5: 提交地图语义收敛**

```bash
git add content/world/locations public/data/world src/features/world-content src/features/map src/features/world scripts package.json
git commit -m "refactor: separate gameplay locations from map geometry"
```

---

### Task 11: 将普通物品声明迁入世界内容并保留规则代码

**Files:**
- Modify: `content/world/items/ordinary-items.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Create: `src/features/items/ordinaryItemCatalog.ts`
- Modify: `src/data/itemDefinitions.ts`
- Create: `scripts/test-world-ordinary-items.mjs`
- Modify: `scripts/test-item-catalog.mjs`
- Modify: `scripts/test-item-definitions.mjs`
- Modify: `scripts/test-item-effects.mjs`
- Modify: `scripts/check-item-images.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 编译后的普通 `ItemDefinition[]` 和既有 `AGOT_ARTIFACT_DEFINITIONS`。
- Produces: `loadOrdinaryItemDefinitions(): Promise<readonly ItemDefinition[]>`、`preloadItemCatalog(): Promise<void>`。
- Preserves: `ITEM_CATALOG` 稳定导出、物品 ID、效果种类、装备位置、图片引用和神器懒加载行为。

- [x] **Step 1: 写失败测试，锁定物品集合等价和非法声明编译失败**

```js
test('迁移前后普通物品 ID 和关键定义保持一致', async () => {
  const definitions = await loadCompiledOrdinaryItems();
  assert.deepEqual(definitions.map((item) => item.id).sort(), EXPECTED_ORDINARY_ITEM_IDS);
  assert.deepEqual(definitions.find((item) => item.id === 'clothing.northern_wool_tunic')?.allowedPositions,
    [{ group: 'torso', layer: 'garment' }]);
});

test('未知效果、非法装备位置和重复 ID 在编译时失败', async () => {
  await assert.rejects(() => compileItems([{ ...validItem, effects: [{ kind: 'unknown' }] }]), /未知物品效果/);
  await assert.rejects(() => compileItems([{ ...validItem, allowedPositions: [{ group: 'torso', layer: 'boots' }] }]), /装备位置/);
  await assert.rejects(() => compileItems([validItem, validItem]), /物品 ID 重复/);
});
```

`EXPECTED_ORDINARY_ITEM_IDS` 从迁移前清单生成并作为测试 fixture 提交，不以数量替代 ID 等价检查。

- [x] **Step 2: 运行测试，确认普通物品仍写在 TypeScript 数组中**

Run:

```bash
node scripts/test-world-ordinary-items.mjs
```

Expected: FAIL，编译普通物品加载器不存在。

- [x] **Step 3: 机械迁移所有普通物品定义并加强编译校验**

将 `ITEM_DEFINITIONS` 中每个普通物品展开为完整 JSON；迁移完成后 JSON 不依赖 `expandedItem()` 或 `dailyClothing()` 默认值。编译器以既有 `ItemDefinition` 枚举等价规则检查 effect kind、position、unique、stack、charges、图片引用和重复 ID，并交叉校验起点资产、模板、覆盖引用。

- [x] **Step 4: 将目录装配改为编译数据 + 神器数据**

`src/data/itemDefinitions.ts` 缩为兼容门面：

```ts
export const ITEM_DEFINITIONS: ItemDefinition[] = [];
export const ITEM_CATALOG = createItemCatalog(ITEM_DEFINITIONS) as Map<string, ItemDefinition>;

export async function preloadItemCatalog(): Promise<void> {
  const [ordinary, artifacts] = await Promise.all([
    loadOrdinaryItemDefinitions(),
    import('./generated/agotArtifactDefinitions').then((module) => module.AGOT_ARTIFACT_DEFINITIONS),
  ]);
  replaceCatalog([...ordinary, ...artifacts]);
}
```

所有需要目录的开局和 UI 路径必须先调用现有 `preloadItemCatalog()`；效果执行器、容量和装备算法不改。

Run:

```bash
npm run build:world-content
npm run test:world-ordinary-items
npm run test:item-catalog
npm run test:item-definitions
npm run test:item-effects
npm run check:item-images
npm run build:code
```

Expected: PASS，普通物品 ID 集合与迁移前一致。

- [x] **Step 5: 提交普通物品迁移**

```bash
git add content/world/items/ordinary-items.json public/data/world src/features/items/ordinaryItemCatalog.ts src/data/itemDefinitions.ts scripts package.json
git commit -m "refactor: move ordinary items to world content"
```

---

### Task 12: 将 NPC 装备模板和人物覆盖迁入世界内容

**Files:**
- Modify: `content/world/items/loadout-templates.json`
- Modify: `content/world/items/loadout-overrides.json`
- Modify: `scripts/world-content/schemas.mjs`
- Modify: `scripts/world-content/compiler.mjs`
- Create: `src/features/items/npcLoadoutContent.ts`
- Modify: `scripts/build_character_supplements.py`
- Modify: `scripts/agot_character_import/writer.py`
- Modify: `scripts/prune_bundled_character_dataset.py`
- Create: `scripts/test-world-loadouts.mjs`
- Modify: `scripts/test-npc-loadout-templates.mjs`
- Modify: `scripts/test_character_supplements.py`
- Modify: `package.json`
- Delete: `src/data/npcLoadoutTemplates.ts`
- Delete: `src/data/npcLoadoutOverrides.ts`

**Interfaces:**
- Consumes: 编译后的 `NpcLoadoutTemplate[]`、`NpcLoadoutOverride[]` 和普通/神器物品目录。
- Produces: `loadNpcLoadoutContent(): Promise<{ templates: ReadonlyMap<string, NpcLoadoutTemplate>; overrides: ReadonlyMap<CharacterId, NpcLoadoutOverride> }>`。
- Produces: Python 编译输入 `public/data/world/loadouts.json`，供离线人物 loadout 分片构建使用。
- Preserves: 保留人物的模板选择和覆盖结果不变；被裁剪人物不再生成 loadout。

- [x] **Step 1: 写失败测试，锁定模板/覆盖等价与悬空引用失败**

```js
test('迁移后模板和覆盖保持稳定 ID 与槽位', async () => {
  const content = await loadNpcLoadoutContent();
  assert.equal(content.templates.get('northern_noble')?.ageGroup, 'adult');
  assert.equal(content.overrides.get('agot:Stark_3')?.templateId, EXPECTED_NED_TEMPLATE);
});

test('编译器拒绝未知模板、未知人物和未知物品', async () => {
  await assert.rejects(() => compileLoadouts({ overrideTemplateId: 'missing' }), /模板不存在/);
  await assert.rejects(() => compileLoadouts({ characterId: 'agot:missing' }), /人物不存在/);
  await assert.rejects(() => compileLoadouts({ definitionId: 'item.missing' }), /物品不存在/);
});
```

Python 测试比较保留 fixture 人物迁移前后的 `templateId`、`overrideId` 和装备槽位，并断言被排除人物不进入 `loadouts/*.json`。

- [x] **Step 2: 运行测试，确认代码表仍是唯一来源**

Run:

```bash
node scripts/test-world-loadouts.mjs
python3 -m unittest scripts.test_character_supplements -v
```

Expected: 新内容加载断言 FAIL。

- [x] **Step 3: 迁移模板和覆盖并生成离线桥接产物**

模板 JSON 使用完整 `EquipmentPosition`，覆盖 JSON 使用稳定 `CharacterId`；编译器交叉验证人物闭包、物品目录、模板 ID、重复槽位和年龄组。`public/data/world/loadouts.json` 由世界内容编译器生成，Python 不直接解析 TypeScript。

- [x] **Step 4: 改造人物 loadout 构建并删除代码表**

`scripts/build_character_supplements.py` 和人物 writer 从 `public/data/world/loadouts.json` 读取模板/覆盖；裁剪器只为完整保留人物生成 loadout。运行时 `characterProjector` 继续消费现有 `StaticCharacterLoadoutProfile`，不改变装备规则。

Run:

```bash
npm run build:world-content
npm run test:world-loadouts
npm run test:npc-loadout-templates
python3 -m unittest scripts.test_character_supplements scripts.test_character_roster scripts.test_prune_bundled_character_dataset -v
npm run build:character-roster
npm run check:character-dataset
npm run test:character-runtime
```

Expected: PASS，保留人物装备结果不变，裁剪人物无装备分片。

- [x] **Step 5: 删除旧代码表并提交**

```bash
git add content/world/items public/data/world public/data/agot-characters src/features/items scripts
git rm src/data/npcLoadoutTemplates.ts src/data/npcLoadoutOverrides.ts
git commit -m "refactor: move npc loadouts to world content"
```

---

### Task 13: 加入硬编码边界门禁、更新文档并完成全量回归

**Files:**
- Create: `scripts/check-living-world-content-boundaries.mjs`
- Create: `scripts/test-living-world-closure.mjs`
- Modify: `scripts/verify/suites.mjs`
- Modify: `package.json`
- Modify: `docs/DATA_PIPELINES.md`
- Modify: `docs/CURRENT_ARCHITECTURE.md`
- Modify: `docs/INDEX.md`
- Modify: `docs/superpowers/specs/2026-08-21-living-world-data-foundation-design.md`
- Modify: `docs/superpowers/plans/2026-08-21-living-world-data-foundation.md`

**Interfaces:**
- Produces: `npm run check:living-world-content-boundaries` 和 `npm run test:living-world-closure`。
- Enforces: 世界入口、人物位置、人物叙事、术语、普通物品和 NPC loadout 不得重新进入被禁止的 TypeScript 文件。
- Verifies: 人物、地图、正文、资产和 LLM 上下文从同一世界起点与当前 runtime 投影形成闭环。

- [x] **Step 1: 写失败的静态边界检查和闭环集成测试**

边界检查扫描精确规则：

```js
const forbidden = [
  ['src/data/presets.ts', /./],
  ['src/features/world/characterWorldFacts.ts', /OPENING_CHARACTER_LOCATIONS|OPENING_SNAPSHOT_DATE/],
  ['src/features/characters/characterDossier.ts', /CULTURE_LABELS|FAITH_LABELS|characterDossierSupplements/],
  ['src/data/itemDefinitions.ts', /id:\s*['"]clothing\.|id:\s*['"]weapon\./],
  ['src', /PRESET_SCENARIOS/],
];
```

闭环测试从一个 `agot-298` fixture 启动奈德，提交一次已验证移动和一次资产转移，然后断言：

```js
assert.equal(next.lord.location.locationId, 'b_the_red_keep');
assert.equal(next.worldRuntime.characters['agot:Stark_3'].location.locationId, 'b_the_red_keep');
assert.match(next.characterDossier.location, /红堡/);
assert.match(next.narrativeContext, /红堡/);
assert.equal(next.worldRuntime.assets['item:ned.seal'].custodian.characterId, 'agot:Tully_4');
assert.equal(next.llmContext.characters.some((entry) => entry.id === 'agot:unreferenced_fill'), false);
```

- [x] **Step 2: 运行新门禁，确认尚未加入验证编排**

Run:

```bash
node scripts/check-living-world-content-boundaries.mjs
node scripts/test-living-world-closure.mjs
node scripts/test-verification-suites.mjs
```

Expected: 在 package scripts/验证 suite 接入前至少一项 FAIL。

- [x] **Step 3: 接入 package scripts 和验证 suite**

`package.json` 增加：

```json
{
  "scripts": {
    "check:living-world-content-boundaries": "node scripts/check-living-world-content-boundaries.mjs",
    "test:living-world-closure": "node scripts/test-living-world-closure.mjs"
  }
}
```

把两项加入 `STRUCTURE_GUARDS`；`full` 通过结构门禁自动包含它们，`world` 显式追加 `test:living-world-closure`，`map` 显式追加 `test:gameplay-locations`。

- [x] **Step 4: 更新架构、管线、索引和实现状态文档**

`docs/DATA_PIPELINES.md` 记录：编辑源 → world compiler → 原子 `public/data/world` → 运行时仓储；人物裁剪引用来源；人物内容迁移命令；普通物品/loadout 校验；禁止访问真实模组的验证边界。

`docs/CURRENT_ARCHITECTURE.md` 记录四类人物、三类地图实体、唯一世界起点和角色面板投影顺序。`docs/INDEX.md` 链接规格与计划。将规格状态改为“已实现”，并把本计划所有完成步骤从 `- [x]` 改为 `- [x]`；只有全部验证完成后才能执行这两项状态更新。

- [x] **Step 5: 执行全量验证和数据审计**

Run:

```bash
npm run build:world-content
npm run test:world-content-compiler
npm run test:world-content-runtime
npm run test:living-world-start
npm run test:world-start-characters
npm run test:world-start-assets
npm run test:world-terminology
npm run test:character-holder-summaries
npm run test:gameplay-locations
npm run test:world-ordinary-items
npm run test:world-loadouts
npm run test:living-world-closure
npm run check:living-world-content-boundaries
npm run test:character-roster
npm run check:character-dataset
npm run verify:map
npm run verify:world-linkage
npm run verify
npm run build
npm run check:bundle-budget
```

Expected:

```text
saveFormatVersion = 9
map schemaVersion = 4
map locations = 6094
route edges = 31724
worldId = agot-298
startDate = 298-05-10
entry JavaScript <= 768000 bytes
all commands exit 0
```

随后审计变更：

```bash
git diff --check
git diff --name-only
git diff --stat -- public/data/agot-map public/assets
```

Expected: `git diff --check` 无输出；`public/data/agot-map` 与 `public/assets` 无变化；`public/data/agot-characters` 和 `public/data/world` 的变化均可由已提交构建命令复现。

- [x] **Step 6: 提交文档与最终门禁，不推送**

```bash
git add package.json scripts/verify/suites.mjs scripts/check-living-world-content-boundaries.mjs scripts/test-living-world-closure.mjs docs
git commit -m "docs: complete living world data foundation"
git log -13 --oneline
```

Expected: 最近提交对应本计划各任务；工作区无本任务未提交文件；不执行 `git push`。

---

## 实施后的权威数据流

```text
content/world 编辑源
        │ 离线校验、交叉引用、稳定排序、哈希、原子发布
        ▼
public/data/world 编译产物
        │
        ├── 唯一 manifest + 298-05-10
        ├── 可玩人物视角入口
        ├── 统一人物/头衔/资产起点
        ├── 人物叙事内容分片 + 共享术语
        ├── 游戏地点白名单
        └── 背景持有人摘要
        │
        ▼
AGOT 基础档案 + 起点状态 + 当前存档事件 + 玩家知识
        │
        ├── CharacterDossier ViewModel → 人物窗口
        ├── WorldRuntime projection → 地图与资产
        ├── gameplay locations → 搜索、链接、行动候选
        └── active/relevant characters only → LLM 上下文
```

该计划结束时只建立后续世界脉冲所需的数据边界；不会把 `focus`、人物性格或叙事经历变成固定剧情触发器。
