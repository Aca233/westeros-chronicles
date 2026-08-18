# AGOT 大型神器库离线导入设计

## 目标

在开发阶段从本机已安装的 AGOT 及获准子模组中提取神器定义、简体中文本地化和 2D 图标，生成可直接随游戏发布的静态物品目录。玩家运行游戏时不读取 Steam 模组、不转换 DDS、不调用模型，也不重新生成物品。

第一阶段覆盖以下内容源：

- `2962333032` A Game of Thrones
- `2995674648` AGOT - Crowns of Westeros
- `2962713441` Valyrian Steel
- `3101422928` Legacy Of The Dragon
- `2950245430` AGOT+
- `2965154314` 冰火子项目汉化合集，仅提供上述子模组的简体中文本地化

御林铁卫盔甲、特质、人物动作、初始神器归属、遗迹探索和重铸机制属于后续阶段，不混入本阶段。

## 数据边界

导入器只接受来源清单中固定的 Steam Workshop ID，并验证目录名和 `.mod`/`descriptor.mod` 中的 `remote_file_id` 或模组名称。禁止扫描 CK3 原版目录，禁止从未列入清单的模组补字段。

每个生成条目保留：

- Workshop ID 与模组名称
- 原始创建效果、名称键、描述键、模板键、视觉键、修正键和神器类型
- 原始 DDS 相对路径与 SHA-256
- 转换后 WebP 路径与 SHA-256
- 使用过的本地化来源

所有参与解析的脚本、本地化和被采用的 DDS 都进入生成清单校验和。

## 提取流程

1. 扫描 `common/scripted_effects/**/*.txt` 中任意层级的直接 `create_artifact` 块。
2. 从同一创建上下文读取名称、描述、类型、视觉、模板、修正和稀有度。
3. 扫描 `common/artifacts/visuals/**/*.txt`，把视觉键解析到图标文件。
4. 扫描 `common/artifacts/templates/**/*.txt`，识别 `unique = yes`。
5. 扫描模组自身与汉化合集对应目录的简体中文本地化；汉化合集覆盖子模组自带译文，AGOT 本体只使用本体简体中文。
6. 仅保留名称、描述和图标均能在获准来源中解析的静态神器；带 `$参数$` 的动态模板、缺图条目和无法确定身份的条目写入报告。
7. 解析获准模组 `common/modifiers/**/*.txt` 的直接数值修正，按白名单转换为项目效果。未映射 CK3 修正只记录在报告，不伪造项目数值。

## 去重与稳定身份

候选条目先按本地化后的规范名称合并，再由显式别名表处理寒冰、长爪、黎明和黑火等已存在的手写唯一神器。

- 同名且唯一的候选视为同一原著神器。
- AGOT 本体优先提供身份与描述；专门子模组可以提供默认视觉。
- 其他来源图标记录为视觉变体，不生成多个世界实例。
- 同名但非唯一的模板不自动合并，使用来源 ID 与名称键生成稳定 ID。
- 无法安全判断的冲突进入人工复核报告，不进入正式目录。

生成 ID 使用 `artifact.generated.<稳定名称>`，不依赖数组顺序或文件系统遍历顺序。

## 项目物品映射

类型映射遵守现有六组装备系统：

- `helmet`：服装，头部
- `sword`、`axe`、`mace`、`dagger`、`spear`、`hammer`：武器，主手；长弓和明确双手武器标记双手
- `armor_*`：护甲，躯干护甲层
- `regalia`、`ring`、`necklace`、`brooch`：首饰，三个佩饰位置
- `book`、`journal`、`valyrian_book`：文书，非装备
- `panacea`、`elixir`：药物，非装备
- 王座、雕塑、头骨、挂毯、龙蛋、号角及其他宫廷奇物：纪念物或工具，默认不装备

CK3 修正白名单映射：

- `diplomacy`、`intrigue`、`stewardship`、`learning`、`martial`、`prowess` 对应项目检定领域
- `monthly_prestige` 对应威仪获得
- `monthly_dread` 对应恶名/威慑获得
- `vassal_opinion` 和同类好感修正对应限定场景的社交修正

所有自动转换值限制在现有效果系统范围内，并保留中文标签。装备没有可靠数值时只生成与其身份一致的叙事效果。

## 图片与运行时

采用 Pillow 在开发期把被使用的 DDS 转为透明 WebP，输出到：

```text
public/assets/item-images/generated/agot-artifacts/
```

不放大原始图，不导入 PSD。相同 DDS 内容只保留一个转换文件。`ItemImageRef` 新增本地静态资源类型，加载失败时退回现有游戏图标。

生成的物品定义位于：

```text
src/data/generated/agotArtifactDefinitions.ts
```

`itemDefinitions.ts` 只组合手写核心目录和生成目录。图片按实际物品卡懒加载；完整定义数量只有数百条，不需要运行时分片。

## 生成报告与失败策略

生成：

```text
public/data/items/agot-artifact-import-manifest.json
public/data/items/agot-artifact-import-report.json
```

报告包含候选数、正式条目数、去重数、视觉变体数、缺失本地化、缺图、动态模板、未映射修正和来源计数。任一来源身份不匹配、输出 ID 重复、唯一神器重复或图片哈希不一致时，导入命令失败且不覆盖上一份成功输出。

## 验证

- Python 测试覆盖嵌套创建块、视觉/模板/修正解析、中文覆盖、类型映射、唯一性、去重、动态模板拒绝和确定性输出。
- Node 测试覆盖生成目录无重复 ID、本地图片存在、所有定义通过现有目录校验、唯一神器不堆叠，以及不出现肩部或披风独立槽。
- 运行完整物品测试、无 Emoji 检查、生产构建和 `npm run verify`。
