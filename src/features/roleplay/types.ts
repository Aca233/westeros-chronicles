import type { CharacterId } from '../../domain/characterId';
import type { LordAttributes } from '../../types/game';

export type SocialAct = 'request' | 'accept' | 'reject' | 'conditional' | 'promise' | 'disclose' | 'fulfill' | 'break';
export type SocialVisibility = 'private' | 'public';

export interface SocialEvent {
  id: string;
  turn: number;
  act: SocialAct;
  actorId: CharacterId;
  targetIds: CharacterId[];
  summary: string;
  visibility: SocialVisibility;
  heardByIds: CharacterId[];
  exchangeId?: string;
  commitmentId?: string;
}

export interface RoleplayKnowledge {
  id: string;
  characterId: CharacterId;
  claim: string;
  sourceEventId: string;
  learnedTurn: number;
}

export interface RelationshipEvidence {
  id: string;
  turn: number;
  participantIds: CharacterId[];
  sourceEventId: string;
  summary: string;
  impact: 'positive' | 'negative' | 'obligation' | 'neutral';
  heardByIds: CharacterId[];
}

export interface MessageTransit {
  id: string;
  senderId: CharacterId;
  recipientIds: CharacterId[];
  summary: string;
  sentTurn: number;
  sentDate: string;
  arrivesOn: string;
  status: 'in_transit' | 'delivered' | 'intercepted';
  deliveredTurn?: number;
  interceptedByIds?: CharacterId[];
}

export interface NpcAgenda {
  id: string;
  actorId: CharacterId;
  targetIds: CharacterId[];
  summary: string;
  dueDate: string;
  visibility: SocialVisibility;
  heardByIds: CharacterId[];
  status: 'scheduled' | 'due' | 'resolved' | 'cancelled';
  sourceEventId?: string;
  resolvedTurn?: number;
}

export interface DelegatedProject {
  id: string;
  ownerId: CharacterId;
  assigneeId: CharacterId;
  objective: string;
  dueDate: string;
  consentEventId: string;
  exchangeId: string;
  status: 'active' | 'due' | 'resolved' | 'failed' | 'cancelled';
  createdTurn: number;
  resolvedTurn?: number;
  outcomeSummary?: string;
}

export interface Commitment {
  id: string;
  debtorId: CharacterId;
  creditorIds: CharacterId[];
  terms: string;
  createdTurn: number;
  dueDate?: string;
  status: 'open' | 'fulfilled' | 'broken' | 'cancelled';
  sourceEventId: string;
  resolvedTurn?: number;
}

export interface RoleplayState {
  schemaVersion: 1;
  revision: number;
  socialEvents: SocialEvent[];
  commitments: Commitment[];
  knowledge: RoleplayKnowledge[];
  relationshipEvidence?: RelationshipEvidence[];
  messages?: MessageTransit[];
  agendas?: NpcAgenda[];
  projects?: DelegatedProject[];
  growthOpportunities?: GrowthOpportunity[];
}

export type GrowthEffect =
  | { kind: 'stat'; stat: keyof LordAttributes; delta: 1 }
  | { kind: 'trait'; traitId: string };

export interface GrowthOption {
  id: string;
  label: string;
  effect: GrowthEffect;
}

export interface GrowthOpportunity {
  id: string;
  basis: 'training' | 'experience';
  summary: string;
  evidenceEventIds: string[];
  options: GrowthOption[];
  offeredTurn: number;
  status: 'open' | 'claimed';
  claimedOptionId?: string;
  claimedTurn?: number;
}

export type RoleplayStateCommand = {
  type: 'RECORD_SOCIAL_BEAT';
  act: SocialAct;
  actorId: CharacterId;
  targetIds: CharacterId[];
  summary: string;
  visibility: SocialVisibility;
  exchangeId?: string;
  commitmentId?: string;
  dueDate?: string;
} | {
  type: 'SEND_MESSAGE';
  senderId: CharacterId;
  recipientIds: CharacterId[];
  summary: string;
  travelDays: number;
} | {
  type: 'SCHEDULE_NPC_AGENDA';
  actorId: CharacterId;
  targetIds: CharacterId[];
  summary: string;
  dueDate: string;
  visibility: SocialVisibility;
} | {
  type: 'RESOLVE_NPC_AGENDA';
  agendaId: string;
  actorId: CharacterId;
  summary: string;
} | {
  type: 'DELEGATE_PROJECT';
  ownerId: CharacterId;
  assigneeId: CharacterId;
  objective: string;
  dueDate: string;
  consentEventId: string;
  exchangeId: string;
} | {
  type: 'RESOLVE_PROJECT';
  projectId: string;
  assigneeId: CharacterId;
  outcome: 'success' | 'partial' | 'failed';
  summary: string;
} | {
  type: 'OFFER_GROWTH_CHOICE';
  basis: 'training' | 'experience';
  summary: string;
  evidenceEventIds: string[];
  options: GrowthOption[];
} | {
  type: 'CLAIM_GROWTH_CHOICE';
  actorId: CharacterId;
  opportunityId: string;
  optionId: string;
};
