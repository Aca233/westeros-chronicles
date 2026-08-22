import type { ResolvedCharacter } from '../characters/types';
import type { WorldCharacterStartRecord } from '../world-content/types';
import type { CharacterWorldPatch } from './worldRuntimeTypes';

export interface StartCharacterRuntimeState {
  characters: Readonly<Record<string, CharacterWorldPatch>>;
}

export function getStartCharacterState(
  characterId: string,
  startState: { characters: readonly WorldCharacterStartRecord[] },
): WorldCharacterStartRecord | undefined {
  return startState.characters.find((record) => record.characterId === characterId);
}

/**
 * Merges the fixed 298 AC start record over the AGOT base record, then lets a
 * committed runtime patch win for every field it carries. Base-record facts
 * without a start entry or patch pass through untouched.
 */
export function projectStartCharacterFacts<T extends ResolvedCharacter>(
  character: T,
  startState: { characters: readonly WorldCharacterStartRecord[] },
  runtime: StartCharacterRuntimeState,
): T {
  const start = getStartCharacterState(character.id, startState);
  const patch = runtime.characters[character.id];
  const alive = patch?.alive ?? start?.aliveOverride ?? character.alive;
  const location = patch?.location
    ?? start?.location
    ?? (character.locationId
      ? { locationId: character.locationId, ...(character.sceneLocation ? { sceneLocation: character.sceneLocation } : {}) }
      : undefined);
  const currentActivity = patch?.currentActivity ?? start?.currentActivity ?? character.currentActivity;
  return {
    ...character,
    alive,
    ...(start?.wounds ? { wounds: [...start.wounds] } : {}),
    ...(location
      ? {
          locationId: location.locationId,
          ...(location.sceneLocation ? { sceneLocation: location.sceneLocation } : {}),
        }
      : {}),
    ...(currentActivity ? { currentActivity } : {}),
  };
}
