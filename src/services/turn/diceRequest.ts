import type { LordAttributes } from '../../domain/character';
import type { TraitCheckDomain } from '../traitEffectEngine';
import type { StateCommand } from '../../types/game';
import { stripEmoji } from '../textSanitizer.ts';

export interface DiceRequest {
  roll: boolean;
  attribute: keyof LordAttributes;
  secondaryAttribute?: keyof LordAttributes;
  dc: number;
  domain: TraitCheckDomain;
  reason: string;
}

export const DICE_DOMAINS: readonly TraitCheckDomain[] = [
  'duel', 'battle', 'intrigue', 'diplomacy', 'stewardship',
  'learning', 'medicine', 'survival', 'intimidation', 'seduction', 'resistFear',
];

export const DICE_ATTRIBUTE_MAP: Record<TraitCheckDomain, keyof LordAttributes> = {
  duel: 'prowess',
  battle: 'martial',
  intrigue: 'intrigue',
  diplomacy: 'diplomacy',
  stewardship: 'stewardship',
  learning: 'learning',
  medicine: 'learning',
  survival: 'learning',
  intimidation: 'diplomacy',
  seduction: 'diplomacy',
  resistFear: 'prowess',
};

const DICE_ATTRIBUTES: readonly (keyof LordAttributes)[] = [
  'diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess',
];

export const DICE_DOMAIN_LABELS: Record<TraitCheckDomain, string> = {
  duel: '个人战斗',
  battle: '战争指挥',
  intrigue: '秘密行动',
  diplomacy: '交涉',
  stewardship: '治理',
  learning: '研究辨识',
  medicine: '治疗',
  survival: '生存行动',
  intimidation: '恐吓',
  seduction: '勾引',
  resistFear: '克服恐惧',
};

/**
 * 判骰说明片段：拼到规则解析 system 末尾，让模型在解析规则的同时
 * 输出 <dice_request> 与优势成功、成功、部分成果、失败四轨 state_cmd。
 */
