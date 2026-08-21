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

export interface TurnResolutionDraft {
  outcomeSummary: string;
  stateCommands: StateCommand[];
  worldIntents: UnresolvedWorldIntent[];
}


export function parseTurnResolutionOutput(rawText: string): TurnResolutionDraft {
  const safe = stripEmoji(rawText);
  const resolution = safe.match(/<resolution>([\s\S]*?)(?:<\/resolution>|$)/i)?.[1]?.trim() ?? '';
  return {
    outcomeSummary: resolution,
    stateCommands: extractJsonArrayFromXml(safe, 'state_cmd') as StateCommand[],
    worldIntents: parseUnresolvedWorldIntents(extractJsonArrayFromXml(safe, 'world_intent')),
  };
}

export function buildTurnResolutionMessages(
  gameState: GameState,
  actionText: string,
  diceCheck?: D20Check,
  diceContext?: DicePromptContext,
  pendingTransactions: PendingWorldTransaction[] = [],
  worldContext = '',
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages = buildChatMessages(gameState, actionText, diceCheck, diceContext, pendingTransactions, worldContext);
  const system = messages[0];
  const rules = system.content.split('### 【第三章：严格输出格式规范')[0];
  messages[0] = {
    role: 'system',
    content: `${rules}
### 【规则解析阶段】
本阶段禁止写小说正文。只分析玩家当前行动可确认的直接结果，并输出 <resolution>简短结果摘要</resolution>、<state_cmd>JSON 数组</state_cmd> 与 <world_intent>JSON 数组</world_intent>。不得输出 <narrate>、<branch> 或替玩家追加行动。

${WORLD_INTENT_RESOLUTION_PROMPT}`,
  };
  const current = messages[messages.length - 1];
  messages[messages.length - 1] = {
    ...current,
    content: `${current.content}

再次强调：这里只做结构化规则解析，不写最终正文。`,
  };
  return messages;
}

export async function requestTurnResolution(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
  signal?: AbortSignal,
): Promise<TurnResolutionDraft> {
  const raw = await requestTurnResolutionCompletion(messages, config, gameState, pendingTransactions, signal);
  return parseTurnResolutionOutput(raw);
}

export interface ResolvedTurnFacts {
  action: string;
  startedOn: WorldDate;
  resolvedOn: WorldDate;
  diceCheck?: D20Check;
  acceptedCommands: StateCommand[];
  changes: string[];
  facts: WorldEventFact[];
  canonicalTransitions: CanonicalEventState[];
}

export interface SettleTurnDraftInput {
  gameState: GameState;
  actionText: string;
  nextTurnNumber: number;
  draft: TurnResolutionDraft;
  pendingTransactions: readonly PendingWorldTransaction[];
  characterContext?: CharacterCommandBatchBaseContext;
  diceCheck?: D20Check;
  timeline?: readonly CanonicalTimelineEvent[];
  preparedWorld?: PreparedWorldTurn;
}

export interface SettledTurn {
  updatedLord: LordProfile;
  isFatalDeath: boolean;
  acceptedCommands: StateCommand[];
  rejectedCommands: RejectedWorldCommand[];
  characterEvents: CharacterEventInput[];
  characterContext: CharacterCommandBatchBaseContext;
  changesLog: string[];
  nextDate: WorldDate;
  nextSeason: string;
  worldHistory: WorldHistoryState;
  worldRuntime: WorldRuntimeState;
  resolvedFacts: ResolvedTurnFacts;
  activeJourney?: ActiveJourney;
  transactionId: string;
  worldLocation: WorldLocationRef;
  narrationContext: string;
}

export interface PrepareWorldTurnInput {
  gameState: GameState;
  draft: TurnResolutionDraft;
  actionText: string;
  nextTurnNumber: number;
  pendingTransactions: readonly PendingWorldTransaction[];
  characterContext?: CharacterCommandBatchBaseContext;
  mapLocationRepository?: {
    loadSearchIndex(): Promise<MapLocationSearchEntry[]>;
    loadSemanticMembership(): Promise<SemanticMembership[]>;
  };
  routePlanner?: (request: RouteRequest) => Promise<RoutePlan>;
}

