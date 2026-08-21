# 项目结构收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在不改变玩家可见行为、持久化格式和地图数据语义的前提下，收敛验证编排、巨型核心模块、生成数据目录、历史研究工具和模块依赖边界。

**Architecture:** 先建立可审计的验证 runner，再通过兼容 facade 逐步提取回合服务、人物窗口和地图画布职责；随后将底层类型和适配器接口移入无反向依赖的叶节点模块，并以 TypeScript AST 循环检查形成长期门禁。所有迁移保留现有公共入口，每项任务单独测试和提交。

**Tech Stack:** TypeScript 5.7、Node.js ESM、React 18、Zustand、Dexie、MapLibre GL 5、Three.js、Vite、Vitest、Node test runner、Python unittest、Git。

**Spec:** `docs/superpowers/specs/2026-08-21-project-structure-consolidation-design.md`

## Global Constraints

- 不新增玩法、人物属性、地图层级、资产类型或 LLM 能力。
- 不改变玩家可见文案、视觉样式、DOM 语义或交互流程。
- `saveFormatVersion` 必须保持 `9`。
- 地图 manifest `schemaVersion` 必须保持 `4`。
- 生产入口 JavaScript 预算必须保持不超过 `750 KiB`。
- 不删除、压缩或重新解释 `public/data`、`public/assets` 中的正式离线资源。
- 不访问网络、Steam、Workshop 或本机 AGOT 模组目录；正式导入命令不得进入验证套件。
- 所有现有 `test:*`、`check:*`、`build` 单项 package scripts 保持可调用。
- `src/services/turnResolution.ts`、`src/components/Ck3CharacterWindow.tsx`、`src/features/map/MapCanvas.tsx` 保持公共入口兼容。
- 不改变世界日期、人物 ID、地点 ID、资产 ID、旅行状态、事件投影和旧结算路径的语义。
- 每项任务独立提交；不推送远端。

---

## 文件结构总览

完成后新增或调整的主要结构：

```text
scripts/
├── verify/
│   ├── run-suite.mjs
│   └── suites.mjs
├── data/character-dossier/
│   ├── raw_supplements_part1.mjs
│   ├── raw_supplements_part2.mjs
│   ├── raw_supplements_part3.mjs
│   ├── raw_supplements_part4.mjs
│   └── raw_supplements_part5.mjs
├── check-module-cycles.mjs
├── test-module-cycles.mjs
└── test-verification-suites.mjs
src/
├── domain/
│   ├── body.ts
│   ├── character.ts
│   ├── characterId.ts
│   ├── worldDate.ts
│   └── worldLocation.ts
├── services/turn/
│   ├── legacySettlement.ts
│   ├── resolutionProtocol.ts
│   ├── resolutionTypes.ts
│   ├── settlement.ts
│   ├── settlementFacts.ts
│   └── worldPreparation.ts
├── components/character-window/
│   ├── CharacterAssetsTab.tsx
│   ├── CharacterHistoryTab.tsx
│   ├── CharacterIdentityHeader.tsx
│   ├── CharacterOverview.tsx
│   ├── CharacterRelationsTab.tsx
│   ├── CharacterTraitOverlay.tsx
│   ├── relationshipCards.ts
│   └── useVerifiedLordFamily.ts
└── features/
    ├── characters/
    │   ├── characterEventProjection.ts
    │   └── characterEventTypes.ts
    ├── items/
    │   ├── itemValidation.ts
    │   └── worldArtifactTypes.ts
    └── map/canvas/
        ├── journeyLayers.ts
        ├── landmarkRuntimeController.ts
        ├── useMapCameraSync.ts
        ├── useMapLifecycle.ts
        └── semanticProjectionController.ts
tools/research/external-rpg-ui/
└── README.md
docs/
├── DATA_PIPELINES.md
├── INDEX.md
└── TESTING.md
```

---

### Task 1: 建立可审计的验证 suite runner

**Files:**
- Create: `scripts/verify/suites.mjs`
- Create: `scripts/verify/run-suite.mjs`
- Create: `scripts/test-verification-suites.mjs`
- Modify: `package.json`
- Modify: `scripts/check-map-runtime-boundaries.mjs`

**Interfaces:**
- Produces: `VERIFICATION_SUITES`, `getVerificationSuite(name)`, `validateVerificationSuites(packageScripts)`, `runVerificationSuite(name, options)`。
- Preserves: `npm run verify`, `npm run verify:quick`, `npm run verify:map`, `npm run verify:world-linkage`。
- Rule: suite step 的 `script` 必须是单项命令；`full` 不得引用任何 `verify:*` 组合入口。

- [x] **Step 1: 写 suite 合同测试，锁定去重、覆盖和失败传播**

在 `scripts/test-verification-suites.mjs` 中使用 `node:test` 和注入 executor，不启动完整验证：

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LEGACY_UNIQUE_LEAVES,
  VERIFICATION_SUITES,
  validateVerificationSuites,
} from './verify/suites.mjs';
import { runVerificationSuite } from './verify/run-suite.mjs';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('所有验证套件只引用存在的单项 script，且各自无重复', () => {
  assert.doesNotThrow(() => validateVerificationSuites(packageJson.scripts));
  for (const suite of Object.values(VERIFICATION_SUITES)) {
    const scripts = suite.map((step) => step.script);
    assert.equal(new Set(scripts).size, scripts.length);
    assert.equal(scripts.some((script) => script.startsWith('verify:')), false);
  }
});

test('full 按原顺序完整保留旧 verify 的 115 个唯一叶子任务', () => {
  const fullScripts = VERIFICATION_SUITES.full.map((step) => step.script);
  assert.deepEqual(
    fullScripts.filter((script) => LEGACY_UNIQUE_LEAVES.full.includes(script)),
    LEGACY_UNIQUE_LEAVES.full,
  );
  assert.deepEqual(
    fullScripts.filter((script) => !LEGACY_UNIQUE_LEAVES.full.includes(script)),
    ['test:verification-suites'],
  );
});

test('runner 串行执行并在首个失败处保留退出码', async () => {
  const calls = [];
  const result = await runVerificationSuite('quick', {
    packageScripts: packageJson.scripts,
    logger: { log() {}, error() {} },
    execute: async (script) => {
      calls.push(script);
      return script === VERIFICATION_SUITES.quick[1].script ? 17 : 0;
    },
  });
  assert.equal(result, 17);
  assert.deepEqual(calls, VERIFICATION_SUITES.quick.slice(0, 2).map((step) => step.script));
});
```

`LEGACY_UNIQUE_LEAVES` 必须显式保存迁移前四个组合命令展开后的顺序基线：`quick` 15 项、`world` 14 项、`map` 47 项、`full` 115 项。该常量只用于合同测试与迁移审计；数组中不得出现 `verify:*`。

- [x] **Step 2: 运行合同测试，确认因模块缺失而失败**

Run:

```bash
node scripts/test-verification-suites.mjs
```

Expected: FAIL，错误指出 `scripts/verify/suites.mjs` 或 `run-suite.mjs` 不存在。

- [x] **Step 3: 实现静态 suite 定义和结构验证**

`scripts/verify/suites.mjs` 使用以下公开形状：

```js
const step = (script) => Object.freeze({ id: script, script });
const suite = (scripts) => Object.freeze(scripts.map(step));

export const STRUCTURE_GUARDS = Object.freeze(['test:verification-suites']);

export const VERIFICATION_SUITES = Object.freeze({
  quick: suite([...LEGACY_UNIQUE_LEAVES.quick, ...STRUCTURE_GUARDS]),
  world: suite(LEGACY_UNIQUE_LEAVES.world),
  map: suite(LEGACY_UNIQUE_LEAVES.map),
  full: suite([...LEGACY_UNIQUE_LEAVES.full, ...STRUCTURE_GUARDS]),
});

export function getVerificationSuite(name) {
  const value = VERIFICATION_SUITES[name];
  if (!value) throw new Error(`未知验证套件：${name}`);
  return value;
}

