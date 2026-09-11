import type React from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { buildCountyInteractionIndex, type CountyInteractionIndex } from '../countyInteraction';
import type { MapAssetPoint, MapCharacterPoint } from '../dynamicMapSubjects';
import {
  addSelectedCountyLocationLayers,
  addDynamicMapSubjectLayers,
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
  let layersReady = false;
  let presentationKey = '';
  let subjectInputs: readonly unknown[] = [];

  const syncPresentation = (): void => {
    if (destroyed || !layersReady) return;
    const presentation = input.getPresentation();
    const hasRoute = input.hasRoute();
    const key = JSON.stringify([presentation, hasRoute]);
    if (key === presentationKey) return;
    applyMapPresentation(
      input.map,
      presentation,
      hasRoute,
      semanticZoomState(input.map.getZoom()).primaryRank,
    );
    presentationKey = key;
  };

  const refreshSubjects = (): void => {
    const semantic = input.semanticRef.current;
    const presentation = input.getPresentation();
    if (destroyed || !layersReady || !semantic || (!presentation.characters && !presentation.assets)) return;
    const bounds = viewportPixelBounds(input.map, input.manifest);
    const zoomState = semanticZoomState(input.map.getZoom());
    const characters = input.getCharacterPoints();
    const assets = input.getAssetPoints();
    const characterMarkers = input.getCharacterMarkers?.() ?? characters;
    const assetMarkers = input.getAssetMarkers?.() ?? assets;
    const nextInputs = [semantic, characters, assets, characterMarkers, assetMarkers,
      bounds.minX, bounds.minY, bounds.maxX, bounds.maxY,
      zoomState.primaryRank, zoomState.zoom >= 4.1, zoomState.zoom <= 4.4];
    if (nextInputs.length === subjectInputs.length && nextInputs.every((value, index) => value === subjectInputs[index])) return;
    syncDynamicMapSubjects(
      input.map,
      input.manifest,
      characters,
      assets,
      bounds,
      { ...semantic, zoomState },
      {
        characters: characterMarkers,
        assets: assetMarkers,
      },
    );
    subjectInputs = nextInputs;
  };

  const syncSelection = (): void => {
    const index = input.countyInteractionRef.current;
    if (destroyed || !layersReady || !index) return;
    syncSelectedCountyLocations(input.map, input.manifest, index, input.getSelectedCountyId());
  };

  return {
    async initialize() {
      if (destroyed) return;
      try {
        addSelectedCountyLocationLayers(input.map);
        addDynamicMapSubjectLayers(input.map);
        layersReady = true;
        syncPresentation();
        void loadCountyLocationIcons(input.map, () => destroyed).catch(() => {
          if (!destroyed) input.onWarning('伯爵领内部地点图标未能载入，其他地图内容不受影响');
        });
        this.syncPoliticalStates();
        const [entries, semantic] = await Promise.all([
          mapRepository.loadSearchIndex(),
          mapRepository.loadSemanticIndex(),
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
      syncPresentation();
      const semantic = input.semanticRef.current;
      if (!semantic) return;
      const state = semanticZoomState(input.map.getZoom());
      if (state.primaryRank === semantic.primaryRank) return;
      semantic.primaryRank = state.primaryRank;
      // moveend follows zoomend; it refreshes the subjects once with settled bounds.
    },
    syncSelection,
    syncPoliticalStates(previous = []) {
      if (destroyed || !layersReady) return;
      const current = input.getPoliticalStates();
      applyPoliticalFeatureStates(input.map, current, changedTitleIds(previous, current), previous);
    },
    syncPresentation,
    destroy() {
      destroyed = true;
      layersReady = false;
      subjectInputs = [];
      input.semanticRef.current = null;
      input.countyInteractionRef.current = null;
    },
  };
}
