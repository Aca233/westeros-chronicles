import type { BodyZoneKey, WoundLevel } from '../../types/game';
import type {
  CharacterEvent,
  CharacterId,
  CharacterMemory,
  CharacterRelationship,
  KnowledgeVisibility,
} from './types';

export type CharacterCommandId = string;

export interface CharacterState {
  id: CharacterId;
  alive: boolean;
  locationId?: string | null;
  traits?: string[];
  spouseIds?: CharacterId[];
  titles?: string[];
  titleIds?: string[];
  wounds?: string[];
  relationships?: CharacterRelationship[];
  deathReason?: string | null;
}

export interface CharacterMemoryInput {
  id?: string;
  turn?: number;
  event: string;
  attitude?: string;
  importance: number;
  participants?: CharacterId[];
  visibility?: KnowledgeVisibility;
}

export type CharacterStateCommand =
  | { type: 'SET_CHARACTER_RELATIONSHIP'; sourceCharacterId: CharacterId; targetCharacterId: CharacterId; relationship: Omit<CharacterRelationship, 'sourceId' | 'targetId'>; commandId?: CharacterCommandId }
  | { type: 'ADD_CHARACTER_TRAIT'; characterId: CharacterId; traitId: string; commandId?: CharacterCommandId }
  | { type: 'REMOVE_CHARACTER_TRAIT'; characterId: CharacterId; traitId: string; commandId?: CharacterCommandId }
  | { type: 'MOVE_CHARACTER'; characterId: CharacterId; locationId: string; reason?: string; commandId?: CharacterCommandId }
  | { type: 'INJURE_CHARACTER'; characterId: CharacterId; zone: BodyZoneKey | 'arm' | 'leg'; level: WoundLevel; woundText: string; commandId?: CharacterCommandId }
  | { type: 'HEAL_CHARACTER'; characterId: CharacterId; zone?: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string; commandId?: CharacterCommandId }
  | { type: 'KILL_CHARACTER'; characterId: CharacterId; cause: string; killerId?: CharacterId; commandId?: CharacterCommandId }
  | { type: 'MARRY_CHARACTERS'; characterId: CharacterId; spouseId: CharacterId; reason?: string; commandId?: CharacterCommandId }
  | { type: 'DIVORCE_CHARACTERS'; characterId: CharacterId; spouseId: CharacterId; reason?: string; commandId?: CharacterCommandId }
  | { type: 'ADD_CHARACTER_MEMORY'; characterId: CharacterId; memory: CharacterMemoryInput; commandId?: CharacterCommandId }
  | { type: 'GRANT_CHARACTER_TITLE'; characterId: CharacterId; titleId: string; commandId?: CharacterCommandId }
  | { type: 'REVOKE_CHARACTER_TITLE'; characterId: CharacterId; titleId: string; commandId?: CharacterCommandId };

/** CharacterEvent in types.ts is the single authoritative event union. */
export type ValidatedCharacterEvent = CharacterEvent;

export interface ValidatedCharacterEventInput {
  id: string;
  characterId: CharacterId;
  event: ValidatedCharacterEvent;
}

export interface CharacterCommandContext {
  characters: readonly CharacterState[] | ReadonlyMap<CharacterId, CharacterState> | Record<string, CharacterState>;
  currentLocationId?: string;
  presentCharacterIds?: ReadonlySet<CharacterId> | readonly CharacterId[];
  knownLocationIds?: ReadonlySet<string> | readonly string[];
  currentTurn: number;
  commandSequence: number;
  /** Optional event history lets validation reject duplicate DIE events even if a stale snapshot says alive. */
  eventHistory?: readonly { characterId: CharacterId; event: { type: string } }[];
}

export interface CharacterCommandValidationSuccess {
  ok: true;
  events: ValidatedCharacterEventInput[];
  reason?: undefined;
}

export interface CharacterCommandValidationFailure {
  ok: false;
  events: [];
  reason: string;
}

export type CharacterCommandValidationResult = CharacterCommandValidationSuccess | CharacterCommandValidationFailure;

/**
 * The event identity is a storage identity, never an AI identity. The command
 * argument is intentionally unused: runId is supplied by the outer store key.
 */
export function canonicalCharacterCommandIdentity(
  _command: CharacterStateCommand,
  context: Pick<CharacterCommandContext, 'currentTurn' | 'commandSequence'>,
  suffix = '0',
): string {
  return `${context.currentTurn}:${context.commandSequence}:${suffix}`;
}

export function characterEventId(
  command: CharacterStateCommand,
  context: Pick<CharacterCommandContext, 'currentTurn' | 'commandSequence'>,
  suffix = '0',
): string {
  return canonicalCharacterCommandIdentity(command, context, suffix);
}

export function eventInput(
  command: CharacterStateCommand,
  context: Pick<CharacterCommandContext, 'currentTurn' | 'commandSequence'>,
  characterId: CharacterId,
  event: ValidatedCharacterEvent,
  suffix = '0',
): ValidatedCharacterEventInput {
  return { id: characterEventId(command, context, suffix), characterId, event };
}
