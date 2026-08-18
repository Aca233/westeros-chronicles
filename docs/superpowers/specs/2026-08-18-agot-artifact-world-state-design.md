# AGOT 298 AC 神器世界初始状态设计

## 目标

把已经离线导入的唯一神器定义投影为 8298.1.1 的静态世界状态。玩家开始新游戏时直接载入这份状态，不在浏览器中解析模组脚本，也不把全世界神器塞进玩家的 `lord.items`。

## 数据来源与边界

- 只读取 AGOT 模组 `2962333032`，不读取 CK3 原版文件。
- 历史入口为 `common/scripted_effects/00_agot_scenario_artifacts_effects.txt` 中的 `agot_historical_artifacts_setup`。
- 家族武器继续投影同文件的 `agot_assign_starting_family_weapons_effect`。
- 人物存在、存活、出生年份和家族来自已生成的 `public/data/agot-characters/search-index.json`。
- 直接头衔持有人来自 `public/data/agot-characters/title-holders.json`；男爵领等无直接历史持有人的地产，通过 AGOT `common/landed_titles` 逐级向上寻找最近的已知持有人。
- 神器创建效果通过离线导入候选的 `contentSource.sourceId` 映射至项目物品定义；寒冰、长爪、黎明、黑火使用显式别名。
- 不执行任意 Paradox 脚本。随机作用域、事件、运行时变量、未知游戏规则及无法证明的条件只写入未解析报告。

## 受限投影规则

投影器支持：

- `game_start_date` 的 `=`, `>`, `>=`, `<`, `<=` 比较；
- 连续的 `if / else_if / else` 分支，且只选择第一条成立分支；
- `always = yes/no`；
- `exists = character:*`, `exists = title:*.holder`, `exists = dynasty:*`；
- 人物作用域中的 `is_alive` 和 `is_adult`；
- `NOT` 以及固定历史快照下的 `house_customizer_placeholder` 排除条件；
- `character:*`, `title:*.holder`, `dynasty:*.dynast` 三类保管作用域；
- 直接唯一神器创建效果，以及白名单历史辅助效果的递归调用。

若分支条件为未知，投影器不得继续猜测同一 `if / else_if / else` 链的结果。相关调用进入报告，不生成世界实例。

## 世界状态模型

静态数据采用独立的 `WorldArtifactState`，不复用玩家 `ItemSystemState`：

```ts
interface WorldArtifactState {
  schemaVersion: 1;
  datasetHash: string;
  startDate: '8298.1.1';
  artifacts: Record<string, WorldArtifactRecord>;
}
```

每件神器只允许一个世界实例。记录包含：

- 稳定的 `instanceId` 和 `definitionId`；
- 合法控制者引用，可为人物或家族首领作用域；
- 保管位置，可为人物、地产或家族；
- `equipped: false`；
- 原脚本文件、行号和创建效果。

地产类大型陈设以 `subcategory === 'throne_special'` 判断，保留在地产中，并记录该地产在 298 AC 的控制者。其他由 `title:*.holder` 创建的可携带神器归持有人保管。家族首领作用域不伪造具体人物，保留为 `dynasty` 保管引用。

## 穿戴规则

历史脚本中的 `equip_artifact_to_owner` 不进入初始穿戴状态。所有世界神器统一 `equipped: false`。人物拥有盔甲、武器或号角，仅表示保管权；实际穿上或拿起仍需游戏内行动，并遵循现有的下一回合队列。

## 生成物

离线导入命令同时生成：

- `public/data/items/agot-artifact-world-state.json`
- `public/data/items/agot-artifact-world-state-report.json`
- `src/data/generated/agotArtifactWorldState.ts`

生成结果包含关联的神器定义数据哈希和人物数据哈希，便于发现过期投影。前端从生成的 TypeScript 常量克隆初始世界状态，不进行脚本解析。

## 游戏接入

`GameState` 增加独立的 `worldArtifacts` 字段。应用初始状态和每次新游戏都通过 `createInitialAgotArtifactWorldState()` 获得深拷贝，因此不同游戏不会共享可变对象。既有 `lord.items` 只保存玩家当前可访问的随身、据点和运输物品。

## 验收标准

- 8298.1.1 的长爪归 `agot:Mormont_2`，8299.1.1 后才归 `agot:Stark_7`。
- 旧冬境王冠与罗柏的新冬境王冠均不在 8298.1.1 世界状态中。
- `title:b_the_red_keep.holder` 通过地产层级解析到 `agot:Baratheon_2`，铁王座仍放置于 `b_the_red_keep`。
- 连续分支最多生成一个相同唯一神器实例。
- 所有实例 `equipped` 均为 `false`。
- 无对应项目定义或条件无法可靠判断的调用进入报告。
- 前端初始世界状态与玩家 `lord.items` 相互独立。
