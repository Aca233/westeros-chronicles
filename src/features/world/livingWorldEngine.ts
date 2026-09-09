import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import type { WorldLocationRef } from '../../domain/worldLocation';
import { advanceWorldDate, compareWorldDates } from './worldHistory.ts';
import type { LivingWorldState, OngoingWorldAction, PendingInformation, WorldSituation } from './livingWorldContracts';
import { RIVERLANDS_CRISIS } from './livingWorldScenario.ts';
import type { LivingWorldIntent, WorldEvent, WorldRuntimeState, WorldSubjectRef } from './worldRuntimeTypes';

export interface LivingWorldAdvanceContext {
  turn: number;
  playerId: CharacterId;
  playerLocation: WorldLocationRef;
  transactionId?: string;
}

export interface LivingWorldAdvanceResult {
  runtime: WorldRuntimeState;
  actualDays: number;
  events: WorldEvent[];
  stoppedForDecision?: { situationId: string; reason: string };
}

export interface LivingWorldIntentContext {
  turn: number;
  actorId: CharacterId;
  actorLocation: WorldLocationRef;
  transactionId: string;
  hasDelegationConsent?: (assigneeId: CharacterId | undefined) => boolean;
}

function dateKey(date: WorldDate): string {
  return `${date.year}.${date.month}.${date.day}`;
}

function cloneRuntime(runtime: WorldRuntimeState): WorldRuntimeState {
  return structuredClone(runtime);
}

function nextDay(date: WorldDate): WorldDate {
  return advanceWorldDate(date, { days: 1 });
}

function sameLocation(left: WorldLocationRef | undefined, right: WorldLocationRef | undefined): boolean {
  return Boolean(left && right && left.locationId === right.locationId);
}

function findSituation(living: LivingWorldState, id: string | undefined, location: WorldLocationRef): WorldSituation | undefined {
  return id
    ? living.situations.find((entry) => entry.id === id)
    : living.situations.find((entry) => sameLocation(entry.location, location) && entry.stage !== 'resolved');
}

function eventId(turn: number, date: WorldDate, key: string): string {
  return `scheduler:${turn}:${dateKey(date)}:${key}`;
}

function appendEvent(
  runtime: WorldRuntimeState,
  out: WorldEvent[],
  date: WorldDate,
  context: LivingWorldAdvanceContext,
  key: string,
  draft: Omit<WorldEvent, 'id' | 'transactionId' | 'turn' | 'date' | 'occurredAt'>,
): WorldEvent {
  const id = eventId(context.turn, date, key);
  const existing = runtime.events.find((entry) => entry.id === id);
  if (existing) return existing;
  const event: WorldEvent = {
    ...structuredClone(draft),
    id,
    transactionId: context.transactionId ?? `turn:${context.turn}:scheduler`,
    turn: context.turn,
    date: { ...date },
    occurredAt: { ...date },
  };
  runtime.events.push(event);
  out.push(event);
  return event;
}

function appendCausalLink(living: LivingWorldState, event: WorldEvent, rule: string, affectedRefs: Array<{ type: 'location' | 'character' | 'asset' | 'situation' | 'action'; id: string }>): void {
  if (living.causalLinks.some((link) => link.id === `cause:${event.id}`)) return;
  living.causalLinks.push({
    id: `cause:${event.id}`,
    causeEventIds: [...(event.causeEventIds ?? [])],
    rule,
    affectedRefs,
    occurredAt: { ...event.date },
    knownBy: [...(event.knownBy ?? [])],
  });
}

function queueInformation(
  living: LivingWorldState,
  sourceEvent: WorldEvent,
  source: WorldLocationRef,
  destination: WorldLocationRef,
  recipientIds: CharacterId[],
  summary: string,
): void {
  const channel = living.connections.informationLinks.find((entry) => sameLocation(entry.source, source) && sameLocation(entry.destination, destination));
  if (!channel) return;
  const id = `info:${sourceEvent.id}:${destination.locationId}:${recipientIds.join('+')}`;
  if (living.information.some((entry) => entry.id === id)) return;
  living.information.push({
    id,
    sourceEventId: sourceEvent.id,
    recipientIds: [...new Set(recipientIds)],
    source: { ...source },
    destination: { ...destination },
    sentAt: { ...sourceEvent.date },
    arrivesAt: advanceWorldDate(sourceEvent.date, { days: channel.delayDays }),
    status: 'in_transit',
    summary,
  });
}

