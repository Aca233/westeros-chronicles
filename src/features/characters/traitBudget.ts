import type { CharacterTraitDefinition } from '../../data/characterTraits';

/** Character creator's fixed design budget. Kept separate from UI so saves and validation share one rule. */
export const TRAIT_DESIGN_BUDGET = 400;

export interface TraitSelectionCost {
  traitId: string;
  cost: number;
}

export interface TraitBudgetResult {
  budget: number;
  spent: number;
  remaining: number;
  affordable: boolean;
}

export function calculateTraitBudgetCost(traits: readonly CharacterTraitDefinition[]): number {
  return traits.reduce((total, trait) => total + trait.cost, 0);
}

export function calculateTraitBudget(
  traits: readonly CharacterTraitDefinition[],
  attributeCost = 0,
): TraitBudgetResult {
  const spent = attributeCost + calculateTraitBudgetCost(traits);
  return {
    budget: TRAIT_DESIGN_BUDGET,
    spent,
    remaining: TRAIT_DESIGN_BUDGET - spent,
    affordable: spent <= TRAIT_DESIGN_BUDGET,
  };
}

export function canAffordTrait(
  selectedTraits: readonly CharacterTraitDefinition[],
  candidate: CharacterTraitDefinition,
  attributeCost = 0,
): boolean {
  return calculateTraitBudget([...selectedTraits, candidate], attributeCost).affordable;
}