export interface PreparedWorldTurn {
  transactionId: string;
  baseline: WorldBaselineSnapshot;
  transaction?: WorldTransaction;
  acceptedCommands: StateCommand[];
  locations: readonly MapLocationSearchEntry[];
  resolvedIntents: ResolvedLocationWorldIntent[];
  rejectedIntents: RejectedWorldIntent[];
  rejectionReason?: string;
}

function commandParticipantIds(command: StateCommand): CharacterId[] {
  const raw = command as unknown as Record<string, unknown>;
  return [...new Set(['characterId', 'sourceCharacterId', 'fromCharacterId', 'toCharacterId', 'spouseId', 'targetCharacterId', 'targetId', 'recipientId', 'killerId']
    .map((key) => raw[key])
    .filter((value): value is CharacterId => typeof value === 'string' && (value.startsWith('agot:') || value.startsWith('save:'))))];
}

function factSource(command: StateCommand): WorldEventFact['source'] {
  if (isTravelStateCommand(command)) return 'system';
  if (command.type.startsWith('ITEM_')) return 'item';
  if (isCharacterStateCommand(command)) return 'character';
  return 'player';
}

function commandFactLocation(command: StateCommand, currentLocation: WorldLocationRef, resolvedLocation: WorldLocationRef): WorldLocationRef {
  if (command.type === 'CHANGE_LOCATION' || command.type === 'MOVE_CHARACTER') {
    return createWorldLocationRef(command.locationId, command.sceneLocation);
  }
  if (isTravelStateCommand(command)) return { ...resolvedLocation };
  return { ...currentLocation };
}

function travelFactText(command: TravelStateCommand, resolvedLocation: WorldLocationRef): { title: string; summary: string } {
  const labels = 'locationLabels' in command ? command.locationLabels : undefined;
  const plan = 'routePlan' in command ? command.routePlan : undefined;
  const from = plan ? labels?.[plan.from] ?? plan.from : undefined;
  const to = plan ? labels?.[plan.to] ?? plan.to : undefined;
  switch (command.type) {
    case 'PLAN_TRAVEL': return { title: '路线已经规划', summary: `已规划从${from}前往${to}的路线，尚未出发。` };
    case 'START_TRAVEL': return { title: '旅程已经开始', summary: plan ? `队伍从${from}启程前往${to}。` : '队伍按已规划的路线启程。' };
    case 'PAUSE_TRAVEL': return command.reason
      ? { title: '旅程被迫中断', summary: `队伍因${command.reason}停下。` }
      : { title: '旅程已经暂停', summary: '队伍暂时停止赶路。' };
    case 'RESUME_TRAVEL': return { title: '旅程继续', summary: '队伍重新上路。' };
    case 'REROUTE_TRAVEL': return { title: '旅程已经改道', summary: `队伍从${from}改道前往${to}。` };
    case 'RETURN_TRAVEL': return { title: '队伍开始返回', summary: `队伍从${from}沿新路线返回${to}。` };
    case 'ADVANCE_TRAVEL': return {
      title: '旅程继续推进',
      summary: `旅程随世界时间推进 ${command.days} 天，当前权威地点为${resolvedLocation.locationId}。`,
    };
    case 'CANCEL_PLANNED_TRAVEL': return { title: '路线规划已经取消', summary: '尚未开始的旅程已经取消。' };
  }
}