export function validateVerificationSuites(packageScripts) {
  for (const [name, steps] of Object.entries(VERIFICATION_SUITES)) {
    const ids = new Set();
    for (const current of steps) {
      if (ids.has(current.id)) throw new Error(`验证套件 ${name} 含重复步骤：${current.id}`);
      if (current.script.startsWith('verify:')) throw new Error(`验证套件 ${name} 不得递归调用：${current.script}`);
      if (typeof packageScripts[current.script] !== 'string') throw new Error(`验证步骤不存在：${current.script}`);
      ids.add(current.id);
    }
  }
}
```

`full` 以旧 `verify` 展开后的顺序写入 115 个唯一叶子任务；删除第二次出现的 `test:item-action-queue`，其余旧任务顺序不变，并在末尾追加 `test:verification-suites`。`map`、`world` 分别写入当前展开后的 47、14 个唯一叶子任务；`quick` 保留原 15 项并在末尾追加 `test:verification-suites`。

- [x] **Step 4: 实现跨平台串行 runner**

`scripts/verify/run-suite.mjs` 导出可测试函数，并仅在直接执行时设置 `process.exitCode`：

```js
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { getVerificationSuite, validateVerificationSuites } from './suites.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(join(currentDir, '../../package.json'), 'utf8'));

export function executeNpmScript(script) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const args = npmCli ? [npmCli, 'run', script] : ['run', script];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export async function runVerificationSuite(name, options = {}) {
  const packageScripts = options.packageScripts ?? packageJson.scripts;
  const logger = options.logger ?? console;
  const execute = options.execute ?? executeNpmScript;
  validateVerificationSuites(packageScripts);
  const steps = getVerificationSuite(name);
  const startedAt = Date.now();
  for (const [index, current] of steps.entries()) {
    logger.log(`[${index + 1}/${steps.length}] ${name}: ${current.script}`);
    const code = await execute(current.script);
    if (code !== 0) {
      logger.error(`验证失败：${current.script}（退出码 ${code}）`);
      return code;
    }
  }
  logger.log(`验证完成：${name}（${Date.now() - startedAt}ms）`);
  return 0;
}
```

直接执行检测使用：

```js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await runVerificationSuite(process.argv[2] ?? 'full');
  process.exitCode = code;
}
```

- [x] **Step 5: 切换 package scripts，并让边界检查读取 suite 定义**

将组合入口替换为：

```json
"test:verification-suites": "node scripts/test-verification-suites.mjs",
"verify:quick": "node scripts/verify/run-suite.mjs quick",
"verify:world-linkage": "node scripts/verify/run-suite.mjs world",
"verify:map": "node scripts/verify/run-suite.mjs map",
"verify": "node scripts/verify/run-suite.mjs full"
```

把 `test:verification-suites` 加入 `quick` 和 `full` 的静态数组。更新 `scripts/check-map-runtime-boundaries.mjs`，从 `VERIFICATION_SUITES.map`、`.quick`、`.full` 读取 script 名称，不再搜索 package script 字符串；继续断言真实导入命令不在任何 suite 中。

- [x] **Step 6: 运行 runner 合同与快速验证**

Run:

```bash
node scripts/test-verification-suites.mjs
npm run check:map-runtime-boundaries
npm run verify:quick
```

Expected: 全部 PASS；输出有稳定的 `[n/total]` 进度，且 quick 不执行网络或正式导入。

- [x] **Step 7: 提交验证编排**

```bash
git add package.json scripts/verify scripts/test-verification-suites.mjs scripts/check-map-runtime-boundaries.mjs
git commit -m "refactor: centralize verification suites"
```

---

### Task 2: 归档根目录历史研究脚本

**Files:**
- Create: `tools/research/external-rpg-ui/README.md`
- Move: 根目录 19 个历史 Python 脚本到 `tools/research/external-rpg-ui/`
- Modify: `scripts/test-verification-suites.mjs`

**Interfaces:**
- Preserves: 从仓库根目录运行脚本时，现有 `scratch/fanren` 与 `scratch/yishijie` 相对路径语义。
- Produces: 历史研究工具的明确边界；任何验证 suite 都不得引用该目录。

- [x] **Step 1: 增加研究工具隔离合同**

在 `scripts/test-verification-suites.mjs` 增加：

```js
import { readdir } from 'node:fs/promises';

test('历史研究工具不在根目录且不进入验证套件', async () => {
  const rootPython = (await readdir('.')).filter((name) => name.endsWith('.py'));
  assert.deepEqual(rootPython, []);
  for (const steps of Object.values(VERIFICATION_SUITES)) {
    assert.equal(steps.some(({ script }) => packageJson.scripts[script].includes('tools/research/')), false);
  }
});
```

- [x] **Step 2: 运行测试，确认根目录脚本导致失败**

Run:

```bash
node scripts/test-verification-suites.mjs
```

Expected: FAIL，并列出根目录 Python 文件。

- [x] **Step 3: 移动全部 19 个脚本并写 README**

执行：

```bash
mkdir -p tools/research/external-rpg-ui
git mv analyze_extracted.py analyze_ui_css.py crawl_all.py deep_analyze.py \
  deep_code_miner.py deep_dive_analysis.py download_fanren.py download_yishijie.py \
  extract_prompts.py find_prompts.py inspect_core.py inspect_deep_text.py \
  inspect_fanren.py inspect_render.py inspect_ui_components.py read_fanren_html.py \
  scan_fanren_prompts.py scrape_analyze.py summary_files.py \
  tools/research/external-rpg-ui/
```

`README.md` 明确写明“历史研究、依赖 ignored scratch、默认从仓库根运行、下载类脚本访问网络、不得加入产品验证”。不得修改脚本的研究逻辑。

- [x] **Step 4: 验证移动没有进入产品命令**

Run:

```bash
node scripts/test-verification-suites.mjs
rg "tools/research/external-rpg-ui|crawl_all.py|download_fanren.py" package.json scripts/verify
npm run verify:quick
```

Expected: 测试 PASS；`rg` 不命中 package scripts 或 suite 定义。

- [x] **Step 5: 提交研究工具归档**

```bash
git add tools/research/external-rpg-ui scripts/test-verification-suites.mjs
git commit -m "chore: archive external ui research tools"
```

---

### Task 3: 规范人物卷宗补充资料生成目录

**Files:**
- Move: `src/data/characterDossierSupplements.ts` → `src/data/generated/characterDossierSupplements.ts`
- Move: `scripts/raw_supplements_part1.mjs`, `scripts/raw_supplements_part2.mjs`, `scripts/raw_supplements_part3.mjs`, `scripts/raw_supplements_part4.mjs`, `scripts/raw_supplements_part5.mjs` → `scripts/data/character-dossier/`
- Modify: `scripts/compile_dossier_supplements.mjs`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-health-and-equipment-unified.mjs`
- Modify: `scripts/test_character_supplements.py`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/world/storyEntityLinks.ts`

**Interfaces:**
- Preserves: `CHARACTER_DOSSIER_SUPPLEMENTS` 与 `getCharacterDossierSupplement(characterId)` 的内容和行为。
- Produces: 生成产物统一位于 `src/data/generated`；原始输入统一位于 `scripts/data/character-dossier`。

- [x] **Step 1: 记录迁移前生成内容哈希并增加路径合同**

Run:

```bash
sha256sum src/data/characterDossierSupplements.ts > /tmp/character-dossier-before.sha256
```

在 `scripts/test-character-dossier.mjs` 将 bundling 入口先改为新路径：

```js
const { CHARACTER_DOSSIER_SUPPLEMENTS, getCharacterDossierSupplement } =
  await bundleModule('src/data/generated/characterDossierSupplements.ts');
