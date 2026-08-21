import type { WorldArtifactRecord } from './worldArtifacts';

/**
 * Political institutions represented by the title system must not also appear
 * as portable or owned world assets.
 */
const NON_ASSET_WORLD_ARTIFACT_DEFINITION_IDS = new Set<string>([
  'artifact.generated.iron-throne',
]);

export function isWorldArtifactAsset(
  artifact: Pick<WorldArtifactRecord, 'definitionId'>,
): boolean {
  return !NON_ASSET_WORLD_ARTIFACT_DEFINITION_IDS.has(artifact.definitionId);
}
