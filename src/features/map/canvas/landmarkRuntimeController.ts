import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapManifest } from '../types';
import { LOCAL_MIN_ZOOM } from '../semanticZoom';

export interface LandmarkRuntimeController {
  initialize(): Promise<void>;
  sync(reason: 'moveend' | 'zoomend'): void;
  destroy(): void;
}

export function createLandmarkRuntimeController(
  map: MapLibreMap,
  manifest: MapManifest,
): LandmarkRuntimeController {
  let runtime: import('../landmarks/landmarkRuntime.ts').LandmarkRuntime | null = null;
  let cancelled = false;
  let initializing: Promise<void> | null = null;
  const abort = new AbortController();

  const initialize = (): Promise<void> => {
    if (cancelled || runtime || map.getZoom() < LOCAL_MIN_ZOOM) return Promise.resolve();
    if (initializing) return initializing;
    initializing = (async () => {
      try {
        const { createLandmarkRuntime } = await import('../landmarks/landmarkRuntime.ts');
        if (cancelled) return;
        const next = await createLandmarkRuntime(map, manifest, { signal: abort.signal });
        if (cancelled) next.destroy();
        else runtime = next;
      } catch (error) {
        if (!cancelled) console.warn('[Landmarks] 三维地标不可用，保留二维地图', error);
      } finally {
        initializing = null;
      }
    })();
    return initializing;
  };

  return {
    initialize,
    sync(reason) {
      if (runtime) runtime.sync(reason);
      else void initialize();
    },
    destroy() {
      cancelled = true;
      abort.abort();
      runtime?.destroy();
      runtime = null;
    },
  };
}