```

在 `scripts/test_character_supplements.py` 中断言生成器输出目标为 `src/data/generated/characterDossierSupplements.ts`，并断言旧文件不存在。

- [x] **Step 2: 运行测试，确认新路径尚不存在**

Run:

```bash
npm run test:character-dossier
npm run test:character-supplements
```

Expected: 至少一项 FAIL，原因是新生成文件或新输入目录不存在。

- [x] **Step 3: 移动输入与生成文件并更新编译器**

执行：

```bash
mkdir -p scripts/data/character-dossier
git mv scripts/raw_supplements_part{1,2,3,4,5}.mjs scripts/data/character-dossier/
git mv src/data/characterDossierSupplements.ts src/data/generated/characterDossierSupplements.ts
```

`compile_dossier_supplements.mjs` 的 imports 改为：

```js
import { RAW_SUPPLEMENTS as part1 } from './data/character-dossier/raw_supplements_part1.mjs';
import { RAW_SUPPLEMENTS_PART2 as part2 } from './data/character-dossier/raw_supplements_part2.mjs';
import { RAW_SUPPLEMENTS_PART3 as part3 } from './data/character-dossier/raw_supplements_part3.mjs';
import { RAW_SUPPLEMENTS_PART4 as part4 } from './data/character-dossier/raw_supplements_part4.mjs';
import { RAW_SUPPLEMENTS_PART5 as part5 } from './data/character-dossier/raw_supplements_part5.mjs';
```

输出改为：

```js
const outputPath = join(root, 'src/data/generated/characterDossierSupplements.ts');
await writeFile(outputPath, tsHeader, 'utf8');
console.log('Written to src/data/generated/characterDossierSupplements.ts successfully!');
```

运行时 imports 改为 `../../data/generated/characterDossierSupplements`，测试中的 raw imports 分别改为 `./data/character-dossier/raw_supplements_part1.mjs` 到 `raw_supplements_part5.mjs`。

- [x] **Step 4: 验证生成结果等价**

先保存已移动文件，再重新生成并比较：

```bash
cp src/data/generated/characterDossierSupplements.ts /tmp/character-dossier-moved.ts
node scripts/compile_dossier_supplements.mjs
cmp /tmp/character-dossier-moved.ts src/data/generated/characterDossierSupplements.ts
rg "data/characterDossierSupplements|raw_supplements_part" src scripts --glob '!scripts/data/character-dossier/**'
```

Expected: `cmp` 成功；`rg` 只允许命中新路径文件名的显式测试，不得命中旧运行时路径。

- [x] **Step 5: 运行相关测试与构建**

Run:

```bash
npm run test:character-supplements
npm run test:character-dossier
npm run test:health-and-equipment-unified
npm run build:code
git diff --check
```

Expected: 全部 PASS。

- [x] **Step 6: 提交数据目录整理**

```bash
git add scripts/compile_dossier_supplements.mjs scripts/data/character-dossier \
  scripts/test-character-dossier.mjs scripts/test-health-and-equipment-unified.mjs \
  scripts/test_character_supplements.py src/data/generated/characterDossierSupplements.ts \
  src/features/characters/characterDossier.ts src/features/world/storyEntityLinks.ts
git commit -m "refactor: organize character dossier data pipeline"
```

---

### Task 4: 提取回合解析合同、协议和事实函数

**Files:**
- Create: `src/services/turn/resolutionTypes.ts`
- Create: `src/services/turn/resolutionProtocol.ts`
- Create: `src/services/turn/settlementFacts.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-turn-pipeline.mjs`

**Interfaces:**
- Produces from `resolutionTypes.ts`: `TurnResolutionDraft`, `ResolvedTurnFacts`, `SettleTurnDraftInput`, `SettledTurn`, `PrepareWorldTurnInput`, `WorldContextAvailability`, `PreparedWorldTurn`。
- Produces from `resolutionProtocol.ts`: `parseTurnResolutionOutput`, `buildTurnResolutionMessages`, `requestTurnResolution`。
- Produces internally from `settlementFacts.ts`: `commandFacts`, `worldEventFromFact`, `deriveSeason`, `playerCharacterId`, `worldEventAsFact`, `committedNarrationContext`。
- Preserves: 原 `turnResolution.ts` 的同名 exports。

- [x] **Step 1: 给旧入口与新模块增加导出等价测试**

在 `scripts/test-turn-pipeline.mjs` 的 esbuild entry 同时导入两个命名空间：

```js
contents: [
  "export * as facade from './src/services/turnResolution.ts';",
  "export * as protocol from './src/services/turn/resolutionProtocol.ts';",
  "export * as typesModule from './src/services/turn/resolutionTypes.ts';",
].join('\n')
```

断言：

```js
assert.equal(facade.parseTurnResolutionOutput, protocol.parseTurnResolutionOutput);
assert.equal(facade.buildTurnResolutionMessages, protocol.buildTurnResolutionMessages);
assert.equal(facade.requestTurnResolution, protocol.requestTurnResolution);
```

保留现有 pipeline 行为断言。

- [x] **Step 2: 运行测试，确认新模块缺失**

Run:

```bash
npm run test:turn-pipeline
```

Expected: FAIL，esbuild 报告 `src/services/turn/resolutionProtocol.ts` 不存在。

- [x] **Step 3: 移动类型合同，不改变字段**

将原文件第 55–183 行的 interfaces 原样移入 `resolutionTypes.ts`，只修正 imports。关键签名保持：

```ts
export interface TurnResolutionDraft {
  outcomeSummary: string
  stateCommands: StateCommand[]
  worldIntents: UnresolvedWorldIntent[]
}

export interface SettleTurnDraftInput {
  gameState: GameState
  actionText: string
  nextTurnNumber: number
  draft: TurnResolutionDraft
  pendingTransactions: readonly PendingWorldTransaction[]
  characterContext?: CharacterCommandBatchBaseContext
  diceCheck?: D20Check
  timeline?: readonly CanonicalTimelineEvent[]
  preparedWorld?: PreparedWorldTurn
}
```

其余 interfaces 保持原字段、可选性和数组可变性，不借机改名。

- [x] **Step 4: 移动协议函数与纯事实函数**

将原第 62–110 行移入 `resolutionProtocol.ts`。将第 186–303 行以及第 1152–1184 行的纯事实/格式化函数移入 `settlementFacts.ts`，仅把后续模块需要的函数 export；函数体原样迁移。

`turnResolution.ts` 暂时改为从新模块 import 内部依赖，并在末尾 re-export：

```ts
export * from './turn/resolutionTypes';
export {
  parseTurnResolutionOutput,
  buildTurnResolutionMessages,
  requestTurnResolution,
} from './turn/resolutionProtocol';
```

- [x] **Step 5: 运行回合相关测试**

Run:

```bash
npm run test:turn-pipeline
npm run test:world-context-linkage
npm run test:map-independent-turn
npm run test:unified-turn
npm run build:code
```

Expected: 全部 PASS；原入口和新协议入口引用同一函数。

- [x] **Step 6: 提交协议与事实拆分**

```bash
git add src/services/turn src/services/turnResolution.ts scripts/test-turn-pipeline.mjs
git commit -m "refactor: extract turn resolution protocol"
```

---

### Task 5: 提取世界回合准备阶段

**Files:**
- Create: `src/services/turn/worldPreparation.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-world-context-linkage.mjs`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-location-authority.mjs`

**Interfaces:**
- Produces: `prepareWorldTurn(input: PrepareWorldTurnInput): Promise<PreparedWorldTurn>`。
- Internal exports allowed for tests: `buildTravelBaseline`, `prepareTemporalCommand`。
- Preserves: map repository 可注入、route planner 可注入、地图不可用时的 availability/rejection 语义。

- [x] **Step 1: 增加 facade 与直接模块等价测试**

在 `scripts/test-world-context-linkage.mjs` 的 bundling entry 增加：

```js
"export { prepareWorldTurn as directPrepareWorldTurn } from './src/services/turn/worldPreparation.ts';"
```

导入后断言：

```js
assert.equal(prepareWorldTurn, directPrepareWorldTurn);
```

