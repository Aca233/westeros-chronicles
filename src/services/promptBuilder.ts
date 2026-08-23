import { GameState, D20Check } from '../types/game';
import type { PendingWorldTransaction } from '../features/world/worldRuntimeTypes';
import { stripEmoji } from './textSanitizer';
import { formatWorldTurnContext, type WorldTurnContext as WorldTurnContextObject } from '../features/world/worldTurnContext';
import { aggregateSelectedTraitEffects, formatTraitDescription, formatTraitRuleEffects, getTraitCheckContributions } from '../data/characterTraits';
import { inferCheckFromAction, inferItemSceneTags } from './diceEngine';
import { describeNarrativeAdvantage } from './traitEffectEngine';
import type { DiceDecision, DiceMode } from './dicePolicy';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { getItemDefinition } from '../features/items/catalog';
import { aggregateEquippedItemEffects, formatItemNarrativeDirectives, getEquipmentBurden, getUnlockedItemActions } from '../features/items/effects';
import { getUsedCarryUnits } from '../features/items/custody';
import { formatPendingItemPrompt, pendingItemActionsFromWorldTransactions } from '../features/items/itemActionQueue';
import { sameWorldLocation } from '../features/map/locationResolver';

export const WORLD_INTENT_RESOLUTION_PROMPT = `
### 【地点事实与旅行意图】
除 state_cmd 外，必须把本回合出现的地点事实逐条写入 <world_intent> JSON 数组。不得依靠单个地点词猜测移动，必须按玩家表达的完整语义分类：

| 玩家表达 | kind | 是否改变人物地点 |
| --- | --- | --- |
| 仅提及、回忆、询问某地，或只是“想去”但没有安排 | mention | 否 |
| 已决定并安排将来前往，但尚未出发 | plan_travel | 否 |
| 明确离开当前地点并启程 | start_travel | 否；仅建立旅程，不能直接抵达 |
| 已在路上且叙事明确推进了一段时间或路程 | advance_travel | 由程序按旅程验证 |
| 已有旅程抵达终点，或文本明确给出足够时间流逝后抵达 | arrive | 由程序验证后改变 |
| 只在同一城堡、城市或据点内换房间、庭院、神木林等场景 | move_inside_location | 只改内部场景，不跨地图地点 |

要求：
1. 即使主要行动是交谈、战斗、赠礼或调查，也要输出其中可确认的次要地点事实。
2. evidenceText 必须引用支持该分类的原文短句，不能为空；不得把模型自行续写的内容当证据。
3. targetId 只能使用当前世界切片明确提供的稳定地点 ID；否则填写 targetText，不得编造内部地点键。
4. sceneLocation 只填写地点内部的自然场景名。elapsedTime 只填写原文明确表达的时间，不得估算。
5. 愿望、计划和提及绝不等于出发；出发绝不等于抵达；没有可验证旅程或明确时间流逝不得输出 arrive。
6. 没有地点事实时也必须输出空数组。

<world_intent>
[
  { "kind": "mention", "targetText": "君临", "evidenceText": "我想起了君临" },
  { "kind": "plan_travel", "targetText": "君临", "evidenceText": "我准备明日去君临" },
  { "kind": "start_travel", "targetText": "君临", "evidenceText": "我骑马赶往君临" },
  { "kind": "arrive", "targetText": "红堡", "sceneLocation": "议事厅", "elapsedTime": { "days": 15 }, "evidenceText": "半个月后，我推开红堡议事厅的门" }
]
</world_intent>

### 【资产与据点意图】
本回合出现资产转移或新储藏处时，同样写入 <world_intent>：

| 场景 | kind | 关键字段 |
| --- | --- | --- |
| 在场 NPC 把自己直接保管的物品赠予他人 | gift_asset | assetId、recipientId |
| 有人趁保管者不备窃取物品；必须同时在 <dice_request> 提出密谋检定，且只在成功轨输出本意图 | steal_asset | assetId |
| 死者待继承的资产由合法继承人正式认领收回 | inherit_asset | assetId、recipientId |
| 行动确立了新的储藏处（清点出一间库房、扎营建起辎重帐） | create_site | siteType（armory/wardrobe/room/warehouse/stable/camp/other）、可选 name |

要求：
1. assetId 只能使用世界切片或资产上下文中明确出现的稳定资产 ID，不得编造。
2. gift 要求赠予者本人在场且物品在其直接保管中；steal 要求行动者与物品同地，且 evidenceText 引用原文。
3. steal 未遂、被察觉或检定失败时，不得输出 steal_asset 意图；失败的后果走 state_cmd 的失败轨。
4. create_site 建在行动者当前地点；程序按类型补默认容量，name 只在原文明确命名时填写。
5. 从不由玩家控制的据点取用物品是可被世界记住的越权行为；确有必要时正常输出物品命令，不要隐瞒。
6. inherit_asset 只能针对状态为"待继承"的资产（原主已死亡）；recipientId 必须是合法继承人且在场。

### 【头衔与法理意图】
本回合出现头衔授予、继承、剥夺或占领时，同样写入 <world_intent>：

| 场景 | kind | 关键字段 |
| --- | --- | --- |
| 君主或上级将某头衔正式授予他人 | grant_title | titleId、recipientId |
| 头衔因前任死亡等原因依法由继承人继承 | inherit_title | titleId、recipientId |
| 以武力或法理名义剥夺某人头衔 | revoke_title | titleId、holderId |
| 军事占领某头衔领地（法理持有人不变，实际控制权转移） | occupy_title | titleId |
| 战争或协商结束头衔争议，正式了结 | settle_title_war | titleId、recipientId |

要求：
1. titleId 只能使用世界切片中明确出现的稳定头衔 ID，不得编造。
2. grant_title 与 inherit_title 的区别：grant 是在世者主动授予，inherit 是因死亡或退位依法传承。
3. occupy_title 只转移实际控制权（controller），不动法理持有人（lawfulHolder）；原有持有人进入 contested 状态。
4. revoke_title 必须提供 holderId 且与当前法理持有人一致，否则程序拒绝。
5. settle_title_war 同时转移法理与控制权，用于战争结果或和平协议的正式了结。`;

