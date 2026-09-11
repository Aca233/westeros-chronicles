# 项目文档索引

文档按“当前实现 → 当前设计 → 试玩记录 → 历史决策”阅读。实现和文档冲突时，以源码、生成数据校验和 [`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md) 为准。

全量文件分类见 [`CATALOG.md`](CATALOG.md)；它同时区分人工文档、内容源、生成产物和临时文件。

## 0. 项目入口与范围

- [`../README.md`](../README.md)：项目定位、当前能力、本地运行和数据边界。
- [`../2962333032_manifest.md`](../2962333032_manifest.md)：离线资源清单说明。
- [`../tools/research/external-rpg-ui/README.md`](../tools/research/external-rpg-ui/README.md)：外部 RPG UI 研究资料；仅作为参考，不是运行时合同。

## 1. 当前实现与开发入口

| 文档 | 用途 |
| --- | --- |
| [`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md) | 当前运行时状态、回合闭环、存档/持久化、世界状态和地图降级边界；这是实现层的权威说明。 |
| [`design/IMPLEMENTATION_STATUS.md`](design/IMPLEMENTATION_STATUS.md) | 最近一轮角色扮演重构的实际接线状态、已撤下机制、兼容策略和验证边界。 |
| [`DATA_PIPELINES.md`](DATA_PIPELINES.md) | 离线 AGOT 数据的输入、生成器、产物、校验和运行时边界。 |

## 2. 当前产品与玩法设计

### 2.1 全游戏重做

入口：[全游戏机制审视与重做决策](design/gameplay-overhaul-2026-09-07/README.md)

目录导航：[`design/README.md`](design/README.md)

| 文档 | 关注范围 |
| --- | --- |
| [`mechanics-audit.md`](design/gameplay-overhaul-2026-09-07/mechanics-audit.md) | 机制清单、源码证据、已确认风险和最小复现。 |
| [`rules-blueprint.md`](design/gameplay-overhaul-2026-09-07/rules-blueprint.md) | 新版玩法循环、身份、关系、冲突、资源、旅行和世界主动性。 |
| [`character-panel.md`](design/gameplay-overhaul-2026-09-07/character-panel.md) | 自己、熟人和陌生人的信息边界、人物面板和行动入口。 |
| [`ui-ux.md`](design/gameplay-overhaul-2026-09-07/ui-ux.md) | 主游玩、导航、输入、地图、行囊、建角、存档和错误恢复。 |
| [`storage-equipment.md`](design/gameplay-overhaul-2026-09-07/storage-equipment.md) | 落脚处、保管、交接、装束、取用和负担；含专项探针。 |
| [`large-cast.md`](design/gameplay-overhaul-2026-09-07/large-cast.md) | 大量角色的分层模拟、登场筛选、幕后议程和名单 UI。 |
| [`linked-world-state.md`](design/gameplay-overhaul-2026-09-07/linked-world-state.md) | 人物、地点、装备、载具、产权、身体、任务和认知的关联状态。 |
| [`validation-roadmap.md`](design/gameplay-overhaul-2026-09-07/validation-roadmap.md) | 实施顺序、旧机制退出、迁移、试玩路线和发布门槛。 |

探针和结果文件位于同一目录：[`probes.mjs`](design/gameplay-overhaul-2026-09-07/probes.mjs)、[`probe-results.json`](design/gameplay-overhaul-2026-09-07/probe-results.json)、[`storage-equipment-probes.mjs`](design/gameplay-overhaul-2026-09-07/storage-equipment-probes.mjs) 和 [`storage-equipment-results.json`](design/gameplay-overhaul-2026-09-07/storage-equipment-results.json)。

### 2.2 角色扮演上下文与模型

入口：[角色扮演上下文与模型体系重构方案](design/roleplay-context-v2/README.md)

| 文档 | 关注范围 |
| --- | --- |
| [`context-memory.md`](design/roleplay-context-v2/context-memory.md) | 场景、上下文编译、认知、事件、长期记忆和回合结果包。 |
| [`model-prompts.md`](design/roleplay-context-v2/model-prompts.md) | Resolver、Narrator、Memory Compressor、Repair 的协议和提示词。 |
| [`implementation.md`](design/roleplay-context-v2/implementation.md) | 分阶段实施、目录映射、存档迁移、回归案例和发布门槛。 |

## 3. 试玩与专项资料

目录导航：[`qa/README.md`](qa/README.md)

| 目录/文档 | 用途 |
| --- | --- |
| [`qa/`](qa/) | 试玩记录、验收材料和界面截图。 |
| [`qa/playtest-ned-298.md`](qa/playtest-ned-298.md) | 奈德线试玩记录与体验问题清单。 |
| [`agot-landmark-model-import.md`](agot-landmark-model-import.md) | AGOT 三维地标模型离线导入专项说明。 |

## 4. 历史设计与实施记录

- [`superpowers/README.md`](superpowers/README.md)：历史文档的阅读规则、主题入口和规格/计划关系。
- [`superpowers/specs/`](superpowers/specs/)：历史设计规格和决策背景。
- [`superpowers/plans/`](superpowers/plans/)：历史实施计划、任务记录和当时的验证结果。

这些文件用于追踪决策来源，不会自动覆盖当前实现。若历史文档与当前代码、生成数据或上面的现行文档冲突，应以现行实现为准。
