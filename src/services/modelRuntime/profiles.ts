import type { ApiConfig } from '../../types/game';

export type ModelRole = 'resolver' | 'narrator' | 'repair' | 'npc' | 'memory';

export interface ModelRolePolicy {
  promptVersion: string;
  maxTokens: number;
  temperature: number;
  retries: number;
}

const ROLE_POLICIES: Record<ModelRole, Omit<ModelRolePolicy, 'temperature'> & { temperatureCeiling: number; defaultTemperature: number }> = {
  resolver: { promptVersion: 'resolver-v2', maxTokens: 1300, temperatureCeiling: 0.35, defaultTemperature: 0.25, retries: 1 },
  narrator: { promptVersion: 'narrator-v2', maxTokens: 2200, temperatureCeiling: 0.8, defaultTemperature: 0.65, retries: 1 },
  repair: { promptVersion: 'repair-v2', maxTokens: 900, temperatureCeiling: 0.2, defaultTemperature: 0.1, retries: 0 },
  npc: { promptVersion: 'npc-v1', maxTokens: 700, temperatureCeiling: 0.45, defaultTemperature: 0.35, retries: 0 },
  memory: { promptVersion: 'memory-v1', maxTokens: 700, temperatureCeiling: 0.25, defaultTemperature: 0.15, retries: 0 },
};

export function modelRolePolicy(config: ApiConfig, role: ModelRole): ModelRolePolicy {
  const policy = ROLE_POLICIES[role];
  const requested = Number.isFinite(config.temperature) ? config.temperature : policy.defaultTemperature;
  return {
    promptVersion: policy.promptVersion,
    maxTokens: policy.maxTokens,
    temperature: Math.max(0, Math.min(policy.temperatureCeiling, requested)),
    retries: policy.retries,
  };
}

export function configForModelRole(config: ApiConfig, role: ModelRole): ApiConfig {
  return { ...config, temperature: modelRolePolicy(config, role).temperature };
}