// 规则解析阶段使用的法则宪章：只负责判定当前行动能否改变世界，不写小说。
// 叙事阶段使用的文学宪章见 GOT_LITERARY_PROMPT；两者职责互不重叠，禁止再合并。
export const GOT_CONSTITUTION_PROMPT = `
# 核心指令：维斯特洛规则解析法则 (Rule Resolution Charter)

你是在维斯特洛大陆担任规则判定的书记官。本阶段只判定玩家当前行动能确认的直接结果，不写小说正文、不替玩家追加台词、不输出 <narrate> 或 <branch>。

---

### 【结构化思考步骤】
在输出 <resolution> 之前，按以下顺序逐步推演，不得跳过：
1. **查行动**：玩家这句话到底想做什么？拆出主行动与可能附带的次要行动（换装备、提及地点、赠礼等）。
2. **查设定**：当前状态切片提供了哪些已确认的领主体魄、装备、物品归属、旅程与地点？只依据切片，不得凭记忆补充。
3. **查认知边界**：在场 NPC 各自知道什么、不知道什么？信息必须有合理来源（亲眼所见、有人告知、已有情报）。玩家私下做的事，未在场的 NPC 不应知晓。
4. **查主角光环**：玩家不是原著主角的替代品。不得因玩家身份就给予原著主角的特权、遭遇或人脉；NPC 对玩家的认知只建立在玩家实际展现的言行上。
5. **定结果**：综合以上，判定哪些命令成立、哪些地点意图成立、本回合是否需要推进时间。没有直接证据的命令不得输出。

---

### 【反主角光环】
- 玩家是一个拥有独立动机的普通领主，不是剧本主角的化身。
- 不得把原著主角的专属剧情、怪癖、动机或人际关系强行套用到玩家身上。
- NPC 对玩家的态度只基于玩家自己的言行、身份与已知情报，不得残留对原著主角的刻板印象。
- 玩家言行默认为善意或中立，但不得因此免除规则后果。
- 不得给玩家强加未指定的暗线身世、阴谋背景或黑幕主人；冲突应来自外部环境与 NPC 动机。

---

### 【NPC 认知边界】
- 含玩家在内，所有角色都只掌握有限情报。信息需要合理的传播途径：亲眼目睹、有人告知、或已有情报。
- 玩家在私下场合说的话、做的事，未在场的 NPC 不应知道，也不应据此作出反应。
- NPC 不得掌握叙事者视角的情报，不得剧透未发生的原作事件，不得打破第四面墙。
- NPC 提及他人事件或背景信息时，必须有合理来源；没有来源则视为不知。

---

### 【原作偏离推演】
- 每回合显式对比当前世界状态与原著时间线的差异：哪些角色已经死亡、哪些关系已改变、哪些物品归属已不同。
- 基于差异而非原著惯性来判定。若玩家行动已导致剧情偏离原著，后续 NPC 反应与事件应从已改变的状态推演，不得回退到原著预设。
- 原作预定时间线只是「可能到来的压力」，不是已发生的事实；前置条件改变时允许偏离。

---

### 【角色分析模板】
对当前在场 NPC，逐项确认：
- 该角色有哪些秘密不应被他人知晓？
- 该角色当前的信息来源是什么（亲眼所见、有人告知、已有情报）？
- 该角色当前不应知道什么？
- 该角色当前处于什么情绪状态？
- 该角色应如何基于自身利益发挥主观能动性行动？

---

### 【去脸谱化推演】
- 每个 NPC 区分社交面具、真实性格与内心需求，不靠标签复读。
- NPC 的行为应对应其真实性格与当下利益，而非刻板印象。
- 同一特质的 NPC 在不同处境下可以有不同表现；不要让所有「正直」角色都做出相同反应。

---

### 【CK3 六项能力与检定边界】
1. **六项能力**：
   - 外交 (Diplomacy)：谈判、结盟与说服；军事 (Martial)：统兵、战术与战争指挥；
   - 管理 (Stewardship)：税收、领地与后勤；谋略 (Intrigue)：密谋、侦破与暗杀；
   - 学识 (Learning)：历史、医术与神学；勇武 (Prowess)：决斗、个人战斗与体魄；
   - 必须严格区分军事与勇武：军队指挥使用军事，单挑或亲身战斗使用勇武。
2. **检定结果边界**：
   - 骰子只裁定玩家当前声明动作的成败，不得凭空制造与动作无关的人物、追杀、死亡、异象或世界事件；
   - 自然 20 只能让当前动作在现实和设定允许的范围内完成得更好，不能突破血统、能力、物资与身份限制；
   - 自然 1 只能造成与当前动作及检定前已有风险直接相关的局部失败，不得无理由处死角色；
   - 没有 D20 结果时禁止隐藏掷骰。叙事模式中的特质优势只是倾向，不代表自动成功或失败；
   - 程序给出的总点数、特质倍率、抗性结果均已结算，禁止重新计算或二次追加修正。

---

### 【部位创伤、铠甲与物品归属】
1. **真实部位创伤**：
   - 受创分为四大部位：头部与咽喉 (head)、胸膛与躯干 (torso)、双臂与双手 (arms)、双腿与下肢 (legs)；
   - 伤情分为：完好 intact、轻创 minor、重创 heavy、残废致命 critical；
   - 头部或胸膛遭受 critical 将导致阵亡；双臂受创出剑变形，双腿受创行动受限。
2. **铠甲磨损与瓦雷利亚钢**：
   - 只有当前装备栏中实际穿着的铠甲才能提供防护；重型板甲能抵挡普通劈砍，但会发生【受损磨损】或【严重破损】；瓦雷利亚钢武器削铁如泥，凡铁难挡。
3. **物品归属与场景装备真实性**：
   - 状态切片中的装备栏是角色唯一当前穿戴与持握的装备；随身物品、据点储藏和运输工具中的物品当前都未装备，不提供护甲、武器或检定加成；
   - 随身物品只能容纳信件、药草、钱袋、短匕等真正便携的小件。战甲、大盾、备用武器、坐骑和大宗补给必须留在据点或运输工具中；
   - 角色只能使用当前地点可用据点和附近运输工具中的物品。远方军械库、旅店房间、仓库、马厩或未同行马车中的物品不可凭空取用；
   - 不得只因故事提到著名武器、家族传承或历史装备，就声称角色正在穿戴、持握或获得它。所有物品移动必须保持唯一归属，不能复制。

---

### 【可输出的结构化命令】
本阶段只输出 <resolution>、<state_cmd> 与 <world_intent>，不得输出 <narrate>、<branch> 或替玩家追加行动。

<state_cmd>
[
  //  动态时间流逝（由你根据剧情耗时精准裁定）：
  // { "type": "ADVANCE_TIME", "days": 1, "reason": "大厅对峙与商议持续至深夜" }
  //
  // 【物品命令只引用状态切片中的 definitionId 与 instanceId，禁止临时编造旧装备对象】：
  // { "type": "ITEM_EQUIP", "instanceId": "ned.castle_sword", "position": { "group": "mainhand" }, "displacedTo": { "type": "site", "siteId": "winterfell_armory" } },
  // { "type": "ITEM_UNEQUIP", "instanceId": "ned.chainmail", "to": { "type": "site", "siteId": "winterfell_armory" } },
  // { "type": "ITEM_TRANSFER", "instanceId": "ned.staunching_herbs", "to": { "type": "site", "siteId": "winterfell_room" } },
  // { "type": "ITEM_USE", "instanceId": "ned.staunching_herbs" },
  // { "type": "ITEM_GIFT", "instanceId": "gift_ring", "recipientId": "agot:Stark_5" },
  // 获得物品时只能使用目录中已存在的 definitionId，并提供全局唯一 instanceId；不得凭空定义未知名剑、战甲或奇物。
  // 前端已排队的 ITEM_* 动作由程序在成功回复后结算，模型不得重复输出。
  //
  //  肢体创伤、铠甲磨损、伤口治愈、状态与金币收支：
  // { "type": "INJURE_ZONE", "zone": "arms", "level": "minor", "woundText": "右臂格挡划伤" },
  // { "type": "HEAL_ZONE", "zone": "arms", "clearWound": "右臂格挡划伤" },
  // { "type": "SET_BLEEDING", "value": false },
  // { "type": "SET_POISONED", "value": true },
  // { "type": "SET_INFECTED", "value": false },
  // { "type": "MODIFY_STAT", "stat": "martial", "delta": 1, "reason": "战火淬炼后的成长" },
  // { "type": "ADD_TRAIT", "trait": "wrathful" },
  // { "type": "CHANGE_TITLE", "title": "北境守护" },
  // { "type": "MODIFY_GOLD", "goldDragons": 100, "reason": "国王劳勃的丰厚赏赐" },
  // 金币支出必须余额充足；不足时程序拒绝执行该笔扣减，不影响同一回合的其他命令。
  // 地图位置、人物移动和旅程进度只由地图旅行系统与统一回合结算。
  // 模型不得输出任何改变地点、移动人物或推进旅程的状态命令，也不得使用内部地点键。
]
</state_cmd>

${WORLD_INTENT_RESOLUTION_PROMPT}
`;

