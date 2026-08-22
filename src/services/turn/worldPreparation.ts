import type { PrepareWorldTurnInput, PreparedWorldTurn } from './resolutionTypes';
import { playerCharacterId, travelFactText } from './settlementFacts';
import { mergePendingWorldItemCommands } from '../../features/items/itemActionQueue';
import type { ItemStateCommand } from '../../features/items/types';
import type { CharacterId } from '../../features/characters/types';
import { advanceWorldDate, setWorldDateForward, type RejectedWorldCommand, type WorldDate } from '../../features/world/worldHistory';
import type { GameState, LordProfile, StateCommand } from '../../types/game';
import type { CharacterCommandBatchBaseContext } from '../stateReducer';
import { stripEmoji } from '../textSanitizer';
import { fallbackLocationLabel } from '../../features/map/locationResolver';
import type { WorldLocationRef, MapLocationSearchEntry, SemanticMembership } from '../../features/map/types';
import { advanceJourney } from '../../features/map/travel/journeyReducer';
import { applyTravelCommands, isTravelStateCommand } from '../../features/map/travel/travelCommands';
import type { ActiveJourney, TravelStateCommand } from '../../features/map/travel/types';
import type { AssetWorldIntent, WorldRuntimeState, WorldIntent, WorldMutation, WorldTransaction } from '../../features/world/worldRuntimeTypes';
import { buildWorldAssetBaseline, createWorldBaselineSnapshot, worldAssetId, type WorldBaselineSnapshot } from '../../features/world/worldBaseline';
import { commitWorldTransaction } from '../../features/world/worldTransactions';
import { planJourneyTransaction, planExplicitArrivalTransaction } from '../../features/world/worldTravelRules';
import { projectWorldAsset, projectWorldCharacter, resolveAssetMapLocation } from '../../features/world/worldProjection';
import { resolveWorldIntents, type RejectedWorldIntent, type ResolvedDirectWorldIntent, type ResolvedLocationWorldIntent, type ResolvedWorldIntent } from '../../features/world/worldIntentResolver';
import { planAssetIntent, planCreateSiteIntent } from '../../features/world/worldAssetRules';
import { planTitleIntent } from '../../features/world/worldTitleRules';
import type { RoutePlan, RouteRequest } from '../../features/map/routing/types';
import { RouteClient } from '../../features/map/routing/routeClient';
import { mapRepository } from '../../features/map/repository';
export function buildTravelBaseline(
  gameState: GameState,
  lord: LordProfile,
  context: CharacterCommandBatchBaseContext,
  knownLocationIds: ReadonlySet<string>,
): WorldBaselineSnapshot {
  const playerId = playerCharacterId(gameState);
  const characters = new Map<CharacterId, { id: CharacterId; alive: boolean; location: WorldLocationRef | null; currentActivity?: 'idle' | 'travelling' | 'imprisoned' | 'missing' }>();
  characters.set(playerId, { id: playerId, alive: !gameState.isGameOver, location: { ...lord.location } });
  for (const character of context.characters) {
    characters.set(character.id, {
      id: character.id,
      alive: character.alive,
      location: character.locationId
        ? { locationId: character.locationId, ...(character.sceneLocation ? { sceneLocation: character.sceneLocation } : {}) }
        : null,
    });
  }
  for (const [id, patch] of Object.entries(gameState.worldRuntime.characters) as Array<[CharacterId, WorldRuntimeState['characters'][CharacterId]]>) {
    if (!characters.has(id)) {
      characters.set(id, {
        id,
        alive: patch.alive ?? true,
        location: patch.location === undefined ? null : patch.location ? { ...patch.location } : null,
        ...(patch.currentActivity ? { currentActivity: patch.currentActivity } : {}),
      });
    }
  }

  const assets = new Map(buildWorldAssetBaseline({
    playerId,
    itemState: lord.items,
    worldArtifacts: gameState.worldArtifacts,
  }).map((asset) => [asset.id, asset]));
  for (const [id, patch] of Object.entries(gameState.worldRuntime.assets)) {
    if (!assets.has(id)) {
      assets.set(id, {
        id,
        kind: patch.kind,
        lawfulOwner: patch.lawfulOwner ?? null,
        controller: patch.controller ?? null,
        custodian: patch.custodian ?? null,
        placement: patch.placement ?? null,
        equippedPosition: patch.equippedPosition ?? null,
        status: patch.status ?? 'normal',
      });
    }
  }

  const titles = new Map(Object.entries(gameState.worldRuntime.titles).map(([id, patch]) => [id, {
    id,
    lawfulHolderId: patch.lawfulHolderId ?? null,
    controllerId: patch.controllerId ?? null,
    contestedByIds: [...(patch.contestedByIds ?? [])],
  }]));
  const ensureCharacter = (characterId: CharacterId): void => {
    if (!characters.has(characterId)) characters.set(characterId, { id: characterId, alive: true, location: null });
  };
  for (const asset of assets.values()) {
    if (asset.lawfulOwner?.type === 'character') ensureCharacter(asset.lawfulOwner.characterId);
    if (asset.controller?.type === 'character') ensureCharacter(asset.controller.characterId);
    if (asset.custodian?.type === 'character') ensureCharacter(asset.custodian.characterId);
    if (asset.placement?.type === 'character') ensureCharacter(asset.placement.characterId);
    for (const principal of [asset.lawfulOwner, asset.controller]) {
      if (principal?.type === 'title' && !titles.has(principal.titleId)) {
        titles.set(principal.titleId, { id: principal.titleId, lawfulHolderId: null, controllerId: null, contestedByIds: [] });
      }
    }
  }
  return createWorldBaselineSnapshot({
    characters: [...characters.values()],
    titles: [...titles.values()],
    assets: [...assets.values()],
    knownLocationIds: [...knownLocationIds],
  });
}

