import type { LordAttributes } from '../domain/character.ts';
import type { TraitCheckDomain } from './traitEffectEngine.ts';

export type DiceMode = 'auto' | 'force' | 'narrative';

export interface DiceEvaluationContext {
  overallStatus?: '强健' | '挂彩' | '负重伤' | '垂危' | '阵亡';
}

export interface DiceDecision {
  shouldRoll: boolean;
  isImpossible: boolean;
  reason: string;
  attribute?: keyof LordAttributes;
  secondaryAttribute?: keyof LordAttributes;
  domain?: TraitCheckDomain;
  dc?: number;
  intentLabel?: string;
}

export interface CheckOutcomeContract {
  intent: string;
  successOutcome: string;
  failureOutcome: string;
  criticalSuccessLimit: string;
  criticalFailureLimit: string;
  forbiddenEscalations: string[];
}

export interface InferredActionCheck {
  attribute: keyof LordAttributes;
  secondaryAttribute?: keyof LordAttributes;
  domain: TraitCheckDomain;
  dc: number;
  intentLabel: string;
}

interface ActionIntent {
  label: string;
  attribute: keyof LordAttributes;
  domain: TraitCheckDomain;
  baseDc: number;
  patterns: readonly RegExp[];
  physical?: boolean;
}

interface ActionMethod {
  attribute: keyof LordAttributes;
  secondaryAttribute?: keyof LordAttributes;
  domain: TraitCheckDomain;
  label: string;
  baseDc: number;
  patterns: readonly RegExp[];
  physical?: boolean;
}

const IMPOSSIBLE_PATTERNS = [
  /凭空(?:召唤|创造|变出)/,
  /一剑(?:劈开|斩断)(?:城墙|山|大地)/,
  /徒手(?:摧毁|掀翻)(?:城堡|城墙|山)/,
  /瞬间(?:成为|变成)(?:国王|皇帝|神|巨龙)/,
  /没有龙蛋.*孵出龙/,
];

const ACTION_INTENTS: readonly ActionIntent[] = [
  { label: '治疗', attribute: 'learning', domain: 'medicine', baseDc: 13, patterns: [/医治|治疗|诊断|包扎|止血|解毒|处理伤势/] },
  { label: '勾引', attribute: 'diplomacy', domain: 'seduction', baseDc: 14, patterns: [/勾引|调情|求爱|诱惑|示爱/] },
  { label: '恐吓', attribute: 'diplomacy', domain: 'intimidation', baseDc: 14, patterns: [/恐吓|威胁|震慑|逼迫|恫吓/] },
  { label: '克服恐惧', attribute: 'prowess', domain: 'resistFear', baseDc: 13, physical: true, patterns: [/克服恐惧|抵抗恐惧|保持镇定|鼓起勇气/] },
  { label: '秘密行动', attribute: 'intrigue', domain: 'intrigue', baseDc: 15, patterns: [/潜入|偷窃|窃取|下毒|刺探|跟踪|隐瞒|欺骗|伪装|密谋|暗杀|刺杀|开锁|撬锁/] },
  { label: '个人战斗', attribute: 'prowess', domain: 'duel', baseDc: 14, physical: true, patterns: [/决斗|单挑|搏斗|攻击|格挡|挡开|挥剑|拔剑|劈砍|肉搏|斩(?:向|击|杀)|刺向|杀死/] },
  { label: '战争指挥', attribute: 'martial', domain: 'battle', baseDc: 14, patterns: [/战争|统兵|军队|军团|骑兵|布防|攻城|围城|冲锋|阵型|战术|征召|操练|行军|指挥|突围|作战/] },
  { label: '治理', attribute: 'stewardship', domain: 'stewardship', baseDc: 13, patterns: [/粮食|粮草|税收|账簿|营建|修缮|领地|后勤|重整财政|整肃账目/] },
  { label: '交涉', attribute: 'diplomacy', domain: 'diplomacy', baseDc: 14, patterns: [/说服|劝服|谈判|交涉|结盟|联姻|安抚|劝说/] },
  { label: '研究辨识', attribute: 'learning', domain: 'learning', baseDc: 13, patterns: [/研究|辨认|破解|调查|查阅|考证|推理|解读/] },
  { label: '生存行动', attribute: 'learning', domain: 'survival', baseDc: 13, physical: true, patterns: [/追踪|狩猎|荒野求生|求生|逃脱|逃生|攀爬|泅渡|觅食|穿越急流/] },
];

