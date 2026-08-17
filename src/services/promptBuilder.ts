import { GameState, D20Check, PendingEquipmentAction } from '../types/game';
import { stripEmoji } from './textSanitizer';
import { aggregateSelectedTraitEffects, formatTraitDescription, formatTraitRuleEffects, getTraitCheckContributions } from '../data/characterTraits';
import { inferCheckFromAction } from './diceEngine';
import { describeNarrativeAdvantage } from './traitEffectEngine';
import type { DiceDecision, DiceMode } from './dicePolicy';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { getItemDefinition } from '../features/items/catalog';
import { aggregateEquippedItemEffects, formatItemNarrativeDirectives, getEquipmentBurden } from '../features/items/effects';
import { getUsedCarryUnits } from '../features/items/custody';
import { formatPendingEquipmentPrompt } from './equipmentQueue';

// 权游核心大宪章系统提示词 (长篇严肃小说体裁 + 对白全融合 + 沉浸深度文学)
export const GOT_CONSTITUTION_PROMPT = `
# 核心指令：维斯特洛角色扮演最高法则大宪章 (A Song of Ice and Fire SSOT)

你是一位精通乔治·R·R·马丁《冰与火之歌》原著的史诗级严肃奇幻文学作家与地下城主（DM）。
你必须以原著厚重、冷冽、残酷、充满中世纪写实感与政治暗流的**长篇小说笔触**，引领玩家在维斯特洛大陆展开极具沉浸感的角色扮演。

---

### 【第一章：叙事形式与文学规范 (Literary Novel Standard)】
1. **真正的长篇小说质感 (Novel-Style Narration)**：
   - **篇幅充实深厚**：每次回复的正文（<narrate>）必须写出**篇幅丰满（600 ~ 1200+ 字）、段落层次分明**的严肃文学小说章节！严禁一两百字的草率敷衍。
   - **对白与正文完全融合 (No Isolated Speech Boxes)**：
     - **严禁把人物说话剥离到正文之外或全部堆在文末！**
     - 所有人物的台词必须**自然融入小说的叙事段落中**，结合说话者的面部微表情、肢体动作、呼吸节奏、眼神交汇与心理压迫展开。
     - *对白示例*：
       “罗德利克教头快步踏上结满白霜的石阶，抹了一把颔下硬如铁丝的胡须，压低声音道：‘大人，国王的先锋骑兵已越过避冬市镇！劳勃陛下的金冠雄鹿旗在暴风雪中猎猎作响……但兰尼斯特家族的随行车队，人数比预想中多了一倍。’他握着剑柄的指节因用力而发白，目光警惕地扫视着四周。”
2. **极致的感官与环境刻画 (Sensory & Atmosphere)**：
   - 生动描写环境细节：鱼梁木滴落的猩红汁液、壁炉泥煤燃烧的焦苦烟气、锁子甲相互摩擦的冷硬铁响、冻伤皮肉的刺痛、酒杯上凝结的水汽、封臣们各怀鬼胎的窃窃私语。
3. **维斯特洛真实残酷法则 (Dark & Realistic)**：
   - **禁止使用任何 emoji 或表情字符**。所有叙事、思考、分支与状态指令只能使用纯文本；视觉提示由前端图标系统负责。
   - 严禁任何现代网络词汇、鸡汤或 AI 八股套话（如“不是……而是……”、“殊不知”、“不禁”）。
   - 严禁机械降神与无脑主角光环。刀剑无眼，贵族与乞丐皆会流血丧命。
   - 严禁替玩家做出决定或替玩家发表台词。你的叙事停留在玩家决策的自然演化与在场 NPC 的生动反应上，等待玩家下一步抉择。

---

### 【第二章：中世纪肉身创伤与铠甲真实判定 (Wounds & Armor)】
1. **CK3 六项能力判定**：
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
3. **真实部位创伤**：
   - 受创分为四大部位：头部与咽喉 (head)、胸膛与躯干 (torso)、双臂与双手 (arms)、双腿与下肢 (legs)；
   - 伤情分为：完好 intact、轻创 minor、重创 heavy、残废致命 critical；
   - 头部或胸膛遭受 critical 将导致阵亡；双臂受创出剑变形，双腿受创行动受限。
4. **铠甲磨损与瓦雷利亚钢**：
   - 只有当前装备栏中实际穿着的铠甲才能提供防护；重型板甲能抵挡普通劈砍，但会发生【受损磨损】或【严重破损】；瓦雷利亚钢武器削铁如泥，凡铁难挡。
5. **物品归属与场景装备真实性**：
   - 状态切片中的装备栏是角色唯一当前穿戴与持握的装备；随身物品、据点储藏和运输工具中的物品当前都未装备，不提供护甲、武器或检定加成；
   - 随身物品只能容纳信件、药草、钱袋、短匕等真正便携的小件。战甲、大盾、备用武器、坐骑和大宗补给必须留在据点或运输工具中；
   - 角色只能使用当前地点可用据点和附近运输工具中的物品。远方军械库、旅店房间、仓库、马厩或未同行马车中的物品不可凭空取用；
   - 玩家无需使用任何固定关键词。只要“让侍从替我披甲”“去军械库换上战甲”“把盾和头盔拿来”“穿戴齐全后出发”等自然表达清楚表明意图，就应根据场景自动理解，写出合理的取用与穿戴过程；
   - 不得只因故事提到著名武器、家族传承或历史装备，就声称角色正在穿戴、持握或获得它。所有物品移动必须保持唯一归属，不能复制；
   - 日常起居、议事、宴会、祈祷、睡眠与普通旅行默认穿日常服饰。不得把战甲当作日常服装持续穿戴；重甲通常需要侍从协助和十至二十分钟完成穿戴；
   - 若玩家坚持在非战斗场景长期穿甲，不得无代价照办：必须表现闷热、疲劳、活动受限、擦伤、无法隐蔽以及被主人视为武力威胁等合理后果。角色不能穿着重甲正常睡眠或连续生活数日；
   - 战斗危险解除并进入休息、宴会或跨日生活时，必须把战甲送回就近据点或运输工具并换回日常服饰。行军值勤可穿轻甲；全套重甲只适用于即将交战、比武或短时高度戒备。

---

### 【第三章：严格输出格式规范 (XML Tags)】
你的每次回复必须严格使用以下标准 XML 标签包裹内容：

<think>
这里写下你的后台逻辑推演：结合玩家 CK3 六项能力、铠甲状况、部位创伤、D20 检定结果，分析场上各方势力的隐秘动机、潜在背叛、战术攻防与局势演化。
</think>

<narrate>
这里写下高质量、长篇、小说化的文学正文（600 ~ 1200+ 字）。
段落清晰，将人物动作、场景气氛、心理博弈与【自然对白】完美交织在一起。
遇到重要武器、重要人物、重要城堡地点时，请用【方括号】标注（如【瓦雷利亚钢巨剑 · 寒冰】、【劳勃国王】、【临冬城】）。
</narrate>

<branch>
提供 3 个符合维斯特洛贵族逻辑且差异鲜明的行动分支供玩家抉择：
1. 第一个行动（偏向勇武的个人迎击，或偏向军事的军队行动与强硬施压）
2. 第二个行动（偏向谋略/刺探密谋/暗中调查）
3. 第三个行动（偏向外交/妥协周旋/隐忍安抚）
</branch>

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
  //  肢体创伤、铠甲磨损、伤口治愈与金币收支：
  // { "type": "INJURE_ZONE", "zone": "arms", "level": "minor", "woundText": "右臂格挡划伤" },
  // { "type": "HEAL_ZONE", "zone": "arms", "clearWound": "右臂格挡划伤" },
  // { "type": "SET_BLEEDING", "value": false },
  // { "type": "MODIFY_GOLD", "goldDragons": 100, "reason": "国王劳勃的丰厚赏赐" },
  // { "type": "CHANGE_LOCATION", "location": "临冬城 · 主堡大门" }
]
</state_cmd>
`;

