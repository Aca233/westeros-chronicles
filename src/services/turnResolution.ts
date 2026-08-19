import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import type { PendingItemAction } from '../features/items/itemActionQueue';
import { mergePendingItemCommands } from '../features/items/itemActionQueue';
import type { ItemStateCommand } from '../features/items/types';
import type { CharacterEventInput } from '../features/characters/characterEventStore';
import type { CharacterId } from '../features/characters/types';
import type { CanonicalTimelineEvent } from '../features/world/canonicalTimeline';
import { resolveDueCanonicalEvents } from '../features/world/canonicalTimeline';
import {
  advanceWorldDate,
  appendWorldTurn,
  setWorldDateForward,
  type CanonicalEventState,
  type RejectedWorldCommand,
  type WorldDate,
  type WorldEventFact,
  type WorldHistoryState,
} from '../features/world/worldHistory';
import type { ApiConfig, D20Check, GameState, LordProfile, StateCommand } from '../types/game';
import {
  applyStateCommands,
  isCharacterStateCommand,
  validateCharacterCommandBatch,
  type CharacterCommandBatchBaseContext,
} from './stateReducer';
import { stripEmoji } from './textSanitizer';
import { buildChatMessages, type DicePromptContext } from './promptBuilder';
import { extractJsonArrayFromXml, requestTurnResolutionCompletion } from './api';
import { createWorldLocationRef, validateWorldLocationRef } from '../features/map/locationResolver';
import type { WorldLocationRef } from '../features/map/types';

export interface TurnResolutionDraft {
  outcomeSummary: string;
  stateCommands: StateCommand[];
}


export function parseTurnResolutionOutput(rawText: string): TurnResolutionDraft {
  const safe = stripEmoji(rawText);
  const resolution = safe.match(/<resolution>([\s\S]*?)(?:<\/resolution>|$)/i)?.[1]?.trim() ?? '';
  return {
    outcomeSummary: resolution,
    stateCommands: extractJsonArrayFromXml(safe, 'state_cmd') as StateCommand[],
  };
}

