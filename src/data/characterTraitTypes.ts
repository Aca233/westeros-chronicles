import type { GameIconId } from '../components/GameIcon';
import type { LordAttributes } from '../domain/character';

export type TraitCategory = 'personality' | 'education' | 'lifestyle' | 'congenital' | 'health' | 'fame';
export type TraitSource = 'ck3' | 'agot';

export interface BaseCharacterTraitDefinition {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;
  cost: number;
  icon: GameIconId;
  modifiers: Partial<LordAttributes>;
  exclusiveGroup?: string;
  incompatibleTraitIds?: readonly string[];
  source?: TraitSource;
}