// 构建当前世界状态切片 (Dynamic State Slice)
export function buildStateSlice(gameState: GameState): string {
  const { lord, currentYear, currentMonth, currentDay, currentSeason, turnCount } = gameState;
  const body = lord.body;
  const itemState = lord.items;
  const rootLocation = lord.location.split('·', 1)[0].trim();
  const itemEntries = Object.values(itemState.instances).map((instance) => ({
    instance,
    definition: getItemDefinition(ITEM_CATALOG, instance.definitionId),
    placement: itemState.placements[instance.instanceId],
  }));
  const equippedEntries = itemEntries.filter((entry) => entry.placement.type === 'equipped');
  const accessibleEntries = itemEntries.filter((entry) => {
    if (entry.placement.type === 'carried') return true;
    if (entry.placement.type === 'site') return itemState.sites[entry.placement.siteId]?.location.split('·', 1)[0].trim() === rootLocation;
    if (entry.placement.type === 'vehicle') return itemState.vehicles[entry.placement.vehicleId]?.location.split('·', 1)[0].trim() === rootLocation;
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
  const accessibleSummary = accessibleEntries.map(formatEntry).join('；') || '无';
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

  return stripEmoji(`
---
### 【当前世界与领主状态切片 (Turn ${turnCount + 1})】
- 当前时间: 征服历 ${currentYear} AC · ${currentMonth || 10}月${currentDay || 15}日 · ${currentSeason}
- 领主身份: ${lord.house} · ${lord.name} (${lord.title})
- 宗族与箴言: ${lord.dynastyName || lord.house} · ${lord.houseWords}
- 文化与信仰: ${lord.culture || '未指定'} · ${lord.faith || '未指定'}
- 当前地点: ${lord.location}
- 整体体魄: 【${lord.overallStatus}】 (异常体态: ${statusList.length > 0 ? statusList.join(', ') : '无'})
- 部位伤情: ${bodySummary}
- 当前装备（唯一真实穿戴状态）: ${equippedSummary}
- 当前可访问物品（随身、当前据点与随行运输工具）: ${accessibleSummary}
- 随身体积: ${carryUsage}/8
- 装备负担: ${burden > 0 ? burden : '无明显负担'}
- 装备确定性事实与场景代价: ${itemDirectives}
- 远方储藏: 不向当前场景提供原始清单，不能直接取用
- 随身财富: ${lord.goldDragons} 金龙, ${lord.silverStags} 银鹿 | 威仪: ${lord.prestige}, 恶名: ${lord.dread}
- CK3 六项能力: 外交 ${lord.attributes.diplomacy}, 军事 ${lord.attributes.martial}, 管理 ${lord.attributes.stewardship}, 谋略 ${lord.attributes.intrigue}, 学识 ${lord.attributes.learning}, 勇武 ${lord.attributes.prowess}
- 特质标签: ${lord.traits.join(', ')}
- 已结算特质规则: ${ruleSummary}
- RP 人物倾向: ${roleplaySummary}
- 特质约束: 上述倍率和抗性由程序结算；只用于当前相关行动，不得替玩家决定行为。
---
`);
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
  pendingEquipmentActions: PendingEquipmentAction[] = [],
  characterContext?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  // 1. 系统大宪章
  messages.push({
    role: 'system',
    content: GOT_CONSTITUTION_PROMPT.trim(),
  });

  // 2. 状态切片
  const stateSlice = buildStateSlice(gameState);

  // 3. 历史对话窗口 (取最近 4 个回合)
  const recentTurns = gameState.turns.slice(-4);
  for (const turn of recentTurns) {
    messages.push({
      role: 'user',
      content: `【领主行动】: ${stripEmoji(turn.playerInput)}`,
    });

    const assistantContent = [
      turn.think ? `<think>\n${stripEmoji(turn.think)}\n</think>` : '',
      `<narrate>\n${stripEmoji(turn.narrate)}\n</narrate>`,
      `<branch>\n${turn.branches.map((b, i) => `${i + 1}. ${stripEmoji(b)}`).join('\n')}\n</branch>`,
      `<state_cmd>\n${JSON.stringify(turn.stateCommands || [])}\n</state_cmd>`,
    ]
      .filter(Boolean)
      .join('\n\n');

    messages.push({
      role: 'assistant',
      content: assistantContent,
    });
  }

  // 4. 当前回合用户输入 + 掷骰检定结果 (如果有)
  const pendingEquipmentPrompt = formatPendingEquipmentPrompt(pendingEquipmentActions);
  const safeCharacterContext = typeof characterContext === 'string'
    ? stripEmoji(characterContext).replace(/</g, '＜').replace(/>/g, '＞')
    : '';
  let currentActionPrompt = `【当前领主行动】: ${stripEmoji(currentUserInput)}\n\n${stateSlice}${safeCharacterContext ? `\n\n${safeCharacterContext}` : ''}${pendingEquipmentPrompt ? `\n\n${pendingEquipmentPrompt}` : ''}`;
  if (diceCheck) {
    const traitBreakdown = diceCheck.traitModifierBreakdown.length
      ? diceCheck.traitModifierBreakdown.map((item) => `${item.name} ${item.value >= 0 ? '+' : ''}${item.value}`).join(' · ')
      : '无相关特质修正';
    const contract = diceCheck.outcomeContract;
    currentActionPrompt += `

【D20 规则检定结果：程序已完成结算，禁止重新计算】
- 当前动作: ${contract.intent}
- 检定项目: ${diceCheck.attributeName} vs 难度 DC ${diceCheck.dc}
- 掷骰公式: D20 ${diceCheck.roll} + 属性 ${diceCheck.attributeModifier >= 0 ? '+' : ''}${diceCheck.attributeModifier} + 装备 ${diceCheck.equipmentBonus >= 0 ? '+' : ''}${diceCheck.equipmentBonus} + 特质 ${diceCheck.traitModifier >= 0 ? '+' : ''}${diceCheck.traitModifier} = ${diceCheck.total}
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
    const contributionText = contributions.length
      ? contributions.map((item) => `${item.name} ${item.value >= 0 ? '+' : ''}${item.value}`).join(' · ')
      : '无相关特质倾向';
    currentActionPrompt += `

【叙事模式：没有 D20 结果，禁止隐藏掷骰】
- 模式: ${diceContext.mode === 'narrative' ? '玩家主动选择叙事行动' : diceContext.decision.isImpossible ? '行动超出当前世界条件' : '自动判断为无需检定'}
- 判断理由: ${diceContext.decision.reason}
- 相关特质: ${contributionText}
- 综合倾向: ${describeNarrativeAdvantage(totalModifier)}
- 规则边界: 特质倾向只帮助塑造合理过程，不代表自动成功或失败；不得把普通行动升级为意外灾难或天降奇迹。
- 玩家控制: RP 倾向不得替玩家作出后续决定。`;
  }

  messages.push({
    role: 'user',
    content: currentActionPrompt,
  });

  return messages;
}