export const GOT_DICE_REQUEST_PROMPT = `
---

### 【判骰指令】
在本回合输出中，你必须先判断当前行动是否需要 D20 检定，再据此输出四轨状态命令。

**第一部分：<dice_request>**
输出一个 JSON 对象，说明是否检定、用哪个属性、DC 几、什么领域：
\`\`\`
<dice_request>
{ "roll": true, "attribute": "prowess", "secondaryAttribute": "martial", "dc": 14, "domain": "duel", "reason": "以个人剑术执行战术诱导，勇武是主属性、军事是有因果作用的辅属性" }
</dice_request>
\`\`\`
不需要检定时：
\`\`\`
<dice_request>
{ "roll": false, "attribute": "diplomacy", "dc": 12, "domain": "diplomacy", "reason": "普通问候，没有值得检定的失败风险" }
</dice_request>
\`\`\`

**判定标准**
- roll: true：行动存在真实阻力、对抗或失败代价（战斗、潜入、说服对手、治疗重伤、荒野求生等）。
- roll: false：日常行为（坐下、走路、喝水、问候、观察公开信息）、没有阻力或失败代价太小（练习木桩、对方已同意）、或不可能行动（凭空召唤巨龙、一剑劈开城墙）。

**属性选择**
- attribute 是主属性，必须与玩家采用的具体方法直接相关。
- secondaryAttribute 是可选辅属性。只有另一项能力确实参与执行时才填写；不是每次都要双属性。
- 双属性按主属性 70% + 辅属性 30% 形成有效能力；单属性直接使用原值。
- 不要按场景名称机械指定属性。同样进入城堡，交涉可用外交，伪造许可可用谋略+学识，隐蔽翻墙可用勇武+谋略。
- reason 必须说明方法、阻力以及主辅属性为何适用。不得为了迁就角色高属性而选择无关能力。

**领域的默认主属性（仅在没有更具体方法时采用）**

| 领域 domain | 属性 attribute | 说明 |
|---|---|---|
| duel | prowess | 个人战斗：决斗、单挑、搏斗、攻击、格挡 |
| battle | martial | 战争指挥：统兵、攻城、布防、战术、行军 |
| intrigue | intrigue | 秘密行动：潜入、偷窃、下毒、刺探、伪装、暗杀 |
| diplomacy | diplomacy | 交涉：说服、谈判、结盟、联姻、安抚 |
| stewardship | stewardship | 治理：粮食、税收、营建、后勤、领地管理 |
| learning | learning | 研究辨识：研究、辨认、破解、调查、考证 |
| medicine | learning | 治疗：医治、诊断、包扎、解毒、处理伤势 |
| survival | learning | 生存行动：追踪、狩猎、荒野求生、攀爬、泅渡 |
| intimidation | diplomacy | 恐吓：威胁、震慑、逼迫、恫吓 |
| seduction | diplomacy | 勾引：调情、求爱、诱惑、示爱 |
| resistFear | prowess | 克服恐惧：抵抗恐惧、保持镇定、鼓起勇气 |

**DC 规则**
基础 DC 由程序规则服务按行动方法/领域确定；强阻力和伤势可提高难度。玩家或模型不能仅凭‘提前准备’‘有人协助’‘有钥匙’等自述降低 DC；真实工具、装备、协助、关系与前置准备必须先成为可验证状态，再由对应规则效果参与结算。最终 DC 由程序校准并夹在 8-20 之间。

**第二部分：四轨状态与世界意图**
- 当 roll: true 时，必须输出优势成功、成功、部分成果、失败四组状态命令和世界意图：
  - \`<state_cmd_strong_success>\`：优势成功时完整包含普通成功，并最多多取得一个与动作直接相关的小优势。
  - \`<state_cmd_success>\`：检定成功时程序应执行的状态命令（如攻击命中、伤敌）。
  - \`<state_cmd_partial>\`：部分成果时只执行有限进展与当前行动直接相关的代价。
  - \`<state_cmd_failure>\`：检定失败时程序应执行的状态命令（如攻击落空、自身受伤）。
  - \`<world_intent_strong_success>\`：优势成功时提交的世界变更意图。
  - \`<world_intent_success>\`：成功时提交的世界变更意图。
  - \`<world_intent_partial>\`：部分成果时提交的世界变更意图。
  - \`<world_intent_failure>\`：失败时提交的世界变更意图。
- 当 roll: false 时，只输出一组 \`<state_cmd>\` 和一组 \`<world_intent>\`。
- 即使某一轨没有变更，也必须输出对应标签和空数组 \`[]\`；禁止拿另一轨兜底。
- 四组 state_cmd 的格式与现有 state_cmd 完全一致，只引用状态切片中已存在的 definitionId 与 instanceId。
- 程序会在掷骰后自动选用同一结果轨的 state_cmd 与 world_intent 执行结算。
`;

export interface ParsedDiceResolution {
  diceRequest: DiceRequest;
  /** roll: true 时的优势成功命令 */
  strongSuccessCommands: StateCommand[];
  /** roll: true 时的成功命令；roll: false 时的正常命令 */
  successCommands: StateCommand[];
  /** roll: true 时的失败命令；roll: false 时空数组 */
  failureCommands: StateCommand[];
  /** roll: true 时的部分成果命令；roll: false 时空数组 */
  partialCommands: StateCommand[];
  outcomeSummary: string;
  /** roll: false 时的普通世界意图 */
  worldIntents: unknown[];
  /** roll: true 时的成功世界意图 */
  successWorldIntents: unknown[];
  /** roll: true 时的优势成功世界意图 */
  strongSuccessWorldIntents: unknown[];
  /** roll: true 时的失败世界意图 */
  failureWorldIntents: unknown[];
  /** roll: true 时的部分成果世界意图 */
  partialWorldIntents: unknown[];
}

interface ResolutionOutcomeV2 {
  stateCommands: unknown[];
  worldIntents: unknown[];
}