export function isTravelCommandType(type: string): boolean {
  return [
    'PLAN_TRAVEL', 'START_TRAVEL', 'PAUSE_TRAVEL', 'RESUME_TRAVEL',
    'REROUTE_TRAVEL', 'RETURN_TRAVEL', 'ADVANCE_TRAVEL', 'CANCEL_PLANNED_TRAVEL',
  ].includes(type);
}

const ASSET_INTENT_KINDS = new Set<WorldIntent['kind']>([
  'gift_asset', 'steal_asset', 'transfer_asset', 'equip_asset', 'unequip_asset',
]);
const TITLE_INTENT_KINDS = new Set<WorldIntent['kind']>([
  'grant_title', 'inherit_title', 'settle_title_war', 'revoke_title', 'occupy_title',
]);

function elapsedDays(intent: ResolvedLocationWorldIntent): number {
  const elapsed = 'elapsedTime' in intent ? intent.elapsedTime : undefined;
  return (elapsed?.years ?? 0) * 360
    + (elapsed?.months ?? 0) * 30
    + (elapsed?.days ?? 0);
}

async function defaultRoutePlanner(request: RouteRequest): Promise<RoutePlan> {
  const client = new RouteClient();
  try {
    return await client.plan(request, { cancelPrevious: false });
  } finally {
    client.dispose();
  }
}

function mergeWorldTransaction(target: WorldTransaction, source: WorldTransaction): void {
  target.intents.push(...source.intents);
  target.mutations.push(...source.mutations);
  target.eventDrafts.push(...source.eventDrafts);
  if (source.itemCommands?.length) target.itemCommands = [...(target.itemCommands ?? []), ...source.itemCommands];
  if (source.dateAdvance) {
    const existing = target.dateAdvance ?? {};
    target.dateAdvance = {
      days: (existing.days ?? 0) + (source.dateAdvance.days ?? 0),
      months: (existing.months ?? 0) + (source.dateAdvance.months ?? 0),
      years: (existing.years ?? 0) + (source.dateAdvance.years ?? 0),
    };
  }
  if (source.nextJourney !== undefined) target.nextJourney = source.nextJourney ? structuredClone(source.nextJourney) : null;
}

function sameDuchyNeighborCounties(
  currentLocationId: string,
  memberships: readonly SemanticMembership[],
): Set<string> {
  const current = memberships.find((entry) => entry.locationId === currentLocationId);
  if (!current?.duchyId) return new Set();
  return new Set(memberships
    .filter((entry) => entry.duchyId === current.duchyId && entry.countyId)
    .map((entry) => entry.countyId!));
}

function worldDateOrdinal(date: WorldDate): number {
  return date.year * 360 + (date.month - 1) * 30 + date.day - 1;
}