function processInformation(
  runtime: WorldRuntimeState,
  living: LivingWorldState,
  date: WorldDate,
  context: LivingWorldAdvanceContext,
  out: WorldEvent[],
): void {
  const due = living.information
    .filter((message) => message.status === 'in_transit' && compareWorldDates(message.arrivesAt, date) <= 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const message of due) {
    message.status = 'delivered';
    message.deliveredAt = { ...date };
    for (const situation of living.situations) {
      if (situation.sourceEventIds.includes(message.sourceEventId)) {
        situation.knownBy = [...new Set([...situation.knownBy, ...message.recipientIds])].sort();
      }
    }
    const event = appendEvent(runtime, out, date, context, `information:${message.id}`, {
      type: 'information.delivered',
      actorIds: message.senderId ? [message.senderId] : [],
      subjectRefs: message.recipientIds.map((characterId) => ({ type: 'character' as const, characterId })),
      location: { ...message.destination },
      reason: `消息送达：${message.summary}`,
      source: 'system_rule',
      causeEventIds: [message.sourceEventId],
      causeSource: { type: 'rule', id: 'information.propagation' },
      affectedRefs: message.recipientIds.map((characterId) => ({ type: 'character' as const, characterId })),
      visibility: 'secret',
      knownBy: [...message.recipientIds],
      knowledgeBasis: message.recipientIds.map((characterId) => ({ characterId, kind: 'message' as const, sourceEventId: message.sourceEventId })),
    });
    appendCausalLink(living, event, 'information.propagation', message.recipientIds.map((id) => ({ type: 'character', id })));
  }
}

function roadBlockedForAction(living: LivingWorldState, action: OngoingWorldAction): string | undefined {
  for (const id of action.routeConnectionIds ?? []) {
    const road = living.connections.roads.find((entry) => entry.id === id);
    if (road && !road.open && action.authorization !== 'escort') return road.blockedReason ?? `道路 ${id} 已封闭`;
  }
  return undefined;
}

function targetStockpile(living: LivingWorldState, action: OngoingWorldAction) {
  return living.stockpiles.find((stockpile) => sameLocation(stockpile.location, action.target) && stockpile.commodity === action.resource?.commodity);
}

function processTransport(
  runtime: WorldRuntimeState,
  living: LivingWorldState,
  action: OngoingWorldAction,
  date: WorldDate,
  context: LivingWorldAdvanceContext,
  out: WorldEvent[],
): void {
  const blockedReason = roadBlockedForAction(living, action);
  if (blockedReason) {
    action.status = 'blocked';
    action.interruptedBy = blockedReason;
    const blockade = action.sourceSituationId ? living.situations.find((entry) => entry.id === action.sourceSituationId) : undefined;
    const causeEventIds = blockade?.sourceEventIds ?? [];
    const event = appendEvent(runtime, out, date, context, `transport-blocked:${action.id}`, {
      type: 'action.transport.blocked',
      actorIds: [...action.actorIds],
      subjectRefs: [{ type: 'location', location: { ...action.target } }],
      location: action.source ? { ...action.source } : { ...action.target },
      reason: `运输受阻：${blockedReason}`,
      source: 'system_rule',
      causeEventIds: [...causeEventIds],
      causeSource: { type: 'rule', id: 'transport.route-availability' },
      affectedRefs: [{ type: 'location', location: { ...action.target } }],
      visibility: 'secret',
      knownBy: [...action.actorIds],
      knowledgeBasis: action.actorIds.map((characterId) => ({ characterId, kind: 'witness' as const })),
    });
    action.sourceEventIds = [...new Set([...(action.sourceEventIds ?? []), event.id])];
    if (blockade) blockade.sourceEventIds = [...new Set([...blockade.sourceEventIds, event.id])];
    appendCausalLink(living, event, 'transport.route-availability', [{ type: 'action', id: action.id }]);
    const { locations, actors } = RIVERLANDS_CRISIS;
    queueInformation(living, event, { locationId: locations.ferry }, { locationId: locations.sourceSettlement }, [actors.runnymuddHolder], '原定粮运在老渡口受阻。');
    queueInformation(living, event, { locationId: locations.ferry }, { locationId: locations.market }, [actors.ramsfordHolder], '前往美人集的粮运在老渡口受阻。');
    return;
  }

  action.progress = Math.min(1, action.progress + 0.5);
  action.nextEventAt = nextDay(date);
  if (action.progress < 1) return;
  action.status = 'completed';
  const stockpile = targetStockpile(living, action);
  if (stockpile && action.resource) {
    stockpile.quantity += action.resource.quantity;
    stockpile.updatedAt = { ...date };
  }
  const event = appendEvent(runtime, out, date, context, `transport-arrived:${action.id}`, {
    type: 'action.transport.completed',
    actorIds: [...action.actorIds],
    subjectRefs: [{ type: 'location', location: { ...action.target } }],
    location: { ...action.target },
    reason: `运输抵达${action.target.locationId}，${action.resource?.quantity ?? 0} 单位粮食进入当地储备。`,
    source: 'system_rule',
    causeEventIds: [...(action.sourceEventIds ?? [])],
    causeSource: { type: 'action', id: action.id },
    affectedRefs: [{ type: 'location', location: { ...action.target } }],
    visibility: 'secret',
    knownBy: [...action.actorIds],
    knowledgeBasis: action.actorIds.map((characterId) => ({ characterId, kind: 'witness' as const })),
  });
  action.sourceEventIds = [...new Set([...(action.sourceEventIds ?? []), event.id])];
  appendCausalLink(living, event, 'transport.delivery', [{ type: 'action', id: action.id }, { type: 'location', id: action.target.locationId }]);
}