// 叙事阶段使用的文学宪章：在程序已经结算事实之后，把这一拍写成一章严肃小说。
export const GOT_LITERARY_PROMPT = `
# 核心指令：维斯特洛已结算叙事 (Settled Narration Charter)

你是一位精通乔治·R·R·马丁《冰与火之歌》原著的史诗级严肃奇幻文学作家。
你只能根据程序已经结算确认的事实，把本回合写成一章厚重、冷冽、残酷的长篇小说正文。本阶段不得重新决定世界状态。

---

### 【文学形式与规范】
1. **真正的长篇小说质感 (Novel-Style Narration)**：
   - **篇幅服从已确认事实**：正文（<narrate>）应写出**篇幅丰满、段落层次分明**的严肃文学小说章节；但不得为凑字数发明程序未确认的婚姻、死亡、受伤、移动、头衔、物品或时间变化。
   - **对白与正文完全融合 (No Isolated Speech Boxes)**：
     - **严禁把人物说话剥离到正文之外或全部堆在文末！**
     - 所有人物的台词必须**自然融入小说的叙事段落中**，结合说话者的面部微表情、肢体动作、呼吸节奏、眼神交汇与心理压迫展开。
     - *对白示例*：
       “罗德利克教头快步踏上结满白霜的石阶，抹了一把颔下硬如铁丝的胡须，压低声音道：‘大人，国王的先锋骑兵已越过避冬市镇！劳勃陛下的金冠雄鹿旗在暴风雪中猎猎作响……但兰尼斯特家族的随行车队，人数比预想中多了一倍。’他握着剑柄的指节因用力而发白，目光警惕地扫视着四周。”
2. **极致的感官与环境刻画 (Sensory & Atmosphere)**：
   - 生动描写环境细节：鱼梁木滴落的猩红汁液、壁炉泥煤燃烧的焦苦烟气、锁子甲相互摩擦的冷硬铁响、冻伤皮肉的刺痛、酒杯上凝结的水汽、封臣们各怀鬼胎的窃窃私语。
3. **维斯特洛真实残酷法则 (Dark & Realistic)**：
   - **禁止使用任何 emoji 或表情字符**。所有叙事、思考与分支只能使用纯文本；视觉提示由前端图标系统负责。
   - 严禁任何现代网络词汇、鸡汤或 AI 八股套话（如“不是……而是……”、“殊不知”、“不禁”）。
   - 严禁机械降神与无脑主角光环。刀剑无眼，贵族与乞丐皆会流血丧命。
   - 严禁替玩家做出决定或替玩家发表台词。你的叙事停留在玩家决策的自然演化与在场 NPC 的生动反应上，等待玩家下一步抉择。

---

### 【反主角光环与认知边界】
- 玩家不是原著主角的替代品。NPC 对玩家的认知只建立在玩家实际展现的言行上，不得残留对原著主角的刻板印象。
- 不得把原著主角的专属剧情、动机或人际关系强行套用到玩家身上。
- 含玩家在内，所有角色只掌握有限情报。玩家在私下场合做的事，未在场的 NPC 不应知道，也不应据此反应。
- NPC 提及他人事件或背景信息时必须有合理来源；没有来源则视为不知。

---

### 【事件链推演】
在推演本拍氛围与人物反应时，遵循以下原则：
- 从已发生的事件出发推演因果，而非凭空制造新危机。每个 NPC 的反应应对应其已知信息与自身利益。
- 考虑当前场景至少一条主线因果链：玩家上一行动 → NPC 直接反应 → 本拍呈现的后果。
- 若存在未回收的伏笔或待处理世界事务，将其自然融入当前场景，而非强行中断节奏。
- 叙事只呈现这一拍的直接后果；后续更大的局势变化留给玩家下一行动触发，不得在本拍越权推进。

---

### 【叙事节奏】
- 根据当前场景的性质选择节奏：激烈冲突时快推进、短句、动作密集；日常与谈判时慢节奏、细节丰满、心理博弈展开。
- 不得在文戏中强行制造危机，也不得在战斗中拖沓铺垫。
- 节奏服从已确认事实，不得为追求戏剧性而发明未确认的事件。

---

### 【视角控制】
- 严格锁定在玩家角色的物理感官范围内。禁止描写玩家无法看到的内容（如背后发生的动作、远处的全景、他人内心的想法）。
- 玩家不在场的事件不得在正文中出现。
- NPC 的内心只通过其外在行为（表情、动作、语气）间接传达，不得直接全知叙事其心理。

---

### 【草稿检查与输出】
在写出最终 <narrate> 之前，内部完成以下步骤：
1. 拟定本拍草稿：依据程序已确认的事实，写出这一拍的基本事件流。
2. 故事逻辑检查：草稿是否与已确认事实矛盾？人物动机是否合理？有无超游认知？
3. 文风检查：是否符合维斯特洛严肃小说笔法？有无八股套话或禁用句式？
4. 格式检查：只有 <narrate> 与 <branch>；无 <state_cmd>；对白融入正文。
5. 确认无误后输出最终正文。

---

### 【收尾控制】
- 正文必须以 NPC 的可见行动、对话或环境描写收尾，让玩家能自然接上下一拍。
- 不得以内心独白、总结升华或旁白评论收尾。
- 不得在结尾制造「结束感」；故事应当停留在可继续的悬念或行动上。

---

### 【抗重复与抗八股】
- 回顾最近几回合的叙事历史，避免重复已用过的文学手法、句式与桥段。
- 禁止滥用以下意象与句式：「指节发白」「石子落入湖面」「拉满的弓」类比喻；过度使用「喉结」「锁骨」「一丝」「一种」等量词结构。
- 比喻喻词不可只用「像」，应活用「如同」「仿佛」「好似」或借助暗喻略去比喻词。
- 禁止以作者角度解释角色的动作或神态（如「这个动作体现了他的紧张」）；让行为本身传递情绪。

---

### 【禁止霸总化】
- 不得将任何 NPC 关系写成霸道总裁模式：不得用占有欲、强制亲密、压迫式保护、命令式宠溺推动互动。
- NPC 不得强行替玩家做决定、限制玩家自由或以「为你好」的名义控制玩家。
- 所有关系变化应基于双方自主性、边界感与真实反应，而非标签（强势、病娇、占有欲）堆砌。

---

### 【事实锁】
- 只能叙述程序已确认的事实，不得恢复被拒绝的命令。
- 不得增加婚姻、死亡、受伤、移动、头衔、物品或时间变化。
- 遇到重要武器、重要人物、重要城堡地点时，请用【方括号】标注（如【瓦雷利亚钢巨剑 · 寒冰】、【劳勃国王】、【临冬城】）。

---

### 【输出格式】
只使用以下标准 XML 标签：

<think>
这里写下你的后台逻辑推演：结合程序已确认的事实、玩家行动与在场 NPC 的立场，推演本拍的氛围、人物反应与局势走向。
</think>

<narrate>
这里写下高质量、长篇、小说化的文学正文。段落清晰，将人物动作、场景气氛、心理博弈与【自然对白】完美交织在一起。
</narrate>

<branch>
提供 3 个符合维斯特洛贵族逻辑且差异鲜明的行动分支供玩家抉择：
1. 第一个行动（偏向勇武的个人迎击，或偏向军事的军队行动与强硬施压）
2. 第二个行动（偏向谋略/刺探密谋/暗中调查）
3. 第三个行动（偏向外交/妥协周旋/隐忍安抚）
</branch>
`;

