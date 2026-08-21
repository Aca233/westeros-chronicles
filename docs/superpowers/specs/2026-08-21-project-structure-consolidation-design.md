# 项目结构收敛设计

日期：2026-08-21  
状态：已实现；当前运行时权威说明见 `docs/CURRENT_ARCHITECTURE.md`

## 1. 背景与问题

项目当前的玩法闭环已经形成：正文叙事、LLM 回合解析、人物卷宗、世界状态、地图、旅行和资产系统能够互相定位并共同推进。但工程组织仍保留了快速扩建阶段的痕迹，主要表现为：

1. `package.json` 同时承担单项命令注册和完整验证编排，已有 147 个 scripts；`verify` 与 `verify:map` 是超长 shell 串，难以审计覆盖范围、重复项和失败位置。
2. `src/services/turnResolution.ts` 同时负责 LLM 协议、世界回合准备、事实生成、旧路径兼容和结算，已超过 1400 行。
3. `Ck3CharacterWindow.tsx`、`MapCanvas.tsx` 等核心组件混合数据读取、派生状态、生命周期、布局和交互职责。
4. 根目录散落 19 个历史研究脚本，生成输入、生成产物和运行时手写资料边界不统一。
5. 当前存在 5 组模块循环依赖。多数由类型导入或适配器反向依赖造成，运行时尚未失控，但会增加后续拆分风险。
6. 历史规格数量持续增长，缺少面向当前开发者的文档入口、数据生成说明和测试分组说明。

因此，本轮不是产品重做，也不是新玩法开发，而是一次**保持外部行为不变的工程结构收敛**。目标是让现有闭环更容易理解、验证和继续扩展。

## 2. 设计目标

1. 将完整验证从超长 shell 串改为可审计、可去重、跨平台的 JavaScript suite runner。
2. 将回合解析与结算拆成职责单一的模块，同时保留现有公共导入路径。
3. 将人物窗口和地图画布中的独立职责提取为子组件、纯函数和 hooks，不改变 UI 与交互。
4. 将历史研究脚本、生成输入、生成产物和文档入口放入明确目录。
5. 消除已知模块循环依赖，并用自动检查阻止新增循环。
6. 让每个整理阶段都可独立验证、独立回退，不采用一次性大迁移。
7. 保持当前项目的 LLM—正文—人物—地图—资产—世界状态闭环及其权威数据关系不变。

## 3. 非目标

本轮明确不做以下事项：

1. 不新增玩法、人物属性、地图层级、资产类型或 LLM 能力。
2. 不改变任何玩家可见文案、视觉样式、DOM 语义或交互流程。
3. 不升级存档格式，不迁移或重置现有存档。
4. 不升级地图 manifest schema，不重新定义地图数据语义。
5. 不重新生成正式 AGOT 地图、人物、资产或模型资料，除非移动生成文件后需要证明输出字节等价。
6. 不删除或压缩 `public/data`、`public/assets` 等正式离线资源。
7. 不把全部类型集中进新的“万能 types 文件”。
8. 不全面重命名现有 `test:*`、`check:*` 命令；它们继续作为稳定的开发者接口。
9. 不引入新的状态管理框架、测试框架或构建系统。
10. 不在验证流程中访问网络、Steam、Workshop 或本机 AGOT 模组目录。

## 4. 方案选择

### 4.1 方案 A：只整理目录

仅移动根目录脚本、补充文档，不触碰验证编排和核心模块。

优点是风险最低；缺点是不会解决最主要的可维护性问题，巨型验证命令、巨型服务和循环依赖仍然存在。本方案不足以达到本轮目标。

### 4.2 方案 B：一次性重写核心架构

重新设计统一领域层、服务层、UI 层和所有公开导入路径。

优点是目录可以迅速统一；缺点是会同时改变大量模块边界，回归定位困难，也容易把新的抽象误当成稳定架构。对当前已形成闭环的项目风险过高。

### 4.3 方案 C：兼容门面下的渐进式收敛（采用）

先建立验证护栏，再按职责提取内部实现；旧公共文件保留为 facade/re-export，单项测试命令保持兼容。每一阶段均要求行为等价和独立提交，最后再启用循环依赖门禁。

