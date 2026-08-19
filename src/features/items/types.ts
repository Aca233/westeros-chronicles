import type { TraitCheckDomain } from '../../services/traitEffectEngine';
import type { WorldLocationRef } from '../map/types';

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'clothing'
  | 'jewelry'
  | 'tool'
  | 'document'
  | 'medicine'
  | 'poison'
  | 'supply'
  | 'keepsake';

export type ItemBulk = 'tiny' | 'small' | 'medium' | 'large';
export type CraftQuality = 'rough' | 'common' | 'fine' | 'masterwork' | 'legendary';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'illustrious' | 'unique';
export type EquipmentGroup = 'head' | 'torso' | 'mainhand' | 'offhand' | 'legs' | 'accessories';
export type TorsoLayer = 'garment' | 'armor' | 'outerwear';
export type LegLayer = 'legwear' | 'footwear';
export type AccessoryIndex = 0 | 1 | 2;

export type EquipmentPosition =
  | { group: 'head' | 'mainhand' | 'offhand' }
  | { group: 'torso'; layer: TorsoLayer }
  | { group: 'legs'; layer: LegLayer }
  | { group: 'accessories'; index: AccessoryIndex };

export type ItemPlacement =
  | { type: 'carried' }
  | { type: 'site'; siteId: string }
  | { type: 'vehicle'; vehicleId: string }
  | { type: 'equipped'; position: EquipmentPosition }
  | { type: 'character'; characterId: string }
  | { type: 'lost'; reason: string };

export type ItemBodyZone = 'head' | 'torso' | 'arms' | 'legs';

export type ItemImageRef =
  | { type: 'game'; icon: string }
  | { type: 'wiki'; path: string; fallbackIcon: string }
  | { type: 'asset'; path: string; fallbackIcon: string }
  | { type: 'library'; iconName: string };

export interface ItemEffectCondition {
  actionPatterns?: string[];
  requiredSceneTags?: string[];
  forbiddenSceneTags?: string[];
  requiredItemTags?: string[];
}

export type ItemEffect =
  | { kind: 'check_modifier'; domain: TraitCheckDomain; value: number; stackGroup: string; cap?: number; condition?: ItemEffectCondition; label: string }
  | { kind: 'action_unlock'; actionId: string; label: string; condition?: ItemEffectCondition }
  | { kind: 'protection'; zones: ItemBodyZone[]; damageTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'social'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'burden'; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'fatigue'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'heat'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'resource'; target: 'goldGain' | 'prestigeGain' | 'dreadGain' | 'recoverySpeed'; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'capacity'; categories: ItemCategory[]; units: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'narrative'; directive: string; condition?: ItemEffectCondition };

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  roleplayText: string;
  category: ItemCategory;
  subcategory: string;
  tags: string[];
  image: ItemImageRef;
  material: string;
  baseQuality: CraftQuality;
  rarity: ItemRarity;
  bulk: ItemBulk;
  stackable: boolean;
  maxStack: number;
  unique: boolean;
  equippable: boolean;
  allowedPositions: EquipmentPosition[];
  handedness?: 'one' | 'two';
  baseValue: number;
  effects: ItemEffect[];
  provenance?: {
    maker?: string;
    origin?: string;
    createdAt?: string;
    boundHouse?: string;
  };
  contentSource?: {
    workshopId: string;
    modName: string;
    sourceId: string;
    nameKey: string;
    descriptionKey: string;
    visualKey: string;
    templateKey?: string | null;
    modifierKey?: string | null;
    imageSha256: string;
    visualVariants: Array<{ workshopId: string; modName: string; sourceId: string; visualKey: string }>;
  };
}

export interface ItemHistoryEntry {
  id: string;
  type: 'created' | 'acquired' | 'gifted' | 'inherited' | 'stolen' | 'lost' | 'recovered' | 'repaired' | 'heirloom';
  date: string;
  summary: string;
  actorId?: string;
  targetId?: string;
}

export interface ItemInstance {
  instanceId: string;
  definitionId: string;
  quantity: number;
  charges?: number;
  durability: number;
  quality: CraftQuality;
  customName?: string;
  lawfulControllerId?: string;
  renown: number;
  isHeirloom: boolean;
  history: ItemHistoryEntry[];
}

export interface ItemStorageSite {
  id: string;
  name: string;
  type: 'armory' | 'wardrobe' | 'room' | 'warehouse' | 'stable' | 'camp' | 'other';
  location: WorldLocationRef;
  locationLabel: string;
  description: string;
  capacity?: number;
}

export interface ItemTransport {
  id: string;
  name: string;
  type: 'packhorse' | 'wagon' | 'ship' | 'other';
  location: WorldLocationRef;
  locationLabel: string;
  capacity: number;
  description: string;
}

export interface ItemSystemState {
  schemaVersion: 1;
  instances: Record<string, ItemInstance>;
  placements: Record<string, ItemPlacement>;
  sites: Record<string, ItemStorageSite>;
  vehicles: Record<string, ItemTransport>;
}

export type ItemCatalog = ReadonlyMap<string, ItemDefinition>;

export type ItemAction =
  | { kind: 'acquire'; instance: ItemInstance; placement: ItemPlacement; historyType: 'acquired' | 'inherited' | 'stolen' | 'recovered' }
  | { kind: 'equip'; instanceId: string; position: EquipmentPosition; displacedTo: ItemPlacement }
  | { kind: 'unequip'; instanceId: string; to: ItemPlacement }
  | { kind: 'use'; instanceId: string; quantity?: number }
  | { kind: 'transfer'; instanceId: string; to: ItemPlacement; quantity?: number; newInstanceId?: string }
  | { kind: 'gift'; instanceId: string; recipientId: string; quantity?: number; newInstanceId?: string }
  | { kind: 'discard'; instanceId: string; quantity?: number; newInstanceId?: string }
  | { kind: 'repair'; instanceId: string; amount: number }
  | { kind: 'damage'; instanceId: string; amount: number; reason: string }
  | { kind: 'split'; instanceId: string; quantity: number; newInstanceId: string; to: ItemPlacement }
  | { kind: 'merge'; sourceInstanceId: string; targetInstanceId: string }
  | { kind: 'mark_heirloom'; instanceId: string; houseId: string };

export type ItemStateCommand =
  | { type: 'ITEM_CREATE'; instance: ItemInstance; placement: ItemPlacement; historyType: 'acquired' | 'inherited' | 'stolen' | 'recovered' }
  | { type: 'ITEM_EQUIP'; instanceId: string; position: EquipmentPosition; displacedTo: ItemPlacement }
  | { type: 'ITEM_UNEQUIP'; instanceId: string; to: ItemPlacement }
  | { type: 'ITEM_USE'; instanceId: string; quantity?: number }
  | { type: 'ITEM_TRANSFER'; instanceId: string; to: ItemPlacement; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_GIFT'; instanceId: string; recipientId: string; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_DISCARD'; instanceId: string; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_REPAIR'; instanceId: string; amount: number }
  | { type: 'ITEM_DAMAGE'; instanceId: string; amount: number; reason: string }
  | { type: 'ITEM_SPLIT'; instanceId: string; quantity: number; newInstanceId: string; to: ItemPlacement }
  | { type: 'ITEM_MERGE'; sourceInstanceId: string; targetInstanceId: string }
  | { type: 'ITEM_MARK_HEIRLOOM'; instanceId: string; houseId: string };
