import type { LordAttributes } from '../../domain/character';
import type { TraitCheckDomain } from '../traitEffectEngine';
import type { StateCommand } from '../../types/game';
import { stripEmoji } from '../textSanitizer.ts';

export interface DiceRequest {
  roll: boolean;
  attribute: keyof LordAttributes;
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
 * 输出 <dice_request> 与双轨 state_cmd。
 */
export const GOT_DICE_REQUEST_PROMPT = `
---

### 【判骰指令】
在本回合输出中，你必须先判断当前行动是否需要 D20 检定，再据此输出双轨状态命令。

**第一部分：<dice_request>**
输出一个 JSON 对象，说明是否检定、用哪个属性、DC 几、什么领域：
\`\`\`
<dice_request>
{ "roll": true, "attribute": "prowess", "dc": 14, "domain": "duel", "reason": "与敌方骑士单挑，存在真实战斗阻力与失败代价" }
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

**可选领域与属性映射（attribute 必须与 domain 匹配）**

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
基础 DC 13-15；强阻力 +2，中等阻力 +1，充分准备/协助 -2，有利条件 -1；物理行动受伤势影响（挂彩+1、负重伤+2、垂危+4）；DC 夹在 8-20 之间。

**第二部分：双轨 state_cmd**
- 当 roll: true 时，必须输出两组状态命令，分别对应检定成功与检定失败：
  - \`<state_cmd_success>\`：检定成功时程序应执行的状态命令（如攻击命中、伤敌）。
  - \`<state_cmd_failure>\`：检定失败时程序应执行的状态命令（如攻击落空、自身受伤）。
- 当 roll: false 时，只需输出一组 \`<state_cmd>\`（正常状态命令）。
- 两组 state_cmd 的格式与现有 state_cmd 完全一致，只引用状态切片中已存在的 definitionId 与 instanceId。
- 程序会在掷骰后自动选用对应版本的 state_cmd 执行结算。
`;

export interface ParsedDiceResolution {
  diceRequest: DiceRequest;
  /** roll: true 时的成功命令；roll: false 时的正常命令 */
  successCommands: StateCommand[];
  /** roll: true 时的失败命令；roll: false 时空数组 */
  failureCommands: StateCommand[];
  outcomeSummary: string;
  worldIntents: unknown[];
}

/**
 * 解析规则解析阶段的完整输出：dice_request + 双轨 state_cmd + world_intent。
 */
export function parseDiceResolutionOutput(rawText: string): ParsedDiceResolution {
  const safe = stripEmoji(rawText);
  const diceRequest = parseDiceRequest(safe);
  // 丢弃缺少字符串 type 的畸形元素：下游 settlement/worldPreparation 多处用
  // command.type.startsWith(...) 判分支，type 为 undefined 会直接崩溃。
  const successCommands = extractJsonArrayFromXmlSafe(safe, 'state_cmd_success').filter(hasStringType) as StateCommand[];
  const failureCommands = extractJsonArrayFromXmlSafe(safe, 'state_cmd_failure').filter(hasStringType) as StateCommand[];
  const fallbackCommands = extractJsonArrayFromXmlSafe(safe, 'state_cmd').filter(hasStringType) as StateCommand[];
  const resolution = safe.match(/<resolution>([\s\S]*?)(?:<\/resolution>|$)/i)?.[1]?.trim() ?? '';
  const worldIntents = extractJsonArrayFromXmlSafe(safe, 'world_intent');
  if (!diceRequest.roll) {
    const commands = fallbackCommands;
    return { diceRequest, successCommands: commands, failureCommands: [], outcomeSummary: resolution, worldIntents };
  }
  const finalSuccess = successCommands.length > 0 ? successCommands : fallbackCommands;
  const finalFailure = failureCommands.length > 0 ? failureCommands : fallbackCommands;
  return {
    diceRequest,
    successCommands: finalSuccess,
    failureCommands: finalFailure,
    outcomeSummary: resolution,
    worldIntents,
  };
}

function parseDiceRequest(safeText: string): DiceRequest {
  const match = safeText.match(/<dice_request>([\s\S]*?)(?:<\/dice_request>|$)/i);
  if (!match) {
    return { roll: false, attribute: 'diplomacy', dc: 12, domain: 'diplomacy', reason: '模型未输出判骰结果，默认不检定' };
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
    const domain = (DICE_DOMAINS as readonly string[]).includes(parsed.domain) ? parsed.domain : 'diplomacy';
    const attribute = DICE_ATTRIBUTE_MAP[domain as TraitCheckDomain];
    const dc = typeof parsed.dc === 'number' ? Math.max(8, Math.min(20, Math.round(parsed.dc))) : 12;
    return {
      roll: Boolean(parsed.roll),
      attribute,
      dc,
      domain,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch {
    return { roll: false, attribute: 'diplomacy', dc: 12, domain: 'diplomacy', reason: '判骰结果解析失败，默认不检定' };
  }
}

function extractJsonArrayFromXmlSafe(rawText: string, tagName: string): any[] {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)(?:<\\/${tagName}>|$)`, 'i');
  const match = rawText.match(regex);
  if (!match) return [];
  let content = match[1].trim();
  content = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  content = content.replace(/\/\/.*$/gm, '');
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    content = content.substring(start, end + 1);
  }
  content = content.replace(/,\s*([\]}])/g, '$1');
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const objMatches = content.match(/\{[\s\S]*?\}/g);
    if (objMatches) {
      const results: any[] = [];
      for (const objStr of objMatches) {
        try {
          const cleanObj = objStr.replace(/,\s*\}\s*$/g, '}').replace(/,\s*\]/g, ']');
          results.push(JSON.parse(cleanObj));
        } catch {}
      }
      return results;
    }
  }
  return [];
}

function hasStringType(entry: unknown): boolean {
  return typeof (entry as { type?: unknown })?.type === 'string';
}