该方案能在不改变产品行为的前提下逐步降低耦合，并为后续开发保留清晰的回退点，因此作为本设计的实施方案。

## 5. 全局兼容合同

整个整理过程必须持续满足以下合同：

- `saveFormatVersion` 保持 `9`。
- 地图 manifest `schemaVersion` 保持 `4`。
- 生产入口 JavaScript 预算保持不超过 `750 KiB`。
- `src/services/turnResolution.ts` 的现有公共导出继续可用：
  - `parseTurnResolutionOutput`
  - `buildTurnResolutionMessages`
  - `requestTurnResolution`
  - `prepareWorldTurn`
  - `settleTurnDraft`
  - 现有公开 interfaces/types
- `Ck3CharacterWindow.tsx` 和 `MapCanvas.tsx` 的组件入口、props、已有 `data-*` 标记及用户交互保持兼容。
- 世界日期、人物 ID、地点 ID、资产 ID、旅行状态和事件投影的权威来源不变。
- 旧结算兼容路径不得删除；缺少 `preparedWorld` 时仍按当前语义处理。
- 不删除正式资源，不改变生成数据内容和确定性哈希语义。
- 不推送远端；每个阶段以本地独立提交作为回退边界。

## 6. 验证编排

### 6.1 目录与接口

新增：

```text
scripts/verify/
├── run-suite.mjs
└── suites.mjs
```

`suites.mjs` 只声明验证步骤，不执行命令。核心结构为：

```ts
type VerificationStep = {
  id: string
  script: string
}

type VerificationSuite = {
  name: 'quick' | 'world' | 'map' | 'full'
  steps: readonly VerificationStep[]
}
```

`script` 对应 `package.json` 中现有的单项 script 名称，例如 `test:map-runtime`。runner 通过当前 Node 进程和 npm CLI 执行 `npm run <script>`，不得拼接 shell 命令字符串。

### 6.2 套件

保留四个稳定组合入口：

- `verify:quick` → `quick`
- `verify:world-linkage` → `world`
- `verify:map` → `map`
- `verify` → `full`

`full` 直接列出所有唯一叶子步骤，不递归调用 `verify:map` 或其他组合 suite。这样可以：

- 明确完整覆盖范围；
- 避免套件嵌套造成重复；
- 准确报告当前步骤与总进度；
- 在首个失败步骤立即退出，并保留子进程退出码。

现有 `test:*`、`check:*`、`build` 等单项命令继续保留。当前重复执行的 `test:item-action-queue` 在新 `full` 中只出现一次。

### 6.3 runner 行为

runner 必须：

1. 拒绝未知 suite。
2. 在执行前检查 step id 与 script 是否唯一。
3. 检查每个 `script` 均存在于 `package.json`。
4. 按声明顺序串行执行，避免并行任务争抢生成文件和构建目录。
5. 输出 `[当前/总数] suite: script`。
6. fail-fast，并把失败 script、耗时和退出码打印到 stderr。
7. 使用 `process.execPath`、`npm_execpath` 或平台安全的 spawn 参数，兼容 Windows 与 Linux。
8. 不触发网络、真实数据导入或未声明的递归 suite。

### 6.4 合同测试

新增 `scripts/test-verification-suites.mjs`，至少验证：

- 所有 suite 内无重复 step；
- 所有 step 都能解析到 package script；
- `full` 覆盖旧 `verify` 展开的全部唯一叶子任务；
- `map` 与 `world` 保持原组合入口的唯一叶子覆盖；
- runner 对未知 suite 和失败子进程返回非零退出码；
- 测试使用 dry-run/注入 executor，不实际执行完整验证。

该合同测试加入 `verify:quick` 和 `full`。

## 7. 回合服务拆分

### 7.1 目标结构

```text
src/services/turn/
├── resolutionTypes.ts
├── resolutionProtocol.ts
├── settlementFacts.ts
├── worldPreparation.ts
├── legacySettlement.ts
└── settlement.ts
```

职责如下：

