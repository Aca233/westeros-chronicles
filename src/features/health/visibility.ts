import type { CharacterId } from '../../domain/characterId';
import type { CharacterHealthState, HealthRuntimeState } from './types';

export function visibleCharacterHealth(
  runtime: HealthRuntimeState,
  subjectId: CharacterId,
  viewerId: CharacterId,
  options: { debug?: boolean } = {},
): CharacterHealthState | undefined {
  const state = runtime.characters[subjectId];
  if (!state) return undefined;
  const canSeeHidden = options.debug === true || subjectId === viewerId;
  return {
    ...structuredClone(state),
    injuries: state.injuries
      .filter((injury) => canSeeHidden || injury.hiddenFromPlayer !== true)
      .map((injury) => structuredClone(injury)),
  };
}