export function prepareTemporalCommand(
  commands: readonly StateCommand[],
  currentDate: WorldDate,
): { command?: StateCommand; days?: number } {
  const setDate = commands.find((command) => command.type === 'SET_DATE');
  if (setDate?.type === 'SET_DATE') {
    const target = setWorldDateForward(currentDate, setDate);
    return { command: setDate, days: worldDateOrdinal(target) - worldDateOrdinal(currentDate) };
  }
  const advance = commands.find((command) => command.type === 'ADVANCE_TIME');
  if (advance?.type === 'ADVANCE_TIME') {
    const target = advanceWorldDate(currentDate, advance);
    return { command: advance, days: worldDateOrdinal(target) - worldDateOrdinal(currentDate) };
  }
  return {};
}

// ---------------------------------------------------------------------------
// 意图处理器注册表：每种世界意图的规划逻辑收拢为独立处理器，
// worldPreparation 只负责装配环境与分发。新增意图时注册一个处理器即可，
// 不再向回合主流程里堆分支。
// ---------------------------------------------------------------------------

type TurnRoutePlanner = (request: RouteRequest) => Promise<RoutePlan>;
type LocationRef = import('../../features/map/types').WorldLocationRef;

interface TurnIntentEnv {
  gameState: GameState;
  transaction: WorldTransaction;
  baseline: WorldBaselineSnapshot;
  transactionId: string;
  playerId: CharacterId;
  nextTurnNumber: number;
  currentDate: WorldDate;
  locations: readonly MapLocationSearchEntry[];
  knownLocationIds: ReadonlySet<string>;
  fallbackContext: CharacterCommandBatchBaseContext;
  planner: TurnRoutePlanner;
  workingJourney: { current: ActiveJourney | undefined };
  rejected: RejectedWorldIntent[];
}

type TurnIntentHandler = (
  intent: ResolvedWorldIntent,
  target: LocationRef | undefined,
  env: TurnIntentEnv,
) => Promise<void> | void;

function envWorldSnapshot(env: TurnIntentEnv) {
  return {
    journey: env.gameState.activeJourney,
    playerLocation: env.gameState.lord.location,
    vehicles: env.gameState.lord.items.vehicles,
    itemPlacements: env.gameState.lord.items.placements,
    knownLocationIds: env.knownLocationIds,
    characters: env.fallbackContext.characters.map((character) => ({
      id: character.id,
      alive: character.alive,
      locationId: character.locationId,
    })),
  };
}

async function handleArrive(intent: ResolvedWorldIntent, target: LocationRef | undefined, env: TurnIntentEnv): Promise<void> {
  if (!target) throw new Error('抵达意图缺少目标地点');
  const routePlan = await env.planner({
    from: env.gameState.lord.location.locationId,
    to: target.locationId,
    preference: 'fastest',
    travelMode: 'horse',
    season: env.gameState.currentSeason,
  });
  const planned = planExplicitArrivalTransaction({
    world: envWorldSnapshot(env),
    routePlan,
    declaredElapsedDays: elapsedDays(intent as ResolvedLocationWorldIntent),
    assertedDeparture: false,
    assertedArrival: true,
    locationLabels: Object.fromEntries(env.locations.map((entry) => [entry.id, entry.name])),
  }, {
    playerId: env.playerId,
    turn: env.nextTurnNumber,
    transactionId: env.transactionId,
    source: 'player_input',
    reason: intent.evidenceText,
    currentDate: env.currentDate,
  });
  if (target.sceneLocation) {
    planned.mutations.push({ type: 'character.move', characterId: env.playerId, location: { ...target }, activity: 'idle' });
    planned.eventDrafts = planned.eventDrafts.map((event) => ({ ...event, location: { ...target } }));
  }
  mergeWorldTransaction(env.transaction, planned);
  env.workingJourney.current = planned.nextJourney ? structuredClone(planned.nextJourney) : undefined;
}

