# 全量文件与文档分类清单

这份清单解决“文档到底在哪里”的问题。统计口径为 2026-09-08 的工作区：排除 `node_modules/`、`dist/`、`tmp/`、`scratch/`、`.git/` 和独立嵌套仓库 `新建文件夹/`。生成数据和图片不复制到文档区，只记录它们的来源、用途和权威边界。

## 一、人工阅读文档

当前共有 85 份 Markdown 文档（包含本清单本身）：

| 范围 | 数量 | 入口 | 内容 |
| --- | ---: | --- | --- |
| 项目根目录 | 2 | [`../README.md`](../README.md) | 项目定位、本地运行、资源清单。 |
| `docs/` 根目录 | 6 | [`INDEX.md`](INDEX.md) | 当前架构、测试、数据流水线、专项说明、总导航和本清单。 |
| 当前设计 | 15 | [`design/README.md`](design/README.md) | 玩法重做、角色扮演上下文、模型协议和实施状态。 |
| QA 与试玩 | 2 | [`qa/README.md`](qa/README.md) | 试玩记录、截图说明和体验证据。 |
| 历史规格/计划 | 59 | [`superpowers/README.md`](superpowers/README.md) | 历史设计规格、实施计划和决策背景。 |
| 外部研究 | 1 | [`../tools/research/external-rpg-ui/README.md`](../tools/research/external-rpg-ui/README.md) | 外部 RPG UI 研究资料。 |

总入口仍然是 [`INDEX.md`](INDEX.md)。上表的目录 README 负责局部导航，历史文件不改写为当前合同。

## 二、人工编辑的内容源

`content/world/` 是世界内容的唯一人工编辑源，共 125 个文件，主要是：

- [`content/world/characters/`](../content/world/characters/)：人物补充叙事内容。
- [`content/world/items/`](../content/world/items/)：普通物品、NPC 装备模板和覆盖。
- [`content/world/locations/`](../content/world/locations/)：可玩地点。
- [`content/world/start-state/`](../content/world/start-state/)：世界起点的人物、资产和头衔。
- [`content/world/terminology/`](../content/world/terminology/)：文化、信仰和关系术语。
- [`content/world/manifest.json`](../content/world/manifest.json)：内容源版本与清单。

这些是结构化内容源，不是给人连续阅读的说明文档；字段、编译和边界见 [`DATA_PIPELINES.md`](DATA_PIPELINES.md)。

## 三、生成数据与报告

以下目录由导入器或编译器生成，不应手工编辑：

| 目录 | 当前文件数 | 作用 | 修改入口 |
| --- | ---: | --- | --- |
| `public/data/world/` | 25 | 世界内容编译产物、人物分片、术语、起点和装载表。 | 修改 `content/world/`，运行世界内容编译器。 |
| `public/data/items/` | 4 | AGOT 唯一物品导入产物和审计报告。 | 修改导入源/配置，运行 artifact 导入器。 |
| `public/data/agot-map/` | 36 | 地图清单、地点、路线、政治语义和地标报告。 | 运行地图/模型导入器。 |
| `public/data/agot-characters/` | 774 | 人物分片、检索索引、持有人摘要和装备数据。 | 运行人物导入与裁剪脚本。 |
| `public/assets/` | 10,814 | 地图瓦片、模型、纹理、图标和图片资源。 | 运行对应导入器；不要手工重排。 |

清单、报告和 schema 是可审计产物，不是新的人工事实来源。具体流水线见 [`DATA_PIPELINES.md`](DATA_PIPELINES.md)。

## 四、测试输入与开发依赖说明

`scripts/fixtures/` 共 40 个文件，全部是离线测试输入或视觉/导入器夹具，不属于产品文档：

- 13 个 `.txt`：Paradox/AGOT 结构化样例。
- 3 个 `.yml`：本地化样例。
- 2 个 `.csv`：地图定义和邻接关系样例。
- 8 个 `.json`：模型、肖像和导入器校验夹具。
- 其余为 `.mjs`、`.ts`、`.map`、`.mod`、`.png`、`.dds` 等运行测试所需输入。

目录入口：[`scripts/fixtures/`](../scripts/fixtures/)。

脚本依赖说明：

- [`scripts/requirements-map.txt`](../scripts/requirements-map.txt)：地图导入依赖。
- [`scripts/requirements-models.txt`](../scripts/requirements-models.txt)：模型导入依赖。
- [`TESTING.md`](TESTING.md)：验证命令和不会自动执行的导入操作。

## 五、暂存内容与排除项

- `scratch_fanren.html`、`scratch_yishijie.html`：本地 scratch 页面，不是正式产品文档；如不再需要可以删除。
- `nul`：工作区中的异常空文件名，不属于文档系统；当前未在本次整理中碰触。
- `新建文件夹/`：包含独立 `.git` 的嵌套仓库，按独立工作区处理，不纳入本项目文档索引。
- `tmp/`、`dist/`、`.cache/`、`.playwright-mcp/`：临时或构建目录，不纳入文档。

## 六、维护规则

1. 新增人工说明先放到 `docs/` 对应分类，并在 [`INDEX.md`](INDEX.md) 或对应目录 README 增加入口。
2. 新增设计方案优先放到 `docs/design/`；完成后的历史决策才进入 `docs/superpowers/`。
3. 试玩、截图和视觉验收放到 `docs/qa/`，不要把截图当成规则权威。
4. 结构化世界资料放到 `content/world/`，不要直接编辑 `public/data/`。
5. 生成产物、缓存和 scratch 不要混入人工文档目录。
