import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapManifest } from '../types';

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

  return {
    async initialize() {
      try {
        const { createLandmarkRuntime } = await import('../landmarks/landmarkRuntime.ts');
        const next = await createLandmarkRuntime(map, manifest);
        if (cancelled) next.destroy();
        else runtime = next;
      } catch (error) {
        console.warn('[Landmarks] 三维地标不可用，保留二维地图', error);
      }
    },
    sync(reason) {
      runtime?.sync(reason);
    },
    destroy() {
      cancelled = true;
      runtime?.destroy();
      runtime = null;
    },
  };
}
