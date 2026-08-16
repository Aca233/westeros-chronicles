import type { BodyZoneKey, LordAttributes, WoundLevel } from '../../types/game';

export type CharacterId = `agot:${string}` | `save:${string}:${string}`;
export type CharacterCanonTier = 'canon' | 'semicanon' | 'mod_supporting' | 'genealogy';
export type KnowledgeVisibility = 'public' | 'player' | 'restricted' | 'rumor' | 'secret' | 'system';

export interface CharacterDatasetManifest {
  schemaVersion: number;
  datasetHash: string;
  startDate: string;
  displayYear: number;
  counts: Record<string, number>;
  shards: string[];
  source: {
    sourceId: string;
    name: string;
    modVersion: string;
    sourceChecksum: string;
    characterFileCount: number;
    localizationFileCount: number;
  };
}

export interface StaticCharacterRecord {
  id: CharacterId;
  rawId: string;
  canonTier: CharacterCanonTier;
  name: string;
  nameKey?: string | null;
  dynastyId?: string | null;
  fatherId?: CharacterId | null;
  motherId?: CharacterId | null;
  cultureId?: string | null;
  faithId?: string | null;
  sexuality?: string | null;
  born: boolean;
  alive: boolean;
  birthDate?: string | null;
  deathDate?: string | null;
  deathReason?: string | null;
  killerId?: CharacterId | null;
  baseAttributes: Partial<LordAttributes>;
  traits: string[];
  spouseIds: CharacterId[];
  relations: Array<{ kind: string; target_id: string }>;
  hasDna: boolean;
  source: { file: string; line: number };
}

export interface CharacterSearchHit {
  id: CharacterId;
  name: string;
  nameKey?: string | null;
  dynastyId?: string | null;
  canonTier: CharacterCanonTier;
  born: boolean;
  alive: boolean;
  birthYear?: number | null;
  deathYear?: number | null;
  shard: string;
}

export interface CharacterKnowledge {
  id: string;
  field: string;
  value: string;
  visibility: KnowledgeVisibility;
  validFrom?: string;
  validTo?: string;
  knownBy?: CharacterId[];
  sourceUrl?: string;
}

export interface CharacterMemory {
  id: string;
  characterId: CharacterId;
  turn: number;
  event: string;
  attitude?: string;
  importance: number;
  participants: CharacterId[];
  visibility: KnowledgeVisibility;
}

export interface CharacterRelationship {
  sourceId: CharacterId;
  targetId: CharacterId;
  kind?: string;
  opinion: number;
  trust: number;
  fear: number;
  respect: number;
  attraction: number;
  obligation: number;
}

export type CharacterEvent =
  | { type: 'MOVE'; locationId: string; reason?: string }
  | { type: 'DIE'; cause: string; killerId?: CharacterId }
  | { type: 'ADD_TRAIT'; traitId: string }
  | { type: 'REMOVE_TRAIT'; traitId: string }
  | { type: 'ADD_MEMORY'; memory: CharacterMemory }
  | { type: 'SET_RELATIONSHIP'; relationship: CharacterRelationship }
  | { type: 'INJURE'; zone: BodyZoneKey; level: WoundLevel; woundText: string }
  | { type: 'HEAL'; zone: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string }
  | { type: 'MARRY'; spouseId: CharacterId; reason?: string }
  | { type: 'DIVORCE'; spouseId: CharacterId; reason?: string }
  | { type: 'GRANT_TITLE'; titleId: string }
  | { type: 'REVOKE_TITLE'; titleId: string };

export interface ResolvedCharacter extends StaticCharacterRecord {
  attributes: LordAttributes;
  locationId?: string;
  titles: string[];
  wounds: string[];
  woundLevels: Partial<Record<BodyZoneKey, WoundLevel>>;
  relationships: CharacterRelationship[];
  memories: CharacterMemory[];
  knowledge: CharacterKnowledge[];
}
