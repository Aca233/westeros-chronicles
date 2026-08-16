import type { LordAttributes } from '../types/game.ts';
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
const STRONG_ADVANTAGE_PATTERNS = [/内应协助|提前准备|有钥匙|熟悉密道|对方信任|侍从协助|占据绝对优势/];
const SMALL_ADVANTAGE_PATTERNS = [/有人协助|已有准备|工具齐全|熟悉地形|出其不意/];

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

function findIntent(action: string): ActionIntent | undefined {
  const inferred = inferActionCheck(action);
  return ACTION_INTENTS.find((intent) => intent.domain === inferred.domain && intent.label === inferred.intentLabel);
}

function calculateContextualDc(action: string, intent: ActionIntent, context?: DiceEvaluationContext): { dc: number; factors: string[] } {
  let adjustment = 0;
  const factors: string[] = [];
  if (HARD_SITUATION_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment += 2;
    factors.push('强阻力 +2');
  } else if (MODERATE_SITUATION_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment += 1;
    factors.push('场景阻力 +1');
  }
  if (STRONG_ADVANTAGE_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment -= 2;
    factors.push('充分准备或协助 -2');
  } else if (SMALL_ADVANTAGE_PATTERNS.some((pattern) => pattern.test(action))) {
    adjustment -= 1;
    factors.push('有利条件 -1');
  }
  if (intent.physical && context?.overallStatus) {
    const woundAdjustment = context.overallStatus === '垂危' ? 4 : context.overallStatus === '负重伤' ? 2 : context.overallStatus === '挂彩' ? 1 : 0;
    if (woundAdjustment) {
      adjustment += woundAdjustment;
      factors.push(`伤势负担 +${woundAdjustment}`);
    }
  }
  return { dc: Math.max(8, Math.min(20, intent.baseDc + adjustment)), factors };
}

export function evaluateDiceRequirement(actionText: string, context?: DiceEvaluationContext): DiceDecision {
  const action = actionText.trim();
  if (IMPOSSIBLE_PATTERNS.some((pattern) => pattern.test(action))) {
    return { shouldRoll: false, isImpossible: true, reason: '行动明显超出当前世界条件，骰子不能将不可能变成奇迹。' };
  }

  const intent = findIntent(action);
  if (intent && LOW_STAKES_PATTERNS.some((pattern) => pattern.test(action))) {
    return {
      shouldRoll: false,
      isImpossible: false,
      reason: `识别为${intent.label}，但当前没有真实阻力或有意义的失败代价，因此不检定。`,
      attribute: intent.attribute,
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
      attribute: intent.attribute,
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
    criticalSuccessLimit: '自然 20 只让当前动作在现实与设定允许的合理边界内完成得更干净、更迅速或代价更小，不创造超能力、身份跃升或天降异象。',
    criticalFailureLimit: '自然 1 只造成与当前动作和检定前已有风险直接相关的局部挫折，不得凭空处死角色或制造无关追杀。',
    forbiddenEscalations: [
      '不得凭空引入与当前行动无关的追杀、死亡或世界事件',
      '不得因自然 20 突破血统、能力、物资和世界设定限制',
      '不得因失败替玩家作出后续选择',
    ],
  };
}