function processPlayerProcessAction(
  runtime: WorldRuntimeState,
  living: LivingWorldState,
  action: OngoingWorldAction,
  date: WorldDate,
  context: LivingWorldAdvanceContext,
  out: WorldEvent[],
): void {
  if (action.kind === 'investigation') {
    action.status = 'completed';
    action.progress = 1;
    const situation = action.sourceSituationId ? living.situations.find((entry) => entry.id === action.sourceSituationId) : undefined;
    if (situation) situation.knownBy = [...new Set([...situation.knownBy, ...action.actorIds])];
    const event = appendEvent(runtime, out, date, context, `investigation:${action.id}`, {
      type: 'action.investigation.completed', actorIds: [...action.actorIds], subjectRefs: [{ type: 'location', location: { ...action.target } }], location: { ...action.target },
      reason: '调查完成，行动者获得了可验证的当地局势信息。', source: 'system_rule', causeEventIds: [...(situation?.sourceEventIds ?? [])], causeSource: { type: 'action', id: action.id },
      visibility: 'secret', knownBy: [...action.actorIds], knowledgeBasis: action.actorIds.map((characterId) => ({ characterId, kind: 'witness' as const })),
    });
    if (situation) situation.sourceEventIds = [...new Set([...situation.sourceEventIds, event.id])];
    appendCausalLink(living, event, 'investigation.complete', [{ type: 'action', id: action.id }]);
    return;
  }
  if (action.kind === 'negotiation') {
    action.status = 'completed'; action.progress = 1;
    const blockade = action.sourceSituationId ? living.situations.find((entry) => entry.id === action.sourceSituationId) : undefined;
    for (const actorId of action.actorIds) {
      if (!living.connections.authorityLinks.some((entry) => entry.controllerId === actorId && entry.permission === 'escort' && sameLocation(entry.subject, action.target))) {
        living.connections.authorityLinks.push({ id: `authority:${action.id}:${actorId}:escort`, controllerId: actorId, subject: { ...action.target }, permission: 'escort' });
      }
    }
    const event = appendEvent(runtime, out, date, context, `negotiation:${action.id}`, {
      type: 'action.negotiation.permission_granted', actorIds: [...action.actorIds], subjectRefs: [{ type: 'location', location: { ...action.target } }], location: { ...action.target },
      reason: '交涉完成：行动者取得了经此处护送运输的有限通行许可；封锁本身并未因此凭空消失。', source: 'system_rule', causeEventIds: [...(blockade?.sourceEventIds ?? [])], causeSource: { type: 'action', id: action.id },
      visibility: 'secret', knownBy: [...action.actorIds], knowledgeBasis: action.actorIds.map((characterId) => ({ characterId, kind: 'witness' as const })),
    });
    appendCausalLink(living, event, 'negotiation.permission', [{ type: 'action', id: action.id }]);
    return;
  }
  action.status = 'completed';
  action.progress = 1;
  appendEvent(runtime, out, date, context, `${action.kind}:${action.id}`, {
    type: `action.${action.kind}.completed`, actorIds: [...action.actorIds], subjectRefs: [{ type: 'location', location: { ...action.target } }], location: { ...action.target },
    reason: `${action.kind} 按既定条件完成。`, source: 'system_rule', causeEventIds: [...(action.sourceEventIds ?? [])], causeSource: { type: 'action', id: action.id },
    visibility: 'secret', knownBy: [...action.actorIds], knowledgeBasis: action.actorIds.map((characterId) => ({ characterId, kind: 'witness' as const })),
  });
}

