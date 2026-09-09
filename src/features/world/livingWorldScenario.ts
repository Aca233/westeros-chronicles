import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import { advanceWorldDate } from './worldHistory.ts';
import type { LivingWorldState } from './livingWorldContracts';
import type { WorldEvent } from './worldRuntimeTypes';

export const RIVERLANDS_CRISIS = {
  scenarioId: 'gameplay:riverlands-old-ferry-grain-crisis-v1',
  locations: {
    sourceSettlement: 'b_runnymudd',
    sourceCastle: 'b_castle_runny',
    ferry: 'b_old_ferry',
    alternateFord: 'b_ramsford',
    market: 'b_fairmarket',
    nearbyVillage: 'b_elmbridge_wood',
    nearbyBridgeKeep: 'b_elmbridge_keep',
  },
  actors: {
    runnymuddHolder: 'agot:Runny_69' as CharacterId,
    ramsfordHolder: 'agot:Temper_40' as CharacterId,
  },
  roads: {
    sourceToFerry: 'b_runnymudd>b_old_ferry',
    ferryToFord: 'b_old_ferry>b_ramsford',
    fordToMarket: 'b_ramsford>b_fairmarket',
    sourceToCastle: 'b_runnymudd>b_castle_runny',
    castleToFord: 'b_castle_runny>b_ramsford',
  },
  situations: {
    blockade: 'situation:old-ferry-blockade',
    shortage: 'situation:fairmarket-grain-shortage',
  },
  actions: {
    shipment: 'action:runnymudd-fairmarket-grain-1',
  },
  stockpile: 'stockpile:fairmarket-grain',
} as const;

function route(id: string, from: string, to: string, kind: 'road' | 'ford' | 'ferry', open: boolean, date: WorldDate, blockedReason?: string) {
  return { id, from: { locationId: from }, to: { locationId: to }, kind, open, updatedAt: { ...date }, ...(blockedReason ? { blockedReason } : {}) };
}

export function createRiverlandsCrisisLivingWorld(startDate: WorldDate): LivingWorldState {
  const nextDay = advanceWorldDate(startDate, { days: 1 });
  const { locations, actors, roads, situations, actions } = RIVERLANDS_CRISIS;
  const blockadeEventId = 'scenario:riverlands:old-ferry:blockade-declared';
  const shipmentEventId = 'scenario:riverlands:grain-shipment:dispatched';
  return {
    schemaVersion: 1,
    scenarioId: RIVERLANDS_CRISIS.scenarioId,
    connections: {
      roads: [
        route(roads.sourceToFerry, locations.sourceSettlement, locations.ferry, 'ferry', true, startDate),
        route(roads.ferryToFord, locations.ferry, locations.alternateFord, 'ferry', false, startDate, '玩法情境：老渡口被地方武装封锁'),
        route(roads.fordToMarket, locations.alternateFord, locations.market, 'ford', true, startDate),
        route(roads.sourceToCastle, locations.sourceSettlement, locations.sourceCastle, 'road', true, startDate),
        route(roads.castleToFord, locations.sourceCastle, locations.alternateFord, 'ford', true, startDate),
      ],
      supplyLinks: [
        {
          id: 'supply:runnymudd-to-fairmarket:grain',
          source: { locationId: locations.sourceSettlement },
          destination: { locationId: locations.market },
          commodity: 'grain',
          dailyCapacity: 24,
          blockedBy: situations.blockade,
        },
      ],
      authorityLinks: [
        { id: 'authority:runnymudd:investigate', controllerId: actors.runnymuddHolder, subject: { locationId: locations.sourceSettlement }, permission: 'investigate' },
        { id: 'authority:runnymudd:escort', controllerId: actors.runnymuddHolder, subject: { locationId: locations.sourceSettlement }, permission: 'escort' },
        { id: 'authority:ramsford:travel', controllerId: actors.ramsfordHolder, subject: { locationId: locations.alternateFord }, permission: 'travel' },
      ],
      informationLinks: [
        { id: 'info:old-ferry-to-runnymudd', source: { locationId: locations.ferry }, destination: { locationId: locations.sourceSettlement }, delayDays: 1 },
        { id: 'info:old-ferry-to-fairmarket', source: { locationId: locations.ferry }, destination: { locationId: locations.market }, delayDays: 1 },
        { id: 'info:fairmarket-to-runnymudd', source: { locationId: locations.market }, destination: { locationId: locations.sourceSettlement }, delayDays: 1 },
      ],
    },
    situations: [
      {
        id: situations.blockade,
        kind: 'ferry_blockade',
        location: { locationId: locations.ferry },
        participants: [actors.runnymuddHolder],
        pressure: ['渡口封闭', '粮车无法按原路线通过'],
        stage: 'active',
        nextCheck: { ...nextDay },
        endCondition: '封锁道路重新开放或运输改用替代路线',
        visibility: 'secret',
        knownBy: [actors.runnymuddHolder],
        sourceEventIds: [blockadeEventId],
        severity: 1,
      },
      {
        id: situations.shortage,
        kind: 'grain_shortage',
        location: { locationId: locations.market },
        participants: [actors.ramsfordHolder],
        pressure: ['市场粮食储备持续消耗'],
        stage: 'forming',
        nextCheck: { ...nextDay },
        endCondition: '粮食储备恢复至短缺阈值以上',
        visibility: 'secret',
        knownBy: [],
        sourceEventIds: [],
        severity: 0,
      },
    ],
    actions: [
      {
        id: actions.shipment,
        kind: 'transport',
        actorIds: [actors.runnymuddHolder],
        source: { locationId: locations.sourceSettlement },
        target: { locationId: locations.market },
        progress: 0,
        nextEventAt: { ...nextDay },
        status: 'active',
        routeConnectionIds: [roads.sourceToFerry, roads.ferryToFord, roads.fordToMarket],
        resource: { commodity: 'grain', quantity: 24 },
        sourceSituationId: situations.blockade,
        sourceEventIds: [shipmentEventId],
        authorization: 'none',
        processedEventKeys: [],
      },
    ],
    stockpiles: [
      {
        id: RIVERLANDS_CRISIS.stockpile,
        location: { locationId: locations.market },
        commodity: 'grain',
        quantity: 32,
        dailyConsumption: 8,
        shortageThreshold: 16,
        criticalThreshold: 8,
        updatedAt: { ...startDate },
      },
    ],
    information: [],
    causalLinks: [],
    processedScheduleKeys: [],
  };
}

