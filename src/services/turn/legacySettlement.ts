import type { ResolvedTurnFacts, SettleTurnDraftInput, SettledTurn } from './resolutionTypes';
import { buildTravelBaseline, isTravelCommandType } from './worldPreparation';
import { commandFacts, deriveSeason, playerCharacterId, travelFactText, worldEventAsFact, worldEventFromFact } from './settlementFacts';
import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { mergePendingWorldItemCommands } from '../../features/items/itemActionQueue';
import type { ItemStateCommand } from '../../features/items/types';
import type { CharacterEventInput } from '../../features/characters/characterEventStore';
import type { CharacterId } from '../../features/characters/types';
import { resolveDueCanonicalEvents } from '../../features/world/canonicalTimeline';
import {
  advanceWorldDate,
  appendWorldTurn,
  setWorldDateForward,
  type CanonicalEventState,
  type RejectedWorldCommand,
  type WorldDate,
  type WorldEventFact,
  type WorldHistoryState,
} from '../../features/world/worldHistory';
import type { LordProfile, StateCommand } from '../../types/game';
import {
  applyStateCommands,
  isCharacterStateCommand,
  validateCharacterCommandBatch,
  type CharacterCommandBatchBaseContext,
} from '../stateReducer';
import { stripEmoji } from '../textSanitizer';
import { createWorldLocationRef, fallbackLocationLabel, validateWorldLocationRef } from '../../features/map/locationResolver';
import type { WorldLocationRef } from '../../features/map/types';
import { advanceJourney } from '../../features/map/travel/journeyReducer';
import { applyTravelCommands, isTravelStateCommand } from '../../features/map/travel/travelCommands';
import type { ActiveJourney, TravelStateCommand } from '../../features/map/travel/types';
import type { WorldEvent, WorldEventSource, WorldRuntimeState } from '../../features/world/worldRuntimeTypes';
import { settleWorldTransactionStatus } from '../../features/world/worldTransactionQueue';
import { worldAssetId } from '../../features/world/worldBaseline';
import { commitWorldTransaction } from '../../features/world/worldTransactions';
import { planJourneyTransaction } from '../../features/world/worldTravelRules';
import { projectWorldCharacter, resolveAssetMapLocation } from '../../features/world/worldProjection';