现有抵达、地图不可用、路线和事务准备测试保持不变。

- [x] **Step 2: 运行测试，确认新模块缺失**

Run:

```bash
npm run test:world-context-linkage
```

Expected: FAIL，缺少 `worldPreparation.ts`。

- [x] **Step 3: 将准备阶段完整迁移到新模块**

移动原 `turnResolution.ts` 第 307–789 行，包括：

```ts
function buildTravelBaseline(
  gameState: GameState,
  lord: LordProfile,
  context: CharacterCommandBatchBaseContext,
  knownLocationIds: ReadonlySet<string>,
): WorldBaselineSnapshot
function isTravelCommandType(type: string): boolean
function elapsedDays(intent: ResolvedLocationWorldIntent): number
async function defaultRoutePlanner(request: RouteRequest): Promise<RoutePlan>
function mergeWorldTransaction(target: WorldTransaction, source: WorldTransaction): void
function sameDuchyNeighborCounties(
  currentLocationId: string,
  memberships: readonly SemanticMembership[],
): ReadonlySet<string>
function worldDateOrdinal(date: WorldDate): number
function prepareTemporalCommand(
  commands: readonly StateCommand[],
  currentDate: WorldDate,
): { command?: StateCommand; days?: number }
export async function prepareWorldTurn(input: PrepareWorldTurnInput): Promise<PreparedWorldTurn>
```

只调整相对 imports；所有分支、错误文案、事务 ID 和数组顺序保持原样。`turnResolution.ts` 改为：

```ts
export { prepareWorldTurn } from './turn/worldPreparation';
```

- [x] **Step 4: 运行世界准备和旅行回归**

Run:

```bash
npm run test:world-context-linkage
npm run test:map-travel
npm run test:location-authority
npm run test:world-intent-resolver
npm run test:world-travel-linkage
npm run build:code
```

Expected: 全部 PASS。

- [x] **Step 5: 提交世界准备拆分**

```bash
git add src/services/turn/worldPreparation.ts src/services/turnResolution.ts \
  scripts/test-world-context-linkage.mjs scripts/test-map-travel.mjs scripts/test-location-authority.mjs
git commit -m "refactor: extract world turn preparation"
```

---

### Task 6: 提取旧结算和当前结算，完成回合 facade

**Files:**
- Create: `src/services/turn/legacySettlement.ts`
- Create: `src/services/turn/settlement.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `scripts/test-turn-pipeline.mjs`
- Modify: `scripts/test-world-context-linkage.mjs`
- Modify: `scripts/test-map-independent-turn.mjs`

**Interfaces:**
- Produces internally: `settleLegacyTurnDraft(input: SettleTurnDraftInput): SettledTurn`。
- Produces publicly: `settleTurnDraft(input: SettleTurnDraftInput): SettledTurn`。
- Preserves: `preparedWorld` 缺失时走 legacy；存在时先结算非 world-managed commands，再原子提交世界事务。

- [x] **Step 1: 加入新旧路径的显式回归断言**

在 `scripts/test-turn-pipeline.mjs` 增加两个断言：

```js
assert.equal(typeof settleTurnDraft, 'function');
assert.equal(settled.transactionId.startsWith('turn:'), true);
```

在 `scripts/test-world-context-linkage.mjs` 保留 prepared path，并增加：

```js
assert.equal(preparedWorld.availability.map, 'available');
assert.equal(settled.worldRuntime.revision, settled.worldHistory.turns.length);
```

`test-map-independent-turn` 继续覆盖地图不可用但非地图回合可结算的路径。

- [x] **Step 2: 提取 legacy 结算**

把原第 791–1142 行移入 `legacySettlement.ts`。文件公开：

```ts
export function settleLegacyTurnDraft(input: SettleTurnDraftInput): SettledTurn
```

其内部仍调用现有 `applyStateCommands`、人物命令校验、世界历史 append 和事实函数；不得删除任何 rejected command、character event 或 fatal death 分支。

- [x] **Step 3: 提取当前结算入口**

把原第 1144–1401 行移入 `settlement.ts`，包括：

```ts
function isWorldManagedStateCommand(command: StateCommand): boolean
function withPendingStatuses(
  runtime: WorldRuntimeState,
  pending: readonly PendingWorldTransaction[],
  status: 'committed' | 'rejected',
  reason?: string,
): WorldRuntimeState
function rejectedPreparedTurn(
  input: SettleTurnDraftInput,
  base: SettledTurn,
  prepared: PreparedWorldTurn,
  reason: string,
): SettledTurn
export function settleTurnDraft(input: SettleTurnDraftInput): SettledTurn
```

`settlement.ts` 从 `legacySettlement.ts` 导入 legacy 函数，从 `settlementFacts.ts` 导入事实和叙事上下文函数。

- [x] **Step 4: 将原文件缩为纯 facade**

`src/services/turnResolution.ts` 最终只包含：

```ts
export * from './turn/resolutionTypes';
export * from './turn/resolutionProtocol';
export { prepareWorldTurn } from './turn/worldPreparation';
export { settleTurnDraft } from './turn/settlement';
```

不得在 facade 中保留业务函数、数据库调用或世界状态 mutation。

- [x] **Step 5: 运行完整回合链测试**

Run:

```bash
npm run test:turn-pipeline
npm run test:world-context-linkage
npm run test:map-independent-turn
npm run test:unified-turn
npm run test:state-reducer
npm run test:character-ai
npm run check:world-runtime-boundaries
npm run build:code
```

Expected: 全部 PASS；所有现有通过 `export * from './src/services/turnResolution.ts'` 的脚本继续工作。

- [x] **Step 6: 提交结算拆分**

```bash
git add src/services/turn src/services/turnResolution.ts scripts/test-turn-pipeline.mjs scripts/test-world-context-linkage.mjs scripts/test-map-independent-turn.mjs
git commit -m "refactor: split turn settlement services"
```

---

### Task 7: 拆分 CK3 人物窗口

**Files:**
- Create: `src/components/character-window/CharacterIdentityHeader.tsx`
- Create: `src/components/character-window/CharacterOverview.tsx`
- Create: `src/components/character-window/CharacterRelationsTab.tsx`
- Create: `src/components/character-window/CharacterHistoryTab.tsx`
- Create: `src/components/character-window/CharacterAssetsTab.tsx`
- Create: `src/components/character-window/CharacterTraitOverlay.tsx`
- Create: `src/components/character-window/relationshipCards.ts`
- Create: `src/components/character-window/useVerifiedLordFamily.ts`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `scripts/check-ck3-character-window.mjs`
- Modify: `src/app/runtime-flows.test.tsx`

**Interfaces:**
- Preserves: `Ck3CharacterWindowProps` 与 `Ck3CharacterWindow`。
- Produces: 子组件接收完整 view props，不直接创建第二份 store 或 repository。
- Rule: 现有 `data-ck3-character-window`、`data-character-*` 标记、可见文本和回调行为保持不变。

- [x] **Step 1: 将源码检查改为读取容器与子目录的组合源码**

在 `scripts/check-ck3-character-window.mjs` 新增目录读取：

```js
async function readTree(relativeDir) {
  const names = (await readdir(join(root, relativeDir))).filter((name) => /\.tsx?$/.test(name)).sort();
  return (await Promise.all(names.map((name) => read(`${relativeDir}/${name}`)))).join('\n');
}

const containerSource = await read('src/components/Ck3CharacterWindow.tsx');
const childSource = await readTree('src/components/character-window');
const windowSource = `${containerSource}\n${childSource}`;
```

根标记和公共 props 必须继续只在 `containerSource` 检查；六项属性、关系卡、历史、资产和特质 overlay 的检查使用组合源码。

- [x] **Step 2: 运行检查，确认子目录尚不存在**

Run:

```bash
npm run check:ck3-character-window
```

Expected: FAIL，提示 `src/components/character-window` 不存在。

- [x] **Step 3: 提取关系纯逻辑与家族 hook**

`relationshipCards.ts` 导出：

```ts
export interface RelationshipCard {
  group: 'father' | 'mother' | 'spouse' | 'child' | 'sibling' | 'relation'
  character: StaticCharacterRecord
  label: string
}