function processActions(runtime: WorldRuntimeState, living: LivingWorldState, date: WorldDate, context: LivingWorldAdvanceContext, out: WorldEvent[]): void {
  const due = living.actions
    .filter((action) => action.status === 'active' && compareWorldDates(action.nextEventAt, date) <= 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const action of due) {
    const key = `action:${action.id}:${dateKey(date)}`;
    if (living.processedScheduleKeys.includes(key)) continue;
    living.processedScheduleKeys.push(key);
    if (action.kind === 'transport') processTransport(runtime, living, action, date, context, out);
    else processPlayerProcessAction(runtime, living, action, date, context, out);
  }
}

function consumeStockpiles(runtime: WorldRuntimeState, living: LivingWorldState, date: WorldDate, context: LivingWorldAdvanceContext, out: WorldEvent[]): WorldEvent[] {
  const consumptionEvents: WorldEvent[] = [];
  for (const stockpile of [...living.stockpiles].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `consume:${stockpile.id}:${dateKey(date)}`;
    if (living.processedScheduleKeys.includes(key)) continue;
    living.processedScheduleKeys.push(key);
    const consumed = Math.min(stockpile.quantity, stockpile.dailyConsumption);
    stockpile.quantity = Math.max(0, stockpile.quantity - consumed);
    stockpile.updatedAt = { ...date };
    const localKnownBy = RIVERLANDS_CRISIS.locations.market === stockpile.location.locationId ? [RIVERLANDS_CRISIS.actors.ramsfordHolder] : [];
    const event = appendEvent(runtime, out, date, context, `consume:${stockpile.id}`, {
      type: 'supply.consumed', actorIds: [], subjectRefs: [{ type: 'location', location: { ...stockpile.location } }], location: { ...stockpile.location },
      reason: `${stockpile.location.locationId} 当日消耗 ${consumed} 单位${stockpile.commodity === 'grain' ? '粮食' : '物资'}，剩余 ${stockpile.quantity}。`, source: 'system_rule',
      causeSource: { type: 'rule', id: 'supply.daily-consumption' }, affectedRefs: [{ type: 'location', location: { ...stockpile.location } }],
      visibility: 'secret', knownBy: localKnownBy, knowledgeBasis: localKnownBy.map((characterId) => ({ characterId, kind: 'witness' as const })),
    });
    appendCausalLink(living, event, 'supply.daily-consumption', [{ type: 'location', id: stockpile.location.locationId }]);
    consumptionEvents.push(event);
  }
  return consumptionEvents;
}

function latestEvent(runtime: WorldRuntimeState, type: string): WorldEvent | undefined {
  return [...runtime.events].reverse().find((event) => event.type === type);
}

