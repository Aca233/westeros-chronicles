import type { InjuryKind, InjurySeverity } from './types';

export interface InjuryRuleConfig {
  recoveryMinutes: Record<InjurySeverity, number>;
  infectionRiskAfterMinutes: number;
  uncontrolledBleedingEscalationMinutes: Record<1 | 2 | 3, number>;
}

export interface HealthSimulationConfig {
  injuries: Record<InjuryKind, InjuryRuleConfig>;
  hungerPerHour: number;
  thirstPerHour: number;
  fatiguePerHour: Record<'resting' | 'light' | 'walking' | 'strenuous', number>;
  sleepRecoveryPerHour: number;
  autoEatThreshold: number;
  autoDrinkThreshold: number;
  mealRelief: number;
  drinkRelief: number;
  incapacitation: {
    thirst: number;
    fatigue: number;
    consciousness: number;
  };
}

const recovery = (minor: number, heavy: number, critical: number): Record<InjurySeverity, number> => ({ minor, heavy, critical });
const bleed = { 1: 12 * 60, 2: 4 * 60, 3: 90 } as const;

export const HEALTH_SIMULATION_CONFIG: HealthSimulationConfig = {
  injuries: {
    cut_puncture: { recoveryMinutes: recovery(3 * 1440, 14 * 1440, 45 * 1440), infectionRiskAfterMinutes: 36 * 60, uncontrolledBleedingEscalationMinutes: bleed },
    blunt: { recoveryMinutes: recovery(2 * 1440, 10 * 1440, 30 * 1440), infectionRiskAfterMinutes: Number.MAX_SAFE_INTEGER, uncontrolledBleedingEscalationMinutes: bleed },
    fracture: { recoveryMinutes: recovery(14 * 1440, 42 * 1440, 90 * 1440), infectionRiskAfterMinutes: 72 * 60, uncontrolledBleedingEscalationMinutes: bleed },
    burn: { recoveryMinutes: recovery(5 * 1440, 24 * 1440, 60 * 1440), infectionRiskAfterMinutes: 24 * 60, uncontrolledBleedingEscalationMinutes: bleed },
    disease: { recoveryMinutes: recovery(3 * 1440, 10 * 1440, 30 * 1440), infectionRiskAfterMinutes: Number.MAX_SAFE_INTEGER, uncontrolledBleedingEscalationMinutes: bleed },
    poison: { recoveryMinutes: recovery(12 * 60, 3 * 1440, 10 * 1440), infectionRiskAfterMinutes: Number.MAX_SAFE_INTEGER, uncontrolledBleedingEscalationMinutes: bleed },
    disability: { recoveryMinutes: recovery(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), infectionRiskAfterMinutes: Number.MAX_SAFE_INTEGER, uncontrolledBleedingEscalationMinutes: bleed },
  },
  hungerPerHour: 2.2,
  thirstPerHour: 4.5,
  fatiguePerHour: {
    resting: 0.35,
    light: 1.2,
    walking: 2.8,
    strenuous: 5.2,
  },
  sleepRecoveryPerHour: 10,
  autoEatThreshold: 45,
  autoDrinkThreshold: 35,
  mealRelief: 38,
  drinkRelief: 52,
  incapacitation: {
    thirst: 92,
    fatigue: 96,
    consciousness: 20,
  },
};
