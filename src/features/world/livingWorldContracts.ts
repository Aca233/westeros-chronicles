import type { CharacterId } from '../../domain/characterId';
import type { WorldLocationRef } from '../../domain/worldLocation';
import type { WorldDate } from '../../domain/worldDate';

/**
 * Shared world graph contracts. These are projections over existing runtime state,
 * not a second state store.
 */
export interface WorldConnectionGraph {
  roads: WorldRouteConnection[];
  supplyLinks: SupplyConnection[];
  authorityLinks: AuthorityConnection[];
  informationLinks: InformationChannel[];
}

export interface WorldRouteConnection {
  id: string;
  from: WorldLocationRef;
  to: WorldLocationRef;
  kind: 'road' | 'ford' | 'ferry' | 'port';
  open: boolean;
  blockedReason?: string;
  updatedAt: WorldDate;
}

export interface SupplyConnection {
  id: string;
  source: WorldLocationRef;
  destination: WorldLocationRef;
  commodity: 'grain' | 'general';
  dailyCapacity: number;
  blockedBy?: string;
}

export interface AuthorityConnection {
  id: string;
  titleId?: string;
  controllerId?: CharacterId;
  subject: WorldLocationRef;
  permission: 'travel' | 'investigate' | 'escort' | 'garrison';
}

export interface InformationChannel {
  id: string;
  source: WorldLocationRef;
  destination: WorldLocationRef;
  delayDays: number;
  messenger?: CharacterId;
}

export type SituationStage = 'forming' | 'active' | 'escalating' | 'resolved';
export type SituationKind = 'ferry_blockade' | 'grain_shortage' | 'local_dispute';

export interface WorldSituation {
  id: string;
  kind: SituationKind;
  location: WorldLocationRef;
  participants: CharacterId[];
  pressure: string[];
  stage: SituationStage;
  nextCheck: WorldDate;
  endCondition: string;
  visibility: 'public' | 'secret';
  knownBy: CharacterId[];
  sourceEventIds: string[];
  severity?: number;
  requiresPlayerDecision?: boolean;
}

export type OngoingActionKind =
  | 'transport'
  | 'escort'
  | 'investigation'
  | 'negotiation'
  | 'relief'
  | 'request_help'
  | 'reroute'
  | 'wait'
  | 'report_blocked'
  | 'delegated_task';

export type OngoingActionStatus = 'planned' | 'active' | 'blocked' | 'completed' | 'cancelled' | 'refused';

export interface OngoingWorldAction {
  id: string;
  kind: OngoingActionKind;
  actorIds: CharacterId[];
  target: WorldLocationRef;
  source?: WorldLocationRef;
  progress: number;
  nextEventAt: WorldDate;
  status: OngoingActionStatus;
  routeConnectionIds?: string[];
  resource?: { commodity: 'grain' | 'general'; quantity: number };
  sourceSituationId?: string;
  sourceEventIds?: string[];
  authorization?: 'none' | 'travel' | 'investigate' | 'escort' | 'garrison';
  interruptedBy?: string;
  processedEventKeys?: string[];
}

export interface SupplyStockpile {
  id: string;
  location: WorldLocationRef;
  commodity: 'grain' | 'general';
  quantity: number;
  dailyConsumption: number;
  shortageThreshold: number;
  criticalThreshold: number;
  updatedAt: WorldDate;
}

export interface PendingInformation {
  id: string;
  sourceEventId: string;
  senderId?: CharacterId;
  recipientIds: CharacterId[];
  source: WorldLocationRef;
  destination: WorldLocationRef;
  sentAt: WorldDate;
  arrivesAt: WorldDate;
  status: 'in_transit' | 'delivered' | 'intercepted';
  summary: string;
  deliveredAt?: WorldDate;
}

export interface CausalEventLink {
  id: string;
  causeEventIds: string[];
  rule: string;
  affectedRefs: Array<{ type: 'location' | 'character' | 'asset' | 'situation' | 'action'; id: string }>;
  occurredAt: WorldDate;
  knownBy: CharacterId[];
}

export interface LivingWorldState {
  schemaVersion: 1;
  scenarioId: string;
  connections: WorldConnectionGraph;
  situations: WorldSituation[];
  actions: OngoingWorldAction[];
  stockpiles: SupplyStockpile[];
  information: PendingInformation[];
  causalLinks: CausalEventLink[];
  processedScheduleKeys: string[];
}