function updateShortage(runtime: WorldRuntimeState, living: LivingWorldState, date: WorldDate, context: LivingWorldAdvanceContext, out: WorldEvent[], consumptionEvents: readonly WorldEvent[]): void {
  const shortage = living.situations.find((entry) => entry.kind === 'grain_shortage');
  const stockpile = living.stockpiles.find((entry) => entry.commodity === 'grain' && sameLocation(entry.location, shortage?.location));
  if (!shortage || !stockpile) return;
  const previous = shortage.stage;
  const next = stockpile.quantity <= stockpile.criticalThreshold ? 'escalating'
    : stockpile.quantity <= stockpile.shortageThreshold ? 'active'
      : previous === 'forming' ? 'forming' : 'resolved';
  shortage.stage = next;
  shortage.severity = next === 'escalating' ? 2 : next === 'active' ? 1 : 0;
  shortage.nextCheck = nextDay(date);
  if (next === previous) return;
  const blocked = latestEvent(runtime, 'action.transport.blocked');
  const causeEventIds = [...new Set([...(blocked ? [blocked.id] : []), ...consumptionEvents.map((event) => event.id)])];
  const local = RIVERLANDS_CRISIS.actors.ramsfordHolder;
  shortage.knownBy = [...new Set([...shortage.knownBy, local])];
  const event = appendEvent(runtime, out, date, context, `shortage:${shortage.id}:${next}`, {
    type: `situation.grain_shortage.${next}`, actorIds: [], subjectRefs: [{ type: 'location', location: { ...shortage.location } }], location: { ...shortage.location },
    reason: next === 'active' ? `美人集粮食储备降至短缺阈值（${stockpile.quantity}）。` : next === 'escalating' ? `美人集粮食储备进入严重短缺（${stockpile.quantity}）。` : '美人集粮食储备恢复到短缺阈值以上。',
    source: 'system_rule', causeEventIds, causeSource: { type: 'rule', id: 'supply.shortage-threshold' }, affectedRefs: [{ type: 'location', location: { ...shortage.location } }],
    visibility: 'secret', knownBy: [local], knowledgeBasis: [{ characterId: local, kind: 'witness' }],
  });
  shortage.sourceEventIds = [...new Set([...shortage.sourceEventIds, event.id])];
  appendCausalLink(living, event, 'supply.shortage-threshold', [{ type: 'situation', id: shortage.id }, { type: 'location', id: shortage.location.locationId }]);
  queueInformation(living, event, shortage.location, { locationId: RIVERLANDS_CRISIS.locations.sourceSettlement }, [RIVERLANDS_CRISIS.actors.runnymuddHolder], '美人集的粮食储备已经进入短缺。');
}

function npcStrategies(runtime: WorldRuntimeState, living: LivingWorldState, date: WorldDate, context: LivingWorldAdvanceContext, out: WorldEvent[]): void {
  const shipment = living.actions.find((entry) => entry.id === RIVERLANDS_CRISIS.actions.shipment);
  const blockade = living.situations.find((entry) => entry.id === RIVERLANDS_CRISIS.situations.blockade);
  const runny = RIVERLANDS_CRISIS.actors.runnymuddHolder;
  const blockedEvent = latestEvent(runtime, 'action.transport.blocked');
  const receivedBlockedReport = Boolean(blockedEvent && living.information.some((message) => (
    message.sourceEventId === blockedEvent.id
    && message.status === 'delivered'
    && message.recipientIds.includes(runny)
  )));
  if (shipment?.status === 'blocked' && blockade?.knownBy.includes(runny) && receivedBlockedReport) {
    const key = `npc:${runny}:reroute:${shipment.id}`;
    if (!living.processedScheduleKeys.includes(key)) {
      const alternative = [RIVERLANDS_CRISIS.roads.sourceToCastle, RIVERLANDS_CRISIS.roads.castleToFord, RIVERLANDS_CRISIS.roads.fordToMarket];
      const open = alternative.every((id) => living.connections.roads.find((road) => road.id === id)?.open !== false);
      living.processedScheduleKeys.push(key);
      if (open) {
        shipment.routeConnectionIds = alternative;
        shipment.status = 'active';
        delete shipment.interruptedBy;
        shipment.nextEventAt = nextDay(date);
        const event = appendEvent(runtime, out, date, context, `npc-reroute:${shipment.id}`, {
          type: 'npc.strategy.reroute_transport', actorIds: [runny], subjectRefs: [{ type: 'location', location: { ...shipment.target } }], location: { locationId: RIVERLANDS_CRISIS.locations.sourceSettlement },
          reason: '埃伦妮在收到受阻报告后，把粮运改经罗尼堡与公羊渡的替代道路。', source: 'system_rule', causeEventIds: blockedEvent ? [blockedEvent.id] : [], causeSource: { type: 'rule', id: 'npc.known-blockage-reroute' },
          visibility: 'secret', knownBy: [runny], knowledgeBasis: [{ characterId: runny, kind: 'message', sourceEventId: blockedEvent!.id }],
        });
        shipment.sourceEventIds = [...new Set([...(shipment.sourceEventIds ?? []), event.id])];
        appendCausalLink(living, event, 'npc.known-blockage-reroute', [{ type: 'action', id: shipment.id }]);
      }
    }
  }

  const shortage = living.situations.find((entry) => entry.id === RIVERLANDS_CRISIS.situations.shortage);
  const local = RIVERLANDS_CRISIS.actors.ramsfordHolder;
  if (shortage && (shortage.stage === 'active' || shortage.stage === 'escalating') && shortage.knownBy.includes(local)) {
    const key = `npc:${local}:request-help:${shortage.id}`;
    if (!living.processedScheduleKeys.includes(key)) {
      living.processedScheduleKeys.push(key);
      living.actions.push({ id: `action:npc-request-help:${dateKey(date)}`, kind: 'request_help', actorIds: [local], target: { locationId: RIVERLANDS_CRISIS.locations.sourceSettlement }, progress: 1, nextEventAt: { ...date }, status: 'completed', sourceSituationId: shortage.id, sourceEventIds: [...shortage.sourceEventIds], authorization: 'none', processedEventKeys: [] });
      const source = shortage.sourceEventIds[shortage.sourceEventIds.length - 1];
      const event = appendEvent(runtime, out, date, context, `npc-request-help:${shortage.id}`, {
        type: 'npc.strategy.request_help', actorIds: [local], subjectRefs: [{ type: 'location', location: { locationId: RIVERLANDS_CRISIS.locations.sourceSettlement } }], location: { ...shortage.location },
        reason: '美兰莎在确认当地短缺后发出求援，而不是在消息抵达前预知危机。', source: 'system_rule', causeEventIds: source ? [source] : [], causeSource: { type: 'rule', id: 'npc.known-shortage-request-help' },
        visibility: 'secret', knownBy: [local], knowledgeBasis: source ? [{ characterId: local, kind: 'witness', sourceEventId: source }] : [{ characterId: local, kind: 'witness' }],
      });
      appendCausalLink(living, event, 'npc.known-shortage-request-help', [{ type: 'situation', id: shortage.id }]);
    }
  }
}

