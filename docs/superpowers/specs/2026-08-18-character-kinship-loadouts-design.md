# 人物亲属索引与开局装束设计

## 目标

解决大量 NPC 人物卷宗缺少子女、实际穿戴和物品资产的问题，同时保持人物卷宗、正文上下文和人物事件使用同一事实来源。所有开局数据必须随项目预置，不在运行时读取 AGOT 或 CK3 原始文件，也不依赖玩家调用模型生成。

## 已确认事实

- 当前人物数据有 126,978 条，但只保存孩子指向父母的 `fatherId`、`motherId`，没有父母反查子女的索引。
- 当前关系页只读取配偶、父母和少量重要关系，并把卡片总数截断到八张，因此不会完整显示子女。
- 当前世界特殊物品账本只有 72 条记录，人物直接保管记录只覆盖约 55 人。
- 开局特殊物品记录全部是 `equipped: false`，所以 NPC 的“实际穿戴”几乎必然为空。
- 把数十万件普通衣物全部复制进每个存档不可接受；只在 UI 中临时推断又会破坏统一世界状态。

## 约束

- 不使用 Emoji。
- 优先使用游戏图标；没有合适游戏图标时使用现有高质量图标库或项目内图像资产。
- 运行时不读取 AGOT 或 CK3 原始文件。
- 不把所有权、保管、随身携带和实际穿戴混为一谈。
- 普通人物默认穿日常衣物，不因为拥有头衔或骑士身份自动穿战甲。
- 儿童不配置成人盔甲与成人武器。
- 主要人物允许手工覆盖，普通人物使用文化、阶层、年龄和明确职业模板。
- 当前为测试版，不提供旧存档迁移。
- 开发过程中不提交、不合并、不推送，也不使用子代理。

## 方案选择

采用“静态基线装束加人物事件增量”。

静态人物数据只保存轻量的装束配置标识；打开人物时由项目内固定模板展开为具有稳定实例 ID 的开局物品。剧情变化以人物事件追加保存，人物投影器把基线和事件合并为当前装备与资产。这样不需要把全世界普通衣物复制进每个存档，同时正文和卷宗仍读取同一投影结果。

## 一、双向亲属索引

人物数据构建阶段生成 `public/data/agot-characters/kinship/<shard>.json`。每个条目包含：

```ts
interface CharacterKinshipEntry {
  fatherId?: CharacterId;
  motherId?: CharacterId;
  spouseIds: CharacterId[];
  childIds: CharacterId[];
}
```

`childIds` 由所有人物的 `fatherId`、`motherId` 反向汇总，排序必须稳定并去重。运行时仓库按人物所属的两位十六进制分片加载亲属索引，不扫描全部人物分片，也不会一次下载完整亲属数据。

人物卷宗的关系数据增加 `childIds`。相关人物加载必须包括配偶、父母、子女和重要关系。关系页按“配偶、子女、父母、重要关系”组织；子女可以折叠，但不能因原有八张上限被丢弃，每张卡仍可跳转到对应人物。

## 二、静态装束配置

数据构建阶段生成 `public/data/agot-characters/loadouts/<shard>.json`。每名已出生、在世人物保存一个轻量配置：

```ts
interface StaticCharacterLoadoutProfile {
  characterId: CharacterId;
  templateId: string;
  overrideId?: string;
}
```

模板选择依据：

- 年龄段：婴儿、儿童、少年、成人；
- 文化和气候；
- 头衔阶层；
- 守夜人、学士、教士等明确身份特质；
- 主要人物手工覆盖。

模板优先级为：主要人物覆盖、明确职业、儿童年龄段、文化与阶层、通用日常装束。模板只配置正常场景下的衣物。战甲和战斗武器只能来自主要人物覆盖、明确值勤身份或后续人物事件。

## 三、普通物品定义

扩充 `src/data/itemDefinitions.ts`，补齐以下非唯一物品族：

