import type { WorldEvent } from '../world/worldRuntimeTypes';
import {
  selectVisibleWorldEvents,
  type WorldEventViewer,
} from '../world/worldEventVisibility';

export function selectWorldEventsForView(
  events: readonly WorldEvent[],
  viewer: WorldEventViewer,
  debugEnabled: boolean,
): WorldEvent[] {
  return selectVisibleWorldEvents(events, debugEnabled ? { kind: 'system' } : viewer);
}

export function hiddenWorldEventIdsForPlayer(
  events: readonly WorldEvent[],
  viewer: WorldEventViewer,
): ReadonlySet<string> {
  const visibleIds = new Set(selectVisibleWorldEvents(events, viewer).map((event) => event.id));
  return new Set(events.filter((event) => !visibleIds.has(event.id)).map((event) => event.id));
}
