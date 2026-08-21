import { AGOT_ARTIFACT_WORLD_STATE } from '../../data/generated/agotArtifactWorldState';
import type { EquipmentPosition } from './types';

export type WorldArtifactPlacement =
  | { type: 'character'; characterId: string }
  | { type: 'title'; titleId: string; controllerId: string }
  | { type: 'dynasty'; dynastyId: string };

export interface WorldArtifactSource {
  file: string;
  line: number;
  effectId: string;
}

export type WorldArtifactProjectionKind = 'portable-asset' | 'political-symbol';

export interface WorldArtifactRecord {
  instanceId: string;
  definitionId: string;
  projectionKind: WorldArtifactProjectionKind;
  lawfulControllerId: string;
  placement: WorldArtifactPlacement;
  equipped: boolean;
  equippedPosition?: EquipmentPosition;
  source: WorldArtifactSource;
}

export interface WorldArtifactState {
  schemaVersion: 1;
  startDate: string;
  datasetHash: string;
  artifactDatasetHash: string;
  characterDatasetHash: string;
  artifacts: Record<string, WorldArtifactRecord>;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePlacement(value: unknown, definitionId: string): void {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(`世界神器位置无效：${definitionId}`);
  }
  if (value.type === 'character' && typeof value.characterId === 'string' && value.characterId.length > 0) return;
  if (value.type === 'title'
    && typeof value.titleId === 'string' && value.titleId.length > 0
    && typeof value.controllerId === 'string' && value.controllerId.length > 0) return;
  if (value.type === 'dynasty' && typeof value.dynastyId === 'string' && value.dynastyId.length > 0) return;
  throw new Error(`世界神器位置字段不完整：${definitionId}`);
}

export function validateWorldArtifactState(value: unknown): asserts value is WorldArtifactState {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('世界神器数据版本无效');
  if (typeof value.startDate !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.startDate)) {
    throw new Error('世界神器开局日期无效');
  }
  for (const field of ['datasetHash', 'artifactDatasetHash', 'characterDatasetHash'] as const) {
    if (typeof value[field] !== 'string' || !HASH_PATTERN.test(value[field])) {
      throw new Error(`世界神器数据哈希无效：${field}`);
    }
  }
  if (!isRecord(value.artifacts)) throw new Error('世界神器记录缺失');

  const instanceIds = new Set<string>();
  for (const [definitionId, raw] of Object.entries(value.artifacts)) {
    if (!isRecord(raw)) throw new Error(`世界神器记录无效：${definitionId}`);
    if (raw.definitionId !== definitionId) throw new Error(`世界神器定义键不一致：${definitionId}`);
    if (typeof raw.instanceId !== 'string' || !raw.instanceId) throw new Error(`世界神器实例 ID 缺失：${definitionId}`);
    if (instanceIds.has(raw.instanceId)) throw new Error(`世界神器实例重复：${raw.instanceId}`);
    instanceIds.add(raw.instanceId);
    if (typeof raw.lawfulControllerId !== 'string' || !raw.lawfulControllerId) {
      throw new Error(`世界神器控制者缺失：${definitionId}`);
    }
    if (raw.projectionKind !== 'portable-asset' && raw.projectionKind !== 'political-symbol') {
      throw new Error(`世界神器投影分类无效：${definitionId}`);
    }
    if (raw.equipped !== false) throw new Error(`世界神器不得在开局自动穿戴：${definitionId}`);
    validatePlacement(raw.placement, definitionId);
    if (!isRecord(raw.source)
      || typeof raw.source.file !== 'string'
      || typeof raw.source.line !== 'number'
      || typeof raw.source.effectId !== 'string') {
      throw new Error(`世界神器来源无效：${definitionId}`);
    }
  }
}

validateWorldArtifactState(AGOT_ARTIFACT_WORLD_STATE);

export const AGOT_CHARACTER_DATASET_HASH = AGOT_ARTIFACT_WORLD_STATE.characterDatasetHash;

export function createInitialAgotArtifactWorldState(): WorldArtifactState {
  return JSON.parse(JSON.stringify(AGOT_ARTIFACT_WORLD_STATE)) as WorldArtifactState;
}

export function listCharacterRecordedEquipment(
  state: WorldArtifactState,
  characterId: string,
): WorldArtifactRecord[] {
  return Object.values(state.artifacts)
    .filter((record) => record.placement.type === 'character' && record.placement.characterId === characterId)
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}
