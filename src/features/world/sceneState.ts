import type { CharacterId } from '../../domain/characterId';
import type { WorldLocationRef } from '../../domain/worldLocation';

export interface ActiveSceneState {
  schemaVersion: 1;
  id: string;
  revision: number;
  location: WorldLocationRef;
  presentCharacterIds: CharacterId[];
  updatedTurn: number;
}

function normalizedSceneName(value?: string): string {
  return value?.trim() ?? '';
}

export function sameActiveScene(left: WorldLocationRef, right: WorldLocationRef): boolean {
  return left.locationId === right.locationId
    && normalizedSceneName(left.sceneLocation) === normalizedSceneName(right.sceneLocation);
}

function sceneId(location: WorldLocationRef): string {
  const room = normalizedSceneName(location.sceneLocation) || 'unspecified';
  return `scene:${location.locationId}:${room}`;
}

export function createActiveScene(
  location: WorldLocationRef,
  updatedTurn: number,
  presentCharacterIds: readonly CharacterId[] = [],
): ActiveSceneState {
  return {
    schemaVersion: 1,
    id: sceneId(location),
    revision: 0,
    location: { ...location },
    presentCharacterIds: [...new Set(presentCharacterIds)].sort(),
    updatedTurn,
  };
}

export function synchronizeActiveScene(
  previous: ActiveSceneState | undefined,
  location: WorldLocationRef,
  updatedTurn: number,
  presentCharacterIds: readonly CharacterId[],
): ActiveSceneState {
  if (!previous || !sameActiveScene(previous.location, location)) {
    return createActiveScene(location, updatedTurn, presentCharacterIds);
  }
  const nextPresentIds = [...new Set(presentCharacterIds)].sort();
  const rosterChanged = nextPresentIds.length !== previous.presentCharacterIds.length
    || nextPresentIds.some((id, index) => id !== previous.presentCharacterIds[index]);
  return {
    ...previous,
    revision: previous.revision + (rosterChanged ? 1 : 0),
    location: { ...location },
    presentCharacterIds: nextPresentIds,
    updatedTurn,
  };
}