interface ResolutionEnvelopeV2 {
  schemaVersion: 2;
  resolution: string;
  diceRequest: unknown;
  outcomes: {
    deterministic?: ResolutionOutcomeV2;
    strongSuccess?: ResolutionOutcomeV2;
    success?: ResolutionOutcomeV2;
    partial?: ResolutionOutcomeV2;
    failure?: ResolutionOutcomeV2;
  };
}

const ALLOWED_STATE_COMMAND_TYPES = new Set([
  'INJURE_ZONE', 'TREAT_WOUND', 'REPAIR_ITEM', 'BUY_CATALOG_ITEM', 'SELL_ITEM', 'SET_BLEEDING', 'SET_POISONED', 'SET_INFECTED',
  'MODIFY_GOLD', 'MODIFY_STAT', 'ADD_TRAIT', 'ADVANCE_TIME', 'SET_DATE',
  'ITEM_EQUIP', 'ITEM_UNEQUIP', 'ITEM_TRANSFER', 'ITEM_GIFT', 'ITEM_DISCARD',
  'ITEM_DAMAGE', 'ITEM_SPLIT', 'ITEM_MERGE', 'ITEM_MARK_HEIRLOOM',
  'ADD_CHARACTER_TRAIT', 'REMOVE_CHARACTER_TRAIT', 'INJURE_CHARACTER', 'KILL_CHARACTER',
  'MARRY_CHARACTERS', 'DIVORCE_CHARACTERS', 'ADD_CHARACTER_MEMORY',
  'GRANT_CHARACTER_TITLE', 'REVOKE_CHARACTER_TITLE',
  'CHARACTER_ITEM_ACQUIRE', 'CHARACTER_ITEM_EQUIP', 'CHARACTER_ITEM_UNEQUIP',
  'CHARACTER_ITEM_TRANSFER', 'CHARACTER_ITEM_LOSE', 'RECORD_SOCIAL_BEAT',
  'SEND_MESSAGE', 'SCHEDULE_NPC_AGENDA', 'RESOLVE_NPC_AGENDA', 'DELEGATE_PROJECT', 'RESOLVE_PROJECT',
  'OFFER_GROWTH_CHOICE', 'CLAIM_GROWTH_CHOICE',
]);

export class ResolutionProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionProtocolError';
  }
}

/**
 * 解析规则解析阶段的完整输出：dice_request + 四轨 state_cmd + world_intent。
 */
export function parseDiceResolutionOutput(rawText: string): ParsedDiceResolution {
  const safe = stripEmoji(rawText);
  const envelope = parseResolutionEnvelopeV2(safe);
  if (envelope) return envelope;
  const diceRequest = parseDiceRequest(safe);
  const resolution = safe.match(/<resolution>([\s\S]*?)(?:<\/resolution>|$)/i)?.[1]?.trim() ?? '';

  if (!diceRequest.roll) {
    return {
      diceRequest,
      strongSuccessCommands: [],
      successCommands: extractProtocolCommands(safe, 'state_cmd'),
      failureCommands: [],
      partialCommands: [],
      outcomeSummary: resolution,
      worldIntents: extractProtocolArray(safe, 'world_intent'),
      successWorldIntents: [],
      strongSuccessWorldIntents: [],
      failureWorldIntents: [],
      partialWorldIntents: [],
    };
  }

  const successCommands = extractProtocolCommands(safe, 'state_cmd_success');
  const successWorldIntents = extractProtocolArray(safe, 'world_intent_success');
  return {
    diceRequest,
    strongSuccessCommands: /<state_cmd_strong_success\b/i.test(safe)
      ? extractProtocolCommands(safe, 'state_cmd_strong_success')
      : successCommands,
    successCommands,
    failureCommands: extractProtocolCommands(safe, 'state_cmd_failure'),
    partialCommands: extractProtocolCommands(safe, 'state_cmd_partial'),
    outcomeSummary: resolution,
    worldIntents: [],
    successWorldIntents,
    strongSuccessWorldIntents: /<world_intent_strong_success\b/i.test(safe)
      ? extractProtocolArray(safe, 'world_intent_strong_success')
      : successWorldIntents,
    failureWorldIntents: extractProtocolArray(safe, 'world_intent_failure'),
    partialWorldIntents: extractProtocolArray(safe, 'world_intent_partial'),
  };
}