- `resolutionTypes.ts`：回合解析、准备和结算的纯类型合同。
- `resolutionProtocol.ts`：LLM 输出解析、messages 构建与模型请求。
- `settlementFacts.ts`：事实规范化、事件和叙事所需的纯派生函数。
- `worldPreparation.ts`：旅行、世界上下文、意图和准备阶段。
- `legacySettlement.ts`：保留未提供 `preparedWorld` 时的旧结算语义。
- `settlement.ts`：当前结算入口和新旧路径选择。

原文件保留为薄门面：

```ts
export * from './turn/resolutionTypes'
export * from './turn/resolutionProtocol'
export * from './turn/worldPreparation'
export * from './turn/settlement'
```

### 7.2 拆分原则

1. 第一阶段只移动代码与修正 imports，不重写算法。
2. 每次提取后，旧入口与新模块测试同时通过。
3. 纯函数不得反向依赖 store 或 UI。
4. 世界准备阶段可以依赖世界领域服务，但结算事实模块不能依赖 React、Dexie 或 MapLibre。
5. `legacySettlement.ts` 是明确兼容边界，不因“看似未使用”而删除。
6. `useGameStore.ts` 继续通过原入口动态导入，除非后续有独立理由改变。

## 8. 人物窗口拆分

### 8.1 目标结构

```text
src/components/character-window/
├── CharacterIdentityHeader.tsx
├── CharacterOverview.tsx
├── CharacterRelationsTab.tsx
├── CharacterHistoryTab.tsx
├── CharacterAssetsTab.tsx
├── CharacterTraitOverlay.tsx
├── relationshipCards.ts
└── useVerifiedLordFamily.ts
```

`Ck3CharacterWindow.tsx` 保留为公开容器，负责：

- 接收原 props；
- 选择当前 tab；
- 组织共享的关闭、导航和人物切换回调；
- 把准备好的 view model 传给子组件。

### 8.2 约束

- 不修改可见布局、文本、尺寸、颜色、滚动行为和快捷操作。
- 不改变人物死亡状态、装备状态、关系、资产和历史信息的解析规则。
- 不删除现有 `data-*`、aria 标记和用于自动检查的稳定文本。
- 源码字符串检查必须升级为扫描容器及子组件，而不是迫使实现继续留在单文件中。
- `relationshipCards.ts` 只放纯派生逻辑，不持有 React 状态。
- `useVerifiedLordFamily.ts` 只封装当前校验/加载流程，不创建第二份人物权威状态。

目标是让容器以页面编排为主，建议降至约 300 行以内；行数不是验收的唯一标准，职责边界和行为等价优先。

## 9. 地图画布拆分

### 9.1 目标结构

```text
src/features/map/canvas/
├── journeyLayers.ts
├── useMapLifecycle.ts
├── useMapCameraSync.ts
├── semanticProjectionController.ts
└── landmarkRuntimeController.ts
```

`MapCanvas.tsx` 保留公开组件入口，并负责组合 hooks 与渲染 map container。

### 9.2 职责

- `journeyLayers.ts`：旅行线、节点和选中状态的 source/layer 定义与纯更新函数。
- `useMapLifecycle.ts`：创建、挂载、销毁唯一 MapLibre map 实例。
- `useMapCameraSync.ts`：外部选中状态、缩放和定位请求与相机同步。
- `semanticProjectionController.ts`：五级头衔可见性、政治投影和地点层同步。
- `landmarkRuntimeController.ts`：3D 地标载入、缓存、光照和可见性生命周期。

### 9.3 约束

- 每个挂载周期仍只有一个 MapLibre canvas 和一个 map instance。
- source/layer ID、添加顺序、缩放阈值和事件监听顺序保持不变。
- 不改变地标坐标、尺寸、材质、光照、缓存和海陆校正语义。
- 不改变点击伯爵领、地点打开、人物/资产跳转、旅行路线和相机回退行为。
- lifecycle cleanup 必须完整移除各 controller 注册的 listener、RAF、timer 和 custom layer。
- `MapCanvas.tsx` 建议降至约 450 行以内；不为追求行数机械拆分强耦合代码。

## 10. 根目录与数据流水线整理

### 10.1 历史研究脚本

将根目录 19 个历史研究 Python 脚本移动到：

```text
tools/research/external-rpg-ui/
```

新增该目录的 `README.md`，说明：

