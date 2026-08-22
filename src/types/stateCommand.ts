import type { BodyZoneKey, WoundLevel } from '../domain/body';
import type { LordAttributes } from '../domain/character';
import type { CharacterStateCommand } from '../features/characters/characterCommands';
import type { ItemStateCommand } from '../features/items/types';
import type { TravelStateCommand } from '../features/map/travel/types';

export type StateCommand =
  | { type: 'INJURE_ZONE'; zone: BodyZoneKey; level: WoundLevel; woundText: string; reason?: string; damageTags?: string[] }
  | { type: 'HEAL_ZONE'; zone: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string }
  | { type: 'SET_BLEEDING'; value: boolean }
  | { type: 'SET_POISONED'; value: boolean }
  | { type: 'SET_INFECTED'; value: boolean }
  | { type: 'MODIFY_GOLD'; goldDragons?: number; silverStags?: number; reason?: string }
  | { type: 'MODIFY_STAT'; stat: keyof LordAttributes; delta: number; reason?: string }
  | { type: 'ADD_TRAIT'; trait: string }
  | { type: 'CHANGE_LOCATION'; locationId: string; sceneLocation?: string }
  | { type: 'CHANGE_TITLE'; title: string }
  | { type: 'ADVANCE_TIME'; days?: number; months?: number; years?: number; season?: string; reason?: string }
  | { type: 'SET_DATE'; year?: number; month?: number; day?: number; season?: string; reason?: string }
  | ItemStateCommand
  | CharacterStateCommand
  | TravelStateCommand;