function parseRoleplayDate(value: string): WorldDate | undefined {
  const match = /^(\d{1,6})\.(\d{1,2})\.(\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return Number.isInteger(date.year) && date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 30 ? date : undefined;
}

function dateOrdinal(date: WorldDate): number {
  return date.year * 360 + (date.month - 1) * 30 + date.day - 1;
}

function earliestPlayerDeadline(gameState: SettleTurnDraftInput['gameState'], after: WorldDate, before: WorldDate): { date: WorldDate; label: string } | undefined {
  const playerId = playerCharacterId(gameState);
  const candidates: Array<{ value?: string; label: string }> = [
    ...(gameState.roleplay?.messages ?? []).filter((entry) => entry.status === 'in_transit' && (entry.senderId === playerId || entry.recipientIds.includes(playerId))).map((entry) => ({ value: entry.arrivesOn, label: `消息送达：${entry.summary}` })),
    ...(gameState.roleplay?.agendas ?? []).filter((entry) => entry.status === 'scheduled' && entry.heardByIds.includes(playerId)).map((entry) => ({ value: entry.dueDate, label: `议程到期：${entry.summary}` })),
    ...(gameState.roleplay?.projects ?? []).filter((entry) => entry.status === 'active' && (entry.ownerId === playerId || entry.assigneeId === playerId)).map((entry) => ({ value: entry.dueDate, label: `委派到期：${entry.objective}` })),
    ...(gameState.roleplay?.commitments ?? []).filter((entry) => entry.status === 'open' && (entry.debtorId === playerId || entry.creditorIds.includes(playerId))).map((entry) => ({ value: entry.dueDate, label: `承诺期限：${entry.terms}` })),
  ];
  return candidates.map((entry) => ({ date: entry.value ? parseRoleplayDate(entry.value) : undefined, label: entry.label }))
    .filter((entry): entry is { date: WorldDate; label: string } => Boolean(entry.date))
    .filter((entry) => dateOrdinal(entry.date) > dateOrdinal(after) && dateOrdinal(entry.date) < dateOrdinal(before))
    .sort((left, right) => dateOrdinal(left.date) - dateOrdinal(right.date))[0];
}

function growthMutationRejection(
  command: Extract<StateCommand, { type: 'MODIFY_STAT' | 'ADD_TRAIT' }>,
  commands: readonly StateCommand[],
  gameState: SettleTurnDraftInput['gameState'],
): string | undefined {
  const opportunityId = command.growthChoiceId?.trim();
  const optionId = command.growthOptionId?.trim();
  if (!opportunityId || !optionId) return '永久属性与特质成长必须引用一个未消费的成长机会与明确选项';
  const opportunity = (gameState.roleplay?.growthOpportunities ?? []).find((entry) => entry.id === opportunityId);
  if (!opportunity || opportunity.status !== 'open') return '成长机会不存在或已经使用';
  const option = opportunity.options.find((entry) => entry.id === optionId);
  if (!option) return '成长选项不存在';
  const claim = commands.find((candidate) => candidate.type === 'CLAIM_GROWTH_CHOICE'
    && candidate.actorId === playerCharacterId(gameState)
    && candidate.opportunityId === opportunityId
    && candidate.optionId === optionId);
  if (!claim) return '成长必须由玩家在本回合明确确认该成长选项';
  if (command.type === 'MODIFY_STAT') {
    if (option.effect.kind !== 'stat' || option.effect.stat !== command.stat || option.effect.delta !== command.delta) {
      return '属性变更与玩家选择的成长效果不一致';
    }
    return undefined;
  }
  if (option.effect.kind !== 'trait' || option.effect.traitId !== command.trait) return '特质变更与玩家选择的成长效果不一致';
  if ((gameState.lord.traitIds ?? []).includes(command.trait)) return '玩家已经拥有该成长特质';
  return undefined;
}


export function settleLegacyTurnDraft(input: SettleTurnDraftInput): SettledTurn {
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
  let interruptedByDeadline: string | undefined;
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
      const payableTravelCommands = travelCommands.filter((command) => {
        if (command.type !== 'START_TRAVEL') return true;
        const route = command.routePlan ?? activeJourney?.routePlan;
        const silverCost = route ? Math.max(0, Math.ceil(route.totalCost)) : 0;
        if (silverCost <= gameState.lord.silverStags) return true;
        travelRejected.add(command);
        rejectedCommands.push({ type: command.type, reason: `旅费不足：需要 ${silverCost} 银鹿，当前只有 ${gameState.lord.silverStags}` });
        return false;
      });
      const result = applyTravelCommands(activeJourney, payableTravelCommands, {
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
  const rejectedLordCommands = new Set<StateCommand>();
  const treatmentItems = new Set<string>();
  let repairCount = 0;
  for (const command of acceptedCommands) {
    let reason: string | undefined;
    if (command.type === 'HEAL_ZONE') reason = '治疗必须消耗当前可访问的医疗物品';
    else if (command.type === 'CHANGE_TITLE') reason = '头衔必须通过受权的世界头衔事务变更';
    else if (command.type === 'MODIFY_STAT' || command.type === 'ADD_TRAIT') reason = growthMutationRejection(command, acceptedCommands, gameState);
    else if (command.type === 'MODIFY_GOLD') {
      const goldDelta = Math.round(command.goldDragons ?? 0);
      const silverDelta = Math.round(command.silverStags ?? 0);
      if (goldDelta > 0 || silverDelta > 0) reason = '正向资金入账必须来自受验证的交易、报酬或世界资产事务，不能由通用数值命令直接创造';
      else if ((goldDelta !== 0 || silverDelta !== 0) && !command.reason?.trim()) reason = '资金支出必须说明可追溯用途';
    }
    else if (command.type === 'ITEM_REPAIR') reason = '旧式即时修理已停用，必须使用带工具、费用与耗时的 REPAIR_ITEM';
    else if ((command.type === 'ITEM_TRANSFER' || command.type === 'ITEM_GIFT' || command.type === 'ITEM_DISCARD')
      && gameState.lord.items.placements[command.instanceId]?.type === 'equipped') reason = '装备必须先通过 ITEM_UNEQUIP 明确卸下去向';
    else if ((command.type === 'SET_BLEEDING' || command.type === 'SET_POISONED' || command.type === 'SET_INFECTED') && !command.value) {
      reason = '恢复异常状态必须通过消耗物资的治疗事务';
    } else if (command.type === 'TREAT_WOUND') {
      const conflictsWithItemCommand = acceptedCommands.some((candidate) => candidate !== command
        && candidate.type.startsWith('ITEM_')
        && 'instanceId' in candidate
        && candidate.instanceId === command.instanceId);
      if (treatmentItems.has(command.instanceId)) reason = '同一医疗物品每回合只能用于一次治疗';
      else if (conflictsWithItemCommand) reason = '治疗物品不能在同一回合同时执行其他物品动作';
      else {
        treatmentItems.add(command.instanceId);
        const preview = applyStateCommands(gameState.lord, [command]);
        const failed = preview.changesLog.find((entry) => entry.includes('治疗未执行'));
        if (failed) reason = failed.replace(/^\s*/, '');
      }
    } else if (command.type === 'ITEM_GIFT') {
      const consent = gameState.roleplay?.socialEvents.find((event) => event.id === command.consentEventId);
      const playerId = playerCharacterId(gameState);
      if (!consent || consent.act !== 'accept') reason = '赠礼必须引用受赠者此前明确接受的社会事件';
      else if (consent.actorId !== command.recipientId || !consent.targetIds.includes(playerId)) reason = '接受事件的当事人与本次赠礼不一致';
      else if (!consent.exchangeId || consent.exchangeId !== command.exchangeId) reason = '赠礼必须与接受事件使用同一交涉 ID';
    } else if (command.type === 'REPAIR_ITEM') {
      repairCount += 1;
      const hasTravelAction = acceptedCommands.some((candidate) => isTravelStateCommand(candidate));
      const hasTemporalAction = acceptedCommands.some((candidate) => candidate.type === 'ADVANCE_TIME' || candidate.type === 'SET_DATE');
      const conflicts = acceptedCommands.some((candidate) => candidate !== command
        && ((candidate.type.startsWith('ITEM_') && 'instanceId' in candidate
          && (candidate.instanceId === command.instanceId || candidate.instanceId === command.toolInstanceId))
          || (candidate.type === 'REPAIR_ITEM'
            && (candidate.instanceId === command.instanceId || candidate.toolInstanceId === command.toolInstanceId))));
      if (repairCount > 1) reason = '每回合只能结算一次修理';
      else if (hasTravelAction) reason = '修理与启程、改道或推进旅程不能在同一回合结算';
      else if (hasTemporalAction) reason = '修理已自带耗时，不能与其他时间命令重复结算';
      else if (conflicts) reason = '修理目标或工具不能在同一回合参与其他物品动作';
      else {
        const preview = applyStateCommands(gameState.lord, [command]);
        const failed = preview.changesLog.find((entry) => entry.includes('修理未执行'));
        if (failed) reason = failed.replace(/^\s*/, '');
      }
    } else if (command.type === 'BUY_CATALOG_ITEM' || command.type === 'SELL_ITEM') {
      const counterpartyId = command.type === 'BUY_CATALOG_ITEM' ? command.sellerId : command.buyerId;
      const consent = gameState.roleplay?.socialEvents.find((event) => event.id === command.consentEventId);
      const playerId = playerCharacterId(gameState);
      const itemInstanceId = command.type === 'BUY_CATALOG_ITEM' ? command.instanceId : command.instanceId;
      const conflicts = acceptedCommands.some((candidate) => candidate !== command
        && ((candidate.type.startsWith('ITEM_') && 'instanceId' in candidate && candidate.instanceId === itemInstanceId)
          || ((candidate.type === 'BUY_CATALOG_ITEM' || candidate.type === 'SELL_ITEM') && candidate.instanceId === itemInstanceId)));
      if (!consent || consent.act !== 'accept' || consent.actorId !== counterpartyId || !consent.targetIds.includes(playerId)) reason = '交易必须引用交易对手此前明确接受的社会事件';
      else if (!consent.exchangeId || consent.exchangeId !== command.exchangeId) reason = '交易必须与接受事件使用同一交涉 ID';
      else if (conflicts) reason = '同一商品不能在同一回合参与多个物品事务';
      else {
        const preview = applyStateCommands(gameState.lord, [command]);
        const failed = preview.changesLog.find((entry) => entry.includes('交易未执行'));
        if (failed) reason = failed.replace(/^\s*/, '');
      }
    }
    if (reason) {
      rejectedLordCommands.add(command);
      rejectedCommands.push({ type: command.type, reason });
    }
  }

  const deadline = earliestPlayerDeadline(gameState, currentDate, nextDate);
  if (deadline) {
    nextDate = deadline.date;
    nextSeason = deriveSeason(nextDate.month);
    interruptedByDeadline = deadline.label;
  }
  if (rejectedLordCommands.size) acceptedCommands = acceptedCommands.filter((command) => !rejectedLordCommands.has(command));
  const acceptedRepair = acceptedCommands.find((command) => command.type === 'REPAIR_ITEM');
  if (!setDate && !advanceTime && !explicitTravelAdvance && acceptedRepair?.type === 'REPAIR_ITEM') {
    nextDate = advanceWorldDate(currentDate, { days: acceptedRepair.days });
    nextSeason = deriveSeason(nextDate.month);
  }
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
  if (interruptedByDeadline) changesLog.push(`时间停在待回应节点：${interruptedByDeadline}`);
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

      const startedTravel = acceptedTravelCommands.find((command) => command.type === 'START_TRAVEL');
      if (startedTravel?.type === 'START_TRAVEL') {
        const route = startedTravel.routePlan ?? activeJourney?.routePlan;
        const silverCost = route ? Math.max(0, Math.ceil(route.totalCost)) : 0;
        if (silverCost > 0) {
          updatedLord = { ...updatedLord, silverStags: updatedLord.silverStags - silverCost };
          changesLog.push(`支付旅行补给: -${silverCost} 银鹿`);
        }
      }

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
