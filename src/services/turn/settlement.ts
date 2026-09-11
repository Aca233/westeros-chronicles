import type { PreparedWorldTurn, SettleTurnDraftInput, SettledTurn, TurnResolutionDraft } from './resolutionTypes';
import { settleLegacyTurnDraft } from './legacySettlement';
import { committedNarrationContext, deriveSeason, playerCharacterId, worldEventAsFact, worldEventFromFact } from './settlementFacts';
import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import type { WorldEventFact } from '../../features/world/worldHistory';
import type { LordProfile, StateCommand } from '../../types/game';
import { stripEmoji } from '../textSanitizer';
import { fallbackLocationLabel } from '../../features/map/locationResolver';
import { isTravelStateCommand } from '../../features/map/travel/travelCommands';
import { advanceJourney } from '../../features/map/travel/journeyReducer';
import type { PendingWorldTransaction, WorldRuntimeState } from '../../features/world/worldRuntimeTypes';
import { settleWorldTransactionStatus } from '../../features/world/worldTransactionQueue';
import { worldAssetId } from '../../features/world/worldBaseline';
import { commitWorldTransaction } from '../../features/world/worldTransactions';
import { projectWorldCharacter, resolveAssetMapLocation } from '../../features/world/worldProjection';
import { advanceWorldScheduler } from '../../features/world/worldScheduler';
import { settleNpcHealthTurn, settlePlayerHealthTurn } from './healthSettlement';
import { totalActionMinutes } from '../../features/time/gameClock';

function isWorldManagedStateCommand(command: StateCommand): boolean {
  return command.type.startsWith('ITEM_')
    || isTravelStateCommand(command)
    || command.type === 'ADVANCE_TIME'
    || command.type === 'SET_DATE'
    || command.type === 'CHANGE_LOCATION'
    || command.type === 'APPLY_HIT'
    || command.type === 'TREAT_INJURY'
    || command.type === 'CONSUME_SURVIVAL'
    || command.type === 'REST';
}

function dateOrdinal(date: { year: number; month: number; day: number }): number {
  return date.year * 360 + (date.month - 1) * 30 + date.day - 1;
}

