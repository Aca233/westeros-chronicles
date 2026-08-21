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

function replacementEventBefore(event: CanonicalTimelineEvent, worldEvents: readonly WorldEvent[]): WorldEvent | undefined {
  return worldEvents.find((worldEvent) => worldEvent.type === 'timeline.replaced'
    && worldEvent.canonicalEventId === event.id
    && compareWorldDates(worldEvent.date, event.date) <= 0);
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
    const replacement = replacementEventBefore(event, worldEvents);
    const blockingDeath = deathEventBefore(event, worldEvents);
    const conditionChange = conditionChangeBefore(event, worldEvents);
    const changedType = conditionChange ? eventCommandType(conditionChange) : undefined;
    const transition: CanonicalEventState = replacement
      ? {
        eventId: event.id,
        status: 'suppressed',
        resolvedOn: { ...to },
        reason: `本世界事件“${eventLabel(replacement)}”已经取代这一原作节点。`,
      }
      : blockingDeath
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
