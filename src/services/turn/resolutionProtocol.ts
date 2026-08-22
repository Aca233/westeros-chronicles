import type { PendingWorldTransaction } from '../../features/world/worldRuntimeTypes';
import { parseUnresolvedWorldIntents } from '../../features/world/worldIntentResolver';
import type { ApiConfig, D20Check, GameState, StateCommand } from '../../types/game';
import { extractJsonArrayFromXml, requestTurnResolutionCompletion } from '../api';
import { buildChatMessages, type DicePromptContext } from '../promptBuilder';
import { stripEmoji } from '../textSanitizer';
import type { TurnResolutionDraft } from './resolutionTypes';
import { GOT_DICE_REQUEST_PROMPT, parseDiceResolutionOutput, type DiceRequest, type ParsedDiceResolution } from './diceRequest';

export interface DiceResolutionDraft {
  diceRequest: DiceRequest;
  stateCommands: StateCommand[];
  /** roll: true 时为失败版本，roll: false 时为空数组 */
  failureCommands: StateCommand[];
  outcomeSummary: string;
  worldIntents: ReturnType<typeof parseUnresolvedWorldIntents>;
}

export function parseTurnResolutionOutput(rawText: string): DiceResolutionDraft {
  const parsed: ParsedDiceResolution = parseDiceResolutionOutput(rawText);
  return {
    diceRequest: parsed.diceRequest,
    stateCommands: parsed.successCommands,
    failureCommands: parsed.failureCommands,
    outcomeSummary: parsed.outcomeSummary,
    worldIntents: parseUnresolvedWorldIntents(parsed.worldIntents as Parameters<typeof parseUnresolvedWorldIntents>[0]),
  };
}

export function buildTurnResolutionMessages(
  gameState: GameState,
  actionText: string,
  diceCheck?: D20Check,
  diceContext?: DicePromptContext,
  pendingTransactions: PendingWorldTransaction[] = [],
  worldContext = '',
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages = buildChatMessages(gameState, actionText, diceCheck, diceContext, pendingTransactions, worldContext);
  // 将判骰说明拼到 system 消息末尾
  messages[0] = {
    ...messages[0],
    content: `${messages[0].content}${GOT_DICE_REQUEST_PROMPT}`,
  };
  const current = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...current,
    content: `${current.content}

再次强调：先输出 <dice_request> 判断是否需要检定，再输出对应的双轨 <state_cmd_success>/<state_cmd_failure>（或 roll:false 时单组 <state_cmd>）与 <world_intent>。不写 <narrate>、<branch> 或最终正文。`,
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
  return parseTurnResolutionOutput(raw);
}