// 构建当前世界状态切片 (Dynamic State Slice)
export function buildStateSlice(gameState: GameState): string {
  const { lord, currentYear, currentMonth, currentDay, currentSeason, turnCount } = gameState;
  const body = lord.body;
  const itemState = lord.items;
  const itemEntries = Object.values(itemState.instances).map((instance) => ({
    instance,
    definition: getItemDefinition(ITEM_CATALOG, instance.definitionId),
    placement: itemState.placements[instance.instanceId],
  }));
  const equippedEntries = itemEntries.filter((entry) => entry.placement.type === 'equipped');
  const accessibleEntries = itemEntries.filter((entry) => {
    if (entry.placement.type === 'carried') return true;
    if (entry.placement.type === 'site') {
      const site = itemState.sites[entry.placement.siteId];
      return Boolean(site && sameWorldLocation(site.location, lord.location));
    }
    if (entry.placement.type === 'vehicle') {
      const vehicle = itemState.vehicles[entry.placement.vehicleId];
      return Boolean(vehicle && sameWorldLocation(vehicle.location, lord.location));
    }
    return false;
  });
  const formatEntry = (entry: typeof itemEntries[number]) => {
    const count = entry.instance.quantity > 1 ? `,数量:${entry.instance.quantity}` : '';
    const charges = entry.instance.charges !== undefined ? `,次数:${entry.instance.charges}` : '';
    return `${entry.instance.customName ?? entry.definition.name}{definitionId:${entry.definition.id},instanceId:${entry.instance.instanceId}${count}${charges}}`;
  };
  const equippedSummary = equippedEntries.map((entry) => {
    const placement = entry.placement.type === 'equipped' ? JSON.stringify(entry.placement.position) : '';
    return `${formatEntry(entry)},位置:${placement}`;
  }).join('；') || '无';
  // 可访问物品按容器归组：随身、各据点、各运输工具分别成段，据点名直接进入上下文。
  const carriedAccessible = accessibleEntries.filter((entry) => entry.placement.type === 'carried');
  const accessibleBySite = new Map<string, typeof accessibleEntries>();
  const accessibleByVehicle = new Map<string, typeof accessibleEntries>();
  for (const entry of accessibleEntries) {
    if (entry.placement.type === 'site') {
      const list = accessibleBySite.get(entry.placement.siteId) ?? [];
      list.push(entry);
      accessibleBySite.set(entry.placement.siteId, list);
    } else if (entry.placement.type === 'vehicle') {
      const list = accessibleByVehicle.get(entry.placement.vehicleId) ?? [];
      list.push(entry);
      accessibleByVehicle.set(entry.placement.vehicleId, list);
    }
  }
  const accessibleParts = [
    ...(carriedAccessible.length ? [`随身：${carriedAccessible.map(formatEntry).join('；')}`] : []),
    ...[...accessibleBySite.entries()].flatMap(([siteId, entries]) => {
      const site = itemState.sites[siteId];
      return site ? [`${site.name}中：${entries.map(formatEntry).join('；')}`] : [];
    }),
    ...[...accessibleByVehicle.entries()].flatMap(([vehicleId, entries]) => {
      const vehicle = itemState.vehicles[vehicleId];
      return vehicle ? [`${vehicle.name}上：${entries.map(formatEntry).join('；')}`] : [];
    }),
  ];
  const accessibleSummary = accessibleParts.join('｜') || '无';
  const equippedEffects = aggregateEquippedItemEffects(itemState, ITEM_CATALOG);
  const burden = getEquipmentBurden(equippedEffects);
  const itemDirectives = formatItemNarrativeDirectives(equippedEffects).slice(0, 16).join('；') || '无额外装备事实';
  const carryUsage = getUsedCarryUnits(itemState, ITEM_CATALOG);


  const levelNames: Record<string, string> = {
    intact: '完好',
    minor: '轻创',
    heavy: '重创',
    critical: '残废致命',
  };

  const bodySummary = [
    `头部: 【${levelNames[body.head.level]}】${body.head.wounds.length ? `(${body.head.wounds.join(',')})` : ''}`,
    `躯干: 【${levelNames[body.torso.level]}】${body.torso.wounds.length ? `(${body.torso.wounds.join(',')})` : ''}`,
    `双臂: 【${levelNames[body.arms.level]}】${body.arms.wounds.length ? `(${body.arms.wounds.join(',')})` : ''}`,
    `双腿: 【${levelNames[body.legs.level]}】${body.legs.wounds.length ? `(${body.legs.wounds.join(',')})` : ''}`,
  ].join(' | ');

  const statusList = [];
  if (body.isBleeding) statusList.push('持续失血');
  if (body.isPoisoned) statusList.push('身中剧毒');
  if (body.isInfected) statusList.push('伤口发炎');

  const traitEffects = aggregateSelectedTraitEffects(lord.traitIds ?? []);
  const ruleSummary = formatTraitRuleEffects(traitEffects).join(' · ') || '无额外规则效果';
  const roleplaySummary = traitEffects.roleplayDirectives.slice(0, 10)
    .map((directive) => formatTraitDescription(directive, lord.name)).join('；') || '无额外人物倾向';
  const journey = gameState.activeJourney;
  const journeyLabel = (locationId: string, fallback: string): string => {
    const label = journey?.locationLabels?.[locationId]?.trim();
    return label && !/\bb_[a-z0-9_]+\b|baronyId|男爵领/i.test(label) ? label : fallback;
  };
  const journeySummary = !journey
    ? '无'
    : `${journey.status}；路线 ${journeyLabel(journey.routePlan.from, '已确认起点')} -> ${journeyLabel(journey.routePlan.to, '已确认终点')}；分段 ${journey.currentLeg + 1}/${Math.max(1, journey.routePlan.legs.length)}；本段已行 ${journey.progressDays} 天${journey.interruptedBy ? `；中断原因 ${journey.interruptedBy}` : ''}`;

  return stripEmoji(`
---
### 【当前世界与领主状态切片 (Turn ${turnCount + 1})】
- 当前时间: 征服历 ${currentYear} AC · ${currentMonth || 10}月${currentDay || 15}日 · ${currentSeason}
- 领主身份: ${lord.house} · ${lord.name} (${lord.title})
- 宗族与箴言: ${lord.dynastyName || lord.house} · ${lord.houseWords}
- 文化与信仰: ${lord.culture || '未指定'} · ${lord.faith || '未指定'}
- 当前旅程: ${journeySummary}
- 整体体魄: 【${lord.overallStatus}】 (异常体态: ${statusList.length > 0 ? statusList.join(', ') : '无'})
- 部位伤情: ${bodySummary}
- 当前装备（唯一真实穿戴状态）: ${equippedSummary}
- 当前可访问物品（随身、当前据点与随行运输工具）: ${accessibleSummary}
- 随身体积: ${carryUsage}/8
- 装备负担: ${burden > 0 ? burden : '无明显负担'}
- 装备确定性事实与场景代价: ${itemDirectives}
- 远方储藏: 不向当前场景提供原始清单，不能直接取用
- 随身财富: ${lord.goldDragons} 金龙, ${lord.silverStags} 银鹿
- CK3 六项能力: 外交 ${lord.attributes.diplomacy}, 军事 ${lord.attributes.martial}, 管理 ${lord.attributes.stewardship}, 谋略 ${lord.attributes.intrigue}, 学识 ${lord.attributes.learning}, 勇武 ${lord.attributes.prowess}
- 特质标签: ${lord.traits.join(', ')}
- 已结算特质规则: ${ruleSummary}
- RP 人物倾向: ${roleplaySummary}
- 特质约束: 上述倍率和抗性由程序结算；只用于当前相关行动，不得替玩家决定行为。
---
`);
}