async function handleTravelCommand(
  intent: ResolvedWorldIntent,
  target: LocationRef | undefined,
  env: TurnIntentEnv,
): Promise<void> {
  if (!target) throw new Error(`${intent.kind} 意图缺少目标地点`);
  const routePlan = await env.planner({
    from: env.gameState.lord.location.locationId,
    to: target.locationId,
    preference: 'fastest',
    travelMode: 'horse',
    season: env.gameState.currentSeason,
  });
  const type = intent.kind === 'plan_travel' ? 'PLAN_TRAVEL'
    : intent.kind === 'start_travel' ? 'START_TRAVEL'
      : intent.kind === 'reroute_travel' ? 'REROUTE_TRAVEL'
        : 'RETURN_TRAVEL';
  const command: TravelStateCommand = {
    type,
    routePlan,
    locationLabels: Object.fromEntries(env.locations.map((entry) => [entry.id, entry.name])),
  } as TravelStateCommand;
  const applied = applyTravelCommands(env.workingJourney.current, [command], {
    currentLocation: env.gameState.lord.location,
    currentDate: env.currentDate,
    knownLocationIds: env.knownLocationIds,
  });
  if (applied.rejected.length) throw new Error(applied.rejected[0].reason);
  env.workingJourney.current = applied.journey;
  env.transaction.intents.push(intent);
  env.transaction.nextJourney = env.workingJourney.current ? structuredClone(env.workingJourney.current) : null;
  env.transaction.eventDrafts.push({
    type: `travel.${intent.kind}`,
    actorIds: [intent.actorId],
    subjectRefs: [{ type: 'location', location: { ...target } }],
    location: { ...env.gameState.lord.location },
    reason: intent.evidenceText,
    visibility: 'public',
  });
}

function handleTravelPause(
  intent: ResolvedWorldIntent,
  _target: LocationRef | undefined,
  env: TurnIntentEnv,
): void {
  const command: TravelStateCommand = intent.kind === 'pause_travel'
    ? { type: 'PAUSE_TRAVEL', reason: intent.evidenceText }
    : intent.kind === 'resume_travel'
      ? { type: 'RESUME_TRAVEL' }
      : { type: 'CANCEL_PLANNED_TRAVEL' };
  const applied = applyTravelCommands(env.workingJourney.current, [command], {
    currentLocation: env.gameState.lord.location,
    currentDate: env.currentDate,
    knownLocationIds: env.knownLocationIds,
  });
  if (applied.rejected.length) throw new Error(applied.rejected[0].reason);
  env.workingJourney.current = applied.journey;
  env.transaction.intents.push(intent);
  env.transaction.nextJourney = env.workingJourney.current ? structuredClone(env.workingJourney.current) : null;
  env.transaction.eventDrafts.push({
    type: `travel.${intent.kind}`,
    actorIds: [intent.actorId],
    subjectRefs: [],
    location: { ...env.gameState.lord.location },
    reason: intent.evidenceText,
    visibility: 'public',
  });
}

function handleAdvanceTravel(
  intent: ResolvedWorldIntent,
  _target: LocationRef | undefined,
  env: TurnIntentEnv,
): void {
  const days = elapsedDays(intent as ResolvedLocationWorldIntent);
  if (days <= 0) throw new Error('旅行推进缺少明确的正数时长');
  const patch = advanceJourney(envWorldSnapshot(env), days);
  const planned = planJourneyTransaction({ ...patch, elapsedDays: days }, {
    playerId: env.playerId,
    turn: env.nextTurnNumber,
    transactionId: env.transactionId,
    source: 'player_input',
    reason: intent.evidenceText,
    currentDate: env.currentDate,
  });
  mergeWorldTransaction(env.transaction, planned);
  env.workingJourney.current = planned.nextJourney ? structuredClone(planned.nextJourney) : undefined;
}

function handleMoveInside(
  intent: ResolvedWorldIntent,
  target: LocationRef | undefined,
  env: TurnIntentEnv,
): void {
  env.transaction.intents.push(intent);
  if (target) {
    env.transaction.mutations.push({ type: 'character.move', characterId: intent.actorId, location: { ...target }, activity: 'idle' });
  }
  env.transaction.eventDrafts.push({
    type: `intent.${intent.kind}`,
    actorIds: [intent.actorId],
    subjectRefs: target ? [{ type: 'location', location: { ...target } }] : [],
    ...(target ? { location: { ...target } } : {}),
    reason: intent.evidenceText,
    visibility: 'public',
  });
}

