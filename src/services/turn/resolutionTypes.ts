import type { CharacterEventInput } from '../../features/characters/characterEventStore';
import type { ActiveJourney } from '../../features/map/travel/types';
import type { MapLocationSearchEntry, SemanticMembership, WorldLocationRef } from '../../features/map/types';
import type { RoutePlan, RouteRequest } from '../../features/map/routing/types';
import type { CanonicalTimelineEvent } from '../../features/world/canonicalTimeline';
import type {
  CanonicalEventState,
  RejectedWorldCommand,
  WorldDate,
  WorldEventFact,
  WorldHistoryState,
} from '../../features/world/worldHistory';
import type {
  PendingWorldTransaction,
  WorldRuntimeState,
  WorldTransaction,
} from '../../features/world/worldRuntimeTypes';
import type { UnresolvedWorldIntent, RejectedWorldIntent, ResolvedLocationWorldIntent } from '../../features/world/worldIntentResolver';
import type { WorldBaselineSnapshot } from '../../features/world/worldBaseline';
import type { RoleplayState } from '../../features/roleplay/types';
import type { ApiConfig, D20Check, GameState, LordProfile, StateCommand } from '../../types/game';
import type { CharacterCommandBatchBaseContext } from '../stateReducer';

export interface TurnResolutionDraft {
  outcomeSummary: string;
  stateCommands: StateCommand[];
  worldIntents: UnresolvedWorldIntent[];
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
  roleplay?: RoleplayState;
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

export interface WorldContextAvailability {
  map: 'available' | 'unavailable' | 'not-required';
  reason?: string;
}

export interface PreparedWorldTurn {
  transactionId: string;
  baseline: WorldBaselineSnapshot;
  transaction?: WorldTransaction;
  acceptedCommands: StateCommand[];
  locations: readonly MapLocationSearchEntry[];
  resolvedIntents: import('../../features/world/worldIntentResolver').ResolvedWorldIntent[];
  rejectedIntents: RejectedWorldIntent[];
  rejectedCommands?: RejectedWorldCommand[];
  availability: WorldContextAvailability;
  rejectionReason?: string;
}

export type { ApiConfig };
