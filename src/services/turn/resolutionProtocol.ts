import type { PendingWorldTransaction } from '../../features/world/worldRuntimeTypes';
import { parseUnresolvedWorldIntents } from '../../features/world/worldIntentResolver';
import type { ApiConfig, D20Check, GameState, StateCommand } from '../../types/game';
import { extractJsonArrayFromXml, requestTurnResolutionCompletion } from '../api';
import { buildChatMessages, type DicePromptContext } from '../promptBuilder';
import { stripEmoji } from '../textSanitizer';
import type { TurnResolutionDraft } from './resolutionTypes';
import { parseDiceResolutionOutput, ResolutionProtocolError, type DiceRequest, type ParsedDiceResolution } from './diceRequest';

const RESOLUTION_V2_OUTPUT_PROMPT = `
### 【唯一输出协议：Resolution V2 JSON】
前文 XML 标签仅用于解释字段含义；本次实际输出只能是一个 JSON 对象，不得输出 Markdown、XML 或额外文字：
{
  "schemaVersion": 2,
  "resolution": "简短结论",
  "diceRequest": { "roll": true, "attribute": "prowess", "secondaryAttribute": "martial", "dc": 14, "domain": "duel", "reason": "按具体方法解释主辅属性；不需要辅属性时省略该字段" },
  "outcomes": {
    "strongSuccess": { "stateCommands": [], "worldIntents": [] },
    "success": { "stateCommands": [], "worldIntents": [] },
    "partial": { "stateCommands": [], "worldIntents": [] },
    "failure": { "stateCommands": [], "worldIntents": [] }
  }
}
roll 为 false 时 outcomes 必须且只能包含 deterministic；roll 为 true 时必须且只能包含 strongSuccess、success、partial 与 failure。strongSuccess 必须完整包含普通成功效果，并且最多多出一个与当前动作直接相关的小优势；不得越级改变身份、权限、财富、伤势或 NPC 底线。所有数组必须存在，允许为空。不得输出未在规则清单中授权的状态命令。`;

export interface DiceResolutionDraft {
  diceRequest: DiceRequest;
  strongSuccessCommands?: StateCommand[];
  stateCommands: StateCommand[];
  /** roll: true 时为失败版本，roll: false 时为空数组 */
  failureCommands: StateCommand[];
  /** roll: true 时为部分成果版本，roll: false 时为空数组 */
  partialCommands?: StateCommand[];
  outcomeSummary: string;
  worldIntents: ReturnType<typeof parseUnresolvedWorldIntents>;
  strongSuccessWorldIntents?: ReturnType<typeof parseUnresolvedWorldIntents>;
  /** roll: true 时为失败版本，roll: false 时为空数组 */
  failureWorldIntents: ReturnType<typeof parseUnresolvedWorldIntents>;
  /** roll: true 时为部分成果版本，roll: false 时为空数组 */
  partialWorldIntents?: ReturnType<typeof parseUnresolvedWorldIntents>;
}

export function parseTurnResolutionOutput(rawText: string): DiceResolutionDraft {
  const parsed: ParsedDiceResolution = parseDiceResolutionOutput(rawText);
  return {
    diceRequest: parsed.diceRequest,
    strongSuccessCommands: parsed.strongSuccessCommands,
    stateCommands: parsed.successCommands,
    failureCommands: parsed.failureCommands,
    partialCommands: parsed.partialCommands,
    outcomeSummary: parsed.outcomeSummary,
    worldIntents: parseUnresolvedWorldIntents(
      (parsed.diceRequest.roll ? parsed.successWorldIntents : parsed.worldIntents) as Parameters<typeof parseUnresolvedWorldIntents>[0],
    ),
    strongSuccessWorldIntents: parseUnresolvedWorldIntents(
      parsed.strongSuccessWorldIntents as Parameters<typeof parseUnresolvedWorldIntents>[0],
    ),
    failureWorldIntents: parseUnresolvedWorldIntents(
      parsed.failureWorldIntents as Parameters<typeof parseUnresolvedWorldIntents>[0],
    ),
    partialWorldIntents: parseUnresolvedWorldIntents(
      parsed.partialWorldIntents as Parameters<typeof parseUnresolvedWorldIntents>[0],
    ),
  };
}

export function buildTurnResolutionMessages(
  gameState: GameState,
  actionText: string,
  diceCheck?: D20Check,
  diceContext?: DicePromptContext,
  pendingTransactions: PendingWorldTransaction[] = [],
  worldContext: string | import('../../features/world/worldTurnContext').WorldTurnContext = '',
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages = buildChatMessages(gameState, actionText, diceCheck, diceContext, pendingTransactions, worldContext);
  // 将判骰说明拼到 system 消息末尾
  messages[0] = {
    ...messages[0],
    content: `${messages[0].content}${RESOLUTION_V2_OUTPUT_PROMPT}`,
  };
  const current = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...current,
    content: `${current.content}

再次强调：只输出 Resolution V2 JSON。不要写 XML、<narrate>、<branch> 或最终正文。`,
  };
  return messages;
}

export async function requestTurnResolution(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
  signal?: AbortSignal,
): Promise<DiceResolutionDraft> {
  const raw = await requestTurnResolutionCompletion(messages, config, gameState, pendingTransactions, signal);
  try {
    return parseTurnResolutionOutput(raw);
  } catch (error) {
    if (!(error instanceof ResolutionProtocolError) || signal?.aborted || !config.apiKey.trim()) throw error;
    const invalidOutput = raw.trim().slice(0, 24_000);
    const repaired = await requestTurnResolutionCompletion([
      {
        role: 'system',
        content: `你是 Resolution V2 格式修复器。只修复既有结果的 JSON 结构，不补写故事、不增加命令、不改变成败判断。${RESOLUTION_V2_OUTPUT_PROMPT}`,
      },
      {
        role: 'user',
        content: `校验错误：${stripEmoji(error.message)}\n\n待修复输出：\n${invalidOutput || '（模型返回了空输出；请仅返回一个无副作用的 deterministic Resolution V2 JSON 对象。）'}\n\n只返回 JSON 对象。`,
      },
    ], { ...config, temperature: 0.1 }, gameState, pendingTransactions, signal, 'repair');
    return parseTurnResolutionOutput(repaired);
  }
}
