# 当前运行时架构

日期：2026-08-21
状态：当前实现的权威说明

本文描述仓库现在实际运行的架构。历史规格用于记录设计演进；当历史规格与本文或代码冲突时，以当前代码、生成数据校验和本文为准。

## 1. 产品闭环

一次可提交的游戏回合形成以下闭环：

1. 页面启动时从 IndexedDB 读取并校验最近一份快照，同时预载完整物品目录。
2. 玩家从正文、人物卷宗、地图、资产详情或旅行规划器取得上下文并提交行动。
3. 第一阶段模型只输出规则解析草案；前端验证人物、物品、头衔、地点和旅行意图。
4. 确定性规则引擎执行 D20、状态命令、世界事务、时间推进和原作时间线迁移，得到“已接受事实”和“已拒绝事实”。
5. 第二阶段模型只能根据已结算事实生成正文和后续选择，不能重新决定世界状态。
6. 正文生成成功后，故事回合、世界账本、世界运行时、人物事件和快照在同一提交边界中写入。
7. Store 只在数据库原子提交成功后切换到新状态；失败或取消保留原世界与待处理事务。
8. 正文、人物、时间线、地图和资产界面从同一已提交状态重新投影。

因此 LLM 不是状态权威。它提出结构化候选与叙事文本，程序负责验证、结算和持久化。

## 2. 权威状态与静态基线

### 2.1 `GameState` 是回合事务根

`src/types/game.ts` 中的 `GameState` 是一个已提交游戏世界的根对象，当前存档格式为 9。关键字段包括：

- `lord`：玩家人物及其玩法物品状态
- `turns`：玩家可读的正文回合
- `worldHistory`：每回合接受/拒绝命令、日期和事件引用的审计账本
- `worldRuntime`：人物、头衔和资产相对静态基线的稀疏覆盖，以及权威世界事件和待处理事务
- `worldArtifacts`：AGOT 唯一物品在开局日期的生成基线
- `worldCharacters`：当前 run、人物数据集哈希和人物事件修订号
- `activeJourney`：正在进行的旅行

`worldHistory.turns`、`worldRuntime.revision`、`worldCharacters.revision`、故事回合数和当前日期在提交前必须一致。`src/services/db.ts` 的提交守卫拒绝分叉或不连续状态。

### 2.2 静态资料不是存档副本

人物分片、地图地点/头衔和神器定义是只读静态基线，不会整套复制进每个存档。`WorldBaselineRepository` 按当前意图收集最小人物、头衔、地点与资产切片，然后把 `worldRuntime` 覆盖应用到基线。

这套“静态基线 + 稀疏覆盖”避免把数万名人物和全部地图数据塞进每个回合，同时保证死亡、移动、婚姻、控制权和资产转移等变化在所有界面一致。

人物事件仍保存在 Dexie 的独立表中，但与快照在同一事务中提交，并由 `worldCharacters.runId/revision` 绑定到当前世界。

## 3. 回合管线

主要入口是 `useGameStore.submitAction()`：

- **解析阶段 `resolving`**：构造玩家可见上下文，请求结构化 `state_cmd` 与 `world_intent`。
- **结算阶段 `settling`**：验证命令，处理待提交 UI 事务，运行人物、物品、旅行、头衔和世界规则，生成确定的事实集合。
- **叙事阶段 `narrating`**：把已接受/拒绝事实交给模型生成正文；叙事不得增加新的状态变化。
- **提交阶段**：再次进入 `settling`，通过 `commitTurnAtomically()` 写入快照与人物事件，随后更新 Store。

用户可以取消解析或叙事请求。取消、模型失败、规则失败或数据库失败都不会提交半个回合。

## 4. 模型提供商边界

`src/services/modelProviders` 提供两种传输适配器：

- `openai-compatible`：OpenAI、DeepSeek、SiliconFlow 与自定义兼容端点
- `anthropic`：Anthropic Messages API

解析和叙事都经 `getModelProviderAdapter()` 选择协议，并共享 AbortSignal 与超时组合。Provider adapter 负责 HTTP 请求形状、流式响应和模型列表；规则引擎不依赖具体供应商。

## 5. 世界事件、可见性与名称

`worldRuntime.events` 是权威事件账本。事件具有 `public` 或 `secret` 可见性，秘密事件只有在 `knownBy` 明确包含当前玩家时才会进入玩家投影。未知值按隐藏处理。

以下玩家界面都必须先通过 `selectVisibleWorldEvents()`：

- 正文事实链接
- 人物经历
- 电视时间线
- 地图政治投影
- LLM 世界上下文

`worldDisplayResolver` 再把稳定 ID 解析为人物、地点、头衔和资产的准确名称。默认界面不显示内部命令枚举或“查看某对象”一类占位标签；无法解析时使用事件已有的自然语言摘要，原始审计数据只放在可选详情中。

