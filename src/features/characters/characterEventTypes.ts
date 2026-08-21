import type { BodyZoneKey, WoundLevel } from '../../domain/body';
import type { CharacterId } from '../../domain/characterId';
import type { CharacterEvent, CharacterRelationship, StaticCharacterRecord } from './types';

export interface CharacterEventInput {
  id: string;
  characterId: CharacterId;
  event: CharacterEvent;
  timestamp?: number;
}

export interface CharacterEventEnvelope extends CharacterEventInput {
  runId: string;
  turn: number;
  sequence: number;
  timestamp: number;
}

export interface CharacterEventProjection extends StaticCharacterRecord {
  locationId?: string;
  sceneLocation?: string;
  titleIds: string[];
  titles: string[];
  wounds: string[];
  woundLevels: Partial<Record<BodyZoneKey, WoundLevel>>;
  relationships: CharacterRelationship[];
}

export interface CharacterEventRowWriter {
  get(key: [string, string]): Promise<CharacterEventEnvelope | undefined>;
  add(row: CharacterEventEnvelope): Promise<void>;
}

export interface CharacterEventStore {
  append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void>;
  eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]>;
  truncateAfter(runId: string, turn: number): Promise<CharacterId[]>;
}