function firstJsonObject(text: string): string | undefined {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return cleaned.slice(start, index + 1);
  }
  return undefined;
}

function validateCommands(commands: unknown, label: string): StateCommand[] {
  if (!Array.isArray(commands)) throw new ResolutionProtocolError(`${label}.stateCommands 必须是数组。`);
  commands.forEach((command, index) => {
    const type = (command as { type?: unknown })?.type;
    if (typeof type !== 'string' || !ALLOWED_STATE_COMMAND_TYPES.has(type)) {
      throw new ResolutionProtocolError(`${label}.stateCommands[${index}] 使用了未授权命令：${String(type)}`);
    }
  });
  return commands as StateCommand[];
}

function validateOutcome(value: unknown, label: string): { stateCommands: StateCommand[]; worldIntents: unknown[] } {
  if (!value || typeof value !== 'object') throw new ResolutionProtocolError(`${label} 必须是对象。`);
  const outcome = value as ResolutionOutcomeV2;
  if (!Array.isArray(outcome.worldIntents)) throw new ResolutionProtocolError(`${label}.worldIntents 必须是数组。`);
  return { stateCommands: validateCommands(outcome.stateCommands, label), worldIntents: outcome.worldIntents };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function assertStrongSuccessIncludesSuccess(
  strongSuccess: { stateCommands: StateCommand[]; worldIntents: unknown[] },
  success: { stateCommands: StateCommand[]; worldIntents: unknown[] },
): void {
  const strongCommands = new Set(strongSuccess.stateCommands.map(canonicalJson));
  const strongIntents = new Set(strongSuccess.worldIntents.map(canonicalJson));
  if (success.stateCommands.some((command) => !strongCommands.has(canonicalJson(command)))) {
    throw new ResolutionProtocolError('outcomes.strongSuccess 必须完整包含 outcomes.success 的状态命令。');
  }
  if (success.worldIntents.some((intent) => !strongIntents.has(canonicalJson(intent)))) {
    throw new ResolutionProtocolError('outcomes.strongSuccess 必须完整包含 outcomes.success 的世界意图。');
  }
  const baseCommands = new Set(success.stateCommands.map(canonicalJson));
  const baseIntents = new Set(success.worldIntents.map(canonicalJson));
  const extraCount = strongSuccess.stateCommands.filter((command) => !baseCommands.has(canonicalJson(command))).length
    + strongSuccess.worldIntents.filter((intent) => !baseIntents.has(canonicalJson(intent))).length;
  if (extraCount > 1) throw new ResolutionProtocolError('outcomes.strongSuccess 最多只能比普通成功多一个直接小优势。');
}

function validateDiceRequest(value: unknown): DiceRequest {
  if (!value || typeof value !== 'object') throw new ResolutionProtocolError('diceRequest 必须是对象。');
  const parsed = value as Record<string, unknown>;
  if (typeof parsed.roll !== 'boolean') throw new ResolutionProtocolError('diceRequest.roll 必须是布尔值。');
  if (!parsed.roll) {
    const domain = (DICE_DOMAINS as readonly unknown[]).includes(parsed.domain)
      ? parsed.domain as TraitCheckDomain
      : 'diplomacy';
    return {
      roll: false,
      attribute: DICE_ATTRIBUTE_MAP[domain],
      dc: typeof parsed.dc === 'number' && Number.isFinite(parsed.dc)
        ? Math.max(8, Math.min(20, Math.round(parsed.dc)))
        : 12,
      domain,
      reason: typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim()
        : '当前行动无需检定',
    };
  }
  if (!(DICE_DOMAINS as readonly unknown[]).includes(parsed.domain)) throw new ResolutionProtocolError(`diceRequest.domain 不受支持：${String(parsed.domain)}`);
  if (typeof parsed.dc !== 'number' || !Number.isFinite(parsed.dc)) throw new ResolutionProtocolError('diceRequest.dc 必须是有限数字。');
  if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) throw new ResolutionProtocolError('diceRequest.reason 不能为空。');
  const domain = parsed.domain as TraitCheckDomain;
  if (!(DICE_ATTRIBUTES as readonly unknown[]).includes(parsed.attribute)) {
    throw new ResolutionProtocolError(`diceRequest.attribute 不受支持：${String(parsed.attribute)}`);
  }
  const attribute = parsed.attribute as keyof LordAttributes;
  if (parsed.secondaryAttribute !== undefined && !(DICE_ATTRIBUTES as readonly unknown[]).includes(parsed.secondaryAttribute)) {
    throw new ResolutionProtocolError(`diceRequest.secondaryAttribute 不受支持：${String(parsed.secondaryAttribute)}`);
  }
  const secondaryAttribute = parsed.secondaryAttribute as keyof LordAttributes | undefined;
  if (secondaryAttribute === attribute) throw new ResolutionProtocolError('diceRequest.secondaryAttribute 不得与主属性相同。');
  return {
    roll: parsed.roll,
    attribute,
    ...(secondaryAttribute ? { secondaryAttribute } : {}),
    dc: Math.max(8, Math.min(20, Math.round(parsed.dc))),
    domain,
    reason: parsed.reason.trim(),
  };
}