- 七国主要文化区域的日常躯干服装；
- 贵族、平民、儿童、婴儿、学士、教士和守夜人服装；
- 通用腿部衣物、鞋靴、冬季外披和旅行服；
- 少量明确职业使用的工具或武器。

普通模板不得引用唯一神器定义。家传武器、王冠和特殊物品继续由特殊物品账本提供，避免重复实例。

## 四、人物物品状态

新增人物普通物品模型：

```ts
type CharacterItemCustody =
  | { type: 'character'; characterId: CharacterId }
  | { type: 'site'; siteId: string };

interface CharacterItemRecord {
  instanceId: string;
  definitionId: string;
  ownerId: CharacterId;
  custody: CharacterItemCustody;
  equippedPosition?: EquipmentPosition;
  source: 'baseline_template' | 'curated_override' | 'story_event';
}
```

基线实例 ID 由人物 ID 和模板槽位稳定生成，例如 `npc:Stark_3:baseline:garment`。同一人物重复加载必须得到完全相同的实例和顺序。

`ResolvedCharacter` 增加 `items: CharacterItemRecord[]`。人物投影顺序为：

```text
静态人物档案
+ 静态装束配置
+ 主要人物覆盖
+ 当前存档人物物品事件
= 当前人物物品状态
```

## 五、人物物品事件和命令

扩展人物事件：

- `ITEM_ACQUIRE`
- `ITEM_EQUIP`
- `ITEM_UNEQUIP`
- `ITEM_TRANSFER_OUT`
- `ITEM_TRANSFER_IN`
- `ITEM_LOSE`

扩展模型状态命令，使用 `CHARACTER_ITEM_*` 前缀，避免被现有玩家 `ITEM_*` 命令管线错误识别：

- `CHARACTER_ITEM_ACQUIRE`
- `CHARACTER_ITEM_EQUIP`
- `CHARACTER_ITEM_UNEQUIP`
- `CHARACTER_ITEM_TRANSFER`
- `CHARACTER_ITEM_LOSE`

命令必须验证人物存在、物品存在、保管关系允许操作、装备位置兼容且转移双方有效。人物物品事件随其他人物事件一起进入现有原子提交和回滚流程。

## 六、人物卷宗投影

NPC“健康与装备”合并两个来源：

1. `ResolvedCharacter.items` 中具有 `equippedPosition` 的普通物品；
2. 特殊物品账本中当前确实 `equipped` 且由该人物保管的物品。

NPC“物品与资产”合并：

1. 当前人物所有或保管的普通物品；
2. 特殊物品账本中属于本人、由本人保管、由本人控制头衔持有或属于其家族的物品。

两个列表按实例 ID 去重。健康页只显示实际穿戴；资产页必须标注本人所有、本人保管、据点保管、领地资产或家族资产。

无伤人物显示四个部位均无已记录创伤，而不是空白。不存在可靠资产时仍保留明确空状态，不能虚构财产。

## 七、正文上下文

`buildWorldTurnContext` 对选入场景的人物读取投影后的普通装备与特殊物品：

- 明确区分“当前穿戴”和“名下或保管”；
- 当前穿戴可作为叙事事实；
- 名下资产不得被描述为随身携带；
- 人物物品命令结算后，下一回合上下文必须立即反映新状态。

## 八、数据生成与验证

数据构建脚本只读取项目已捆绑的人物分片、头衔映射、固定模板和手工覆盖表。输出必须确定性排序，并把亲属数量、装束覆盖人数、儿童模板人数、职业模板人数和无模板人数写入报告。

验证至少包括：

- 父母能够反查全部子女；
- 配偶双向关系不回退；
- 儿童不会获得成人武器或盔甲；
- 普通人物获得日常衣物、腿部衣物和足部物品；
- 主要人物覆盖优先于模板；
- 基线实例 ID 稳定；
- 装备、所有权和保管关系分别投影；
- 人物物品事件能覆盖基线并进入正文上下文；
- 人物卷宗不再因八张上限丢失子女；
- TypeScript、数据模式、无 Emoji 和完整构建检查通过。