function commandFacts(
  commands: readonly StateCommand[],
  turn: number,
  date: WorldDate,
  currentLocation: WorldLocationRef,
  resolvedLocation: WorldLocationRef,
  playerId?: CharacterId,
  travelParticipants: readonly CharacterId[] = [],
): WorldEventFact[] {
  return commands
    .filter((command) => command.type !== 'ADVANCE_TIME' && command.type !== 'SET_DATE')
    .map((command, index) => {
      const isTravel = isTravelStateCommand(command)
      const participantIds = isTravel
        ? [...new Set([...(playerId ? [playerId] : []), ...travelParticipants])]
        : commandParticipantIds(command).length
          ? commandParticipantIds(command)
          : playerId ? [playerId] : []
      const travelText = isTravel ? travelFactText(command, resolvedLocation) : undefined
      return {
        id: `command:${turn}:${index}:${command.type}`,
        turn,
        date: { ...date },
        source: factSource(command),
        kind: command.type === 'KILL_CHARACTER'
          ? 'character.death'
          : command.type === 'ADVANCE_TRAVEL'
            ? 'travel.progress'
            : `command.${command.type.toLowerCase()}`,
        title: travelText?.title ?? `已确认命令：${command.type}`,
        summary: travelText?.summary ?? `程序已接受并结算 ${command.type}。`,
        participantIds,
        commandTypes: [command.type],
        location: commandFactLocation(command, currentLocation, resolvedLocation),
      }
    })
}
function worldEventSource(source: WorldEventFact['source']): WorldEventSource {
  if (source === 'player') return 'player_input';
  if (source === 'item') return 'ui_action';
  if (source === 'character') return 'ai_resolution';
  return 'system_rule';
}

function worldEventFromFact(fact: WorldEventFact, transactionId: string): WorldEvent {
  return {
    id: fact.id,
    transactionId,
    turn: fact.turn,
    date: { ...fact.date },
    type: fact.kind,
    actorIds: [...fact.participantIds],
    subjectRefs: [
      ...fact.participantIds.map((characterId) => ({ type: 'character' as const, characterId })),
      ...(fact.political ? [{ type: 'title' as const, titleId: fact.political.titleId }] : []),
    ],
    ...(fact.location ? { location: { ...fact.location } } : {}),
    reason: fact.summary,
    source: worldEventSource(fact.source),
    ...(fact.canonicalEventId ? { canonicalEventId: fact.canonicalEventId } : {}),
    visibility: fact.political?.visibility ?? 'public',
  };
}

function deriveSeason(month: number): string {
  if (month <= 3) return '新春之兆 (初春)';
  if (month <= 6) return '烈阳盛夏 (盛夏)';
  if (month <= 9) return '丰收残秋 (初秋)';
  return '凛冬将至 (晚秋与寒冬)';
}