// 模型直接发出的资产与据点意图：语义校验失败只拒绝该条，不拖垮整个回合。
async function handleDirectAssetIntent(
  intent: ResolvedWorldIntent,
  _target: LocationRef | undefined,
  env: TurnIntentEnv,
): Promise<void> {
  const { transaction } = env;
  const runtime = env.gameState.worldRuntime;
  try {
    transaction.intents.push(intent);
    if (intent.kind === 'create_site') {
      const locationLabel = env.locations.find((entry) => entry.id === env.gameState.lord.location.locationId)?.name
        ?? env.gameState.lord.location.locationId;
      const site = planCreateSiteIntent(intent, {
        baseline: env.baseline,
        runtime,
        itemSites: env.gameState.lord.items.sites,
        idSeed: `${env.transactionId}:site:${transaction.siteCreations?.length ?? 0}`,
        locationLabel,
      });
      transaction.siteCreations = [...(transaction.siteCreations ?? []), site];
      transaction.eventDrafts.push({
        type: 'intent.create_site',
        actorIds: [intent.actorId],
        subjectRefs: [
          { type: 'asset', assetId: worldAssetId.site(site.id) },
          { type: 'location', location: { ...site.location } },
        ],
        location: { ...site.location },
        reason: intent.evidenceText,
        visibility: 'public',
      });
    } else if (intent.kind === 'steal_asset') {
      const theft = intent as Extract<ResolvedDirectWorldIntent, { kind: 'steal_asset' }>;
      transaction.mutations.push(...planAssetIntent(theft, { baseline: env.baseline, runtime }));
      // 行窃是秘密：只有窃贼、原主与在场者知道；世界账本留下可追溯的痕。
      const asset = projectWorldAsset(env.baseline, runtime, theft.assetId);
      const assetLocation = asset ? resolveAssetMapLocation(env.baseline, runtime, asset.id) : null;
      const witnessIds = [intent.actorId];
      for (const ref of [asset?.controller, asset?.lawfulOwner]) {
        if (ref?.type === 'character') witnessIds.push(ref.characterId);
      }
      if (assetLocation && assetLocation.locationId === env.gameState.lord.location.locationId) {
        witnessIds.push(env.playerId);
      }
      transaction.eventDrafts.push({
        type: 'intent.steal_asset',
        actorIds: [intent.actorId],
        subjectRefs: [{ type: 'asset', assetId: intent.assetId }],
        ...(assetLocation ? { location: { ...assetLocation } } : {}),
        reason: intent.evidenceText,
        visibility: 'secret',
        knownBy: [...new Set(witnessIds)],
      });
    } else {
      const gift = intent as Extract<ResolvedDirectWorldIntent, { kind: 'gift_asset' }>;
      transaction.mutations.push(...planAssetIntent(gift, { baseline: env.baseline, runtime }));
      transaction.eventDrafts.push({
        type: 'intent.gift_asset',
        actorIds: [gift.actorId],
        subjectRefs: [
          { type: 'asset', assetId: gift.assetId },
          { type: 'character', characterId: gift.recipientId },
        ],
        location: { ...env.gameState.lord.location },
        reason: intent.evidenceText,
        visibility: 'public',
      });
    }
  } catch (error) {
    env.rejected.push({
      intent: { ...intent },
      reason: stripEmoji(error instanceof Error ? error.message : '资产或据点意图无法结算'),
    });
    transaction.intents = transaction.intents.filter((kept) => kept !== intent);
  }
}

const INTENT_HANDLERS: Partial<Record<ResolvedWorldIntent['kind'], TurnIntentHandler>> = {
  arrive: handleArrive,
  plan_travel: handleTravelCommand,
  start_travel: handleTravelCommand,
  reroute_travel: handleTravelCommand,
  return_travel: handleTravelCommand,
  pause_travel: handleTravelPause,
  resume_travel: handleTravelPause,
  cancel_travel: handleTravelPause,
  advance_travel: handleAdvanceTravel,
  move_inside_location: handleMoveInside,
  gift_asset: handleDirectAssetIntent,
  steal_asset: handleDirectAssetIntent,
  create_site: handleDirectAssetIntent,
};