export function createRiverlandsCrisisInitialEvents(startDate: WorldDate): WorldEvent[] {
  const { actors, locations, situations, actions } = RIVERLANDS_CRISIS;
  return [
    {
      id: 'scenario:riverlands:old-ferry:blockade-declared',
      transactionId: 'scenario:riverlands:init',
      turn: 1,
      date: { ...startDate },
      occurredAt: { ...startDate },
      type: 'situation.ferry_blockade.started',
      actorIds: [],
      subjectRefs: [{ type: 'location', location: { locationId: locations.ferry } }],
      affectedRefs: [{ type: 'location', location: { locationId: locations.ferry } }],
      location: { locationId: locations.ferry },
      reason: '【玩法情境】老渡口被地方武装封锁；这不是原作既定历史，后果由当前世界规则继续结算。',
      source: 'system_rule',
      causeSource: { type: 'rule', id: situations.blockade },
      visibility: 'secret',
      knownBy: [actors.runnymuddHolder],
      knowledgeBasis: [{ characterId: actors.runnymuddHolder, kind: 'witness' }],
    },
    {
      id: 'scenario:riverlands:grain-shipment:dispatched',
      transactionId: 'scenario:riverlands:init',
      turn: 1,
      date: { ...startDate },
      occurredAt: { ...startDate },
      type: 'action.transport.started',
      actorIds: [actors.runnymuddHolder],
      subjectRefs: [
        { type: 'character', characterId: actors.runnymuddHolder },
        { type: 'location', location: { locationId: locations.sourceSettlement } },
        { type: 'location', location: { locationId: locations.market } },
      ],
      location: { locationId: locations.sourceSettlement },
      reason: '泥浆口发出一批前往美人集的粮食运输。',
      source: 'system_rule',
      causeSource: { type: 'action', id: actions.shipment },
      visibility: 'secret',
      knownBy: [actors.runnymuddHolder],
      knowledgeBasis: [{ characterId: actors.runnymuddHolder, kind: 'witness' }],
    },
  ];
}
