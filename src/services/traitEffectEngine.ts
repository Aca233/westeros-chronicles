export type TraitCheckDomain =
  | 'duel'
  | 'battle'
  | 'intrigue'
  | 'stewardship'
  | 'diplomacy'
  | 'learning'
  | 'medicine'
  | 'survival'
  | 'intimidation'
  | 'seduction'
  | 'resistFear';

export type TraitMultiplierTarget = 'goldGain';

export type TraitResistanceTarget = 'injury' | 'disease' | 'poison' | 'bleeding';

export interface TraitMethodEdge {
  domains: TraitCheckDomain[];
  /** A miss no worse than this can become a constrained partial result. */
  maxMiss: number;
  label: string;
  directive: string;
}

export interface TraitRuleSet {
  multipliers?: Partial<Record<TraitMultiplierTarget, number>>;
  resistances?: Partial<Record<TraitResistanceTarget, number>>;
  checkModifiers?: Partial<Record<TraitCheckDomain, number>>;
  methodEdges?: TraitMethodEdge[];
  roleplayDirectives?: string[];
}

export interface AggregatedTraitEffects {
  multipliers: Partial<Record<TraitMultiplierTarget, number>>;
  resistances: Partial<Record<TraitResistanceTarget, number>>;
  checkModifiers: Partial<Record<TraitCheckDomain, number>>;
  methodEdges: TraitMethodEdge[];
  roleplayDirectives: string[];
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function aggregateTraitRuleEffects(rules: readonly TraitRuleSet[]): AggregatedTraitEffects {
  const result: AggregatedTraitEffects = {
    multipliers: {},
    resistances: {},
    checkModifiers: {},
    methodEdges: [],
    roleplayDirectives: [],
  };

  for (const rule of rules) {
    for (const [target, value] of Object.entries(rule.multipliers ?? {}) as Array<[TraitMultiplierTarget, number]>) {
      result.multipliers[target] = clamp((result.multipliers[target] ?? 0) + value, -0.8, 2);
    }
    for (const [target, value] of Object.entries(rule.resistances ?? {}) as Array<[TraitResistanceTarget, number]>) {
      result.resistances[target] = clamp((result.resistances[target] ?? 0) + value, 0, 0.75);
    }
    for (const [domain, value] of Object.entries(rule.checkModifiers ?? {}) as Array<[TraitCheckDomain, number]>) {
      result.checkModifiers[domain] = clamp((result.checkModifiers[domain] ?? 0) + value, -10, 10);
    }
    for (const edge of rule.methodEdges ?? []) {
      if (!result.methodEdges.some((candidate) => candidate.label === edge.label)) result.methodEdges.push(edge);
    }
    for (const directive of rule.roleplayDirectives ?? []) {
      if (!result.roleplayDirectives.includes(directive)) result.roleplayDirectives.push(directive);
    }
  }

  return result;
}

export function applyPositiveMultiplier(baseValue: number, modifier = 0): number {
  if (baseValue <= 0) return baseValue;
  return Math.round(baseValue * (1 + clamp(modifier, -0.8, 2)));
}

export function didTraitResistanceTrigger(resistance: number, roll: number): boolean {
  const effectiveResistance = clamp(resistance, 0, 0.75);
  return effectiveResistance > 0 && roll >= 0 && roll < effectiveResistance;
}

export function describeNarrativeAdvantage(modifier: number): string {
  if (modifier <= -4) return '严重劣势';
  if (modifier <= -2) return '明显劣势';
  if (modifier === -1) return '轻微劣势';
  if (modifier === 0) return '无额外影响';
  if (modifier === 1) return '轻微优势';
  if (modifier <= 3) return '明显优势';
  return '显著优势';
}

export function formatSignedPercent(value: number): string {
  const percentage = Math.round(value * 100);
  return `${percentage >= 0 ? '+' : ''}${percentage}%`;
}
