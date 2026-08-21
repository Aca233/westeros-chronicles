import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../types/game';
import { createWorldDisplayRepositories, resolveWorldEventDisplays, type WorldEventDisplay } from './worldDisplayResolver';
import type { WorldEvent } from './worldRuntimeTypes';

export function useWorldEventDisplays(
  events: readonly WorldEvent[],
  gameState: GameState,
): ReadonlyMap<string, WorldEventDisplay> {
  const [resolved, setResolved] = useState<ReadonlyMap<string, WorldEventDisplay>>(() => new Map());
  const repositories = useMemo(
    () => createWorldDisplayRepositories(gameState),
    [gameState.lord.canonicalCharacterId, gameState.lord.items, gameState.lord.location.locationId, gameState.lord.locationLabel, gameState.lord.name, gameState.worldArtifacts, gameState.worldCharacters?.runId],
  );

  useEffect(() => {
    let cancelled = false;
    resolveWorldEventDisplays(events, repositories)
      .then((displays) => { if (!cancelled) setResolved(displays); })
      .catch(() => { if (!cancelled) setResolved(new Map()); });
    return () => { cancelled = true; };
  }, [events, repositories]);

  return resolved;
}