## 6. 人物与资产

人物卷宗通过稳定 `CharacterId` 读取静态档案，再叠加当前 run 的事件与世界投影。玩家和 NPC 共用同一人物窗口；关系卡、正文人名、时间线人物和资产持有人都可以进入同一导航栈。

物品定义分为轻量基础目录和按启动边界预载的生成神器目录。运行时消费者继续同步读取共享 `ITEM_CATALOG`，但大型生成文件不进入首屏入口包。

世界神器记录具有显式 `projectionKind`：

- `portable-asset`：可以进入普通资产、保管、位置和装备投影
- `political-symbol`：制度性或政治象征，不作为普通可操作资产显示

普通物品的所有者、控制者、保管者和世界位置以 `worldRuntime.assets` 为权威覆盖；物品玩法字段不再维护第二套法理归属。

## 7. 地图是可降级的表现层

地图运行时只读取仓库内生成的离线文件。当前地图 manifest schema 为 4，政治语义等级为：

`hegemon → empire → kingdom → duchy → county`

缩放阈值硬切换主要头衔等级，同一时间只显示一级普通政治标签和边界。近景退出普通政治填色并显示地形、伯爵领内部地点、人物、资产和道路。政治颜色来自头衔；家族名只属于详情资料，不再作为地图副标题。男爵领 ID 仅用于内部地点映射。

地图选择最终落到伯爵领或具体地点。政治、人物、资产和道路是独立信息覆盖层；相机、Three.js 地标和图层状态都不是世界权威。

地图故障分两类处理：

- 可选表现或补充索引失败：隔离地图子树，正文、人物和普通回合继续运行。
- 明确依赖地图的旅行、抵达或地点变更：只拒绝该意图并返回原因，不中止整个叙事回合。

## 8. 持久化与恢复

Dexie 保存回合快照、世界 run、人物事件和人物状态缓存。启动流程：

1. 读取最高回合号的快照。
2. 校验存档版本、世界子结构、回合连续性和修订号一致性。
3. 成功则恢复 Store；没有存档则创建默认状态。
4. 不兼容或损坏则进入显式错误态，保留数据，等待用户重置。

存档导入走同一完整校验，成功后直接 `replaceGameState()`。测试版不迁移旧于格式 9 的存档。

## 9. 启动与代码拆分

首屏只加载正文骨架、Store 和必要数据。以下内容在功能边界按需加载：

- 地图及 MapLibre/Three.js 路径
- 人物窗口、资产抽屉、设置、统治者设计器和时间线
- 规则解析、D20、结算、叙事和地图回合上下文
- 生成神器目录和人物补充资料

`npm run check:bundle-budget` 对生产入口 JavaScript 设置 750 KiB 上限。地图与生成数据可以形成较大的独立 chunk，但不得重新并入首屏入口。

## 10. 验证边界

- `npm run verify:quick`：核心源码检查、规则测试与轻量生产构建
- `npm run verify:map`：地图导入器、schema、语义层、地形、旅行、地标和运行时边界
- `npm run test:ui`：启动恢复、导入替换、正文到人物、资产返回和地图故障降级的 DOM 交互
- `npm run check:bundle-budget`：首屏入口包预算
- `npm run verify`：完整 Node、Python、DOM、地图、包体与生产构建验证

正式地图清单、瓦片与模型位于 `public/data/agot-map` 和 `public/assets/agot-map`。`tmp/`、构建目录和本地分析文件不属于运行时合同。

## 11. 工程边界

- 验证编排由 `scripts/verify/suites.mjs` 和 `scripts/verify/run-suite.mjs` 统一维护；现有单项 `test:*`、`check:*` 继续作为稳定叶子入口。
- `src/domain` 保存 `CharacterId`、人物属性、身体状态键、世界日期和世界地点引用等无 feature 反向依赖的基础合同；旧聚合模块保留兼容 re-export。
- `src/services/turnResolution.ts` 是回合解析与结算的公共 facade，协议、世界准备、新结算和旧结算分别位于 `src/services/turn`。
- `src/components/Ck3CharacterWindow.tsx` 是人物窗口公共组合入口；具体页签、身份头部、关系卡与数据 hook 位于 `src/components/character-window`。
- `src/features/map/MapCanvas.tsx` 是地图画布公共组合入口；旅行图层、语义投影、地标控制、镜头同步和 MapLibre 生命周期位于 `src/features/map/canvas`。
- `scripts/check-module-cycles.mjs` 要求 `src` 的静态相对 import/export 图不存在循环依赖。

开发入口与数据生成边界见 [`INDEX.md`](INDEX.md)、[`TESTING.md`](TESTING.md) 和 [`DATA_PIPELINES.md`](DATA_PIPELINES.md)。
