import type { ApiConfig, GameState, StoryTurn } from '../types/game';
import type { ResolvedTurnFacts } from './turnResolution';
import { stripEmoji } from './textSanitizer';
import { parseModelOutput, streamNarrativeCompletion } from './api';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuildSettledNarrativeMessagesInput {
  gameState: GameState;
  actionText: string;
  facts: ResolvedTurnFacts;
  recentTurns?: readonly StoryTurn[];
  worldContext?: string;
}

export function buildSettledNarrativeMessages(input: BuildSettledNarrativeMessagesInput): ChatMessage[] {
  const accepted = input.facts.acceptedCommands.map((command) => command.type).join('、') || '无状态命令';
  const changes = input.facts.changes.join('；') || '无数值变化';
  const worldFacts = input.facts.facts.map((fact) => `- ${fact.title}: ${fact.summary}`).join('\n') || '- 没有额外世界事件。';
  const dice = input.facts.diceCheck
    ? `${input.facts.diceCheck.attributeName} ${input.facts.diceCheck.success ? '成功' : '失败'}，总点数 ${input.facts.diceCheck.total} 对 DC ${input.facts.diceCheck.dc}`
    : '本回合没有 D20 检定，不得暗骰。';
  const history = (input.recentTurns ?? input.gameState.turns.slice(-4)).map((turn) => (
    `玩家：${stripEmoji(turn.playerInput)}\n正文：${stripEmoji(turn.narrate)}`
  )).join('\n\n');
  const worldContext = input.worldContext
    ? stripEmoji(input.worldContext).replace(/<\/?[^>]+>/g, '').trim()
    : '';
  return [
    {
      role: 'system',
      content: `你负责把已经由程序结算的维斯特洛回合写成严肃小说正文。只能叙述程序已确认的事实，不得恢复被拒绝的命令，不得增加婚姻、死亡、受伤、移动、头衔、物品或时间变化。输出只能包含 <think>、<narrate>、<branch>；<branch> 内必须直接写三行“1. 行动”格式的纯文本，不得嵌套 <choice>、<option> 或其他标签；禁止输出 <state_cmd>，禁止使用 emoji。`,
    },
    ...(history ? [{ role: 'assistant' as const, content: history }] : []),
    {
      role: 'user',
      content: `【玩家行动】\n${stripEmoji(input.actionText)}\n\n【程序已确认】\n- 日期：${input.facts.resolvedOn.year}.${input.facts.resolvedOn.month}.${input.facts.resolvedOn.day}\n- D20：${dice}\n- 接受命令：${accepted}\n- 状态变化：${changes}\n${worldFacts}${worldContext ? `\n\n【提交后的世界切片】\n${worldContext}` : ''}\n\n请严格根据以上事实写正文与三个后续选择。`,
    },
  ];
}


export async function streamSettledNarrative(
  messages: ChatMessage[],
  config: ApiConfig,
  turnNumber: number,
  playerInput: string,
  onChunk: (partialText: string) => void,
  signal?: AbortSignal,
): Promise<Omit<StoryTurn, 'id' | 'timestamp'>> {
  const raw = await streamNarrativeCompletion(messages, config, onChunk, signal);
  const parsed = parseModelOutput(raw, turnNumber, playerInput);
  return { ...parsed, stateCommands: [] };
}
