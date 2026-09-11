import type { CharacterId } from '../characters/types';
import type { AtomicWorldPatch, JourneyWorldState, TravelStateCommand } from '../map/travel/types';
import { advanceJourney } from '../map/travel/journeyReducer';
import { applyTravelCommands } from '../map/travel/travelCommands';
import type { RoutePlan } from '../map/routing/types';
import { worldAssetId } from './worldBaseline';
import type { WorldDate } from './worldHistory';
import type { WorldEventSource, WorldTransaction } from './worldRuntimeTypes';

export interface WorldTravelRuleContext {
  playerId: CharacterId;
  turn: number;
  transactionId: string;
  source: WorldEventSource;
  reason: string;
  currentDate: WorldDate;
}

function travelActivity(patch: AtomicWorldPatch): 'idle' | 'travelling' {
  return patch.journey?.status === 'travelling' ? 'travelling' : 'idle';
}

export function planJourneyTransaction(
  patch: AtomicWorldPatch,
  context: WorldTravelRuleContext,
): WorldTransaction {
  if (!context.transactionId.trim()) throw new Error('旅行事务 ID 不能为空');
  if (!context.reason.trim()) throw new Error('旅行事务原因不能为空');
  if (!Number.isInteger(context.turn) || context.turn < 0) throw new Error('旅行事务回合不合法');
  if (!Number.isFinite(patch.elapsedDays) || patch.elapsedDays < 0) throw new Error('旅行推进时长无效');

  const activity = travelActivity(patch);
  const participantIds = [...new Set([context.playerId, ...patch.characterMoves.map((move) => move.characterId)])];
  const vehicleAssetIds = Object.keys(patch.vehicleLocations).map(worldAssetId.vehicle);
  const mutations: WorldTransaction['mutations'] = [
    {
      type: 'character.move',
      characterId: context.playerId,
      location: { ...patch.playerLocation },
      activity,
    },
    ...patch.characterMoves.map((move) => ({
      type: 'character.move' as const,
      characterId: move.characterId,
      location: {
        locationId: move.locationId,
        ...(move.sceneLocation ? { sceneLocation: move.sceneLocation } : {}),
      },
      activity,
    })),
    ...Object.entries(patch.vehicleLocations).map(([vehicleId, location]) => ({
      type: 'asset.place' as const,
      assetId: worldAssetId.vehicle(vehicleId),
      placement: { type: 'location' as const, location: { ...location } },
    })),
  ];

  return {
    id: context.transactionId,
    turn: context.turn,
    source: context.source,
    reason: context.reason,
    intents: [{
      kind: patch.journey?.status === 'arrived' ? 'arrive' : 'advance_travel',
      actorId: context.playerId,
      targetRef: { type: 'location', location: { ...patch.playerLocation } },
      ...(patch.elapsedDays > 0 ? { elapsedTime: { days: patch.elapsedDays } } : {}),
      evidenceText: context.reason,
    }],
    mutations,
    ...(patch.elapsedDays > 0 ? { timeAdvanceMinutes: Math.round(patch.elapsedDays * 1440) } : {}),
    nextJourney: patch.journey ? structuredClone(patch.journey) : null,
    eventDrafts: [{
      type: patch.journey?.status === 'arrived' ? 'travel.arrived' : 'travel.progress',
      actorIds: participantIds,
      subjectRefs: [
        ...participantIds.map((characterId) => ({ type: 'character' as const, characterId })),
        ...vehicleAssetIds.map((assetId) => ({ type: 'asset' as const, assetId })),
        { type: 'location' as const, location: { ...patch.playerLocation } },
      ],
      location: { ...patch.playerLocation },
      reason: context.reason,
      visibility: 'public',
    }],
  };
}

export interface ExplicitArrivalPlanInput {
  world: JourneyWorldState;
  routePlan: RoutePlan;
  declaredElapsedDays: number;
  assertedDeparture: boolean;
  assertedArrival: boolean;
  companions?: CharacterId[];
  vehicleIds?: string[];
  locationLabels?: Record<string, string>;
}

export function planExplicitArrivalTransaction(
  input: ExplicitArrivalPlanInput,
  context: WorldTravelRuleContext,
): WorldTransaction {
  if (!Number.isInteger(input.declaredElapsedDays) || input.declaredElapsedDays < 0) {
    throw new Error('声明的旅行时长必须是非负整数');
  }
  if (input.routePlan.from !== input.world.playerLocation.locationId) {
    throw new Error('显式抵达路线必须从人物当前位置开始');
  }
  if (input.assertedArrival && !input.assertedDeparture && input.declaredElapsedDays < input.routePlan.totalDays) {
    throw new Error('没有有效出发事实或足够时间，不能直接抵达');
  }

  const startCommand: TravelStateCommand = {
    type: 'START_TRAVEL',
    routePlan: structuredClone(input.routePlan),
    companions: [...new Set(input.companions ?? [])],
    vehicleIds: [...new Set(input.vehicleIds ?? [])],
    ...(input.locationLabels ? { locationLabels: { ...input.locationLabels } } : {}),
  };
  const started = applyTravelCommands(input.world.journey, [startCommand], {
    currentLocation: input.world.playerLocation,
    currentDate: context.currentDate,
    knownLocationIds: input.world.knownLocationIds,
  });
  if (started.rejected.length || !started.journey) {
    throw new Error(started.rejected[0]?.reason ?? '旅行无法开始');
  }
  const journeyPatch = advanceJourney({ ...input.world, journey: started.journey }, input.declaredElapsedDays);
  const patch = { ...journeyPatch, elapsedDays: input.declaredElapsedDays };
  if (input.assertedArrival && input.declaredElapsedDays >= input.routePlan.totalDays && patch.journey?.status !== 'arrived') {
    throw new Error('声明时间足够但路线未能合法抵达');
  }
  if (input.assertedArrival && input.declaredElapsedDays < input.routePlan.totalDays && !input.assertedDeparture) {
    throw new Error('声明时间不足，不能直接抵达');
  }
  return planJourneyTransaction(patch, context);
}