const MODEL_HIDDEN_LOCATION_COMMANDS = new Set(['CHANGE_LOCATION', 'MOVE_CHARACTER']);

function modelVisibleStateCommands(commands: unknown): unknown[] {
  if (!Array.isArray(commands)) return [];
  return commands.filter((command) => {
    if (!command || typeof command !== 'object') return true;
    const type = 'type' in command ? command.type : undefined;
    return typeof type !== 'string' || !MODEL_HIDDEN_LOCATION_COMMANDS.has(type);
  });
}

// 组装完整的 Prompt 请求消息列表
export interface DicePromptContext {
  mode: DiceMode;
  decision: DiceDecision;
}

export function buildChatMessages(
  gameState: GameState,
  currentUserInput: string,
  diceCheck?: D20Check,
  diceContext?: DicePromptContext,
  pendingTransactions: PendingWorldTransaction[] = [],
  worldContext?: string | WorldTurnContextObject,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  // 世界上下文的唯一拼装点：自动路径传入 WorldTurnContext 对象在此格式化，
  // 字符串保留给人物窗口的 promptContext 等既有调用方。
  const characterContext = typeof worldContext === 'string'
    ? worldContext
    : worldContext
      ? formatWorldTurnContext(worldContext)
      : undefined;
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  // 1. 系统大宪章
  messages.push({
    role: 'system',
    content: GOT_CONSTITUTION_PROMPT.trim(),
  });

  // 2. 状态切片
  const stateSlice = buildStateSlice(gameState);

  // 3. 历史对话窗口：规则阶段只回放行动与已接受命令，不回放上一章正文，
  //    避免"先当小说家再改口"导致规则随文风漂移。
  const recentTurns = gameState.turns.slice(-4);
  for (const turn of recentTurns) {
    messages.push({
      role: 'user',
      content: `【领主行动】: ${stripEmoji(turn.playerInput)}`,
    });

    const visibleCommands = modelVisibleStateCommands(turn.stateCommands);
    const assistantContent = visibleCommands.length
      ? `<state_cmd>
${JSON.stringify(visibleCommands)}
</state_cmd>`
      : '<state_cmd>[]</state_cmd>';

    messages.push({
      role: 'assistant',
      content: assistantContent,
    });
  }

  // 4. 当前回合用户输入 + 掷骰检定结果 (如果有)
  const pendingEquipmentPrompt = formatPendingItemPrompt(
    pendingItemActionsFromWorldTransactions(pendingTransactions, gameState.lord.items, ITEM_CATALOG),
  );
  const safeCharacterContext = typeof characterContext === 'string'
    ? stripEmoji(characterContext).replace(/</g, '＜').replace(/>/g, '＞')
    : '';
  let currentActionPrompt = `【当前领主行动】: ${stripEmoji(currentUserInput)}\n\n${stateSlice}${safeCharacterContext ? `\n\n${safeCharacterContext}` : ''}${pendingEquipmentPrompt ? `\n\n${pendingEquipmentPrompt}` : ''}`;
  if (diceCheck) {
    const traitBreakdown = diceCheck.traitModifierBreakdown.length
      ? diceCheck.traitModifierBreakdown.map((item) => `${item.name} ${item.value >= 0 ? '+' : ''}${item.value}`).join(' · ')
      : '无相关特质修正';
    const itemBreakdown = diceCheck.equipmentModifierBreakdown.length
      ? diceCheck.equipmentModifierBreakdown.map((item) => `${item.name}“${item.reason}” ${item.value >= 0 ? '+' : ''}${item.value}`).join(' · ')
      : '无相关物品修正';
    const contract = diceCheck.outcomeContract;
    currentActionPrompt += `

【D20 规则检定结果：程序已完成结算，禁止重新计算】
- 当前动作: ${contract.intent}
- 检定项目: ${diceCheck.attributeName} vs 难度 DC ${diceCheck.dc}
- 掷骰公式: D20 ${diceCheck.roll} + 属性 ${diceCheck.attributeModifier >= 0 ? '+' : ''}${diceCheck.attributeModifier} + 物品 ${diceCheck.equipmentModifier >= 0 ? '+' : ''}${diceCheck.equipmentModifier} + 特质 ${diceCheck.traitModifier >= 0 ? '+' : ''}${diceCheck.traitModifier} = ${diceCheck.total}
- 物品明细: ${itemBreakdown}
- 特质明细: ${traitBreakdown}
- 判定结论: ${diceCheck.isNatural20 ? '自然 20，当前动作在合理边界内取得更佳结果' : diceCheck.isNatural1 ? '自然 1，当前动作在既有风险内遭遇局部失败' : diceCheck.success ? '当前动作成功' : '当前动作失败'}
- 成功边界: ${contract.successOutcome}
- 失败边界: ${contract.failureOutcome}
- 自然 20 上限: ${contract.criticalSuccessLimit}
- 自然 1 上限: ${contract.criticalFailureLimit}
- 禁止升级: ${contract.forbiddenEscalations.join('；')}
- 叙事要求: 只呈现当前动作的成败与直接后果，不得追加无关灾难、奇遇、追杀或身份跃升。`;
  } else if (diceContext) {
    const inferred = inferCheckFromAction(currentUserInput);
    const contributions = getTraitCheckContributions(gameState.lord.traitIds ?? [], inferred.domain);
    const totalModifier = contributions.reduce((total, item) => total + item.value, 0);
    const sceneTags = inferItemSceneTags(currentUserInput, inferred.domain);
    const itemEffects = aggregateEquippedItemEffects(gameState.lord.items, ITEM_CATALOG);
    const unlockedActions = getUnlockedItemActions(itemEffects, { actionText: currentUserInput, sceneTags });
    const itemFacts = formatItemNarrativeDirectives(itemEffects).slice(0, 12).join('；') || '无额外装备事实';
    const burden = getEquipmentBurden(itemEffects);
    const contributionText = contributions.length
      ? contributions.map((item) => `${item.name} ${item.value >= 0 ? '+' : ''}${item.value}`).join(' · ')
      : '无相关特质倾向';
    currentActionPrompt += `

【叙事模式：没有 D20 结果，禁止隐藏掷骰】
- 模式: ${diceContext.mode === 'narrative' ? '玩家主动选择叙事行动' : diceContext.decision.isImpossible ? '行动超出当前世界条件' : '自动判断为无需检定'}
- 判断理由: ${diceContext.decision.reason}
- 相关特质: ${contributionText}
- 综合倾向: ${describeNarrativeAdvantage(totalModifier)}
- 当前物品场景: ${sceneTags.length ? sceneTags.join('、') : '一般场景'}
- 物品允许行动: ${unlockedActions.length ? unlockedActions.join('、') : '无额外行动'}
- 穿戴负担: ${burden || '无明显负担'}
- 当前装备事实与代价: ${itemFacts}
- 规则边界: 特质倾向只帮助塑造合理过程，不代表自动成功或失败；不得把普通行动升级为意外灾难或天降奇迹。
- 玩家控制: RP 倾向不得替玩家作出后续决定。`;
  }

  messages.push({
    role: 'user',
    content: currentActionPrompt,
  });

  return messages;
}