export function playerRelationshipCards(
  dossier: PlayerCharacterDossier,
  family: LordFamilyRecords | null,
): RelationshipCard[]

export function npcRelationshipCards(
  dossier: NpcCharacterDossier,
  records: ReadonlyMap<CharacterId, StaticCharacterRecord>,
): RelationshipCard[]
export function relationLabel(kind: string): string
export function isJonSnow(characterId: CharacterId | undefined): boolean
```

`useVerifiedLordFamily.ts` 导出：

```ts
export function useVerifiedLordFamily(
  dossier: PlayerCharacterDossier | null,
  worldHistory: WorldHistoryState,
  worldRuntime: WorldRuntimeState,
): { family: LordFamilyRecords | null; loading: boolean }
```

函数体从原文件原样迁移；继续使用同一个 module-scope `StaticCharacterRepository` 和 `dossierEventStore`。

- [x] **Step 4: 提取身份、概览和特质 overlay**

按原 DOM 顺序提取 `IdentityHeader`、`OverviewTab`、`TraitDetailOverlay`，把 `SectionTitle`、`ResourceCell`、`StorageSummary`、`EmptyState` 放在实际唯一消费者文件内；若被两个以上子组件共享，则放入 `CharacterOverview.tsx` 并显式 export。不得改变 className、aria、data attribute 或中文文案。

- [x] **Step 5: 提取关系、历史和资产 tabs**

分别迁移：

- 原 `RelationsTab`、`RelationshipRow` → `CharacterRelationsTab.tsx`
- 原 narrative profile、experiences、source links、player/NPC history → `CharacterHistoryTab.tsx`
- 原 `CharacterAssetsTab`、`woundLabel` → `CharacterAssetsTab.tsx`

子组件不得直接调用 `useGameStore`；容器继续读取 `gameState`、`worldEvents`、`lord` 和 dossier，再通过 props 传入。

- [x] **Step 6: 将容器缩为状态与编排入口**

`Ck3CharacterWindow.tsx` 只保留：

- `TABS` 与 `CharacterTab`；
- 公共 props；
- store selectors；
- `useCharacterDossier`、active tab、active trait；
- visible world events/display 组合；
- loading/error/main shell；
- 子组件编排。

目标不超过约 300 行，但优先保持 DOM 结构完全一致。

- [x] **Step 7: 运行人物窗口回归**

Run:

```bash
npm run check:ck3-character-window
npm run test:character-dossier
npm run test:character-navigation
npm run test:health-and-equipment-unified
npm run test:character-trait-display
npx vitest run src/app/runtime-flows.test.tsx
npm run build:code
```

Expected: 全部 PASS；运行时测试中的人物打开、返回、人物跳转和资产/地点回调不变。

- [x] **Step 8: 提交人物窗口拆分**

```bash
git add src/components/Ck3CharacterWindow.tsx src/components/character-window \
  scripts/check-ck3-character-window.mjs src/app/runtime-flows.test.tsx