export function buildTurnResolutionMessages(
  gameState: GameState,
  actionText: string,
  diceCheck?: D20Check,
  diceContext?: DicePromptContext,
  pendingItemActions: PendingItemAction[] = [],
  worldContext = '',
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages = buildChatMessages(gameState, actionText, diceCheck, diceContext, pendingItemActions, worldContext);
  const system = messages[0];
  const rules = system.content.split('### 【第三章：严格输出格式规范')[0];
  messages[0] = {
    role: 'system',
    content: `${rules}
### 【规则解析阶段】
本阶段禁止写小说正文。只分析玩家当前行动可确认的直接结果，并输出 <resolution>简短结果摘要</resolution> 与 <state_cmd>JSON 数组</state_cmd>。不得输出 <narrate>、<branch> 或替玩家追加行动。`,
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
  pendingItemActions: PendingItemAction[] = [],
  signal?: AbortSignal,
): Promise<TurnResolutionDraft> {
  const raw = await requestTurnResolutionCompletion(messages, config, gameState, pendingItemActions, signal);
  return parseTurnResolutionOutput(raw);
}

export interface ResolvedTurnFacts {
  action: string;
  startedOn: WorldDate;
  resolvedOn: WorldDate;
  diceCheck?: D20Check;
  acceptedCommands: StateCommand[];
  changes: string[];
  facts: WorldEventFact[];
  canonicalTransitions: CanonicalEventState[];
}

export interface SettleTurnDraftInput {
  gameState: GameState;
  actionText: string;
  nextTurnNumber: number;
  draft: TurnResolutionDraft;
  pendingItemActions: readonly PendingItemAction[];
  characterContext?: CharacterCommandBatchBaseContext;
  diceCheck?: D20Check;
  timeline?: readonly CanonicalTimelineEvent[];
}

export interface SettledTurn {
  updatedLord: LordProfile;
  isFatalDeath: boolean;
  acceptedCommands: StateCommand[];
  rejectedCommands: RejectedWorldCommand[];
  characterEvents: CharacterEventInput[];
  characterContext: CharacterCommandBatchBaseContext;
  changesLog: string[];
  nextDate: WorldDate;
  nextSeason: string;
  worldHistory: WorldHistoryState;
  resolvedFacts: ResolvedTurnFacts;
}

function commandParticipantIds(command: StateCommand): CharacterId[] {
  const raw = command as unknown as Record<string, unknown>;
  return [...new Set(['characterId', 'sourceCharacterId', 'fromCharacterId', 'toCharacterId', 'spouseId', 'targetCharacterId', 'targetId', 'recipientId', 'killerId']
    .map((key) => raw[key])
    .filter((value): value is CharacterId => typeof value === 'string' && (value.startsWith('agot:') || value.startsWith('save:'))))];
}

function factSource(command: StateCommand): WorldEventFact['source'] {
  if (command.type.startsWith('ITEM_')) return 'item';
  if (isCharacterStateCommand(command)) return 'character';
  return 'player';
}

function commandFactLocation(command: StateCommand, currentLocation: WorldLocationRef): WorldLocationRef {
  if (command.type === 'CHANGE_LOCATION' || command.type === 'MOVE_CHARACTER') {
    return createWorldLocationRef(command.locationId, command.sceneLocation);
  }
  return { ...currentLocation };
}

function commandFacts(
  commands: readonly StateCommand[],
  turn: number,
  date: WorldDate,
  currentLocation: WorldLocationRef,
  playerId?: CharacterId,
): WorldEventFact[] {
  return commands
    .filter((command) => command.type !== 'ADVANCE_TIME' && command.type !== 'SET_DATE')
    .map((command, index) => ({
      id: `command:${turn}:${index}:${command.type}`,
      turn,
      date: { ...date },
      source: factSource(command),
      kind: command.type === 'KILL_CHARACTER' ? 'character.death' : `command.${command.type.toLowerCase()}`,
      title: `已确认命令：${command.type}`,
      summary: `程序已接受并结算 ${command.type}。`,
      participantIds: commandParticipantIds(command).length ? commandParticipantIds(command) : playerId ? [playerId] : [],
      commandTypes: [command.type],
      location: commandFactLocation(command, currentLocation),
    }));
}

function deriveSeason(month: number): string {
  if (month <= 3) return '新春之兆 (初春)';
  if (month <= 6) return '烈阳盛夏 (盛夏)';
  if (month <= 9) return '丰收残秋 (初秋)';
  return '凛冬将至 (晚秋与寒冬)';
}

export function settleTurnDraft(input: SettleTurnDraftInput): SettledTurn {
  const { gameState } = input;
  const parsedCommands = input.draft.stateCommands ?? [];
  const modelItemCommands = parsedCommands.filter((command): command is ItemStateCommand => command.type.startsWith('ITEM_'));
  const nonItemCommands = parsedCommands.filter((command) => !command.type.startsWith('ITEM_'));
  const stateCommands: StateCommand[] = [
    ...mergePendingItemCommands(input.pendingItemActions, modelItemCommands),
    ...nonItemCommands,
  ];
  const characterBatch = validateCharacterCommandBatch(
    stateCommands,
    input.characterContext,
    input.nextTurnNumber,
  );
  const rejectedSequences = new Set(characterBatch.rejected.map((entry) => entry.commandSequence));
  const rejectedCommands: RejectedWorldCommand[] = characterBatch.rejected.map((entry) => ({
    type: entry.command.type,
    reason: stripEmoji(entry.reason),
  }));
  const knownLocationIds = input.characterContext?.knownLocationIds
    ? new Set(input.characterContext.knownLocationIds)
    : undefined;
  stateCommands.forEach((command, index) => {
    if (command.type !== 'CHANGE_LOCATION') return;
    const raw = command as unknown as Record<string, unknown>;
    const ref = { locationId: raw.locationId, sceneLocation: raw.sceneLocation };
    if ('location' in raw) {
      rejectedSequences.add(index);
      rejectedCommands.push({ type: command.type, reason: '地点变更必须使用地图地点 ID，不能使用自由文本地点' });
    } else if (!knownLocationIds) {
      rejectedSequences.add(index);
      rejectedCommands.push({ type: command.type, reason: '缺少地图地点索引，地点变更未执行' });
    } else if (!validateWorldLocationRef(ref, knownLocationIds)) {
      rejectedSequences.add(index);
      rejectedCommands.push({ type: command.type, reason: '目标地图地点不存在或具体场景不合法' });
    }
  });
  const currentDate: WorldDate = {
    year: gameState.currentYear,
    month: gameState.currentMonth,
    day: gameState.currentDay,
  };
  let nextDate = currentDate;
  let nextSeason = gameState.currentSeason;
  let rejectedTemporal: StateCommand | undefined;
  const setDate = stateCommands.find((command) => command.type === 'SET_DATE');
  const advanceTime = stateCommands.find((command) => command.type === 'ADVANCE_TIME');
  if (setDate?.type === 'SET_DATE') {
    try {
      nextDate = setWorldDateForward(currentDate, setDate);
      nextSeason = setDate.season ? stripEmoji(setDate.season) : deriveSeason(nextDate.month);
    } catch (error) {
      rejectedTemporal = setDate;
      rejectedCommands.push({ type: setDate.type, reason: stripEmoji(error instanceof Error ? error.message : '日期无效') });
    }
  } else if (advanceTime?.type === 'ADVANCE_TIME') {
    try {
      nextDate = advanceWorldDate(currentDate, advanceTime);
      nextSeason = advanceTime.season ? stripEmoji(advanceTime.season) : deriveSeason(nextDate.month);
    } catch (error) {
      rejectedTemporal = advanceTime;
      rejectedCommands.push({ type: advanceTime.type, reason: stripEmoji(error instanceof Error ? error.message : '时长无效') });
    }
  }
  const acceptedCommands = stateCommands.filter((command, index) => !rejectedSequences.has(index) && command !== rejectedTemporal);
  const lordCommands = acceptedCommands.filter((command) => !isCharacterStateCommand(command));
  const { updatedLord, changesLog, isFatalDeath } = applyStateCommands(gameState.lord, lordCommands);
  const facts = commandFacts(acceptedCommands, input.nextTurnNumber, nextDate, gameState.lord.location, gameState.lord.canonicalCharacterId);
  const allKnownFacts = [...gameState.worldHistory.turns.flatMap((turn) => turn.facts), ...facts];
  const canonicalResolution = resolveDueCanonicalEvents(
    gameState.worldHistory,
    input.timeline ?? CANONICAL_TIMELINE,
    currentDate,
    nextDate,
    allKnownFacts,
  );
  const timelineFacts: WorldEventFact[] = canonicalResolution.dueEvents.map((event) => {
    const transition = canonicalResolution.transitions.find((entry) => entry.eventId === event.id);
    const occurred = transition?.status === 'occurred';
    return {
      id: `timeline:${event.id}:${input.nextTurnNumber}`,
      turn: input.nextTurnNumber,
      date: occurred ? { ...event.date } : { ...nextDate },
      source: 'timeline',
      kind: occurred ? 'timeline.occurred' : 'timeline.diverged',
      title: event.title,
      summary: occurred ? event.summary : transition?.reason ?? event.summary,
      participantIds: event.participants.flatMap((person) => person.characterId ? [person.characterId] : []),
      commandTypes: [],
      canonicalEventId: event.id,
    };
  });
  const resolvedFacts: ResolvedTurnFacts = {
    action: stripEmoji(input.actionText),
    startedOn: currentDate,
    resolvedOn: nextDate,
    diceCheck: input.diceCheck,
    acceptedCommands,
    changes: changesLog.map(stripEmoji),
    facts: [...facts, ...timelineFacts],
    canonicalTransitions: canonicalResolution.transitions,
  };
  const worldHistory = appendWorldTurn(canonicalResolution.history, {
    turn: input.nextTurnNumber,
    action: resolvedFacts.action,
    startedOn: currentDate,
    resolvedOn: nextDate,
    acceptedCommands,
    rejectedCommands,
    facts: resolvedFacts.facts,
    canonicalTransitions: canonicalResolution.transitions,
  });
  return {
    updatedLord,
    isFatalDeath,
    acceptedCommands,
    rejectedCommands,
    characterEvents: characterBatch.events,
    characterContext: characterBatch.context,
    changesLog: [
      ...changesLog.map(stripEmoji),
      ...rejectedCommands.map((entry) => `命令拒绝 [${entry.type}]: ${entry.reason}`),
      ...timelineFacts.map((fact) => `时间线${fact.kind === 'timeline.occurred' ? '发生' : '偏离'}: ${fact.title}`),
    ],
    nextDate,
    nextSeason,
    worldHistory,
    resolvedFacts,
  };
}