- 脚本只用于历史外部 RPG UI 研究；
- 依赖被 Git 忽略的 `scratch/fanren`、`scratch/yishijie` 等资料；
- 不属于产品构建、正式数据生成或验证流程；
- 抓取/下载脚本可能访问网络，绝不能被 `verify` 调用；
- 默认从项目根目录运行，移动后保持现有相对路径语义。

不删除这些脚本，也不把研究缓存加入 Git。

### 10.2 人物卷宗补充资料

`src/data/characterDossierSupplements.ts` 是生成产物，应移动为：

```text
src/data/generated/characterDossierSupplements.ts
```

原始生成输入移动为：

```text
scripts/data/character-dossier/
├── raw_supplements_part1.mjs
├── raw_supplements_part2.mjs
├── raw_supplements_part3.mjs
├── raw_supplements_part4.mjs
└── raw_supplements_part5.mjs
```

`compile_dossier_supplements.mjs`、运行时 imports 和相关测试同步更新。迁移前后生成文件正文必须字节等价；只允许 generated header 中的路径说明随新位置变化，且若 header 参与哈希，应保持原内容以避免无意义变化。

### 10.3 文档入口

新增：

```text
docs/INDEX.md
docs/TESTING.md
docs/DATA_PIPELINES.md
```

职责：

- `INDEX.md`：指向当前架构、当前可执行规格、历史规格目录和主要开发说明。
- `TESTING.md`：解释 quick/world/map/full 的用途、耗时预期、单项命令和失败定位方式。
- `DATA_PIPELINES.md`：列出地图、人物、卷宗、资产和模型数据的输入、生成器、输出与离线约束。

历史 `docs/superpowers/specs` 与 `plans` 不做物理搬迁，只通过索引区分“当前权威文档”和“历史实施记录”。

## 11. 模块循环依赖治理

### 11.1 原则

循环治理采用小型叶节点合同文件，而不是创建新的全局上帝模块。叶节点文件只能包含类型、常量或纯验证原语，不依赖 store、数据库、UI 或 feature 聚合模块。

建议新增：

```text
src/domain/
├── characterId.ts
├── character.ts
├── body.ts
├── worldDate.ts
└── worldLocation.ts
```

原 feature 文件可 re-export 已迁移类型，保持现有调用方兼容。

### 11.2 最大类型环

当前最大环跨越地图旅行、世界运行时、世界历史、人物命令、骰子策略和 `types/game.ts`。处理方式：

- `CharacterId` 移入 `src/domain/characterId.ts`。
- `LordAttributes` 等人物基础合同移入 `src/domain/character.ts`。
- `BodyZoneKey`、`WoundLevel` 等身体合同移入 `src/domain/body.ts`。
- `WorldDate`、`WorldDateAdvance` 移入 `src/domain/worldDate.ts`。
- `WorldLocationRef` 移入 `src/domain/worldLocation.ts`。
- `src/types/game.ts` 继续组合顶层 `GameState`，但不得再作为底层人物、骰子、旅行或世界日期类型的来源。

### 11.3 四个小环

1. **生成资产 ↔ 运行时资产**  
   将 `WorldArtifactState` 的纯数据 schema/type 提取到无运行时依赖的合同文件。生成文件只导出纯常量；运行时负责解析或校验，不让生成数据反向 import feature 实现。

2. **导入人物特质 ↔ 特质聚合**  
   将 `BaseCharacterTraitDefinition` 移到 `src/data/characterTraitTypes.ts`。导入定义与聚合模块都只依赖该叶节点类型。

3. **物品 custody ↔ state**  
   将 `canContainerAccept` 所需的容量/放置纯验证原语移入 `src/features/items/itemValidation.ts`。状态验证与 custody 命令单向依赖该文件，不互相 import。

4. **人物事件存储 ↔ Dexie db**  
   拆出：
   
   ```text
   src/features/characters/characterEventTypes.ts
   src/features/characters/characterEventProjection.ts
   ```
   
   `services/db.ts` 只依赖事件数据合同；`characterEventStore.ts` 作为 adapter 依赖 db；纯投影逻辑不依赖 db。

### 11.4 自动门禁

新增 `scripts/check-module-cycles.mjs`：

