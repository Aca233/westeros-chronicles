# 数据流水线

运行时只消费仓库中的静态产物，不读取 Steam、Workshop、真实模组目录或网络地图服务。导入器必须由开发者显式调用；验证套件只使用 fixture 和已生成产物进行确定性检查。

| 资料 | 输入 | 生成器 | 输出 | 运行时限制 |
|---|---|---|---|---|
| 地图 | 开发者提供的 AGOT 离线模组 | `scripts.agot_map_import`（`npm run import:agot-map`） | `public/data/agot-map`、`public/assets/agot-map` | 浏览器只读本地静态清单、索引与瓦片。 |
| 人物 | 开发者提供的 AGOT 离线模组 | `scripts.agot_character_import`（`npm run import:agot-characters`） | `public/data/agot-characters` | 运行时按索引和分片读取，不访问原模组。 |
| 人物裁剪 | 导入后的完整人物数据集、世界起点、唯一物品归属、叙事内容和可玩入口 | `scripts.prune_bundled_character_dataset`（`npm run build:character-roster`） | 引用闭包内的完整档案与 `holder-summaries.json` | 无职责填充人物不进入运行时名单；摘要只供头衔/地图显示。 |
| 世界内容 | `content/world/` 手写编辑源 | `scripts/world-content/compiler.mjs`（`npm run build:world-content`） | `public/data/world/` | 浏览器只读编译产物，不编译编辑源，不访问真实模组。 |
| 人物叙事 | `content/world/characters/*.json`（由 `scripts/world-content/migrate-character-supplements.mjs` 一次性迁入） | 世界内容编译器分片 | `public/data/world/character-content/` | 按索引按需加载，不在浏览器内重新编译。 |
| 普通物品 / NPC 装备 | `content/world/items/ordinary-items.json`、`loadout-templates.json`、`loadout-overrides.json` | 世界内容编译器交叉校验物品、模板和人物引用 | `public/data/world/ordinary-items.json`、`loadouts.json` | 运行时预载编译表；规则算法仍在代码中。 |
| 唯一物品 | 开发者提供的 AGOT 离线模组 | `scripts.agot_artifact_import`（`npm run import:agot-artifacts`） | `src/data/generated/agotArtifactDefinitions.ts`、`src/data/generated/agotArtifactWorldState.ts` 与相关图片 | `verify` 只测试 fixture 和已提交产物，不执行真实导入。 |
| 3D 地标 | 开发者提供的 AGOT 模型与显式转换器 | `scripts.agot_model_import`（`npm run import:agot-models`） | `public/data/agot-map/models`、`public/assets/agot-map/models` | 运行时只加载本地 manifest、GLB 与纹理，不访问模组目录。 |

## 世界内容编译

`content/world/` 是唯一人工编辑源。编译器在临时目录完成跨人物、地图、唯一物品数据集校验后，再原子发布 `public/data/world/`。失败时保留上一份完整产物。

编译器会交叉校验：

- 普通物品效果、装备位和重复 ID；
- NPC 装备模板/覆盖引用的模板、人物和物品；
- 起点资产定义 ID 必须落在普通物品、手工唯一物品或生成唯一物品集合中；
- 游戏地点必须能在地图搜索索引中解析。

运行时通过 `WorldContentRepository` 读取编译产物并校验数据集哈希。浏览器不得编译 `content/world/`，也不得访问网络、Steam、Workshop 或真实 AGOT 模组目录。`npm run check:living-world-content-boundaries` 阻止世界入口、人物位置、叙事、术语、普通物品和 NPC 装备重新进入被禁止的 TypeScript 文件。

## 生成产物规则

- `src/data/generated`、`public/data` 和 `public/assets` 中由生成器声明管理的文件不得手工修改；应修改源资料、覆盖配置或生成器后重新生成。
- 真实导入可读取本机离线数据，但不得被 `verify`、`verify:quick`、`verify:map` 或 `verify:world-linkage` 隐式触发。
- 导入器不得依赖网络下载；来源路径由开发者显式提供，并且不能写入浏览器运行时代码。
- 相同输入、配置与工具版本必须产生顺序稳定、哈希可复现的输出。审计失败时保留上一份完整产物，不能发布部分目录。
- 大型地图瓦片、模型和生成目录仍是正式运行时资源；结构整理不得删除、压缩或重新解释这些数据。