git commit -m "refactor: split character window responsibilities"
```

---

### Task 8: 拆分 MapCanvas 的图层与生命周期职责

**Files:**
- Create: `src/features/map/canvas/journeyLayers.ts`
- Create: `src/features/map/canvas/useMapLifecycle.ts`
- Create: `src/features/map/canvas/useMapCameraSync.ts`
- Create: `src/features/map/canvas/semanticProjectionController.ts`
- Create: `src/features/map/canvas/landmarkRuntimeController.ts`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Preserves: `prewarmMapRuntime()`、`MapCanvas` 和全部 `MapCanvasProps` 行为。
- Produces: `ensureJourneyLayers`, `syncJourneyLayers`, `useMapLifecycle`, `useMapCameraSync`, `createMapSemanticProjectionController`, `createLandmarkRuntimeController`。
- Invariant: 每个挂载周期一个 MapLibre instance、一个共享 canvas/context、一次完整 cleanup。

- [x] **Step 1: 更新地图边界测试以允许实现进入 canvas 子目录**

`check-map-runtime-boundaries.mjs` 已扫描整个 `src/features/map`，保留这一范围；将只读取 `MapCanvas.tsx` 的动态地标断言改为组合检查：

```js
const canvasRuntimeSource = files
  .filter((path) => path.includes('src/features/map/canvas/') || path.endsWith('src/features/map/MapCanvas.tsx'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
assert.match(canvasRuntimeSource, /import\(['"]\.\.\/landmarks\/landmarkRuntime\.ts['"]\)/);
```

在 `scripts/test-map-integration.mjs` 增加静态合同：`MapCanvas.tsx` 只能出现一次 `useMapLifecycle(`，且新生命周期模块只能出现一次 `new maplibregl.Map(`。

- [x] **Step 2: 提取旅行图层纯函数**

将原第 105–228 行移动到 `canvas/journeyLayers.ts`，导出：

```ts
export function viewportPixelBounds(map: MapLibreMap, manifest: MapManifest): MapBounds
export function ensureJourneyLayers(map: MapLibreMap): void
export function syncJourneyLayers(
  map: MapLibreMap,
  manifest: MapManifest,
  routePlan: RoutePlan | null | undefined,
  journey: ActiveJourney | undefined,
): void
```

`emptyFeatureCollection`、`routeCoordinates`、`progressCoordinates`、`lineCollection`、`pointCollection` 保持文件私有。source/layer ID 和 paint/layout 表达式逐字迁移。

- [x] **Step 3: 提取语义投影 hook**

`semanticProjectionController.ts` 管理：

```ts
export interface SemanticRuntimeContext extends SemanticMembershipIndex {
  primaryRank: SemanticRank
}

export function createMapSemanticProjectionController(input: {
  map: MapLibreMap
  semanticRef: React.MutableRefObject<SemanticRuntimeContext | null>
  countyInteractionRef: React.MutableRefObject<CountyInteractionIndex | null>
  getPresentation(): MapPresentation
  getSelectedCountyId(): string | null
  getPoliticalStates(): readonly PoliticalFeatureState[]
  getCharacterPoints(): readonly MapCharacterPoint[]
  getAssetPoints(): readonly MapAssetPoint[]
  onInitializationError(value: boolean): void
}): { initialize(): Promise<void>; refreshSubjects(): void; syncZoom(): void; destroy(): void }
```

它封装 repository semantic/search 加载、`applyPoliticalFeatureStates`、`syncDynamicMapSubjects`、`syncSelectedCountyLocations` 和 primary rank 切换；不得在连续 `zoom` 回调中重新加载或重建数据。

- [x] **Step 4: 提取地标 runtime hook**

`landmarkRuntimeController.ts` 导出与 MapLibre 生命周期配套的命令式控制器：

```ts
export interface LandmarkRuntimeController {
  initialize(): Promise<void>
  sync(reason: 'moveend' | 'zoomend'): void
  destroy(): void
}

export function createLandmarkRuntimeController(map: MapLibreMap): LandmarkRuntimeController
```

`useMapLifecycle.ts` 在 map/style ready 后调用 `initialize()`，在 `moveend`、`zoomend` 转发 `sync()`，并在唯一 cleanup 中调用 `destroy()`。内部继续动态导入 `../landmarks/landmarkRuntime.ts`；不新增 RAF、第二 canvas 或 Raycaster。

- [x] **Step 5: 提取 lifecycle 与 camera sync**

`useMapLifecycle.ts` 创建 MapLibre instance、semantic/landmark controllers、基础 layer/event listeners，并返回：

```ts
export interface MapLifecycleResult {
  containerRef: React.RefObject<HTMLDivElement>
  mapRef: React.MutableRefObject<MapLibreMap | null>
  styleReadyRef: React.MutableRefObject<boolean>
  initializationError: boolean
}
```

`useMapCameraSync.ts` 负责 `initialViewport`、`focusRequest`、`topDownLocked`、`northResetRequestId` 和 viewport 回调。focus 目标仍以 county `3.8`、location `4.8` 缩放，继续使用 `terrainCameraProfile` 与 `cameraAnimation`。

- [x] **Step 6: 将 MapCanvas 缩为组合入口**

保留 worker count、`prewarmMapRuntime`、props interface、错误 UI 和 hooks 编排。建议降至约 450 行以内。不得改变：

```text
COUNTY_HIT_LAYER
SELECTED_COUNTY_LOCATION_LAYER
CHARACTER_POINT_LAYER
ASSET_POINT_LAYER
JOURNEY_ROUTE_SOURCE
JOURNEY_PROGRESS_SOURCE
JOURNEY_POSITION_SOURCE
```

的 ID、注册顺序或点击传播规则。

- [x] **Step 7: 运行地图回归**

Run:

```bash
npm run test:map-integration
npm run test:map-runtime
npm run test:map-semantic-projection
npm run test:map-semantic-layers
npm run test:map-travel
npm run test:map-terrain-integration
npm run test:map-landmark-integration
npm run check:map-runtime-boundaries
npm run verify:map
npm run build:code
```

Expected: 全部 PASS；地图检查确认没有第二渲染循环、网络依赖或 zoom 时数据重建。

- [x] **Step 8: 提交地图画布拆分**

```bash
git add src/features/map/MapCanvas.tsx src/features/map/canvas \
  scripts/check-map-runtime-boundaries.mjs scripts/test-map-integration.mjs
git commit -m "refactor: split map canvas lifecycle"
```

---

### Task 9: 提取领域叶节点类型并消除最大类型环

**Files:**
- Create: `src/domain/characterId.ts`
- Create: `src/domain/character.ts`
- Create: `src/domain/body.ts`
- Create: `src/domain/worldDate.ts`
- Create: `src/domain/worldLocation.ts`
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/world/worldHistory.ts`
- Modify: `src/features/map/types.ts`
- Modify: `src/types/game.ts`
- Modify: 所有直接从聚合模块读取上述基础类型的 `src/**/*.ts(x)` imports
- Create: `scripts/test-domain-contracts.mjs`
- Modify: `package.json`
- Modify: `scripts/verify/suites.mjs`

**Interfaces:**
- Produces: `CharacterId`, `LordAttributes`, `BodyZoneKey`, `WoundLevel`, `WorldDate`, `WorldDateAdvance`, `WorldLocationRef` 的叶节点定义。
- Preserves: 原模块继续 re-export 同名类型，避免外部调用方立即失效。

- [x] **Step 1: 编写领域合同测试**

`scripts/test-domain-contracts.mjs` 使用 esbuild 编译以下类型赋值，并检查聚合模块 re-export：

```ts
import type { CharacterId as DomainCharacterId } from './src/domain/characterId.ts';
import type { CharacterId as LegacyCharacterId } from './src/features/characters/types.ts';
import type { WorldDate as DomainWorldDate } from './src/domain/worldDate.ts';
import type { WorldDate as LegacyWorldDate } from './src/features/world/worldHistory.ts';
import type { WorldLocationRef as DomainLocation } from './src/domain/worldLocation.ts';
import type { WorldLocationRef as LegacyLocation } from './src/features/map/types.ts';

const character: DomainCharacterId = 'agot:Stark_3';
const legacyCharacter: LegacyCharacterId = character;
const date: DomainWorldDate = { year: 298, month: 5, day: 10 };
const legacyDate: LegacyWorldDate = date;
const location: DomainLocation = { locationId: 'b_winterfell' };
const legacyLocation: LegacyLocation = location;
void [legacyCharacter, legacyDate, legacyLocation];
```

- [x] **Step 2: 运行测试，确认 domain 文件缺失**

Run:

```bash
node scripts/test-domain-contracts.mjs
```

Expected: FAIL，缺少 `src/domain/*`。

- [x] **Step 3: 创建叶节点类型并添加兼容 re-export**

定义：

```ts
// characterId.ts
export type CharacterId = `agot:${string}` | `save:${string}:${string}`;

// character.ts
export interface LordAttributes {
  diplomacy: number; martial: number; stewardship: number;
  intrigue: number; learning: number; prowess: number;
}

// body.ts
export type BodyZoneKey = 'head' | 'torso' | 'arms' | 'legs';
export type WoundLevel = 'intact' | 'minor' | 'heavy' | 'critical';

// worldDate.ts
export interface WorldDate { year: number; month: number; day: number }
export interface WorldDateAdvance { days?: number; months?: number; years?: number }

// worldLocation.ts
export interface WorldLocationRef { locationId: string; sceneLocation?: string }
```

原定义位置删除本地声明并 re-export：

```ts
export type { CharacterId } from '../../domain/characterId';
export type { WorldDate, WorldDateAdvance } from '../../domain/worldDate';
export type { WorldLocationRef } from '../../domain/worldLocation';
export type { LordAttributes } from '../domain/character';
export type { BodyZoneKey, WoundLevel } from '../domain/body';
```

同时在原文件内部用 `import type` 引入需要继续使用的同名类型，因为 re-export 不会创建本地绑定。

- [x] **Step 4: 将底层模块改为直接依赖 domain**

优先修改形成大环的路径：

```text
src/features/map/travel/types.ts
src/features/world/worldRuntimeTypes.ts
src/features/world/worldHistory.ts
src/features/characters/types.ts
src/features/characters/characterCommands.ts
src/services/dicePolicy.ts
src/types/game.ts
```

规则：feature 内部的底层合同直接 import `src/domain/*`；顶层 UI 可暂时使用兼容 re-export。`types/game.ts` 组合 `GameState`，但不再定义这些基础类型。

- [x] **Step 5: 注册并运行领域测试**

在 `package.json` 加：

```json
"test:domain-contracts": "node scripts/test-domain-contracts.mjs"
```

加入 quick/full suite，然后运行：

```bash
npm run test:domain-contracts
npm run test:dice-policy
npm run test:character-commands
npm run test:world-history
npm run test:map-travel
npm run test:verification-suites
npm run build:code
```

Expected: 全部 PASS。

- [x] **Step 6: 提交领域叶节点迁移**

```bash
git add src/domain src/features/characters src/features/world src/features/map src/services/dicePolicy.ts \
  src/types/game.ts scripts/test-domain-contracts.mjs scripts/verify/suites.mjs package.json
git commit -m "refactor: extract stable domain contracts"
```

---

### Task 10: 消除四个局部循环并加入循环依赖门禁

**Files:**
- Create: `src/features/items/worldArtifactTypes.ts`
- Create: `src/data/characterTraitTypes.ts`
- Create: `src/features/items/itemValidation.ts`
- Create: `src/features/characters/characterEventTypes.ts`
- Create: `src/features/characters/characterEventProjection.ts`
- Create: `scripts/check-module-cycles.mjs`
- Create: `scripts/test-module-cycles.mjs`
- Modify: `src/data/generated/agotArtifactWorldState.ts`
- Modify: `src/features/items/worldArtifacts.ts`
- Modify: `src/data/importedCharacterTraitDefinitions.ts`
- Modify: `src/data/characterTraits.ts`
- Modify: `src/features/items/custody.ts`
- Modify: `src/features/items/state.ts`
- Modify: `src/features/characters/characterEventStore.ts`
- Modify: `src/features/characters/characterProjector.ts`
- Modify: `src/features/characters/characterRelationshipProjection.ts`
- Modify: `src/features/characters/characterItems.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/services/db.ts`
- Modify: `package.json`
- Modify: `scripts/verify/suites.mjs`

**Interfaces:**
- Produces: `findModuleCycles(rootDir): string[][]` 和 CLI `npm run check:module-cycles`。
- Preserves: `worldArtifacts.ts` 与 `characterEventStore.ts` 的现有公共 type/function exports 通过 re-export 保持可用。
- Acceptance: `src` 静态 import graph 中 SCC 大小大于 1 的数量为 0。

- [x] **Step 1: 先写循环检测器测试夹具**

`scripts/test-module-cycles.mjs` 在临时目录创建：

```text
a.ts -> b.ts
b.ts -> c.ts
c.ts -> a.ts
leaf.ts -> external package
```

测试：

```js
assert.deepEqual(findModuleCycles(fixtureRoot), [['a.ts', 'b.ts', 'c.ts']]);
assert.deepEqual(findModuleCycles(acyclicRoot), []);
```

再对真实 `src` 运行并先断言当前已知 5 个 SCC 被发现，确保检查器不是空实现。

- [x] **Step 2: 实现 TypeScript AST import graph**

`check-module-cycles.mjs` 使用已安装的 `typescript`：

```js
import ts from 'typescript';

export function importedSpecifiers(sourceText, fileName) {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const values = [];
  source.forEachChild((node) => {
    const isImport = ts.isImportDeclaration(node) || ts.isExportDeclaration(node);
    if (isImport && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      values.push(node.moduleSpecifier.text);
    }
  });
  return values;
}
```

只解析以 `.` 开头的相对 specifier，按 `.ts`、`.tsx`、`/index.ts`、`/index.tsx` 解析；随后使用 Tarjan 或 Kosaraju 计算 SCC。CLI 对环排序并打印：

```text
模块循环依赖：
src/a.ts -> src/b.ts -> src/c.ts -> src/a.ts
```

发现任一环时设置非零退出码。

- [x] **Step 3: 运行检测器测试并记录当前真实环**

Run:

```bash
node scripts/test-module-cycles.mjs
node scripts/check-module-cycles.mjs || true
```

Expected: fixture 测试 PASS；真实检查打印规格列出的 5 组环。

- [x] **Step 4: 解除生成资产与运行时资产环**

把 `WorldArtifactPlacement`、`WorldArtifactSource`、`WorldArtifactProjectionKind`、`WorldArtifactRecord`、`WorldArtifactState` 移入 `worldArtifactTypes.ts`。`worldArtifacts.ts` import 并 re-export 这些类型；生成文件改为：

```ts
import type { WorldArtifactState } from '../../features/items/worldArtifactTypes';
export const AGOT_ARTIFACT_WORLD_STATE = { /* existing generated literal */ } as const satisfies WorldArtifactState;
```

这样生成文件不再依赖会反向 import 它的 runtime module。

- [x] **Step 5: 解除人物特质定义环**

`characterTraitTypes.ts` 定义并导出：

```ts
export type TraitCategory = 'personality' | 'education' | 'lifestyle' | 'congenital' | 'health' | 'fame';
export type TraitSource = 'ck3' | 'agot';
export interface BaseCharacterTraitDefinition {
  id: string; name: string; category: TraitCategory; description: string;
  cost: number; icon: GameIconId; modifiers: Partial<LordAttributes>;
  exclusiveGroup?: string; incompatibleTraitIds?: readonly string[]; source?: TraitSource;
}
```

`characterTraits.ts` import/re-export 这些类型，并让完整 `CharacterTraitDefinition` 扩展基础定义、增加 `rules: TraitRuleSet`。`importedCharacterTraitDefinitions.ts` 只 import `characterTraitTypes.ts`。

- [x] **Step 6: 解除 custody 与 state 环**

将 `getCapacityPools`、`getEffectiveCarryUnits` 和 `canContainerAccept` 从 `custody.ts` 移入 `itemValidation.ts`。该文件只依赖 `items/types.ts` 与 catalog 查询函数，不依赖 `state.ts` 或 `custody.ts`。`custody.ts` 和 `state.ts` 都从 `itemValidation.ts` import；`custody.ts` re-export `canContainerAccept` 保持旧测试兼容。

- [x] **Step 7: 解除人物事件与 Dexie 环**

`characterEventTypes.ts` 定义 `CharacterEventInput`、`CharacterEventEnvelope`、`CharacterEventProjection`、`CharacterEventRowWriter`、`CharacterEventStore`。

`characterEventProjection.ts` 移入：

```ts
export function sameCharacterEventContent(
  left: CharacterEventEnvelope,
  right: CharacterEventEnvelope,
): boolean

export async function appendCharacterEventRows(
  writer: CharacterEventRowWriter,
  runId: string,
  turn: number,
  events: readonly CharacterEventInput[],
): Promise<void>

export function projectCharacterEvents(
  base: StaticCharacterRecord,
  envelopes: readonly CharacterEventEnvelope[],
): CharacterEventProjection
```

`characterEventStore.ts` 只保留 InMemory/Dexie adapters，依赖 `services/db.ts`；`services/db.ts` 只 import `characterEventTypes.ts`，不再 import adapter。旧 `characterEventStore.ts` re-export types 和 pure projection functions 以保持兼容。

- [x] **Step 8: 将真实循环检查加入验证套件**

`package.json` 增加：

```json
"test:module-cycles": "node scripts/test-module-cycles.mjs",
"check:module-cycles": "node scripts/check-module-cycles.mjs"
```

`quick` 和 `full` 都加入这两项，顺序为 `test:module-cycles` 后紧接 `check:module-cycles`。更新验证 suite 基线测试中的明确增量列表：`full` 的增量从 `['test:verification-suites']` 变为 `['test:verification-suites', 'test:domain-contracts', 'test:module-cycles', 'check:module-cycles']`；`quick` 同步增加这三项结构检查。旧 115 项仍须按原顺序完整包含。

- [x] **Step 9: 运行局部系统与循环回归**

Run:

```bash
npm run test:agot-artifact-world-state
npm run test:world-artifact-state
npm run test:imported-trait-policy
npm run test:item-custody
npm run test:item-state-commands
npm run test:character-store
npm run test:character-runtime
npm run test:module-cycles
npm run check:module-cycles
npm run test:verification-suites
npm run build:code
```

Expected: 全部 PASS；`check:module-cycles` 输出 0 个 SCC。

- [x] **Step 10: 提交循环依赖治理**

```bash
git add src/data src/features/items src/features/characters src/services/db.ts \
  scripts/check-module-cycles.mjs scripts/test-module-cycles.mjs scripts/verify/suites.mjs package.json
git commit -m "refactor: remove module dependency cycles"
```

---

### Task 11: 建立当前文档、测试和数据流水线入口

**Files:**
- Create: `docs/INDEX.md`
- Create: `docs/TESTING.md`
- Create: `docs/DATA_PIPELINES.md`
- Modify: `README.md`
- Modify: `docs/CURRENT_ARCHITECTURE.md`

**Interfaces:**
- Produces: 开发者从根 README 到当前架构、测试套件和数据生成器的单一路径。
- Preserves: 历史 specs/plans 原地保留，不改写为当前权威行为。

- [x] **Step 1: 编写文档链接检查脚本片段并先验证缺失**

在现有文档检查方式中若无统一脚本，则直接使用以下命令作为任务合同：

```bash
test -f docs/INDEX.md
test -f docs/TESTING.md
test -f docs/DATA_PIPELINES.md
```

Expected before creation: FAIL。

- [x] **Step 2: 编写 `docs/INDEX.md`**

必须包含以下分区和明确链接：

```markdown
# 项目文档索引
## 当前权威说明
- `CURRENT_ARCHITECTURE.md`
## 开发与验证
- `TESTING.md`
- `DATA_PIPELINES.md`
## 当前设计
- 项目结构收敛设计与实施计划
## 历史记录
- `superpowers/specs/`
- `superpowers/plans/`
```

说明历史规格用于追踪决策，不自动覆盖 `CURRENT_ARCHITECTURE.md`。

- [x] **Step 3: 编写 `docs/TESTING.md`**

逐项记录：

- `npm run verify:quick`：日常快速边界与 code build；
- `npm run verify:world-linkage`：人物、资产、旅行、标题与世界事务联动；
- `npm run verify:map`：地图 schema、瓦片、地形、交互、3D 地标；
- `npm run verify`：115 个迁移前唯一叶子任务加新增结构门禁；
- 单项 `test:*`/`check:*` 是稳定调试入口；
- runner fail-fast、退出码和 `[n/total]` 输出；
- 验证不运行 `import:agot-map`、`import:agot-models` 或任何网络研究脚本。

- [x] **Step 4: 编写 `docs/DATA_PIPELINES.md`**

用表格列出至少五条流水线：

| 资料 | 输入 | 生成器 | 输出 | 运行时限制 |
|---|---|---|---|---|
| 地图 | AGOT 离线模组 | `scripts.agot_map_import` | `public/data/agot-map` | 浏览器只读本地静态资料 |
| 人物 | AGOT 离线模组 | `scripts.agot_character_import` | `public/data/agot-characters` | 按索引/分片读取 |
| 卷宗补充 | `scripts/data/character-dossier` | `compile_dossier_supplements.mjs` | `src/data/generated/characterDossierSupplements.ts` | 生成结果随应用打包 |
| 神器 | AGOT 离线模组 | `scripts.agot_artifact_import` | generated definitions/world state 与图片 | verify 只测 fixture，不真实导入 |
| 3D 地标 | AGOT 模型 | `scripts.agot_model_import` | `public/data/agot-map/models`、`public/assets/agot-map/models` | 运行时无模组目录访问 |

注明生成产物不可手改、导入命令的网络/本机数据边界和确定性要求。

- [x] **Step 5: 更新根 README 与当前架构**

根 `README.md` 在开发文档区链接 `docs/INDEX.md`。`CURRENT_ARCHITECTURE.md` 增加“工程边界”小节，指向 suite runner、domain leaf contracts、turn facade、character-window 和 map/canvas；不重复整份实现计划。

- [x] **Step 6: 验证文档与路径**

Run:

```bash
test -f docs/INDEX.md && test -f docs/TESTING.md && test -f docs/DATA_PIPELINES.md
rg "CURRENT_ARCHITECTURE|TESTING|DATA_PIPELINES" docs/INDEX.md README.md
rg "import:agot-map|import:agot-models|compile_dossier_supplements" docs/DATA_PIPELINES.md docs/TESTING.md
git diff --check
npm run verify:quick
```

Expected: 全部 PASS。

- [x] **Step 7: 提交文档入口**

```bash
git add README.md docs/INDEX.md docs/TESTING.md docs/DATA_PIPELINES.md docs/CURRENT_ARCHITECTURE.md
git commit -m "docs: add project development index"
```

---

### Task 12: 全量验证、结构审计与规格收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-project-structure-consolidation-design.md`
- Modify: `docs/superpowers/plans/2026-08-21-project-structure-consolidation.md`
- Modify only if verification exposes a regression: the owning task's files

**Interfaces:**
- Produces: 可复现的最终验证证据和状态为“已实现”的规格。
- Rule: 验证失败必须回到拥有该问题的任务修复，不得通过删除测试、放宽断言或提高 bundle 预算绕过。

- [x] **Step 1: 运行静态结构审计**

Run:

```bash
npm run test:verification-suites
npm run test:domain-contracts
npm run test:module-cycles
npm run check:module-cycles
find . -maxdepth 1 -name '*.py' -print
rg "data/characterDossierSupplements|scripts/raw_supplements_part" src scripts || true
wc -l src/services/turnResolution.ts src/components/Ck3CharacterWindow.tsx src/features/map/MapCanvas.tsx
git diff --check
```

Expected:

- 所有合同测试 PASS；
- 循环数为 0；
- 根目录 Python 列表为空；
- 旧生成路径无命中；
- `turnResolution.ts` 只剩 facade；
- 人物窗口约 300 行以内；
- 地图画布约 450 行以内，或因不可拆 invariant 略高但职责清晰；
- `git diff --check` 无输出。

- [x] **Step 2: 验证固定版本和资源未误删**

Run:

```bash
rg "saveFormatVersion: 9|ITEM_SAVE_FORMAT_VERSION = 9" src
rg "schemaVersion: z.literal\(4\)|schemaVersion: 4" src/features/map scripts/agot_map_import
rg "ENTRY_BUDGET_BYTES = 750 \* 1024" scripts/check-bundle-budget.mjs
git diff --name-status -- public
```

Expected: 版本与预算命中；`public` 没有由结构整理产生的删除或批量改写。

- [x] **Step 3: 运行完整验证**

Run:

```bash
npm run verify
```

Expected: runner 顺序执行全部旧唯一叶子任务及新增结构门禁，最终退出码 0。

- [x] **Step 4: 再运行生产构建和工作树检查**

Run:

```bash
npm run build
git diff --check
git status --short
```

Expected: build PASS；只显示规格/计划状态更新或明确属于本轮尚未提交的文件。

- [x] **Step 5: 更新规格和计划状态**

将规格头部改为：

```markdown
状态：已实现；当前运行时权威说明见 `docs/CURRENT_ARCHITECTURE.md`
```

在本计划已完成的 checkbox 全部标记为 `[x]`，并在末尾追加实际验证命令、退出码 0 和完成日期 `2026-08-21`。不得写未经执行的验证结果。

- [x] **Step 6: 提交收尾状态**

```bash
git add docs/superpowers/specs/2026-08-21-project-structure-consolidation-design.md \
  docs/superpowers/plans/2026-08-21-project-structure-consolidation.md
git commit -m "docs: complete project structure consolidation"
```

- [x] **Step 7: 确认最终仓库状态**

Run:

```bash
git status --short --branch
git log --oneline -12
```

Expected: 工作树干净；最近提交按本计划任务边界排列；不执行 `git push`。

---

## 执行检查点

- Task 1 完成后：验证编排具备可靠基线，后续所有迁移都使用新 runner。
- Task 6 完成后：回合服务 facade 稳定，进行一次 `npm run verify:world-linkage`。
- Task 8 完成后：核心 UI 拆分结束，进行一次 `npm run verify:quick && npm run verify:map`。
- Task 10 完成后：循环依赖必须为 0，才允许进入文档与收尾任务。
- Task 12 完成后：仅报告本地提交，不推送。

## 实施完成记录

完成日期：2026-08-21。

本计划已在当前 `main` 工作区直接实施；未创建 worktree，未推送远端。收尾阶段实际执行并通过以下验证：

```text
npm run test:verification-suites              退出码 0
npm run test:domain-contracts                 退出码 0
npm run test:module-cycles                    退出码 0
npm run check:module-cycles                   退出码 0（0 个循环）
find . -maxdepth 1 -name '*.py' -print        退出码 0（无输出）
rg "data/characterDossierSupplements|scripts/raw_supplements_part" src scripts || true
                                               退出码 0（无旧路径命中）
wc -l src/services/turnResolution.ts src/components/Ck3CharacterWindow.tsx src/features/map/MapCanvas.tsx
                                               退出码 0（4 / 196 / 86 行）
rg "saveFormatVersion: 9|ITEM_SAVE_FORMAT_VERSION = 9" src
                                               退出码 0
rg "schemaVersion: z.literal\(4\)|schemaVersion: 4" src/features/map scripts/agot_map_import
                                               退出码 0
rg "ENTRY_BUDGET_BYTES = 750 \* 1024" scripts/check-bundle-budget.mjs
                                               退出码 0
git diff --name-status -- public              退出码 0（无正式资源改动）
npm run verify                                退出码 0（119/119）
npm run build                                 退出码 0
git diff --check                              退出码 0
```

`check:bundle-budget` 报告生产入口 JavaScript 为 723,028 字节，低于固定的 768,000 字节上限。完整验证中发现并修复了 `check:ck3-attributes` 对旧 facade 内联接口的静态依赖；检查器现读取权威领域定义 `src/domain/character.ts`，六项属性断言未放宽。
