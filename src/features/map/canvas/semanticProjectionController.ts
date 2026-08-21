import type React from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildCountyInteractionIndex, type CountyInteractionIndex } from '../countyInteraction';
import type { MapAssetPoint, MapCharacterPoint } from '../dynamicMapSubjects';
import {
  addSelectedCountyLocationLayers,
  applyMapPresentation,
  applyPoliticalFeatureStates,
  loadCountyLocationIcons,
  syncDynamicMapSubjects,
  syncSelectedCountyLocations,
} from '../mapLayers';
import type { MapPresentation } from '../mapPresentation';
import { changedTitleIds, type PoliticalFeatureState } from '../politicalProjection';
import { mapRepository } from '../repository';
import { semanticZoomState } from '../semanticZoom';
import type { MapManifest, SemanticMembershipIndex, SemanticRank } from '../types';
import { viewportPixelBounds } from './journeyLayers';

export interface SemanticRuntimeContext extends SemanticMembershipIndex {
  primaryRank: SemanticRank;
}

export interface MapSemanticProjectionController {
  initialize(): Promise<void>;
  refreshSubjects(): void;
  syncZoom(): void;
  syncSelection(): void;
  syncPoliticalStates(previous?: readonly PoliticalFeatureState[]): void;
  syncPresentation(): void;
  destroy(): void;
}

export function createMapSemanticProjectionController(input: {
  map: MapLibreMap;
  manifest: MapManifest;
  semanticRef: React.MutableRefObject<SemanticRuntimeContext | null>;
  countyInteractionRef: React.MutableRefObject<CountyInteractionIndex | null>;
  getPresentation(): MapPresentation;
  getSelectedCountyId(): string | null;
  getPoliticalStates(): readonly PoliticalFeatureState[];
  getCharacterPoints(): readonly MapCharacterPoint[];
  getAssetPoints(): readonly MapAssetPoint[];
  getCharacterMarkers?(): readonly MapCharacterPoint[];
  getAssetMarkers?(): readonly MapAssetPoint[];
  hasRoute(): boolean;
  onInitializationError(value: boolean): void;
  onWarning(message: string): void;
}): MapSemanticProjectionController {
  let destroyed = false;

  const syncPresentation = (): void => {
    const semantic = input.semanticRef.current;
    applyMapPresentation(
      input.map,
      input.getPresentation(),
      input.hasRoute(),
      semantic?.primaryRank ?? semanticZoomState(input.map.getZoom()).primaryRank,
    );
  };

  const refreshSubjects = (): void => {
    const semantic = input.semanticRef.current;
    const presentation = input.getPresentation();
    if (!input.map.isStyleLoaded() || !semantic || (!presentation.characters && !presentation.assets)) return;
    syncDynamicMapSubjects(
      input.map,
      input.manifest,
      input.getCharacterPoints(),
      input.getAssetPoints(),
      viewportPixelBounds(input.map, input.manifest),
      { ...semantic, zoomState: semanticZoomState(input.map.getZoom()) },
      {
        characters: input.getCharacterMarkers?.() ?? input.getCharacterPoints(),
        assets: input.getAssetMarkers?.() ?? input.getAssetPoints(),
      },
    );
  };

  const syncSelection = (): void => {
    const index = input.countyInteractionRef.current;
    if (!index || !input.map.isStyleLoaded()) return;
    syncSelectedCountyLocations(input.map, input.manifest, index, input.getSelectedCountyId());
  };

  return {
    async initialize() {
      addSelectedCountyLocationLayers(input.map);
      const locationIconsReady = loadCountyLocationIcons(input.map)
        .catch(() => input.onWarning('伯爵领内部地点图标未能载入，其他地图内容不受影响'));
      this.syncPoliticalStates();
      try {
        const [entries, semantic] = await Promise.all([
          mapRepository.loadSearchIndex(),
          mapRepository.loadSemanticIndex(),
          locationIconsReady,
        ]);
        if (destroyed) return;
        input.semanticRef.current = { ...semantic, primaryRank: semanticZoomState(input.map.getZoom()).primaryRank };
        input.countyInteractionRef.current = buildCountyInteractionIndex(entries, semantic);
        syncSelection();
        input.onInitializationError(false);
        refreshSubjects();
        syncPresentation();
      } catch {
        if (destroyed) return;
        input.semanticRef.current = null;
        input.countyInteractionRef.current = null;
        input.onInitializationError(true);
        input.onWarning('地图语义资料未能载入，请重新载入地图');
      }
    },
    refreshSubjects,
    syncZoom() {
      const semantic = input.semanticRef.current;
      if (!semantic) return;
      const state = semanticZoomState(input.map.getZoom());
      if (state.primaryRank === semantic.primaryRank) return;
      semantic.primaryRank = state.primaryRank;
      refreshSubjects();
    },
    syncSelection,
    syncPoliticalStates(previous = []) {
      const current = input.getPoliticalStates();
      applyPoliticalFeatureStates(input.map, current, changedTitleIds(previous, current), previous);
    },
    syncPresentation,
    destroy() {
      destroyed = true;
      input.semanticRef.current = null;
      input.countyInteractionRef.current = null;
    },
  };
}
