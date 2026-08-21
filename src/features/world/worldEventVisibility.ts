import type { CharacterId } from '../characters/types';
import type { WorldEvent } from './worldRuntimeTypes';

export type WorldEventViewer =
  | { kind: 'player'; characterId?: CharacterId }
  | { kind: 'system' };

interface PlayerWorldEventIdentity {
  lord: { canonicalCharacterId?: CharacterId };
  worldCharacters?: { runId: string } | null;
}

export function playerWorldEventViewer(identity: PlayerWorldEventIdentity): WorldEventViewer {
  return {
    kind: 'player',
    characterId: identity.lord.canonicalCharacterId
      ?? (`save:${identity.worldCharacters?.runId ?? 'current'}:player` as CharacterId),
  };
}

/**
 * Creates a player-safe projection of the authoritative event ledger.
 * Unknown visibility values are deliberately hidden from player views.
 */
export function selectVisibleWorldEvents(
  events: readonly WorldEvent[],
  viewer: WorldEventViewer,
): WorldEvent[] {
  if (viewer.kind === 'system') return [...events];
  return events.filter((event) => event.visibility === 'public'
    || (event.visibility === 'secret'
      && Boolean(viewer.characterId)
      && event.knownBy?.includes(viewer.characterId!) === true));
}