function transactionPlannedMinutes(transaction: import('../../features/world/worldRuntimeTypes').WorldTransaction): number {
  if (transaction.timeAdvanceMinutes !== undefined) return transaction.timeAdvanceMinutes;
  const advance = transaction.dateAdvance;
  if (!advance) return 0;
  return ((advance.years ?? 0) * 360 + (advance.months ?? 0) * 30 + (advance.days ?? 0)) * 1440;
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
    nextMinute: input.gameState.currentMinute,
    nextTimePrecision: input.gameState.currentTimePrecision,
    nextSeason: input.gameState.currentSeason,
    worldHistory: { ...base.worldHistory, turns },
    worldRuntime: runtime,
    health: structuredClone(input.gameState.health),
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
  if (!input.preparedWorld) {
    const base = settleLegacyTurnDraft(input);
    const dateMinutes = Math.max(0, dateOrdinal(base.nextDate) - dateOrdinal({ year: input.gameState.currentYear, month: input.gameState.currentMonth, day: input.gameState.currentDay })) * 1440;
    const plannedMinutes = totalActionMinutes(input.draft.actionPhases) || dateMinutes;
    const health = settlePlayerHealthTurn({
      gameState: input.gameState,
      lord: base.updatedLord,
      items: base.updatedLord.items,
      commands: input.draft.stateCommands,
      phases: input.draft.actionPhases,
      plannedMinutes,
      travelActive: base.activeJourney?.status === 'travelling',
    });
    const npcHealth = settleNpcHealthTurn({
      gameState: input.gameState,
      health: health.health,
      items: health.items,
      commands: input.draft.stateCommands,
      phases: input.draft.actionPhases,
      elapsedMinutes: health.elapsedMinutes,
      presentCharacterIds: input.characterContext?.presentCharacterIds,
    });
    return {
      ...base,
      updatedLord: { ...health.lord, items: npcHealth.items },
      isFatalDeath: base.isFatalDeath || health.isFatalDeath,
      health: npcHealth.health,
      nextDate: health.finalMoment.date,
      nextMinute: health.finalMoment.minuteOfDay,
      nextTimePrecision: health.elapsedMinutes > 0 ? 'exact' : input.gameState.currentTimePrecision,
      acceptedCommands: [...base.acceptedCommands, ...health.appliedCommands, ...npcHealth.appliedCommands],
      changesLog: [...base.changesLog, ...health.changes, ...npcHealth.changes, ...(health.interruptionReason ? [`行动中断：${health.interruptionReason}`] : [])],
    };
  }

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
  const plannedMinutes = transactionPlannedMinutes(prepared.transaction);
  const transactionWithoutTime = {
    ...prepared.transaction,
    dateAdvance: undefined,
    timeAdvanceMinutes: 0,
  };
  const committed = commitWorldTransaction({
    runtime: base.worldRuntime,
    items: base.updatedLord.items,
    health: input.gameState.health,
    ...(input.gameState.activeJourney ? { journey: input.gameState.activeJourney } : {}),
    date: currentDate,
    minuteOfDay: input.gameState.currentMinute,
  }, prepared.baseline, transactionWithoutTime);
  if (!committed.ok) return rejectedPreparedTurn(input, base, prepared, committed.reason);

  let healthTurn;
  try {
    healthTurn = settlePlayerHealthTurn({
      gameState: input.gameState,
      lord: { ...base.updatedLord, items: committed.state.items },
      items: committed.state.items,
      commands: input.draft.stateCommands,
      phases: input.draft.actionPhases,
      plannedMinutes,
      travelActive: prepared.transaction.nextJourney?.status === 'travelling' || input.gameState.activeJourney?.status === 'travelling',
    });
  } catch (error) {
    return rejectedPreparedTurn(input, base, prepared, error instanceof Error ? error.message : String(error));
  }
  let npcHealth: ReturnType<typeof settleNpcHealthTurn>;
  try {
    npcHealth = settleNpcHealthTurn({
      gameState: input.gameState,
      health: healthTurn.health,
      items: healthTurn.items,
      commands: input.draft.stateCommands,
      phases: input.draft.actionPhases,
      elapsedMinutes: healthTurn.elapsedMinutes,
      presentCharacterIds: input.characterContext?.presentCharacterIds,
    });
  } catch (error) {
    return rejectedPreparedTurn(input, base, prepared, error instanceof Error ? error.message : String(error));
  }
  committed.state.date = { ...healthTurn.finalMoment.date };
  committed.state.minuteOfDay = healthTurn.finalMoment.minuteOfDay;
  committed.state.items = npcHealth.items;
  committed.state.health = npcHealth.health;
  if (healthTurn.isFatalDeath) {
    const id = playerCharacterId(input.gameState);
    committed.state.runtime.characters[id] = { ...(committed.state.runtime.characters[id] ?? {}), alive: false };
  }
  for (const id of npcHealth.deadCharacterIds) {
    committed.state.runtime.characters[id] = { ...(committed.state.runtime.characters[id] ?? {}), alive: false };
  }
  if (healthTurn.interrupted && plannedMinutes > healthTurn.elapsedMinutes && input.gameState.activeJourney?.status === 'travelling') {
    const clipped = advanceJourney({
      journey: structuredClone(input.gameState.activeJourney),
      playerLocation: { ...input.gameState.lord.location },
      vehicles: structuredClone(input.gameState.lord.items.vehicles),
      itemPlacements: input.gameState.lord.items.placements,
      knownLocationIds: prepared.baseline.knownLocationIds,
      characters: [...prepared.baseline.characters.values()].map((character) => ({
        id: character.id,
        alive: character.alive,
        locationId: character.location?.locationId,
      })),
    }, healthTurn.elapsedMinutes / 1440);
    const interruptionReason = healthTurn.interruptionReason ?? '身体或补给状态要求停止';
    if (clipped.journey) clipped.journey = { ...clipped.journey, status: 'interrupted', interruptedBy: interruptionReason };
    committed.state.journey = clipped.journey;
    const playerId = playerCharacterId(input.gameState);
    committed.state.runtime.characters[playerId] = {
      ...(committed.state.runtime.characters[playerId] ?? {}),
      location: { ...clipped.playerLocation },
      currentActivity: 'idle',
    };
    for (const move of clipped.characterMoves) {
      committed.state.runtime.characters[move.characterId] = {
        ...(committed.state.runtime.characters[move.characterId] ?? {}),
        location: { locationId: move.locationId, ...(move.sceneLocation ? { sceneLocation: move.sceneLocation } : {}) },
        currentActivity: 'idle',
      };
    }
    for (const [vehicleId, location] of Object.entries(clipped.vehicleLocations)) {
      const vehicle = committed.state.items.vehicles[vehicleId];
      if (vehicle) committed.state.items.vehicles[vehicleId] = { ...vehicle, location: { ...location } };
      const assetId = worldAssetId.vehicle(vehicleId);
      committed.state.runtime.assets[assetId] = {
        ...(committed.state.runtime.assets[assetId] ?? { kind: 'vehicle' as const }),
        placement: { type: 'location', location: { ...location } },
      };
    }
    for (const event of committed.state.runtime.events) {
      if (event.transactionId !== prepared.transactionId || !event.type.startsWith('travel.')) continue;
      event.type = 'travel.progress';
      event.location = { ...clipped.playerLocation };
      event.subjectRefs = event.subjectRefs.map((subject) => subject.type === 'location' ? { type: 'location', location: { ...clipped.playerLocation } } : subject);
      event.reason = `旅程推进 ${healthTurn.elapsedMinutes} 分钟后中断：${interruptionReason}`;
    }
  } else if (healthTurn.interrupted && committed.state.journey?.status === 'travelling') {
    committed.state.journey = { ...committed.state.journey, status: 'interrupted', interruptedBy: healthTurn.interruptionReason ?? '身体或补给状态要求停止' };
  }

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
    ...healthTurn.lord,
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
  const acceptedCommands = [...base.acceptedCommands, ...prepared.acceptedCommands, ...healthTurn.appliedCommands, ...npcHealth.appliedCommands];
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
    isFatalDeath: base.isFatalDeath || healthTurn.isFatalDeath,
    acceptedCommands,
    rejectedCommands,
    changesLog: [...base.changesLog, ...healthTurn.changes, ...npcHealth.changes, ...(healthTurn.interruptionReason ? [`行动中断：${healthTurn.interruptionReason}`] : []), ...scheduler.roleplayChanges, ...committedEvents.map((event) => stripEmoji(event.reason))],
    nextDate: { ...scheduler.finalDate },
    nextMinute: healthTurn.finalMoment.minuteOfDay,
    nextTimePrecision: healthTurn.elapsedMinutes > 0 ? 'exact' : input.gameState.currentTimePrecision,
    nextSeason: deriveSeason(scheduler.finalDate.month),
    worldHistory: { ...scheduler.history, turns },
    worldRuntime: runtime,
    health: healthTurn.health,
    resolvedFacts: {
      ...base.resolvedFacts,
      resolvedOn: { ...scheduler.finalDate },
      acceptedCommands,
      changes: [...base.resolvedFacts.changes, ...healthTurn.changes, ...scheduler.roleplayChanges, ...committedEvents.map((event) => stripEmoji(event.reason))],
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
