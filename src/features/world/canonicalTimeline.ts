import type { CharacterId } from '../characters/types';
import type {
  CanonicalEventState,
  WorldDate,
  WorldHistoryState,
} from './worldHistory';
import { compareWorldDates } from './worldHistory';
import type { WorldEvent } from './worldRuntimeTypes';

export interface CanonicalTimelinePerson {
  name: string;
  characterId?: CharacterId;
}

export interface CanonicalTimelineEvent {
  id: string;
  date: WorldDate;
  dateDisplay?: string;
  title: string;
  summary: string;
  region: string;
  regionTag?: string;
  category: 'war' | 'intrigue' | 'death' | 'coronation' | 'magic';
  participants: readonly CanonicalTimelinePerson[];
  fatalities: readonly CanonicalTimelinePerson[];
  consequences: readonly string[];
}

export interface CanonicalResolutionResult {
  history: WorldHistoryState;
  transitions: CanonicalEventState[];
  dueEvents: CanonicalTimelineEvent[];
}

/** 游戏的第一天。世界在此刻的状态就是既有正史，也决定原作节点的历史/预定分界。 */
export const GAME_START_DATE: WorldDate = { year: 298, month: 5, day: 10 };

/**
 * 开局分界必须与 resolveDueCanonicalEvents 的时间窗语义互补。
 *
 * 调度器每天推进一个半开区间 (cursor, day]，并且只在事件日期落在该区间内时结算。
 * 因此开局日当天及之前的事件永远不会进入任何时间窗，必须在初始化时直接判为已发生的正史；
 * 早先这里用严格 <（即只认"开局日之前"），会让正好落在开局当天的事件既不是 historical
 * 也永远排不到 scheduled，永久卡死——琼恩·艾林的死亡事件（298.4.5，开局日 298.5.10）因此
 * 从未结算，导致他在整局里一直是活人。
 */
export function initializeCanonicalStates(
  events: readonly CanonicalTimelineEvent[],
  startDate: WorldDate,
): Record<string, CanonicalEventState> {
  return Object.fromEntries(events.map((event) => [
    event.id,
    {
      eventId: event.id,
      status: compareWorldDates(event.date, startDate) < 0 ? 'historical' : 'scheduled',
    } satisfies CanonicalEventState,
  ]));
}

const CONDITION_CHANGING_COMMANDS: Record<string, string> = {
  MOVE_CHARACTER: '地点',
  CHANGE_LOCATION: '地点',
  MARRY_CHARACTERS: '婚姻',
  DIVORCE_CHARACTERS: '婚姻',
  SET_CHARACTER_RELATIONSHIP: '关系',
  GRANT_CHARACTER_TITLE: '头衔',
  REVOKE_CHARACTER_TITLE: '头衔',
  CHANGE_TITLE: '头衔',
};

function participantIdsOf(event: CanonicalTimelineEvent): Set<CharacterId> {
  return new Set(event.participants.flatMap((participant) => participant.characterId ? [participant.characterId] : []));
}

function eventCharacterIds(event: WorldEvent): CharacterId[] {
  return [...new Set([
    ...event.actorIds,
    ...event.subjectRefs.flatMap((subject) => subject.type === 'character' ? [subject.characterId] : []),
  ])];
}

function eventCommandType(event: WorldEvent): string | undefined {
  if (!event.type.startsWith('command.')) return undefined;
  return event.type.slice('command.'.length).toUpperCase();
}

function eventLabel(event: WorldEvent): string {
  return event.reason || event.type;
}

function participantEventBefore(
  event: CanonicalTimelineEvent,
  worldEvents: readonly WorldEvent[],
  predicate: (worldEvent: WorldEvent) => boolean,
): WorldEvent | undefined {
  const participantIds = participantIdsOf(event);
  if (!participantIds.size) return undefined;
  return worldEvents.find((worldEvent) => predicate(worldEvent)
    && compareWorldDates(worldEvent.date, event.date) <= 0
    && eventCharacterIds(worldEvent).some((id) => participantIds.has(id)));
}

function deathEventBefore(event: CanonicalTimelineEvent, worldEvents: readonly WorldEvent[]): WorldEvent | undefined {
  return participantEventBefore(event, worldEvents, (worldEvent) => worldEvent.type === 'character.death');
}

function conditionChangeBefore(event: CanonicalTimelineEvent, worldEvents: readonly WorldEvent[]): WorldEvent | undefined {
  return participantEventBefore(event, worldEvents, (worldEvent) => {
    const commandType = eventCommandType(worldEvent);
    return commandType !== undefined && commandType in CONDITION_CHANGING_COMMANDS;
  });
}

export function resolveDueCanonicalEvents(
  history: WorldHistoryState,
  schedule: readonly CanonicalTimelineEvent[],
  from: WorldDate,
  to: WorldDate,
  worldEvents: readonly WorldEvent[],
): CanonicalResolutionResult {
  if (compareWorldDates(to, from) < 0) throw new Error('原作时间线不能倒退结算');
  const canonical = { ...history.canonical };
  const transitions: CanonicalEventState[] = [];
  const dueEvents: CanonicalTimelineEvent[] = [];

  for (const event of schedule) {
    const current = canonical[event.id];
    if (!current || current.status !== 'scheduled') continue;
    if (compareWorldDates(event.date, from) <= 0 || compareWorldDates(event.date, to) > 0) continue;
    dueEvents.push(event);
    const blockingDeath = deathEventBefore(event, worldEvents);
    const conditionChange = conditionChangeBefore(event, worldEvents);
    const changedType = conditionChange ? eventCommandType(conditionChange) : undefined;
    const transition: CanonicalEventState = blockingDeath
      ? {
        eventId: event.id,
        status: 'diverged',
        resolvedOn: { ...to },
        reason: `关键人物已在“${eventLabel(blockingDeath)}”中改变命运，原作节点无法按既定方式发生。`,
      }
      : conditionChange
        ? {
          eventId: event.id,
          status: 'diverged',
          resolvedOn: { ...to },
          reason: `关键人物的${changedType ? CONDITION_CHANGING_COMMANDS[changedType] : '前置条件'}已在“${eventLabel(conditionChange)}”中改变，原作节点不能按原条件发生。`,
        }
        : { eventId: event.id, status: 'occurred', resolvedOn: { ...event.date } };
    canonical[event.id] = transition;
    transitions.push(transition);
  }

  return {
    history: { ...history, canonical },
    transitions,
    dueEvents,
  };
}
