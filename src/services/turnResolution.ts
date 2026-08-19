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
import { fallbackLocationLabel } from '../features/map/locationResolver';
import { advanceJourney } from '../features/map/travel/journeyReducer';
import { applyTravelCommands, isTravelStateCommand } from '../features/map/travel/travelCommands';
import type { ActiveJourney, TravelStateCommand } from '../features/map/travel/types';

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
  pendingTravelCommands?: readonly TravelStateCommand[];
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
  activeJourney?: ActiveJourney;
}

function commandParticipantIds(command: StateCommand): CharacterId[] {
  const raw = command as unknown as Record<string, unknown>;
  return [...new Set(['characterId', 'sourceCharacterId', 'fromCharacterId', 'toCharacterId', 'spouseId', 'targetCharacterId', 'targetId', 'recipientId', 'killerId']
    .map((key) => raw[key])
    .filter((value): value is CharacterId => typeof value === 'string' && (value.startsWith('agot:') || value.startsWith('save:'))))];
}

function factSource(command: StateCommand): WorldEventFact['source'] {
  if (isTravelStateCommand(command)) return 'system';
  if (command.type.startsWith('ITEM_')) return 'item';
  if (isCharacterStateCommand(command)) return 'character';
  return 'player';
}

function commandFactLocation(command: StateCommand, currentLocation: WorldLocationRef, resolvedLocation: WorldLocationRef): WorldLocationRef {
  if (command.type === 'CHANGE_LOCATION' || command.type === 'MOVE_CHARACTER') {
    return createWorldLocationRef(command.locationId, command.sceneLocation);
  }
  if (isTravelStateCommand(command)) return { ...resolvedLocation };
  return { ...currentLocation };
}

function travelFactText(command: TravelStateCommand, resolvedLocation: WorldLocationRef): { title: string; summary: string } {
  const labels = 'locationLabels' in command ? command.locationLabels : undefined;
  const plan = 'routePlan' in command ? command.routePlan : undefined;
  const from = plan ? labels?.[plan.from] ?? plan.from : undefined;
  const to = plan ? labels?.[plan.to] ?? plan.to : undefined;
  switch (command.type) {
    case 'PLAN_TRAVEL': return { title: '路线已经规划', summary: `已规划从${from}前往${to}的路线，尚未出发。` };
    case 'START_TRAVEL': return { title: '旅程已经开始', summary: plan ? `队伍从${from}启程前往${to}。` : '队伍按已规划的路线启程。' };
    case 'PAUSE_TRAVEL': return command.reason
      ? { title: '旅程被迫中断', summary: `队伍因${command.reason}停下。` }
      : { title: '旅程已经暂停', summary: '队伍暂时停止赶路。' };
    case 'RESUME_TRAVEL': return { title: '旅程继续', summary: '队伍重新上路。' };
    case 'REROUTE_TRAVEL': return { title: '旅程已经改道', summary: `队伍从${from}改道前往${to}。` };
    case 'RETURN_TRAVEL': return { title: '队伍开始返回', summary: `队伍从${from}沿新路线返回${to}。` };
    case 'ADVANCE_TRAVEL': return {
      title: '旅程继续推进',
      summary: `旅程随世界时间推进 ${command.days} 天，当前权威地点为${resolvedLocation.locationId}。`,
    };
    case 'CANCEL_PLANNED_TRAVEL': return { title: '路线规划已经取消', summary: '尚未开始的旅程已经取消。' };
  }
}

