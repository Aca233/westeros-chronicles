import type { PreparedWorldTurn, ResolvedTurnFacts, SettleTurnDraftInput, SettledTurn, TurnResolutionDraft } from './turn/resolutionTypes';
import { buildTravelBaseline, isTravelCommandType } from './turn/worldPreparation';
import { commandFacts, committedNarrationContext, deriveSeason, playerCharacterId, travelFactText, worldEventAsFact, worldEventFromFact } from './turn/settlementFacts';
import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import { mergePendingWorldItemCommands } from '../features/items/itemActionQueue';
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
import { WORLD_INTENT_RESOLUTION_PROMPT } from './promptBuilder';
import { extractJsonArrayFromXml, requestTurnResolutionCompletion } from './api';
import {
  parseUnresolvedWorldIntents,
  type UnresolvedWorldIntent,
} from '../features/world/worldIntentResolver';
import { createWorldLocationRef, validateWorldLocationRef } from '../features/map/locationResolver';
import type { WorldLocationRef } from '../features/map/types';
import { fallbackLocationLabel } from '../features/map/locationResolver';
import { advanceJourney } from '../features/map/travel/journeyReducer';
import { applyTravelCommands, isTravelStateCommand } from '../features/map/travel/travelCommands';
import type { ActiveJourney, TravelStateCommand } from '../features/map/travel/types';
import type { PendingWorldTransaction, WorldEvent, WorldEventSource, WorldRuntimeState } from '../features/world/worldRuntimeTypes';
import { settleWorldTransactionStatus } from '../features/world/worldTransactionQueue';
import { buildWorldAssetBaseline, createWorldBaselineSnapshot, worldAssetId, type WorldBaselineSnapshot } from '../features/world/worldBaseline';
import { commitWorldTransaction } from '../features/world/worldTransactions';
import { planJourneyTransaction } from '../features/world/worldTravelRules';
import { planExplicitArrivalTransaction } from '../features/world/worldTravelRules';
import { projectWorldCharacter, resolveAssetMapLocation } from '../features/world/worldProjection';
import { resolveWorldIntents, type RejectedWorldIntent, type ResolvedLocationWorldIntent } from '../features/world/worldIntentResolver';
import { planAssetIntent } from '../features/world/worldAssetRules';
import { planTitleIntent } from '../features/world/worldTitleRules';
import type { MapLocationSearchEntry, SemanticMembership } from '../features/map/types';
import type { RoutePlan, RouteRequest } from '../features/map/routing/types';
import { RouteClient } from '../features/map/routing/routeClient';
import { mapRepository } from '../features/map/repository';
import type { AssetWorldIntent, WorldIntent, WorldMutation, WorldTransaction } from '../features/world/worldRuntimeTypes';