function revealLocalSituation(living: LivingWorldState, playerId: CharacterId, playerLocation: WorldLocationRef): WorldSituation | undefined {
  const situation = living.situations.find((entry) => entry.stage !== 'resolved' && sameLocation(entry.location, playerLocation));
  if (!situation) return undefined;
  situation.knownBy = [...new Set([...situation.knownBy, playerId])];
  if (situation.stage === 'active' || situation.stage === 'escalating') situation.requiresPlayerDecision = true;
  return situation;
}

export function advanceLivingWorld(
  runtime: WorldRuntimeState,
  fromDate: WorldDate,
  requestedDays: number,
  context: LivingWorldAdvanceContext,
): LivingWorldAdvanceResult {
  if (!Number.isInteger(requestedDays) || requestedDays < 0) throw new Error('统一时间调度只接受非负整数天数');
  if (!runtime.livingWorld || requestedDays === 0) return { runtime: cloneRuntime(runtime), actualDays: 0, events: [] };
  const nextRuntime = cloneRuntime(runtime);
  const living = nextRuntime.livingWorld!;
  const events: WorldEvent[] = [];
  let actualDays = 0;
  let date = { ...fromDate };
  let stoppedForDecision: LivingWorldAdvanceResult['stoppedForDecision'];
  for (let index = 0; index < requestedDays; index += 1) {
    date = nextDay(date);
    actualDays += 1;
    processInformation(nextRuntime, living, date, context, events);
    processActions(nextRuntime, living, date, context, events);
    const consumptionEvents = consumeStockpiles(nextRuntime, living, date, context, events);
    updateShortage(nextRuntime, living, date, context, events, consumptionEvents);
    npcStrategies(nextRuntime, living, date, context, events);
    const local = revealLocalSituation(living, context.playerId, context.playerLocation);
    if (local?.requiresPlayerDecision && local.knownBy.includes(context.playerId)) {
      stoppedForDecision = { situationId: local.id, reason: `你已在${local.location.locationId}接触到需要决定的持续局势。` };
      break;
    }
  }
  return { runtime: nextRuntime, actualDays, events, ...(stoppedForDecision ? { stoppedForDecision } : {}) };
}

function authorityAllows(living: LivingWorldState, actorId: CharacterId, permission: 'travel' | 'investigate' | 'escort' | 'garrison', location: WorldLocationRef): boolean {
  return living.connections.authorityLinks.some((entry) => entry.controllerId === actorId && entry.permission === permission && sameLocation(entry.subject, location));
}