// 方法优先于场景大类：同样是“进城”，伪造文书与翻墙应形成不同构筑。
// 辅属性只在它对执行方式确有因果作用时出现，不强迫所有检定使用两项属性。
const ACTION_METHODS: readonly ActionMethod[] = [
  { label: '伪造文书', attribute: 'intrigue', secondaryAttribute: 'learning', domain: 'intrigue', baseDc: 16, patterns: [/伪造|仿写|假(?:的)?(?:通行证|许可|军令|文书|印章)/] },
  { label: '隐蔽攀爬', attribute: 'prowess', secondaryAttribute: 'intrigue', domain: 'survival', baseDc: 15, physical: true, patterns: [/悄悄.*攀|攀.*(?:避开|躲开|不惊动)|翻(?:过|越).*(?:墙|城垛)/] },
  { label: '攀爬', attribute: 'prowess', domain: 'survival', baseDc: 13, physical: true, patterns: [/攀爬|翻墙|爬上|爬下|攀上|攀下/] },
  { label: '追踪', attribute: 'learning', secondaryAttribute: 'prowess', domain: 'survival', baseDc: 13, physical: true, patterns: [/追踪|循着踪迹|辨认足迹|寻找兽迹/] },
  { label: '武力威慑', attribute: 'diplomacy', secondaryAttribute: 'prowess', domain: 'intimidation', baseDc: 14, patterns: [/(?:拔剑|佩剑|展示武器|武力).*(?:威胁|恐吓|震慑)|(?:威胁|恐吓|震慑).*(?:拔剑|佩剑|武器|动手)/] },
  { label: '识破文书', attribute: 'learning', secondaryAttribute: 'intrigue', domain: 'learning', baseDc: 14, patterns: [/(?:检查|识破|核验|辨认).*(?:文书|印章|签名|许可|军令)/] },
  { label: '伏击谋划', attribute: 'martial', secondaryAttribute: 'intrigue', domain: 'battle', baseDc: 15, patterns: [/伏击|佯攻|诱敌|设伏/] },
];