function settleLegacyTurnDraft(input: SettleTurnDraftInput): SettledTurn {
  const { gameState } = input;
  const submittedTransactions = input.pendingTransactions ?? [];
  const parsedCommands = input.draft.stateCommands ?? [];
  const modelItemCommands = parsedCommands.filter((command): command is ItemStateCommand => command.type.startsWith('ITEM_'));
  const nonItemCommands = parsedCommands.filter((command) => !command.type.startsWith('ITEM_'));
  const stateCommands: StateCommand[] = [
    ...mergePendingWorldItemCommands(submittedTransactions, modelItemCommands),
    ...submittedTransactions.flatMap((transaction) => transaction.status === 'pending' ? transaction.travelCommands ?? [] : []),
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

  let travelRuntime = gameState.worldRuntime;
  let travelWorldEvents: WorldEvent[] = [];
  let travelTransactionCommitted = false;
  const acceptedTravelCommands = acceptedCommands.filter(isTravelStateCommand);
  const shouldCommitJourney = Boolean(knownLocationIds && (acceptedTravelCommands.length > 0 || shouldAutoAdvance));

  if (shouldCommitJourney && knownLocationIds) {
    try {
      const patch = shouldAutoAdvance && activeJourney
        ? {
            ...advanceJourney({
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
            }, elapsedDays),
            elapsedDays,
          }
        : {
            journey: activeJourney ? structuredClone(activeJourney) : undefined,
            playerLocation: { ...updatedLord.location },
            vehicleLocations: {},
            characterMoves: [],
            reachedLocationIds: [],
            elapsedDays: 0,
            changed: acceptedTravelCommands.length > 0,
          };
      const baseline = buildTravelBaseline(gameState, updatedLord, characterContext, knownLocationIds);
      const queuedTravel = submittedTransactions.find((transaction) => transaction.status === 'pending'
        && transaction.travelCommands?.some((command) => acceptedTravelCommands.includes(command)));
      const transaction = planJourneyTransaction(patch, {
        playerId: playerCharacterId(gameState),
        turn: input.nextTurnNumber,
        transactionId: queuedTravel?.id ?? `turn:${input.nextTurnNumber}:travel`,
        source: queuedTravel?.source ?? 'ai_resolution',
        reason: stripEmoji(input.actionText) || '旅行状态更新',
        currentDate,
      });
      const committed = commitWorldTransaction({
        runtime: gameState.worldRuntime,
        items: updatedLord.items,
        ...(gameState.activeJourney ? { journey: gameState.activeJourney } : {}),
        date: currentDate,
      }, baseline, transaction);
      if (!committed.ok) throw new Error(committed.reason);

      travelRuntime = committed.state.runtime;
      travelWorldEvents = committed.events;
      travelTransactionCommitted = true;
      activeJourney = committed.state.journey;
      nextDate = committed.state.date;
      nextSeason = deriveSeason(nextDate.month);

      const projectedPlayer = projectWorldCharacter(baseline, travelRuntime, playerCharacterId(gameState));
      if (!projectedPlayer?.location) throw new Error('旅行提交后玩家地点未能投影');
      const locationName = activeJourney?.locationLabels?.[projectedPlayer.location.locationId];
      const resolvedLocationLabel = locationName
        ? projectedPlayer.location.sceneLocation ? `${locationName} · ${projectedPlayer.location.sceneLocation}` : locationName
        : fallbackLocationLabel(projectedPlayer.location);
      updatedLord = {
        ...updatedLord,
        location: { ...projectedPlayer.location },
        locationLabel: resolvedLocationLabel,
        items: {
          ...committed.state.items,
          vehicles: Object.fromEntries(Object.entries(committed.state.items.vehicles).map(([id, vehicle]) => {
            const location = resolveAssetMapLocation(baseline, travelRuntime, worldAssetId.vehicle(id));
            if (!location) return [id, vehicle];
            const label = activeJourney?.locationLabels?.[location.locationId] ?? fallbackLocationLabel(location);
            return [id, { ...vehicle, location: { ...location }, locationLabel: label }];
          })),
        },
      };

      const moves = new Map(patch.characterMoves.map((move) => [move.characterId, move]));
      characterContext = {
        ...characterContext,
        currentLocationId: updatedLord.location.locationId,
        presentCharacterIds: patch.reachedLocationIds.length
          ? new Set(patch.characterMoves.map((move) => move.characterId))
          : characterContext.presentCharacterIds,
        characters: characterContext.characters.map((character) => {
          const move = moves.get(character.id);
          return move
            ? { ...character, locationId: move.locationId, sceneLocation: move.sceneLocation }
            : character;
        }),
      };
      if (patch.changed) {
        changesLog.push(activeJourney?.status === 'arrived'
          ? `旅程抵达: 【${updatedLord.locationLabel}】`
          : patch.elapsedDays > 0
            ? `旅程推进: ${patch.elapsedDays} 天`
            : '旅程状态已经更新');
      }
    } catch (error) {
      const reason = stripEmoji(error instanceof Error ? error.message : '旅行状态验证失败');
      travelRuntime = gameState.worldRuntime;
      travelWorldEvents = [];
      travelTransactionCommitted = false;
      activeJourney = gameState.activeJourney ? structuredClone(gameState.activeJourney) : undefined;
      nextDate = currentDate;
      nextSeason = gameState.currentSeason;
      const rejectedTypes = new Set<string>();
      acceptedTravelCommands.forEach((command) => {
        rejectedTypes.add(command.type);
        rejectedCommands.push({ type: command.type, reason });
      });
      if (shouldAutoAdvance && !rejectedTypes.has('ADVANCE_TRAVEL')) {
        rejectedCommands.push({ type: 'ADVANCE_TRAVEL', reason });
      }
      acceptedCommands = acceptedCommands.filter((command) => !isTravelStateCommand(command)
        && command.type !== 'ADVANCE_TIME'
        && command.type !== 'SET_DATE');
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
  const transactionId = `turn:${input.nextTurnNumber}`;
  const commandEvents = facts
    .filter((fact) => !travelTransactionCommitted || !fact.commandTypes.some(isTravelCommandType))
    .map((fact) => worldEventFromFact(fact, transactionId));
  const canonicalResolution = resolveDueCanonicalEvents(
    gameState.worldHistory,
    input.timeline ?? CANONICAL_TIMELINE,
    currentDate,
    nextDate,
    [...travelRuntime.events, ...commandEvents],
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
  const timelineEvents = timelineFacts.map((fact) => worldEventFromFact(fact, transactionId));
  const appendedTurnEvents = [...commandEvents, ...timelineEvents];
  const turnEvents = [...travelWorldEvents, ...appendedTurnEvents];
  let pendingTransactions = travelRuntime.pendingTransactions;
  const itemBatchFailure = changesLog.find((entry) => entry.includes('[物品] 批次未结算'));
  for (const transaction of submittedTransactions) {
    const commandTypes = new Set<string>([
      ...(transaction.itemCommands ?? []).map((command) => command.type),
      ...(transaction.travelCommands ?? []).map((command) => command.type),
    ]);
    const rejection = rejectedCommands.find((entry) => commandTypes.has(entry.type));
    const reason = transaction.itemCommands?.length && itemBatchFailure
      ? itemBatchFailure
      : rejection?.reason;
    pendingTransactions = settleWorldTransactionStatus(
      pendingTransactions,
      transaction.id,
      reason ? 'rejected' : 'committed',
      reason,
    );
  }
  const worldRuntime: WorldRuntimeState = {
    ...travelRuntime,
    revision: gameState.worldRuntime.revision + 1,
    events: [...travelRuntime.events, ...appendedTurnEvents],
    pendingTransactions,
  };
  const worldHistory = appendWorldTurn(canonicalResolution.history, {
    turn: input.nextTurnNumber,
    action: resolvedFacts.action,
    startedOn: currentDate,
    resolvedOn: nextDate,
    acceptedCommands,
    rejectedCommands,
    eventIds: turnEvents.map((event) => event.id),
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
    worldRuntime,
    resolvedFacts,
    activeJourney,
    transactionId,
    worldLocation: { ...updatedLord.location },
    narrationContext: '',
  };
}

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

  const canonicalResolution = resolveDueCanonicalEvents(
    base.worldHistory,
    input.timeline ?? CANONICAL_TIMELINE,
    currentDate,
    committed.state.date,
    committed.state.runtime.events,
  );
  const timelineFacts: WorldEventFact[] = canonicalResolution.dueEvents.map((event) => {
    const transition = canonicalResolution.transitions.find((entry) => entry.eventId === event.id);
    const occurred = transition?.status === 'occurred';
    return {
      id: `timeline:${event.id}:${input.nextTurnNumber}`,
      turn: input.nextTurnNumber,
      date: occurred ? { ...event.date } : { ...committed.state.date },
      source: 'timeline',
      kind: occurred ? 'timeline.occurred' : 'timeline.diverged',
      title: event.title,
      summary: occurred ? event.summary : transition?.reason ?? event.summary,
      participantIds: event.participants.flatMap((person) => person.characterId ? [person.characterId] : []),
      commandTypes: [],
      canonicalEventId: event.id,
    };
  });
  const timelineEvents = timelineFacts.map((fact) => worldEventFromFact(fact, prepared.transactionId));
  let runtime = {
    ...withPendingStatuses(committed.state.runtime, input.pendingTransactions, 'committed'),
    // The ledger revision belongs to the narrative turn, not to each internal
    // transaction committed while resolving that turn.
    revision: base.worldRuntime.revision,
    events: [...committed.state.runtime.events, ...timelineEvents],
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
  const committedEvents = [...committed.events, ...timelineEvents];
  const worldFacts = committedEvents.map(worldEventAsFact);
  const acceptedCommands = [...base.acceptedCommands, ...prepared.acceptedCommands];
  const rejectedCommands = [...base.rejectedCommands, ...locationRejections];
  const turns = canonicalResolution.history.turns.map((turn, index, entries) => index === entries.length - 1
    ? {
        ...turn,
        resolvedOn: { ...committed.state.date },
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
    changesLog: [...base.changesLog, ...committedEvents.map((event) => stripEmoji(event.reason))],
    nextDate: { ...committed.state.date },
    nextSeason: deriveSeason(committed.state.date.month),
    worldHistory: { ...canonicalResolution.history, turns },
    worldRuntime: runtime,
    resolvedFacts: {
      ...base.resolvedFacts,
      resolvedOn: { ...committed.state.date },
      acceptedCommands,
      changes: [...base.resolvedFacts.changes, ...committedEvents.map((event) => stripEmoji(event.reason))],
      facts: [...base.resolvedFacts.facts, ...worldFacts],
      canonicalTransitions: canonicalResolution.transitions,
    },
    activeJourney: committed.state.journey,
    transactionId: committed.transactionId,
    worldLocation: { ...projectedPlayer.location },
    narrationContext,
  };
}

export * from './turn/resolutionTypes';
export { parseTurnResolutionOutput, buildTurnResolutionMessages, requestTurnResolution } from './turn/resolutionProtocol';
export { prepareWorldTurn } from './turn/worldPreparation';