- 扫描 `src` 内静态 `import`、`export ... from` 和类型导入；
- 按 TypeScript/TSX 常用扩展名解析相对路径；
- 忽略注释、普通字符串、动态数据路径和第三方包；
- 用强连通分量检测模块环；
- 任一 SCC 包含两个或更多模块即非零退出；
- 输出每一条可重现的环路；
- 加入 `verify:quick` 与 `full`。

为降低自制解析器误判，实施时优先复用项目现有 TypeScript 依赖解析 AST；不新增仅用于该检查的大型生产依赖。

## 12. 迁移顺序与提交边界

实施顺序固定为：

1. 验证 suite runner 与合同测试。
2. 根目录研究脚本归档。
3. 人物卷宗生成数据与输入目录整理。
4. 回合服务 protocol/types/facts 拆分。
5. 世界准备阶段拆分。
6. 新旧结算拆分并保留 facade。
7. 人物窗口拆分。
8. 地图画布拆分。
9. 提取领域叶节点类型并消除最大环。
10. 消除四个小环并启用循环门禁。
11. 增加文档索引、测试和数据流水线说明。
12. 全量验证与最终清理。

每一步均形成一个本地提交。若某一步无法证明行为等价，应停止在上一提交，不把未完成迁移混入后续任务。

## 13. 测试与验收

### 13.1 每阶段验收

每个阶段至少运行：

- 与改动模块直接相关的单项测试；
- `npm run verify:quick`；
- `git diff --check`。

人物窗口和地图画布拆分还必须运行各自现有 UI、runtime、integration 和源码边界检查。

### 13.2 最终验收

最终必须运行并通过：

```bash
npm run verify
npm run build
git diff --check
git status --short
```

同时人工确认：

1. `saveFormatVersion === 9`。
2. 地图 `schemaVersion === 4`。
3. 首屏 bundle 预算仍为 `750 KiB`。
4. `src` 内循环依赖 SCC 数量为 0。
5. 根目录不再散落本轮列出的历史研究脚本。
6. `turnResolution.ts`、`Ck3CharacterWindow.tsx`、`MapCanvas.tsx` 均已成为清晰的编排/兼容入口，而非继续承载全部实现。
7. 新旧入口的相关测试均通过。
8. 正式 `public` 资源数量和内容未被清理任务误删。
9. 应用中的正文、人物、地图、旅行、资产和 LLM 回合闭环保持原行为。

## 14. 风险与控制

### 14.1 脆弱源码检查阻止合理拆分

现有部分检查直接搜索单个源码文件中的字符串。拆分时应把检查范围改为明确的组件文件集合或入口目录，并继续断言真实合同；不得为了让旧检查通过而把实现复制回巨型组件。

### 14.2 import 路径移动造成隐式漏改

生成资料和类型迁移必须使用全仓库静态搜索确认旧路径为零，并由 TypeScript build 与相关 bundling tests 双重验证。

### 14.3 facade 隐藏新的反向依赖

facade 只允许 re-export，不得重新加入业务逻辑。循环检查必须覆盖 facade 文件，防止通过门面把环路隐藏起来。

### 14.4 巨型提交难以回归

严格按第 12 节拆分提交。组件拆分与行为修改不得混在同一提交；若发现原有 bug，应另立规格处理，不在本轮顺手改变。

### 14.5 验证套件整理意外减少覆盖

合同测试以旧命令展开后的唯一叶子集合为基准。新 `full` 只允许去除已确认的重复执行，不允许遗漏任何原有唯一任务。

## 15. 完成定义

本设计完成时，项目的玩家可见行为和数据格式与整理前一致，但开发者可以：

- 从清晰的 suite 定义理解验证范围；
- 在失败时立即看到具体步骤；
- 分别阅读 LLM 协议、世界准备和回合结算；
- 分别维护人物窗口与地图画布的独立职责；
- 从统一文档入口找到测试与数据流水线；
- 在提交前自动阻止新的模块循环依赖；
- 明确区分正式运行时代码、生成数据、生成输入和历史研究工具。

只有全部兼容合同与最终验证通过，才能把本规格状态从“待确认/实施中”更新为“已实现”。
