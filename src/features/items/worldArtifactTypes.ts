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
