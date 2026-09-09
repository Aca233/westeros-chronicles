import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import type { RoleplayState } from '../roleplay/types';
import { settleRoleplayCommands } from '../roleplay/state';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import { resolveDueCanonicalEvents } from './canonicalTimeline';
import { advanceLivingWorld } from './livingWorldEngine';
import { advanceWorldDate, compareWorldDates, type CanonicalEventState, type WorldHistoryState } from './worldHistory';
import type { WorldEvent, WorldRuntimeState } from './worldRuntimeTypes';

export interface WorldSchedulerInput {
  runtime: WorldRuntimeState;
  roleplay: RoleplayState | undefined;
  history: WorldHistoryState;
  timeline: readonly CanonicalTimelineEvent[];
  from: WorldDate;
  to: WorldDate;
  turn: number;
  playerId: CharacterId;
  playerLocation: { locationId: string; sceneLocation?: string };
  presentCharacterIds: readonly CharacterId[];
  knownEventTurns?: ReadonlyMap<string, number>;
  transactionId: string;
}

export interface WorldSchedulerResult {
  runtime: WorldRuntimeState;
  roleplay: RoleplayState;
  history: WorldHistoryState;
  finalDate: WorldDate;
  actualDays: number;
  events: WorldEvent[];
  canonicalTransitions: CanonicalEventState[];
  roleplayChanges: string[];
  stoppedForDecision?: { situationId: string; reason: string };
}

function formatDate(date: WorldDate): string {
  return `${date.year}.${date.month}.${date.day}`;
}

function timelineEvent(
  event: CanonicalTimelineEvent,
  transition: CanonicalEventState,
  turn: number,
  transactionId: string,
): WorldEvent {
  const occurred = transition.status === 'occurred';
  const date = occurred ? event.date : (transition.resolvedOn ?? event.date);
  const participantIds = event.participants.flatMap((person) => person.characterId ? [person.characterId] : []);
  return {
    id: `timeline:${event.id}:${turn}`,
    transactionId,
    turn,
    date: { ...date },
    occurredAt: { ...date },
    type: occurred ? 'timeline.occurred' : 'timeline.diverged',
    actorIds: participantIds,
    subjectRefs: participantIds.map((characterId) => ({ type: 'character' as const, characterId })),
    reason: occurred ? event.summary : transition.reason ?? event.summary,
    source: 'system_rule',
    canonicalEventId: event.id,
    causeSource: { type: 'canonical', id: event.id },
    affectedRefs: participantIds.map((characterId) => ({ type: 'character' as const, characterId })),
    visibility: 'public',
    knowledgeBasis: participantIds.map((characterId) => ({ characterId, kind: 'public_record' as const })),
  };
}

/**
 * Single deterministic clock for date-driven world work. Granularity is one game day because
 * all persisted deadlines currently use WorldDate. Within a day the stable order is:
 * canonical precondition checks -> roleplay message/agenda/delegation due work -> living-world
 * information -> ongoing actions -> supply consumption -> situation thresholds -> NPC strategy.
 */
export function advanceWorldScheduler(input: WorldSchedulerInput): WorldSchedulerResult {
  if (compareWorldDates(input.to, input.from) < 0) throw new Error('统一世界调度不能倒退时间');
  let runtime = structuredClone(input.runtime);
  let roleplay = structuredClone(input.roleplay ?? {
    schemaVersion: 1,
    revision: 0,
    socialEvents: [],
    commitments: [],
    knowledge: [],
    relationshipEvidence: [],
    messages: [],
    agendas: [],
    projects: [],
    growthOpportunities: [],
  } satisfies RoleplayState);
  let history = structuredClone(input.history);
  let cursor = { ...input.from };
  let actualDays = 0;
  const events: WorldEvent[] = [];
  const canonicalTransitions: CanonicalEventState[] = [];
  const roleplayChanges: string[] = [];
  let stoppedForDecision: WorldSchedulerResult['stoppedForDecision'];

  while (compareWorldDates(cursor, input.to) < 0) {
    const day = advanceWorldDate(cursor, { days: 1 });

    const canonical = resolveDueCanonicalEvents(history, input.timeline, cursor, day, runtime.events);
    history = canonical.history;
    canonicalTransitions.push(...canonical.transitions);
    canonical.dueEvents.forEach((event) => {
      const transition = canonical.transitions.find((candidate) => candidate.eventId === event.id);
      if (!transition) return;
      const projected = timelineEvent(event, transition, input.turn, input.transactionId);
      if (!runtime.events.some((existing) => existing.id === projected.id)) {
        runtime.events.push(projected);
        events.push(projected);
      }
    });

    const roleplayResult = settleRoleplayCommands(roleplay, [], {
      turn: input.turn,
      playerId: input.playerId,
      presentCharacterIds: input.presentCharacterIds,
      currentDate: formatDate(day),
      knownEventTurns: input.knownEventTurns,
      appliedGrowthChoices: [],
    });
    roleplay = roleplayResult.state;
    roleplayChanges.push(...roleplayResult.changes);

    const living = advanceLivingWorld(runtime, cursor, 1, {
      turn: input.turn,
      playerId: input.playerId,
      playerLocation: input.playerLocation,
      transactionId: input.transactionId,
    });
    runtime = living.runtime;
    events.push(...living.events);
    cursor = day;
    actualDays += 1;
    if (living.stoppedForDecision) {
      stoppedForDecision = living.stoppedForDecision;
      break;
    }
  }

  return {
    runtime,
    roleplay,
    history,
    finalDate: cursor,
    actualDays,
    events,
    canonicalTransitions,
    roleplayChanges,
    ...(stoppedForDecision ? { stoppedForDecision } : {}),
  };
}
