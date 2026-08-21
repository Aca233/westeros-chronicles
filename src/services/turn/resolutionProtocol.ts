import type { PendingWorldTransaction } from '../../features/world/worldRuntimeTypes';
import { parseUnresolvedWorldIntents } from '../../features/world/worldIntentResolver';
import type { ApiConfig, D20Check, GameState, StateCommand } from '../../types/game';
import { extractJsonArrayFromXml, requestTurnResolutionCompletion } from '../api';
import { buildChatMessages, type DicePromptContext, WORLD_INTENT_RESOLUTION_PROMPT } from '../promptBuilder';
import { stripEmoji } from '../textSanitizer';
import type { TurnResolutionDraft } from './resolutionTypes';

export function parseTurnResolutionOutput(rawText: string): TurnResolutionDraft {
  const safe = stripEmoji(rawText);
  const resolution = safe.match(/<resolution>([\s\S]*?)(?:<\/resolution>|$)/i)?.[1]?.trim() ?? '';
  return {
    outcomeSummary: resolution,
    stateCommands: extractJsonArrayFromXml(safe, 'state_cmd') as StateCommand[],
    worldIntents: parseUnresolvedWorldIntents(extractJsonArrayFromXml(safe, 'world_intent')),
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
  const system = messages[0];
  const rules = system.content.split('### 【第三章：严格输出格式规范')[0];
  messages[0] = {
    role: 'system',
    content: `${rules}
### 【规则解析阶段】
本阶段禁止写小说正文。只分析玩家当前行动可确认的直接结果，并输出 <resolution>简短结果摘要</resolution>、<state_cmd>JSON 数组</state_cmd> 与 <world_intent>JSON 数组</world_intent>。不得输出 <narrate>、<branch> 或替玩家追加行动。

${WORLD_INTENT_RESOLUTION_PROMPT}`,
  };
  const current = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...current,
    content: `${current.content}

再次强调：这里只做结构化规则解析，不写最终正文。`,
  };
  return messages;
}

export async function requestTurnResolution(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
  signal?: AbortSignal,
): Promise<TurnResolutionDraft> {
  const raw = await requestTurnResolutionCompletion(messages, config, gameState, pendingTransactions, signal);
  return parseTurnResolutionOutput(raw);
}