export async function prepareWorldTurn(input: PrepareWorldTurnInput): Promise<PreparedWorldTurn> {
  const locationRepository = input.mapLocationRepository ?? mapRepository;
  const pending = input.pendingTransactions.filter((entry) => entry.status === 'pending');
  const queuedTravelCommands = pending.flatMap((entry) => entry.travelCommands ?? []);
  const locationStateCommands = input.draft.stateCommands.filter((command) => command.type === 'CHANGE_LOCATION');
  const needsMap = (input.draft.worldIntents?.length ?? 0) > 0
    || queuedTravelCommands.length > 0
    || locationStateCommands.length > 0;
  let locations: MapLocationSearchEntry[] = [];
  let memberships: SemanticMembership[] = [];
  let mapFailureReason: string | undefined;
  if (needsMap) {
    try {
      [locations, memberships] = await Promise.all([
        locationRepository.loadSearchIndex(),
        locationRepository.loadSemanticMembership(),
      ]);
    } catch (error) {
      mapFailureReason = `地图资料不可用：${stripEmoji(error instanceof Error ? error.message : String(error))}`;
    }
  }
  const knownLocationIds = new Set([
    input.gameState.lord.location.locationId,
    ...(input.characterContext?.knownLocationIds ?? []),
    ...locations.map((entry) => entry.id),
  ]);
  const fallbackContext: CharacterCommandBatchBaseContext = input.characterContext ?? {
    characters: [],
    currentLocationId: input.gameState.lord.location.locationId,
    presentCharacterIds: [],
    knownLocationIds: [...knownLocationIds],
  };
  const baseline = buildTravelBaseline(input.gameState, input.gameState.lord, fallbackContext, knownLocationIds);
  const playerId = playerCharacterId(input.gameState);
  const countyIdByLocationId = new Map(memberships.flatMap((entry) => entry.countyId
    ? [[entry.locationId, entry.countyId] as const]
    : []));
  const resolution = mapFailureReason
    ? {
        resolved: [] as ResolvedLocationWorldIntent[],
        rejected: (input.draft.worldIntents ?? []).map((intent) => ({ intent, reason: mapFailureReason })),
      }
    : resolveWorldIntents(input.draft.worldIntents ?? [], {
        defaultActorId: playerId,
        currentLocation: input.gameState.lord.location,
        activeJourney: input.gameState.activeJourney,
        locations,
        countyIdByLocationId,
        neighboringCountyIds: sameDuchyNeighborCounties(input.gameState.lord.location.locationId, memberships),
      });
  const mapRejectedCommands: RejectedWorldCommand[] = mapFailureReason
    ? [
        ...locationStateCommands.map((command) => ({ type: command.type, reason: mapFailureReason! })),
        ...queuedTravelCommands.map((command) => ({ type: command.type, reason: mapFailureReason! })),
      ]
    : [];
  const transactionId = `turn:${input.nextTurnNumber}:world`;
  const transaction: WorldTransaction = {
    id: transactionId,
    turn: input.nextTurnNumber,
    source: 'player_input',
    reason: stripEmoji(input.actionText) || '本回合世界状态结算',
    intents: [],
    mutations: [],
    eventDrafts: [],
  };
  let workingJourney = input.gameState.activeJourney ? structuredClone(input.gameState.activeJourney) : undefined;
  const currentDate = {
    year: input.gameState.currentYear,
    month: input.gameState.currentMonth,
    day: input.gameState.currentDay,
  };
  const acceptedCommands: StateCommand[] = [];

  try {
    const planner = input.routePlanner ?? defaultRoutePlanner;
    const env: TurnIntentEnv = {
      gameState: input.gameState,
      transaction,
      baseline,
      transactionId,
      playerId,
      nextTurnNumber: input.nextTurnNumber,
      currentDate,
      locations,
      knownLocationIds,
      fallbackContext,
      planner,
      workingJourney: { current: workingJourney },
      rejected: resolution.rejected,
    };
    for (const intent of resolution.resolved) {
      const target = 'targetRef' in intent && intent.targetRef?.type === 'location'
        ? intent.targetRef.location
        : undefined;
      const handler = INTENT_HANDLERS[intent.kind];
      if (handler) {
        await handler(intent, target, env);
        continue;
      }
      // 未注册的地点意图（mention 等）：只记录意图与通用事件。
      env.transaction.intents.push(intent);
      env.transaction.eventDrafts.push({
        type: `intent.${intent.kind}`,
        actorIds: [intent.actorId],
        subjectRefs: target ? [{ type: 'location', location: { ...target } }] : [],
        ...(target ? { location: { ...target } } : {}),
        reason: intent.evidenceText,
        visibility: 'public',
      });
    }
    workingJourney = env.workingJourney.current;

    for (const entry of pending) {
      for (const intent of entry.intents) {
        transaction.intents.push(intent);
        if (ASSET_INTENT_KINDS.has(intent.kind)) {
          transaction.mutations.push(...planAssetIntent(intent as AssetWorldIntent, {
            baseline,
            runtime: input.gameState.worldRuntime,
          }));
        } else if (TITLE_INTENT_KINDS.has(intent.kind)) {
          transaction.mutations.push(...planTitleIntent(intent as Parameters<typeof planTitleIntent>[0], {
            baseline,
            runtime: input.gameState.worldRuntime,
          }));
        }
        transaction.eventDrafts.push({
          type: `intent.${intent.kind}`,
          actorIds: [intent.actorId],
          subjectRefs: 'assetId' in intent ? [{ type: 'asset', assetId: intent.assetId }] : [],
          reason: intent.evidenceText,
          visibility: 'public',
        });
      }
    }
    if (queuedTravelCommands.length && !mapFailureReason) {
      const travel = applyTravelCommands(workingJourney, queuedTravelCommands, {
        currentLocation: input.gameState.lord.location,
        currentDate,
        knownLocationIds,
      });
      if (travel.rejected.length) throw new Error(travel.rejected[0].reason);
      workingJourney = travel.journey;
      transaction.nextJourney = workingJourney ? structuredClone(workingJourney) : null;
      acceptedCommands.push(...travel.accepted);
      for (const command of travel.accepted) {
        const text = travelFactText(command, input.gameState.lord.location);
        transaction.eventDrafts.push({
          type: `travel.${command.type.toLocaleLowerCase()}`,
          actorIds: [playerId],
          subjectRefs: [{ type: 'location', location: { ...input.gameState.lord.location } }],
          location: { ...input.gameState.lord.location },
          reason: text.summary,
          visibility: 'public',
        });
      }
    }

    if (!transaction.dateAdvance) {
      const temporal = prepareTemporalCommand(input.draft.stateCommands, currentDate);
      if (temporal.command && temporal.days !== undefined) {
        transaction.dateAdvance = { days: temporal.days };
        acceptedCommands.push(temporal.command);
      }
    }

    const modelItemCommands = input.draft.stateCommands.filter((command): command is ItemStateCommand => command.type.startsWith('ITEM_'));
    const itemCommands = mergePendingWorldItemCommands(pending, modelItemCommands);
    if (itemCommands.length) {
      transaction.itemCommands = itemCommands;
      acceptedCommands.push(...itemCommands);
    }
    if (itemCommands.length && transaction.intents.length === 0) {
      transaction.intents.push({
        kind: 'mention',
        actorId: playerId,
        targetRef: { type: 'location', location: { ...input.gameState.lord.location } },
        evidenceText: stripEmoji(input.actionText) || '物品状态调整',
      });
    }
  } catch (error) {
    return {
      transactionId,
      baseline,
      acceptedCommands: [],
      locations,
      resolvedIntents: resolution.resolved,
      rejectedIntents: resolution.rejected,
      rejectedCommands: mapRejectedCommands,
      availability: { map: mapFailureReason ? 'unavailable' : needsMap ? 'available' : 'not-required', ...(mapFailureReason ? { reason: mapFailureReason } : {}) },
      rejectionReason: stripEmoji(error instanceof Error ? error.message : '世界事务准备失败'),
    };
  }

  const hasWork = transaction.intents.length > 0
    || transaction.mutations.length > 0
    || Boolean(transaction.itemCommands?.length)
    || Boolean(transaction.siteCreations?.length)
    || transaction.nextJourney !== undefined
    || Boolean(transaction.dateAdvance);
  return {
    transactionId,
    baseline,
    ...(hasWork ? { transaction } : {}),
    acceptedCommands,
    locations,
    resolvedIntents: resolution.resolved,
    rejectedIntents: resolution.rejected,
    rejectedCommands: mapRejectedCommands,
    availability: { map: mapFailureReason ? 'unavailable' : needsMap ? 'available' : 'not-required', ...(mapFailureReason ? { reason: mapFailureReason } : {}) },
  };
}

