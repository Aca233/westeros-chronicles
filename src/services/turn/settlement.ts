import type { PreparedWorldTurn, SettleTurnDraftInput, SettledTurn, TurnResolutionDraft } from './resolutionTypes';
import { settleLegacyTurnDraft } from './legacySettlement';
import { committedNarrationContext, deriveSeason, playerCharacterId, worldEventAsFact, worldEventFromFact } from './settlementFacts';
import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import type { WorldEventFact } from '../../features/world/worldHistory';
import type { LordProfile, StateCommand } from '../../types/game';
import { stripEmoji } from '../textSanitizer';
import { fallbackLocationLabel } from '../../features/map/locationResolver';
import { isTravelStateCommand } from '../../features/map/travel/travelCommands';
import type { PendingWorldTransaction, WorldRuntimeState } from '../../features/world/worldRuntimeTypes';
import { settleWorldTransactionStatus } from '../../features/world/worldTransactionQueue';
import { worldAssetId } from '../../features/world/worldBaseline';
import { commitWorldTransaction } from '../../features/world/worldTransactions';
import { projectWorldCharacter, resolveAssetMapLocation } from '../../features/world/worldProjection';
import { advanceWorldScheduler } from '../../features/world/worldScheduler';

function isWorldManagedStateCommand(command: StateCommand): boolean {
  return command.type.startsWith('ITEM_')
    || isTravelStateCommand(command)
    || command.type === 'ADVANCE_TIME'
    || command.type === 'SET_DATE'
    || command.type === 'CHANGE_LOCATION';
}

function withPendingStatuses(
  runtime: WorldRuntimeState,
  pending: readonly PendingWorldTransaction[],
  status: 'committed' | 'rejected',
  reason?: string,
): WorldRuntimeState {
  let queue = runtime.pendingTransactions;
  for (const transaction of pending.filter((entry) => entry.status === 'pending')) {
    if (!queue.some((entry) => entry.id === transaction.id)) continue;
    queue = settleWorldTransactionStatus(queue, transaction.id, status, reason);
  }
  return { ...runtime, pendingTransactions: queue };
}

function rejectedPreparedTurn(
  input: SettleTurnDraftInput,
  base: SettledTurn,
  prepared: PreparedWorldTurn,
  reason: string,
): SettledTurn {
  const currentDate = {
    year: input.gameState.currentYear,
    month: input.gameState.currentMonth,
    day: input.gameState.currentDay,
  };
  const rejectedIntents = prepared.rejectedIntents.map((entry) => ({ type: entry.intent.kind, reason: entry.reason }));
  const rejectedCommands = [
    ...base.rejectedCommands,
    ...rejectedIntents,
    { type: 'WORLD_TRANSACTION', reason },
  ];
  const turns = base.worldHistory.turns.map((turn, index, entries) => index === entries.length - 1
    ? {
        ...turn,
        resolvedOn: { ...currentDate },
        acceptedCommands: [],
        rejectedCommands,
        eventIds: [],
      }
    : turn);
  const runtime = {
    ...withPendingStatuses(input.gameState.worldRuntime, input.pendingTransactions, 'rejected', reason),
    revision: base.worldRuntime.revision,
  };
  const narrationContext = committedNarrationContext(
    input.gameState.lord.location,
    prepared.locations,
    [],
    [reason, ...prepared.rejectedIntents.map((entry) => entry.reason)],
  );
  return {
    ...base,
    updatedLord: structuredClone(input.gameState.lord),
    isFatalDeath: input.gameState.isGameOver,
    acceptedCommands: [],
    rejectedCommands,
    characterEvents: [],
    changesLog: [`世界事务拒绝: ${reason}`],
    nextDate: currentDate,
    nextSeason: input.gameState.currentSeason,
    worldHistory: { ...base.worldHistory, turns },
    worldRuntime: runtime,
    resolvedFacts: {
      ...base.resolvedFacts,
      resolvedOn: currentDate,
      acceptedCommands: [],
      changes: [],
      facts: [],
    },
    activeJourney: input.gameState.activeJourney ? structuredClone(input.gameState.activeJourney) : undefined,
    transactionId: prepared.transactionId,
    worldLocation: { ...input.gameState.lord.location },
    narrationContext,
  };
}