const TRIVIAL_PATTERNS = [
  /^(我)?(?:坐下|站起|走路|散步|喝水|吃饭|睡觉|休息|点头|摇头)/,
  /^(我)?(?:询问|问候|打招呼|自我介绍)/,
  /^(我)?(?:说|回答|告诉|表示)[：:“"]?$/,
  /^(我)?(?:观察|看看|阅读)(?:周围|公开|眼前|手中)/,
  /(?:去|从).*(?:军械库|衣箱|随身物品).*(?:穿上|戴上|装备|佩上)/,
];

const LOW_STAKES_PATTERNS = [
  /练习|演练|排练/,
  /木桩|稻草人|空挥/,
  /轻微(?:擦伤|划伤)|普通小伤/,
  /无人阻拦|已经获准|对方已经同意|主动配合/,
];

const HARD_SITUATION_PATTERNS = [/重兵把守|警戒严密|戒备森严|身经百战|暴风雪|湍急|悬崖|几乎无光/];
const MODERATE_SITUATION_PATTERNS = [/守卫把守|上锁|警戒|敌方骑士|敌人阻拦|恶劣天气|黑暗|负重前进/];
const DOMAIN_BASE_DCS: Record<TraitCheckDomain, number> = {
  duel: 14,
  battle: 14,
  intrigue: 15,
  diplomacy: 14,
  stewardship: 13,
  learning: 13,
  medicine: 13,
  survival: 13,
  intimidation: 14,
  seduction: 14,
  resistFear: 13,
};

const PHYSICAL_DOMAINS = new Set<TraitCheckDomain>(['duel', 'survival', 'resistFear']);

function firstPatternIndex(action: string, patterns: readonly RegExp[]): number {
  let first = Number.POSITIVE_INFINITY;
  for (const pattern of patterns) {
    const match = pattern.exec(action);
    if (match && match.index < first) first = match.index;
  }
  return first;
}

export function inferActionCheck(actionText: string): InferredActionCheck {
  const action = actionText.trim();
  let selectedMethod: ActionMethod | undefined;
  let selectedMethodIndex = Number.POSITIVE_INFINITY;
  for (const method of ACTION_METHODS) {
    const index = firstPatternIndex(action, method.patterns);
    if (index < selectedMethodIndex) {
      selectedMethod = method;
      selectedMethodIndex = index;
    }
  }
  if (selectedMethod) {
    return {
      attribute: selectedMethod.attribute,
      ...(selectedMethod.secondaryAttribute ? { secondaryAttribute: selectedMethod.secondaryAttribute } : {}),
      domain: selectedMethod.domain,
      dc: selectedMethod.baseDc,
      intentLabel: selectedMethod.label,
    };
  }
  let selected: ActionIntent | undefined;
  let selectedIndex = Number.POSITIVE_INFINITY;
  for (const intent of ACTION_INTENTS) {
    const index = firstPatternIndex(action, intent.patterns);
    if (index < selectedIndex) {
      selected = intent;
      selectedIndex = index;
    }
  }
  if (!selected) {
    return { attribute: 'diplomacy', domain: 'diplomacy', dc: 12, intentLabel: '一般行动' };
  }
  return {
    attribute: selected.attribute,
    domain: selected.domain,
    dc: selected.baseDc,
    intentLabel: selected.label,
  };
}

function findIntent(action: string): ActionIntent | ActionMethod | undefined {
  const inferred = inferActionCheck(action);
  return ACTION_METHODS.find((method) => method.domain === inferred.domain && method.label === inferred.intentLabel)
    ?? ACTION_INTENTS.find((intent) => intent.domain === inferred.domain && intent.label === inferred.intentLabel);
}

function calculateContextualDc(
  action: string,
  intent: Pick<ActionIntent | ActionMethod, 'baseDc' | 'physical'>,
  context?: DiceEvaluationContext,
): { dc: number; factors: string[] } {
  let adjustment = 0;
  const factors: string[] = [];
  if (HARD_SITUATION_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment += 2;
    factors.push('强阻力 +2');
  } else if (MODERATE_SITUATION_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment += 1;
    factors.push('场景阻力 +1');
  }
  // 准备、工具、协助和关系优势不得仅凭玩家在文本中自称成立。
  // 它们由装备效果、人物/社会账本、世界事实等已验证状态单独结算。
  if (intent.physical && context?.overallStatus) {
    const woundAdjustment = context.overallStatus === '垂危' ? 4 : context.overallStatus === '负重伤' ? 2 : context.overallStatus === '挂彩' ? 1 : 0;
    if (woundAdjustment) {
      adjustment += woundAdjustment;
      factors.push(`伤势负担 +${woundAdjustment}`);
    }
  }
  return { dc: Math.max(8, Math.min(20, intent.baseDc + adjustment)), factors };
}

/** DC 由程序规则拥有；玩家或模型不能仅靠措辞获得准备/协助优惠。 */
export function getRuleOwnedDc(
  actionText: string,
  domain: TraitCheckDomain,
  context?: DiceEvaluationContext,
): number {
  const action = actionText.trim();
  const inferredIntent = findIntent(action);
  const ruleShape = inferredIntent?.domain === domain
    ? { baseDc: inferredIntent.baseDc, physical: inferredIntent.physical }
    : { baseDc: DOMAIN_BASE_DCS[domain], physical: PHYSICAL_DOMAINS.has(domain) };
  return calculateContextualDc(action, ruleShape, context).dc;
}

export function evaluateDiceRequirement(actionText: string, context?: DiceEvaluationContext): DiceDecision {
  const action = actionText.trim();
  if (IMPOSSIBLE_PATTERNS.some((pattern) => pattern.test(action))) {
    return { shouldRoll: false, isImpossible: true, reason: '行动明显超出当前世界条件，骰子不能将不可能变成奇迹。' };
  }

  const inferred = inferActionCheck(action);
  const intent = findIntent(action);
  if (intent && LOW_STAKES_PATTERNS.some((pattern) => pattern.test(action))) {
    return {
      shouldRoll: false,
      isImpossible: false,
      reason: `识别为${intent.label}，但当前没有真实阻力或有意义的失败代价，因此不检定。`,
      attribute: inferred.attribute,
      ...(inferred.secondaryAttribute ? { secondaryAttribute: inferred.secondaryAttribute } : {}),
      domain: intent.domain,
      dc: intent.baseDc,
      intentLabel: intent.label,
    };
  }

  if (intent) {
    const { dc, factors } = calculateContextualDc(action, intent, context);
    return {
      shouldRoll: true,
      isImpossible: false,
      reason: `识别为${intent.label}；行动存在真实阻力和直接失败后果${factors.length ? `；${factors.join('，')}` : ''}。`,
      attribute: inferred.attribute,
      ...(inferred.secondaryAttribute ? { secondaryAttribute: inferred.secondaryAttribute } : {}),
      domain: intent.domain,
      dc,
      intentLabel: intent.label,
    };
  }

  if (!action || TRIVIAL_PATTERNS.some((pattern) => pattern.test(action))) {
    return { shouldRoll: false, isImpossible: false, reason: '这是普通、公开或纯叙事行动，没有值得检定的失败风险。' };
  }

  return { shouldRoll: false, isImpossible: false, reason: '没有识别到明确阻力和有意义的失败条件，因此不检定。' };
}

const OUTCOMES: Record<TraitCheckDomain, { success: string; failure: string }> = {
  duel: { success: '当前攻击、格挡或决斗行动目标在合理战斗范围内达成。', failure: '当前攻击落空、被挡下，或未能取得预期战斗位置。' },
  battle: { success: '当前指挥或战术行动得到执行并取得预期局部效果。', failure: '当前命令或战术未能取得预期局部效果。' },
  intrigue: { success: '当前潜入、欺骗或密谋步骤在既定范围内达成。', failure: '当前秘密行动未能达成，阻力只来自本次行动已有的风险。' },
  stewardship: { success: '当前治理、建设或资源安排达到预期目标。', failure: '当前治理安排未能达到预期目标，造成与该事务直接相关的损失或延误。' },
  diplomacy: { success: '当前说服行动目标在合理范围内达成；若对象是守卫，则守卫接受理由或作出有限让步。', failure: '当前说服未能奏效；若对象是守卫，则守卫拒绝请求或提高有限警惕。' },
  learning: { success: '当前研究、辨识或推理得到可靠结论。', failure: '当前研究未能得到可靠结论，需要更多材料或其他方法复核。' },
  medicine: { success: '当前诊断或治疗步骤正确完成，产生合理的局部疗效。', failure: '当前治疗未能达到预期效果，但不会凭空产生无关灾难。' },
  survival: { success: '当前追踪、狩猎或生存行动取得预期局部成果。', failure: '当前生存行动未能取得目标，时间或物资受到合理消耗。' },
  intimidation: { success: '目标因当前威胁作出合理范围内的退让或透露信息。', failure: '当前威胁未能动摇目标，或只让目标提高警惕。' },
  seduction: { success: '当前示好获得合理的积极回应，但不强制建立关系。', failure: '当前示好未获接受，关系不会因此凭空升级为仇杀。' },
  resistFear: { success: '角色克服当前恐惧并完成原定动作。', failure: '角色受到恐惧干扰，当前动作迟疑、中断或效果下降。' },
};

export function buildOutcomeContract(actionText: string, domain: TraitCheckDomain): CheckOutcomeContract {
  const outcome = OUTCOMES[domain];
  return {
    intent: actionText.trim(),
    successOutcome: outcome.success,
    failureOutcome: outcome.failure,
    criticalSuccessLimit: '自然 20 没有自动成功或额外奖励；仍按总值与难度比较，并受现实与设定的合理边界约束。',
    criticalFailureLimit: '自然 1 没有自动失败或额外惩罚；仍按总值与难度比较，只能产生与当前行动直接相关的后果，不得凭空制造灾难。',
    forbiddenEscalations: [
      '不得凭空引入与当前行动无关的追杀、死亡或世界事件',
      '不得因单次原始骰面突破血统、能力、物资和世界设定限制',
      '不得因失败替玩家作出后续选择',
    ],
  };
}