function parseResolutionEnvelopeV2(text: string): ParsedDiceResolution | undefined {
  const json = firstJsonObject(text);
  if (!json) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    if (!text.includes('<dice_request>')) throw new ResolutionProtocolError(`V2 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { schemaVersion?: unknown }).schemaVersion !== 2) {
    if (!text.includes('<dice_request>')) throw new ResolutionProtocolError('结果包缺少 schemaVersion: 2。');
    return undefined;
  }
  const envelope = parsed as ResolutionEnvelopeV2;
  if (typeof envelope.resolution !== 'string') throw new ResolutionProtocolError('resolution 必须是字符串。');
  if (!envelope.outcomes || typeof envelope.outcomes !== 'object') throw new ResolutionProtocolError('outcomes 必须是对象。');
  const diceRequest = validateDiceRequest(envelope.diceRequest);
  if (diceRequest.roll) {
    if (envelope.outcomes.deterministic !== undefined) throw new ResolutionProtocolError('需要检定时不得提供 deterministic 结果轨。');
    const strongSuccess = validateOutcome(envelope.outcomes.strongSuccess, 'outcomes.strongSuccess');
    const success = validateOutcome(envelope.outcomes.success, 'outcomes.success');
    assertStrongSuccessIncludesSuccess(strongSuccess, success);
    const partial = validateOutcome(envelope.outcomes.partial, 'outcomes.partial');
    const failure = validateOutcome(envelope.outcomes.failure, 'outcomes.failure');
    return {
      diceRequest,
      strongSuccessCommands: strongSuccess.stateCommands,
      successCommands: success.stateCommands,
      failureCommands: failure.stateCommands,
      partialCommands: partial.stateCommands,
      outcomeSummary: envelope.resolution.trim(),
      worldIntents: [],
      successWorldIntents: success.worldIntents,
      strongSuccessWorldIntents: strongSuccess.worldIntents,
      failureWorldIntents: failure.worldIntents,
      partialWorldIntents: partial.worldIntents,
    };
  }
  if (envelope.outcomes.strongSuccess !== undefined || envelope.outcomes.success !== undefined || envelope.outcomes.partial !== undefined || envelope.outcomes.failure !== undefined) {
    throw new ResolutionProtocolError('无需检定时只能提供 deterministic 结果轨。');
  }
  const deterministic = validateOutcome(envelope.outcomes.deterministic, 'outcomes.deterministic');
  return {
    diceRequest,
    strongSuccessCommands: [],
    successCommands: deterministic.stateCommands,
    failureCommands: [],
    partialCommands: [],
    outcomeSummary: envelope.resolution.trim(),
    worldIntents: deterministic.worldIntents,
    successWorldIntents: [],
    strongSuccessWorldIntents: [],
    failureWorldIntents: [],
    partialWorldIntents: [],
  };
}

function parseDiceRequest(safeText: string): DiceRequest {
  const match = safeText.match(/<dice_request>([\s\S]*?)<\/dice_request>/i);
  if (!match) {
    throw new ResolutionProtocolError('回合解析缺少完整的 <dice_request>。');
  }
  let content = match[1].trim();
  content = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    content = content.substring(start, end + 1);
  }
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.roll !== 'boolean') {
      throw new ResolutionProtocolError('dice_request.roll 必须是布尔值。');
    }
    if (!parsed.roll) {
      const domain = (DICE_DOMAINS as readonly unknown[]).includes(parsed.domain)
        ? parsed.domain as TraitCheckDomain
        : 'diplomacy';
      return {
        roll: false,
        attribute: DICE_ATTRIBUTE_MAP[domain],
        dc: typeof parsed.dc === 'number' && Number.isFinite(parsed.dc)
          ? Math.max(8, Math.min(20, Math.round(parsed.dc)))
          : 12,
        domain,
        reason: typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : '当前行动无需检定',
      };
    }
    if (!(DICE_DOMAINS as readonly unknown[]).includes(parsed.domain)) {
      throw new ResolutionProtocolError(`dice_request.domain 不受支持：${String(parsed.domain)}`);
    }
    if (typeof parsed.dc !== 'number' || !Number.isFinite(parsed.dc)) {
      throw new ResolutionProtocolError('dice_request.dc 必须是有限数字。');
    }
    if (typeof parsed.reason !== 'string' || parsed.reason.trim().length === 0) {
      throw new ResolutionProtocolError('dice_request.reason 不能为空。');
    }
    const domain = parsed.domain as TraitCheckDomain;
    if (!(DICE_ATTRIBUTES as readonly unknown[]).includes(parsed.attribute)) {
      throw new ResolutionProtocolError(`dice_request.attribute 不受支持：${String(parsed.attribute)}`);
    }
    const attribute = parsed.attribute as keyof LordAttributes;
    if (parsed.secondaryAttribute !== undefined && !(DICE_ATTRIBUTES as readonly unknown[]).includes(parsed.secondaryAttribute)) {
      throw new ResolutionProtocolError(`dice_request.secondaryAttribute 不受支持：${String(parsed.secondaryAttribute)}`);
    }
    const secondaryAttribute = parsed.secondaryAttribute as keyof LordAttributes | undefined;
    if (secondaryAttribute === attribute) throw new ResolutionProtocolError('dice_request.secondaryAttribute 不得与主属性相同。');
    const dc = Math.max(8, Math.min(20, Math.round(parsed.dc)));
    return {
      roll: parsed.roll,
      attribute,
      ...(secondaryAttribute ? { secondaryAttribute } : {}),
      dc,
      domain,
      reason: parsed.reason.trim(),
    };
  } catch (error) {
    if (error instanceof ResolutionProtocolError) throw error;
    throw new ResolutionProtocolError(`dice_request JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractProtocolArray(rawText: string, tagName: string): unknown[] {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = rawText.match(regex);
  if (!match) throw new ResolutionProtocolError(`回合解析缺少完整的 <${tagName}>。`);
  let content = match[1].trim();
  content = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    content = content.substring(start, end + 1);
  }
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new ResolutionProtocolError(`<${tagName}> 必须包含 JSON 数组。`);
    return parsed;
  } catch (error) {
    if (error instanceof ResolutionProtocolError) throw error;
    throw new ResolutionProtocolError(`<${tagName}> JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractProtocolCommands(rawText: string, tagName: string): StateCommand[] {
  const commands = extractProtocolArray(rawText, tagName);
  const malformedIndex = commands.findIndex((entry) => typeof (entry as { type?: unknown })?.type !== 'string');
  if (malformedIndex >= 0) {
    throw new ResolutionProtocolError(`<${tagName}>[${malformedIndex}] 缺少字符串 type。`);
  }
  return commands as StateCommand[];
}
