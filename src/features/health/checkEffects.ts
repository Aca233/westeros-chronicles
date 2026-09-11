import type { TraitCheckDomain } from '../../services/traitEffectEngine';
import { deriveHealthCapabilities } from './state';
import type { CharacterHealthState, HealthCapabilityKey } from './types';

export interface HealthCheckModifierEntry {
  injuryId: string;
  label: string;
  value: number;
  capabilities: HealthCapabilityKey[];
}

export interface HealthCheckEffects {
  modifier: number;
  breakdown: HealthCheckModifierEntry[];
}

const TWO_HANDED_ACTION = /双手|双持|巨剑|大剑|双手剑|长枪|长矛|战斧|大锤|重锤/i;
const RUNNING_ACTION = /奔跑|跑|冲刺|冲过去|逃跑|追赶|追击|疾奔/i;
const CLIMB_ACTION = /攀爬|攀登|爬|翻墙|翻越|绳索|上墙/i;
const STEALTH_ACTION = /潜行|隐匿|悄悄|无声|偷窃|扒窃|开锁|撬锁/i;

function unique(values: readonly HealthCapabilityKey[]): HealthCapabilityKey[] {
  return [...new Set(values)];
}

export function relevantHealthCapabilities(
  state: CharacterHealthState,
  actionText: string,
  domain: TraitCheckDomain,
): HealthCapabilityKey[] {
  const dominantGrip: HealthCapabilityKey = state.dominantHand === 'left' ? 'left_grip' : 'right_grip';
  const bothGrips: HealthCapabilityKey[] = ['left_grip', 'right_grip', 'two_hand_coordination'];

  if (domain === 'duel') {
    return unique([
      dominantGrip,
      'walk',
      'sight',
      'consciousness',
      ...(TWO_HANDED_ACTION.test(actionText) ? ['two_hand_coordination' as const] : []),
    ]);
  }
  if (domain === 'battle') return ['sight', 'consciousness'];
  if (domain === 'medicine') return [dominantGrip, 'sight', 'consciousness'];
  if (domain === 'survival') {
    if (CLIMB_ACTION.test(actionText)) return unique([...bothGrips, 'walk', 'sight', 'consciousness']);
    if (RUNNING_ACTION.test(actionText)) return ['run', 'sight', 'consciousness'];
    return ['walk', 'sight', 'consciousness'];
  }
  if (domain === 'intrigue' && STEALTH_ACTION.test(actionText)) {
    return unique([dominantGrip, 'walk', 'sight', 'consciousness']);
  }
  return ['consciousness'];
}

function capabilityPenaltyToD20(penalty: number): number {
  if (penalty >= 85) return -5;
  if (penalty >= 60) return -4;
  if (penalty >= 35) return -2;
  if (penalty >= 15) return -1;
  return 0;
}

/** 把具体身体伤势映射为本次行动的 D20 修正；同一 injury 同时影响多项能力时只结算一次。 */
export function deriveHealthCheckEffects(
  state: CharacterHealthState | undefined,
  actionText: string,
  domain: TraitCheckDomain,
): HealthCheckEffects {
  if (!state) return { modifier: 0, breakdown: [] };
  if (!state.alive) return { modifier: -10, breakdown: [] };

  const capabilities = deriveHealthCapabilities(state);
  const relevant = relevantHealthCapabilities(state, actionText, domain);
  const grouped = new Map<string, { label: string; penalty: number; capabilities: Set<HealthCapabilityKey> }>();

  for (const key of relevant) {
    for (const reason of capabilities[key].reasons) {
      const previous = grouped.get(reason.injuryId);
      if (previous) {
        previous.penalty = Math.max(previous.penalty, reason.penalty);
        previous.capabilities.add(key);
      } else {
        grouped.set(reason.injuryId, {
          label: reason.label,
          penalty: reason.penalty,
          capabilities: new Set([key]),
        });
      }
    }
  }

  const breakdown = [...grouped.entries()].flatMap(([injuryId, entry]) => {
    const value = capabilityPenaltyToD20(entry.penalty);
    return value === 0 ? [] : [{ injuryId, label: entry.label, value, capabilities: [...entry.capabilities] }];
  });

  return {
    modifier: breakdown.reduce((total, entry) => total + entry.value, 0),
    breakdown,
  };
}