function playerCharacterId(gameState: GameState): CharacterId {
  return gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player` as CharacterId;
}

function buildTravelBaseline(
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

function isTravelCommandType(type: string): boolean {
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

function prepareTemporalCommand(
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

export async function prepareWorldTurn(input: PrepareWorldTurnInput): Promise<PreparedWorldTurn> {
  const locationRepository = input.mapLocationRepository ?? mapRepository;
  const [locations, memberships] = await Promise.all([
    locationRepository.loadSearchIndex(),
    locationRepository.loadSemanticMembership(),
  ]);
  const knownLocationIds = new Set(locations.map((entry) => entry.id));
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
  const resolution = resolveWorldIntents(input.draft.worldIntents ?? [], {
    defaultActorId: playerId,
    currentLocation: input.gameState.lord.location,
    activeJourney: input.gameState.activeJourney,
    locations,
    countyIdByLocationId,
    neighboringCountyIds: sameDuchyNeighborCounties(input.gameState.lord.location.locationId, memberships),
  });
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
    for (const intent of resolution.resolved) {
      const target = intent.targetRef?.type === 'location' ? intent.targetRef.location : undefined;
      if (intent.kind === 'arrive') {
        if (!target) throw new Error('抵达意图缺少目标地点');
        const routePlan = await planner({
          from: input.gameState.lord.location.locationId,
          to: target.locationId,
          preference: 'fastest',
          travelMode: 'horse',
          season: input.gameState.currentSeason,
        });
        const planned = planExplicitArrivalTransaction({
          world: {
            journey: input.gameState.activeJourney,
            playerLocation: input.gameState.lord.location,
            vehicles: input.gameState.lord.items.vehicles,
            itemPlacements: input.gameState.lord.items.placements,
            knownLocationIds,
            characters: fallbackContext.characters.map((character) => ({
              id: character.id,
              alive: character.alive,
              locationId: character.locationId,
            })),
          },
          routePlan,
          declaredElapsedDays: elapsedDays(intent),
          assertedDeparture: false,
          assertedArrival: true,
          locationLabels: Object.fromEntries(locations.map((entry) => [entry.id, entry.name])),
        }, {
          playerId,
          turn: input.nextTurnNumber,
          transactionId,
          source: 'player_input',
          reason: intent.evidenceText,
          currentDate: {
            year: input.gameState.currentYear,
            month: input.gameState.currentMonth,
            day: input.gameState.currentDay,
          },
        });
        if (target.sceneLocation) {
          planned.mutations.push({ type: 'character.move', characterId: playerId, location: { ...target }, activity: 'idle' });
          planned.eventDrafts = planned.eventDrafts.map((event) => ({ ...event, location: { ...target } }));
        }
        mergeWorldTransaction(transaction, planned);
        workingJourney = planned.nextJourney ? structuredClone(planned.nextJourney) : undefined;
        continue;
      }
      if (intent.kind === 'plan_travel' || intent.kind === 'start_travel'
        || intent.kind === 'reroute_travel' || intent.kind === 'return_travel') {
        if (!target) throw new Error(`${intent.kind} 意图缺少目标地点`);
        const routePlan = await planner({
          from: input.gameState.lord.location.locationId,
          to: target.locationId,
          preference: 'fastest',
          travelMode: 'horse',
          season: input.gameState.currentSeason,
        });
        const type = intent.kind === 'plan_travel' ? 'PLAN_TRAVEL'
          : intent.kind === 'start_travel' ? 'START_TRAVEL'
            : intent.kind === 'reroute_travel' ? 'REROUTE_TRAVEL'
              : 'RETURN_TRAVEL';
        const command: TravelStateCommand = {
          type,
          routePlan,
          locationLabels: Object.fromEntries(locations.map((entry) => [entry.id, entry.name])),
        } as TravelStateCommand;
        const applied = applyTravelCommands(workingJourney, [command], {
          currentLocation: input.gameState.lord.location,
          currentDate,
          knownLocationIds,
        });
        if (applied.rejected.length) throw new Error(applied.rejected[0].reason);
        workingJourney = applied.journey;
        transaction.intents.push(intent);
        transaction.nextJourney = workingJourney ? structuredClone(workingJourney) : null;
        transaction.eventDrafts.push({
          type: `travel.${intent.kind}`,
          actorIds: [intent.actorId],
          subjectRefs: [{ type: 'location', location: { ...target } }],
          location: { ...input.gameState.lord.location },
          reason: intent.evidenceText,
          visibility: 'public',
        });
        continue;
      }
      if (intent.kind === 'pause_travel' || intent.kind === 'resume_travel' || intent.kind === 'cancel_travel') {
        const command: TravelStateCommand = intent.kind === 'pause_travel'
          ? { type: 'PAUSE_TRAVEL', reason: intent.evidenceText }
          : intent.kind === 'resume_travel'
            ? { type: 'RESUME_TRAVEL' }
            : { type: 'CANCEL_PLANNED_TRAVEL' };
        const applied = applyTravelCommands(workingJourney, [command], {
          currentLocation: input.gameState.lord.location,
          currentDate,
          knownLocationIds,
        });
        if (applied.rejected.length) throw new Error(applied.rejected[0].reason);
        workingJourney = applied.journey;
        transaction.intents.push(intent);
        transaction.nextJourney = workingJourney ? structuredClone(workingJourney) : null;
        transaction.eventDrafts.push({
          type: `travel.${intent.kind}`,
          actorIds: [intent.actorId],
          subjectRefs: [],
          location: { ...input.gameState.lord.location },
          reason: intent.evidenceText,
          visibility: 'public',
        });
        continue;
      }
      if (intent.kind === 'advance_travel') {
        const days = elapsedDays(intent);
        if (days <= 0) throw new Error('旅行推进缺少明确的正数时长');
        const patch = advanceJourney({
          journey: workingJourney,
          playerLocation: input.gameState.lord.location,
          vehicles: input.gameState.lord.items.vehicles,
          itemPlacements: input.gameState.lord.items.placements,
          knownLocationIds,
          characters: fallbackContext.characters.map((character) => ({
            id: character.id,
            alive: character.alive,
            locationId: character.locationId,
          })),
        }, days);
        const planned = planJourneyTransaction({ ...patch, elapsedDays: days }, {
          playerId,
          turn: input.nextTurnNumber,
          transactionId,
          source: 'player_input',
          reason: intent.evidenceText,
          currentDate,
        });
        mergeWorldTransaction(transaction, planned);
        workingJourney = planned.nextJourney ? structuredClone(planned.nextJourney) : undefined;
        continue;
      }
      transaction.intents.push(intent);
      if (intent.kind === 'move_inside_location' && target) {
        transaction.mutations.push({ type: 'character.move', characterId: intent.actorId, location: { ...target }, activity: 'idle' });
      }
      transaction.eventDrafts.push({
        type: `intent.${intent.kind}`,
        actorIds: [intent.actorId],
        subjectRefs: target ? [{ type: 'location', location: { ...target } }] : [],
        ...(target ? { location: { ...target } } : {}),
        reason: intent.evidenceText,
        visibility: 'public',
      });
    }

    const pending = input.pendingTransactions.filter((entry) => entry.status === 'pending');
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
    const queuedTravelCommands = pending.flatMap((entry) => entry.travelCommands ?? []);
    if (queuedTravelCommands.length) {
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
      rejectionReason: stripEmoji(error instanceof Error ? error.message : '世界事务准备失败'),
    };
  }

  const hasWork = transaction.intents.length > 0
    || transaction.mutations.length > 0
    || Boolean(transaction.itemCommands?.length)
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
  };
}

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

function worldEventAsFact(event: WorldEvent): WorldEventFact {
  const location = event.location
    ?? event.subjectRefs.find((subject) => subject.type === 'location')?.location;
  return {
    id: event.id,
    turn: event.turn,
    date: { ...event.date },
    source: event.source === 'ui_action' ? 'item' : event.source === 'system_rule' ? 'system' : 'player',
    kind: event.type,
    title: event.type.startsWith('travel.') ? '旅程状态更新' : '世界状态更新',
    summary: stripEmoji(event.reason),
    participantIds: [...event.actorIds],
    commandTypes: [],
    ...(location ? { location: { ...location } } : {}),
  };
}

function committedNarrationContext(
  location: WorldLocationRef,
  locations: readonly MapLocationSearchEntry[],
  events: readonly WorldEvent[],
  rejectionLines: readonly string[] = [],
): string {
  const locationName = locations.find((entry) => entry.id === location.locationId)?.name ?? '所在地未查明';
  const place = location.sceneLocation ? `${locationName} · ${stripEmoji(location.sceneLocation)}` : locationName;
  const eventLines = events.slice(-12).map((event) => `- ${stripEmoji(event.reason)}`);
  return stripEmoji([
    '【程序已提交的世界状态】',
    `- 当前地点：${place}`,
    ...(eventLines.length ? ['- 本回合世界事件：', ...eventLines] : []),
    ...(rejectionLines.length ? ['- 未执行的世界意图：', ...rejectionLines.map((line) => `- ${line}`)] : []),
  ].join('\n')).replace(/\bb_[a-z0-9_]+\b/gi, '已验证地点');
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

  const locationRejections = prepared.rejectedIntents.map((entry) => ({ type: entry.intent.kind, reason: entry.reason }));
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