export function settleTurnDraft(input: SettleTurnDraftInput): SettledTurn {
  if (!input.preparedWorld) return settleLegacyTurnDraft(input);

  const prepared = input.preparedWorld;
  const legacyDraft: TurnResolutionDraft = {
    outcomeSummary: input.draft.outcomeSummary,
    stateCommands: input.draft.stateCommands.filter((command) => !isWorldManagedStateCommand(command)),
    worldIntents: [],
  };
  const base = settleLegacyTurnDraft({
    ...input,
    draft: legacyDraft,
    pendingTransactions: [],
    preparedWorld: undefined,
  });
  if (prepared.rejectionReason) return rejectedPreparedTurn(input, base, prepared, prepared.rejectionReason);

  const locationRejections = [
    ...prepared.rejectedIntents.map((entry) => ({ type: entry.intent.kind, reason: entry.reason })),
    ...(prepared.rejectedCommands ?? []),
  ];
  if (!prepared.transaction) {
    const narrationContext = committedNarrationContext(base.worldLocation, prepared.locations, [], locationRejections.map((entry) => entry.reason));
    return {
      ...base,
      rejectedCommands: [...base.rejectedCommands, ...locationRejections],
      transactionId: prepared.transactionId,
      narrationContext,
    };
  }

  const currentDate = {
    year: input.gameState.currentYear,
    month: input.gameState.currentMonth,
    day: input.gameState.currentDay,
  };
  const committed = commitWorldTransaction({
    runtime: base.worldRuntime,
    items: base.updatedLord.items,
    ...(input.gameState.activeJourney ? { journey: input.gameState.activeJourney } : {}),
    date: currentDate,
  }, prepared.baseline, prepared.transaction);
  if (!committed.ok) return rejectedPreparedTurn(input, base, prepared, committed.reason);

  const knownEventTurns = new Map<string, number>();
  for (const turn of base.worldHistory.turns) for (const eventId of turn.eventIds) knownEventTurns.set(eventId, turn.turn);
  for (const event of input.gameState.roleplay?.socialEvents ?? []) knownEventTurns.set(event.id, event.turn);
  const scheduler = advanceWorldScheduler({
    runtime: committed.state.runtime,
    roleplay: input.gameState.roleplay,
    history: base.worldHistory,
    timeline: input.timeline ?? CANONICAL_TIMELINE,
    from: currentDate,
    to: committed.state.date,
    turn: input.nextTurnNumber,
    playerId: playerCharacterId(input.gameState),
    playerLocation: input.gameState.lord.location,
    presentCharacterIds: Array.from(input.characterContext?.presentCharacterIds ?? []),
    knownEventTurns,
    transactionId: prepared.transactionId,
  });
  let runtime = {
    ...withPendingStatuses(scheduler.runtime, input.pendingTransactions, 'committed'),
    // The ledger revision belongs to the narrative turn, not to each internal
    // transaction committed while resolving that turn.
    revision: base.worldRuntime.revision,
  };
  const projectedPlayer = projectWorldCharacter(prepared.baseline, runtime, playerCharacterId(input.gameState));
  if (!projectedPlayer?.location) {
    return rejectedPreparedTurn(input, base, prepared, '世界事务提交后玩家地点未能投影');
  }
  const locationName = prepared.locations.find((entry) => entry.id === projectedPlayer.location?.locationId)?.name;
  const locationLabel = locationName
    ? projectedPlayer.location.sceneLocation ? `${locationName} · ${projectedPlayer.location.sceneLocation}` : locationName
    : fallbackLocationLabel(projectedPlayer.location);
  const updatedLord: LordProfile = {
    ...base.updatedLord,
    location: { ...projectedPlayer.location },
    locationLabel,
    items: {
      ...committed.state.items,
      vehicles: Object.fromEntries(Object.entries(committed.state.items.vehicles).map(([id, vehicle]) => {
        const location = resolveAssetMapLocation(prepared.baseline, runtime, worldAssetId.vehicle(id));
        if (!location) return [id, vehicle];
        const label = prepared.locations.find((entry) => entry.id === location.locationId)?.name ?? fallbackLocationLabel(location);
        return [id, { ...vehicle, location: { ...location }, locationLabel: label }];
      })),
    },
  };
  const committedEvents = [...committed.events, ...scheduler.events];
  const worldFacts = committedEvents.map(worldEventAsFact);
  const acceptedCommands = [...base.acceptedCommands, ...prepared.acceptedCommands];
  const rejectedCommands = [...base.rejectedCommands, ...locationRejections];
  const turns = scheduler.history.turns.map((turn, index, entries) => index === entries.length - 1
    ? {
        ...turn,
        resolvedOn: { ...scheduler.finalDate },
        acceptedCommands,
        rejectedCommands,
        eventIds: [...new Set([...turn.eventIds, ...committedEvents.map((event) => event.id)])],
      }
    : turn);
  const narrationContext = committedNarrationContext(
    projectedPlayer.location,
    prepared.locations,
    committedEvents,
    locationRejections.map((entry) => entry.reason),
  );
  return {
    ...base,
    updatedLord,
    acceptedCommands,
    rejectedCommands,
    changesLog: [...base.changesLog, ...scheduler.roleplayChanges, ...committedEvents.map((event) => stripEmoji(event.reason))],
    nextDate: { ...scheduler.finalDate },
    nextSeason: deriveSeason(scheduler.finalDate.month),
    worldHistory: { ...scheduler.history, turns },
    worldRuntime: runtime,
    resolvedFacts: {
      ...base.resolvedFacts,
      resolvedOn: { ...scheduler.finalDate },
      acceptedCommands,
      changes: [...base.resolvedFacts.changes, ...scheduler.roleplayChanges, ...committedEvents.map((event) => stripEmoji(event.reason))],
      facts: [...base.resolvedFacts.facts, ...worldFacts],
      canonicalTransitions: scheduler.canonicalTransitions,
    },
    activeJourney: committed.state.journey,
    roleplay: scheduler.roleplay,
    transactionId: committed.transactionId,
    worldLocation: { ...projectedPlayer.location },
    narrationContext,
  };
}