function livingSubject(location: WorldLocationRef): WorldSubjectRef[] {
  return [{ type: 'location', location: { ...location } }];
}

export function applyLivingWorldIntent(
  runtime: WorldRuntimeState,
  intent: LivingWorldIntent,
  currentDate: WorldDate,
  context: LivingWorldIntentContext,
): { runtime: WorldRuntimeState; events: WorldEvent[] } {
  if (!runtime.livingWorld) throw new Error('当前存档未启用活世界规则；旧档不会静默套用新规则');
  if (intent.actorId !== context.actorId) throw new Error('只能以当前行动人物执行地方事务');
  const nextRuntime = cloneRuntime(runtime);
  const living = nextRuntime.livingWorld!;
  const situation = findSituation(living, intent.situationId, context.actorLocation);
  const target = situation?.location ?? context.actorLocation;
  const id = `action:player:${context.turn}:${intent.kind}`;
  if (living.actions.some((action) => action.id === id && action.status !== 'cancelled')) throw new Error('同一回合的该项持续行动已经存在');
  const knows = Boolean(situation?.knownBy.includes(context.actorId));
  if (intent.kind !== 'investigate_situation' && situation && !knows && !sameLocation(situation.location, context.actorLocation)) throw new Error('行动者尚不知道该局势，不能从远方直接干预');

  let action: OngoingWorldAction;
  if (intent.kind === 'investigate_situation') {
    if (!situation || !sameLocation(situation.location, context.actorLocation)) throw new Error('个人调查必须实际到达相关地点');
    action = { id, kind: 'investigation', actorIds: [context.actorId], target: { ...target }, progress: 0, nextEventAt: nextDay(currentDate), status: 'active', sourceSituationId: situation.id, sourceEventIds: [...situation.sourceEventIds], authorization: authorityAllows(living, context.actorId, 'investigate', target) ? 'investigate' : 'none', processedEventKeys: [] };
  } else if (intent.kind === 'negotiate_access') {
    if (!situation || situation.kind !== 'ferry_blockade' || !sameLocation(situation.location, context.actorLocation)) throw new Error('交涉通行必须在实际封锁地点进行');
    action = { id, kind: 'negotiation', actorIds: [context.actorId], target: { ...target }, progress: 0, nextEventAt: nextDay(currentDate), status: 'active', sourceSituationId: situation.id, sourceEventIds: [...situation.sourceEventIds], authorization: 'none', processedEventKeys: [] };
  } else if (intent.kind === 'escort_transport') {
    const transport = living.actions.find((entry) => entry.id === intent.actionId && entry.kind === 'transport');
    if (!transport || (transport.status !== 'blocked' && transport.status !== 'active')) throw new Error('没有可护送的有效运输行动');
    if (!authorityAllows(living, context.actorId, 'escort', { locationId: RIVERLANDS_CRISIS.locations.ferry })) throw new Error('缺少护送该运输通过封锁点的授权');
    if (transport.resource?.quantity === undefined || transport.resource.quantity <= 0) throw new Error('运输没有可护送的实际物资');
    transport.authorization = 'escort';
    transport.status = 'active';
    delete transport.interruptedBy;
    transport.nextEventAt = nextDay(currentDate);
    action = { id, kind: 'escort', actorIds: [context.actorId], target: { ...transport.target }, source: { ...context.actorLocation }, progress: 0, nextEventAt: nextDay(currentDate), status: 'active', sourceSituationId: transport.sourceSituationId, sourceEventIds: [...(transport.sourceEventIds ?? [])], authorization: 'escort', processedEventKeys: [] };
  } else if (intent.kind === 'reroute_transport') {
    const transport = living.actions.find((entry) => entry.id === intent.actionId && entry.kind === 'transport');
    if (!transport || (transport.status !== 'blocked' && transport.status !== 'active')) throw new Error('没有可改道的有效运输行动');
    if (!authorityAllows(living, context.actorId, 'escort', { locationId: RIVERLANDS_CRISIS.locations.ferry })) throw new Error('缺少改变该运输安排的授权');
    const alternative = [RIVERLANDS_CRISIS.roads.sourceToCastle, RIVERLANDS_CRISIS.roads.castleToFord, RIVERLANDS_CRISIS.roads.fordToMarket];
    if (alternative.some((roadId) => living.connections.roads.find((road) => road.id === roadId)?.open === false)) throw new Error('替代道路当前不可通行');
    transport.routeConnectionIds = alternative;
    transport.status = 'active'; delete transport.interruptedBy; transport.nextEventAt = nextDay(currentDate);
    action = { id, kind: 'reroute', actorIds: [context.actorId], target: { ...transport.target }, progress: 1, nextEventAt: { ...currentDate }, status: 'completed', sourceSituationId: transport.sourceSituationId, sourceEventIds: [...(transport.sourceEventIds ?? [])], authorization: 'escort', processedEventKeys: [] };
  } else if (intent.kind === 'request_relief') {
    if (!situation || situation.kind !== 'grain_shortage' || !sameLocation(situation.location, context.actorLocation)) throw new Error('求援必须基于行动者实际接触到的短缺');
    action = { id, kind: 'request_help', actorIds: [context.actorId], target: { locationId: RIVERLANDS_CRISIS.locations.sourceSettlement }, source: { ...context.actorLocation }, progress: 1, nextEventAt: { ...currentDate }, status: 'completed', sourceSituationId: situation.id, sourceEventIds: [...situation.sourceEventIds], authorization: 'none', processedEventKeys: [] };
  } else {
    if (!context.hasDelegationConsent?.(intent.assigneeId)) throw new Error('委派必须引用受任者已明确同意的现有交涉或委派记录');
    if (!intent.assigneeId) throw new Error('委派缺少受任者');
    action = { id, kind: 'delegated_task', actorIds: [intent.assigneeId], target: { ...target }, progress: 0, nextEventAt: nextDay(currentDate), status: 'active', sourceSituationId: situation?.id, sourceEventIds: [...(situation?.sourceEventIds ?? [])], authorization: 'none', processedEventKeys: [] };
  }
  living.actions.push(action);
  const event: WorldEvent = {
    id: `${context.transactionId}:living:${intent.kind}`,
    transactionId: context.transactionId,
    turn: context.turn,
    date: { ...currentDate },
    occurredAt: { ...currentDate },
    type: `intent.${intent.kind}.accepted`,
    actorIds: [context.actorId],
    subjectRefs: livingSubject(target),
    location: { ...context.actorLocation },
    reason: intent.evidenceText,
    source: 'player_input',
    causeEventIds: [...(action.sourceEventIds ?? [])],
    causeSource: { type: 'action', id: action.id },
    visibility: 'secret',
    knownBy: [...new Set([context.actorId, ...action.actorIds])],
    knowledgeBasis: [{ characterId: context.actorId, kind: 'witness' }],
  };
  if (!nextRuntime.events.some((entry) => entry.id === event.id)) nextRuntime.events.push(event);
  action.sourceEventIds = [...new Set([...(action.sourceEventIds ?? []), event.id])];
  appendCausalLink(living, event, `intent.${intent.kind}`, [{ type: 'action', id: action.id }]);
  return { runtime: nextRuntime, events: [event] };
}

