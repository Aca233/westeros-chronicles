import React from 'react';
import { Map as MapIcon } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CharacterId } from '../characters/types';
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects';
import type { MapInteractionState, MapOverlayPreferences } from './mapInteraction';
import type { MapFocusRequest, MapViewport } from './mapUiStore';
import type { PoliticalFeatureState } from './politicalProjection';
import type { RoutePlan } from './routing/types';
import type { ActiveJourney } from './travel/types';
import type { MapManifest } from './types';
import { useMapLifecycle } from './canvas/useMapLifecycle';

maplibregl.setWorkerCount(Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency ?? 4) / 2))));

let mapRuntimePrewarmed = false;
export function prewarmMapRuntime(): void {
  if (mapRuntimePrewarmed) return;
  maplibregl.prewarm();
  mapRuntimePrewarmed = true;
}

interface MapCanvasProps {
  manifest: MapManifest;
  selectedCountyId: string | null;
  selectedLocationId: string | null;
  initialViewport: MapViewport | null;
  focusRequest?: MapFocusRequest | null;
  onSelectCounty: (countyId: string | null) => void;
  onSelectLocation: (countyId: string, locationId: string) => void;
  onViewportChange: (viewport: MapViewport) => void;
  onWarning: (message: string | null) => void;
  onTerrainAvailabilityChange: (available: boolean) => void;
  overlays: MapOverlayPreferences;
  interactionState: MapInteractionState;
  onChooseTravelDestination: (locationId: string) => void;
  topDownLocked: boolean;
  northResetRequestId: number;
  routePlan?: RoutePlan | null;
  journey?: ActiveJourney;
  politicalStates?: readonly PoliticalFeatureState[];
  characterPoints?: readonly MapCharacterPoint[];
  assetPoints?: readonly MapAssetPoint[];
  characterMarkers?: readonly MapCharacterPoint[];
  assetMarkers?: readonly MapAssetPoint[];
  onSelectCharacter: (characterId: CharacterId) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  politicalStates = [],
  characterPoints = [],
  assetPoints = [],
  characterMarkers = characterPoints,
  assetMarkers = assetPoints,
  ...props
}) => {
  const { containerRef, initializationError, semanticInitializationError } = useMapLifecycle({
    ...props,
    politicalStates,
    characterPoints,
    assetPoints,
    characterMarkers,
    assetMarkers,
  });

  return (
    <>
      <div ref={containerRef} className="agot-map-canvas" aria-label="维斯特洛地图画布" />
      {initializationError && (
        <div className="map-canvas-error" role="alert">
          <MapIcon className="h-7 w-7 text-gold" aria-hidden="true" />
          <strong>地图画布无法初始化</strong>
          <span>请确认浏览器已启用图形加速，或稍后重新打开地图。</span>
        </div>
      )}
      {semanticInitializationError && !initializationError && (
        <div className="map-canvas-error" role="alert">
          <MapIcon className="h-7 w-7 text-gold" aria-hidden="true" />
          <strong>地图语义资料未能载入</strong>
          <span>请重新载入地图；正文与人物卷宗仍可正常使用。</span>
        </div>
      )}
    </>
  );
};
