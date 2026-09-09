import type { BodyZoneKey, WoundLevel } from '../domain/body';
import type { LordAttributes } from '../domain/character';
import type { CharacterStateCommand } from '../features/characters/characterCommands';
import type { ItemPlacement, ItemStateCommand } from '../features/items/types';
import type { TravelStateCommand } from '../features/map/travel/types';
import type { RoleplayStateCommand } from '../features/roleplay/types';

export type StateCommand =
  | { type: 'INJURE_ZONE'; zone: BodyZoneKey; level: WoundLevel; woundText: string; reason?: string; damageTags?: string[] }
  | { type: 'HEAL_ZONE'; zone: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string }
  | { type: 'TREAT_WOUND'; zone?: BodyZoneKey; instanceId: string; clearWound?: string; clearCondition?: 'bleeding' | 'poisoned' | 'infected' }
  | { type: 'REPAIR_ITEM'; instanceId: string; toolInstanceId: string; amount: number; silverCost: number; days: number }
  | { type: 'BUY_CATALOG_ITEM'; definitionId: string; instanceId: string; sellerId: string; placement: ItemPlacement; silverCost: number; consentEventId: string; exchangeId: string }
  | { type: 'SELL_ITEM'; instanceId: string; buyerId: string; silverPrice: number; consentEventId: string; exchangeId: string }
  | { type: 'SET_BLEEDING'; value: boolean }
  | { type: 'SET_POISONED'; value: boolean }
  | { type: 'SET_INFECTED'; value: boolean }
  | { type: 'MODIFY_GOLD'; goldDragons?: number; silverStags?: number; reason?: string }
  | { type: 'MODIFY_STAT'; stat: keyof LordAttributes; delta: number; reason?: string; growthChoiceId?: string; growthOptionId?: string }
  | { type: 'ADD_TRAIT'; trait: string; growthChoiceId?: string; growthOptionId?: string }
  | { type: 'CHANGE_LOCATION'; locationId: string; sceneLocation?: string }
  | { type: 'CHANGE_TITLE'; title: string }
  | { type: 'ADVANCE_TIME'; days?: number; months?: number; years?: number; season?: string; reason?: string }
  | { type: 'SET_DATE'; year?: number; month?: number; day?: number; season?: string; reason?: string }
  | ItemStateCommand
  | CharacterStateCommand
  | RoleplayStateCommand
  | TravelStateCommand;