export function knownLivingWorldSituations(runtime: WorldRuntimeState, viewer: CharacterId, debug = false): WorldSituation[] {
  if (!runtime.livingWorld) return [];
  return runtime.livingWorld.situations.filter((situation) => debug || situation.knownBy.includes(viewer));
}

export function knownLivingWorldActions(runtime: WorldRuntimeState, viewer: CharacterId, debug = false): OngoingWorldAction[] {
  if (!runtime.livingWorld) return [];
  const knownEventIds = new Set(runtime.events.filter((event) => debug || event.visibility === 'public' || event.knownBy?.includes(viewer)).map((event) => event.id));
  return runtime.livingWorld.actions.filter((action) => debug || action.actorIds.includes(viewer) || (action.sourceEventIds ?? []).some((id) => knownEventIds.has(id)));
}

export function routeBlockReason(runtime: WorldRuntimeState, routeLocationIds: readonly string[]): string | undefined {
  const roads = runtime.livingWorld?.connections.roads ?? [];
  for (let index = 0; index < routeLocationIds.length - 1; index += 1) {
    const from = routeLocationIds[index];
    const to = routeLocationIds[index + 1];
    const road = roads.find((entry) => entry.from.locationId === from && entry.to.locationId === to);
    if (road && !road.open) return road.blockedReason ?? `道路 ${road.id} 已关闭`;
  }
  return undefined;
}
