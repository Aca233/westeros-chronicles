import type { WorldArtifactRecord } from './worldArtifacts';

/**
 * Political institutions represented by the title system must not also appear
 * as portable or owned world assets.
 */
// Compatibility only for pre-classification records. New generated data must use projectionKind.
const NON_ASSET_WORLD_ARTIFACT_DEFINITION_IDS = new Set<string>([
  'artifact.generated.iron-throne',
]);

export function isWorldArtifactAsset(
  artifact: Pick<WorldArtifactRecord, 'definitionId'> & Partial<Pick<WorldArtifactRecord, 'projectionKind'>>,
): boolean {
  if (artifact.projectionKind) return artifact.projectionKind === 'portable-asset';
  return !NON_ASSET_WORLD_ARTIFACT_DEFINITION_IDS.has(artifact.definitionId);
}
