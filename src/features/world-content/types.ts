import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import type { WorldLocationRef } from '../../domain/worldLocation';
import type { CharacterDossierSupplement } from '../characters/characterSupplementTypes';
import type { CharacterCreationCatalog } from '../characters/customCharacterStart';
import type { ItemDefinition, ItemStorageSite, ItemTransport, EquipmentPosition } from '../items/types';
import type { MapLocationSearchEntry, MapLocationType } from '../map/types';
import type { AssetPlacement, WorldCustodianRef, WorldPrincipalRef } from '../world/worldRuntimeTypes';

export interface LivingWorldManifest {
  schemaVersion: 1;
  worldId: 'agot-298';
  startDate: WorldDate;
  characterDatasetHash: string;
  mapDatasetHash: string;
  artifactDatasetHash: string;
  artifactWorldStateHash: string;
  contentHash: string;
  paths: {
    startState: string;
    playableCharacters: string;
    characterContentIndex: string;
    terminology: string;
    gameplayLocations: string;
    holderSummaries: string;
    ordinaryItems: string;
    loadouts: string;
    characterCreation: string;
  };
}

export interface PlayableCharacterEntry {
  characterId: CharacterId;
  enabled: boolean;
  difficulty: 'normal' | 'hard' | 'epic';
  focus: string[];
  card: {
    title: string;
    tagline: string;
    background: string;
    avatarIcon: string;
  };
}

export interface WorldCharacterStartRecord {
  characterId: CharacterId;
  location: WorldLocationRef;
  currentActivity: 'idle' | 'travelling' | 'imprisoned' | 'missing';
  aliveOverride?: boolean;
  wounds?: string[];
}

export interface WorldTitleStartRecord {
  titleId: string;
  lawfulHolderId: CharacterId | null;
  controllerId: CharacterId | null;
  contestedByIds: CharacterId[];
}

export interface WorldAssetStartRecord {
  instanceId: string;
  definitionId: string;
  kind: 'item' | 'site' | 'vehicle';
  lawfulOwner: WorldPrincipalRef | null;
  controller: WorldPrincipalRef | null;
  custodian: WorldCustodianRef | null;
  placement: AssetPlacement | null;
  equippedPosition: EquipmentPosition | null;
  status: 'normal' | 'stolen' | 'inheritance_pending';
  overrides?: { customName?: string; charges?: number; renown?: number; isHeirloom?: boolean };
}

export interface LivingWorldStartState {
  schemaVersion: 1;
  characters: WorldCharacterStartRecord[];
  titles: WorldTitleStartRecord[];
  assets: WorldAssetStartRecord[];
  sites: ItemStorageSite[];
  vehicles: ItemTransport[];
}

export interface CharacterContentRecord extends Omit<CharacterDossierSupplement, 'sourceUrls'> {
  schemaVersion: 1;
  sources: string[];
}

export interface CharacterContentIndex {
  schemaVersion: 1;
  shards: Record<string, string>;
  characters: Partial<Record<CharacterId, string>>;
}

export interface WorldTerminology {
  schemaVersion: 1;
  cultures: Record<string, string>;
  faiths: Record<string, string>;
  relationships: Record<string, string>;
}

export type GameplayLocationReason =
  | 'explicit'
  | 'important-place'
  | 'political-center'
  | 'start-reference'
  | 'event-reference'
  | 'major-route-port';

export interface GameplayLocationEntry extends MapLocationSearchEntry {
  reasons: GameplayLocationReason[];
}

export interface GameplayLocationConfig {
  schemaVersion: 1;
  include: string[];
  exclude: string[];
  rules: {
    minimumImportance: number;
    types: MapLocationType[];
    includePoliticalCenters: boolean;
    includeStartReferences: boolean;
    includeEventReferences: boolean;
    includeMajorRoutePorts: boolean;
  };
}

export interface GameplayLocationDataset {
  schemaVersion: 1;
  entries: GameplayLocationEntry[];
  config: GameplayLocationConfig;
}

export interface HolderSummary {
  id: CharacterId;
  name: string;
  dynastyId?: string | null;
  alive: boolean;
  titleIds: string[];
  displayLabel: string;
}

export interface HolderSummaryDataset {
  schemaVersion: 1;
  holders: HolderSummary[];
}

export interface NpcLoadoutSlotContent {
  id: string;
  definitionId: string;
  position: EquipmentPosition;
}

export interface NpcLoadoutTemplateContent {
  id: string;
  name: string;
  ageGroup: 'infant' | 'child' | 'adult';
  slots: NpcLoadoutSlotContent[];
}

export interface NpcLoadoutOverrideContent {
  characterId: CharacterId;
  id: string;
  templateId?: string;
  slots?: NpcLoadoutSlotContent[];
  clearedPositions?: EquipmentPosition[];
}

export interface WorldLoadoutContent {
  templates: NpcLoadoutTemplateContent[];
  overrides: NpcLoadoutOverrideContent[];
}

export type OrdinaryItemContent = ItemDefinition;
export type CharacterCreationContent = CharacterCreationCatalog;