function commandFacts(
  commands: readonly StateCommand[],
  turn: number,
  date: WorldDate,
  currentLocation: WorldLocationRef,
  resolvedLocation: WorldLocationRef,
  playerId?: CharacterId,
  travelParticipants: readonly CharacterId[] = [],
): WorldEventFact[] {
  return commands
    .filter((command) => command.type !== 'ADVANCE_TIME' && command.type !== 'SET_DATE')
    .map((command, index) => {
      const isTravel = isTravelStateCommand(command)
      const participantIds = isTravel
        ? [...new Set([...(playerId ? [playerId] : []), ...travelParticipants])]
        : commandParticipantIds(command).length
          ? commandParticipantIds(command)
          : playerId ? [playerId] : []
      const travelText = isTravel ? travelFactText(command, resolvedLocation) : undefined
      return {
        id: `command:${turn}:${index}:${command.type}`,
        turn,
        date: { ...date },
        source: factSource(command),
        kind: command.type === 'KILL_CHARACTER'
          ? 'character.death'
          : command.type === 'ADVANCE_TRAVEL'
            ? 'travel.progress'
            : `command.${command.type.toLowerCase()}`,
        title: travelText?.title ?? `已确认命令：${command.type}`,
        summary: travelText?.summary ?? `程序已接受并结算 ${command.type}。`,
        participantIds,
        commandTypes: [command.type],
        location: commandFactLocation(command, currentLocation, resolvedLocation),
      }
    })
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
    ...(input.pendingTravelCommands ?? []),
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
  const explicitTravelAdvance = stateCommands.find((command): command is TravelStateCommand & { type: 'ADVANCE_TRAVEL' } => command.type === 'ADVANCE_TRAVEL');
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
  } else if (explicitTravelAdvance) {
    try {
      if (!Number.isInteger(explicitTravelAdvance.days)) throw new Error('旅行推进天数必须是整数');
      nextDate = advanceWorldDate(currentDate, { days: explicitTravelAdvance.days });
      nextSeason = deriveSeason(nextDate.month);
    } catch (error) {
      rejectedTemporal = explicitTravelAdvance;
      rejectedCommands.push({ type: explicitTravelAdvance.type, reason: stripEmoji(error instanceof Error ? error.message : '旅行时长无效') });
    }
  }

  const preliminarilyAccepted = stateCommands.filter((command, index) => !rejectedSequences.has(index) && command !== rejectedTemporal);
  const travelCommands = preliminarilyAccepted.filter(isTravelStateCommand);
  const travelRejected = new Set<TravelStateCommand>();
  let activeJourney = gameState.activeJourney ? structuredClone(gameState.activeJourney) : undefined;
  if (travelCommands.length) {
    if (!knownLocationIds) {
      travelCommands.forEach((command) => {
        travelRejected.add(command);
        rejectedCommands.push({ type: command.type, reason: '缺少地图地点索引，旅行命令未执行' });
      });
    } else {
      const result = applyTravelCommands(activeJourney, travelCommands, {
        currentLocation: gameState.lord.location,
        currentDate,
        knownLocationIds,
      });
      activeJourney = result.journey;
      result.rejected.forEach((entry) => {
        travelRejected.add(entry.command);
        rejectedCommands.push({ type: entry.command.type, reason: stripEmoji(entry.reason) });
      });
    }
  }
  if (explicitTravelAdvance && travelRejected.has(explicitTravelAdvance) && !setDate && !advanceTime) {
    nextDate = currentDate;
    nextSeason = gameState.currentSeason;
  }

  let acceptedCommands = preliminarilyAccepted.filter((command) => !isTravelStateCommand(command) || !travelRejected.has(command));
  const elapsedDays = (nextDate.year - currentDate.year) * 360
    + (nextDate.month - currentDate.month) * 30
    + nextDate.day - currentDate.day;
  const shouldAutoAdvance = elapsedDays > 0 && activeJourney?.status === 'travelling';
  if (shouldAutoAdvance && !acceptedCommands.some((command) => command.type === 'ADVANCE_TRAVEL')) {
    acceptedCommands = [...acceptedCommands, { type: 'ADVANCE_TRAVEL', days: elapsedDays }];
  }

  const lordCommands = acceptedCommands.filter((command) => !isCharacterStateCommand(command) && !isTravelStateCommand(command));
  const lordResult = applyStateCommands(gameState.lord, lordCommands);
  let updatedLord = lordResult.updatedLord;
  const changesLog = [...lordResult.changesLog];
  let characterEvents = [...characterBatch.events];
  let characterContext = characterBatch.context;

  if (shouldAutoAdvance && activeJourney && knownLocationIds) {
    try {
      const patch = advanceJourney({
        journey: activeJourney,
        playerLocation: updatedLord.location,
        vehicles: updatedLord.items.vehicles,
        itemPlacements: updatedLord.items.placements,
        knownLocationIds,
        characters: characterContext.characters.map((character) => ({
          id: character.id,
          alive: character.alive,
          locationId: character.locationId,
        })),
      }, elapsedDays);
      activeJourney = patch.journey;
      const locationName = activeJourney?.locationLabels?.[patch.playerLocation.locationId];
      const resolvedLocationLabel = locationName
        ? patch.playerLocation.sceneLocation ? `${locationName} · ${patch.playerLocation.sceneLocation}` : locationName
        : fallbackLocationLabel(patch.playerLocation);
      updatedLord = {
        ...updatedLord,
        location: { ...patch.playerLocation },
        locationLabel: resolvedLocationLabel,
        items: {
          ...updatedLord.items,
          vehicles: Object.fromEntries(Object.entries(updatedLord.items.vehicles).map(([id, vehicle]) => {
            const location = patch.vehicleLocations[id];
            if (!location) return [id, vehicle];
            const label = activeJourney?.locationLabels?.[location.locationId] ?? fallbackLocationLabel(location);
            return [id, { ...vehicle, location: { ...location }, locationLabel: label }];
          })),
        },
      };
      const travelEvents: CharacterEventInput[] = patch.characterMoves.map((move, index) => ({
        id: `${input.nextTurnNumber}:travel:${index}`,
        characterId: move.characterId,
        event: { type: 'MOVE', locationId: move.locationId, sceneLocation: move.sceneLocation, reason: '随队旅行' },
      }));
      characterEvents = [...characterEvents, ...travelEvents];
      const moves = new Map(travelEvents.map((entry) => [entry.characterId, entry.event]));
      characterContext = {
        ...characterContext,
        currentLocationId: updatedLord.location.locationId,
        presentCharacterIds: patch.reachedLocationIds.length
          ? new Set(patch.characterMoves.map((move) => move.characterId))
          : characterContext.presentCharacterIds,
        characters: characterContext.characters.map((character) => {
          const move = moves.get(character.id);
          return move?.type === 'MOVE'
            ? { ...character, locationId: move.locationId, sceneLocation: move.sceneLocation }
            : character;
        }),
        eventHistory: [
          ...(characterContext.eventHistory ?? []),
          ...travelEvents.map((entry) => ({ characterId: entry.characterId, event: entry.event })),
        ],
      };
      if (patch.changed) {
        changesLog.push(activeJourney?.status === 'arrived'
          ? `旅程抵达: 【${updatedLord.locationLabel}】`
          : `旅程推进: ${patch.elapsedDays} 天`);
      }
    } catch (error) {
      const reason = stripEmoji(error instanceof Error ? error.message : '旅行状态验证失败');
      activeJourney = gameState.activeJourney ? structuredClone(gameState.activeJourney) : undefined;
      acceptedCommands = acceptedCommands.filter((command) => command.type !== 'ADVANCE_TRAVEL' && !isTravelStateCommand(command));
      travelCommands.forEach((command) => rejectedCommands.push({ type: command.type, reason }));
      rejectedCommands.push({ type: 'ADVANCE_TRAVEL', reason });
    }
  }

  const travelParticipants = activeJourney?.companions ?? [];
  const facts = commandFacts(
    acceptedCommands,
    input.nextTurnNumber,
    nextDate,
    gameState.lord.location,
    updatedLord.location,
    gameState.lord.canonicalCharacterId,
    travelParticipants,
  );
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
    isFatalDeath: lordResult.isFatalDeath,
    acceptedCommands,
    rejectedCommands,
    characterEvents,
    characterContext,
    changesLog: [
      ...changesLog.map(stripEmoji),
      ...rejectedCommands.map((entry) => `命令拒绝 [${entry.type}]: ${entry.reason}`),
      ...timelineFacts.map((fact) => `时间线${fact.kind === 'timeline.occurred' ? '发生' : '偏离'}: ${fact.title}`),
    ],
    nextDate,
    nextSeason,
    worldHistory,
    resolvedFacts,
    activeJourney,
  };
}
