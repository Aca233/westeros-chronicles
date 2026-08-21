import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import maplibregl, {
  type ErrorEvent as MapLibreErrorEvent,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type MapSourceDataEvent,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import type { CharacterId } from '../../characters/types';
import { configureCk3Camera, createCk3MapOptions } from '../cameraProfile';
import { buildCountyInteractionIndex, type CountyInteractionIndex } from '../countyInteraction';
import type { MapAssetPoint, MapCharacterPoint } from '../dynamicMapSubjects';
import {
  ASSET_POINT_LAYER,
  CHARACTER_POINT_LAYER,
  COUNTY_HIT_LAYER,
  MATERIAL_TERRAIN_SOURCE,
  SELECTED_COUNTY_LOCATION_LAYER,
} from '../mapLayers';
import type { MapInteractionState, MapOverlayPreferences } from '../mapInteraction';
import { mapPresentationFor } from '../mapPresentation';
import { createLocalMapStyle } from '../mapStyle';
import type { MapFocusRequest, MapViewport } from '../mapUiStore';
import type { PoliticalFeatureState } from '../politicalProjection';
import { createTerrainController, type TerrainController } from '../terrainController';
import { createTerrainSurfaceController, type TerrainSurfaceController } from '../terrainSurfaceController';
import type { MapManifest } from '../types';
import type { RoutePlan } from '../routing/types';
import type { ActiveJourney } from '../travel/types';
import { createWheelCameraController, type WheelCameraController } from '../wheelCameraController';
import { syncJourneyLayers } from './journeyLayers';
import { createLandmarkRuntimeController } from './landmarkRuntimeController';
import {
  createMapSemanticProjectionController,
  type MapSemanticProjectionController,
  type SemanticRuntimeContext,
} from './semanticProjectionController';
import { useMapCameraSync } from './useMapCameraSync';

export interface UseMapLifecycleInput {
  manifest: MapManifest;
  selectedCountyId: string | null;
  selectedLocationId: string | null;
  initialViewport: MapViewport | null;
  focusRequest?: MapFocusRequest | null;
  onSelectCounty(countyId: string | null): void;
  onSelectLocation(countyId: string, locationId: string): void;
  onViewportChange(viewport: MapViewport): void;
  onWarning(message: string | null): void;
  onTerrainAvailabilityChange(available: boolean): void;
  overlays: MapOverlayPreferences;
  interactionState: MapInteractionState;
  onChooseTravelDestination(locationId: string): void;
  topDownLocked: boolean;
  northResetRequestId: number;
  routePlan?: RoutePlan | null;
  journey?: ActiveJourney;
  politicalStates: readonly PoliticalFeatureState[];
  characterPoints: readonly MapCharacterPoint[];
  assetPoints: readonly MapAssetPoint[];
  characterMarkers: readonly MapCharacterPoint[];
  assetMarkers: readonly MapAssetPoint[];
  onSelectCharacter(characterId: CharacterId): void;
}

export interface MapLifecycleResult {
  containerRef: React.RefObject<HTMLDivElement>;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  styleReadyRef: React.MutableRefObject<boolean>;
  initializationError: boolean;
  semanticInitializationError: boolean;
}

export function useMapLifecycle(input: UseMapLifecycleInput): MapLifecycleResult {
  const {
    manifest,
    selectedCountyId,
    selectedLocationId,
    initialViewport,
    focusRequest,
    onSelectCounty,
    onSelectLocation,
    onViewportChange,
    onWarning,
    onTerrainAvailabilityChange,
    overlays,
    interactionState,
    onChooseTravelDestination,
    topDownLocked,
    northResetRequestId,
    routePlan,
    journey,
    politicalStates,
    characterPoints,
    assetPoints,
    characterMarkers,
    assetMarkers,
    onSelectCharacter,
  } = input;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleReadyRef = useRef(false);
  const [initializationError, setInitializationError] = useState(false);
  const [semanticInitializationError, setSemanticInitializationError] = useState(false);
  const callbacksRef = useRef({
    onSelectLocation,
    onSelectCharacter,
    onViewportChange,
    onWarning,
    onTerrainAvailabilityChange,
    onSelectCounty,
    onChooseTravelDestination,
  });
  const routeRef = useRef({ routePlan, journey });
  const politicalRef = useRef<readonly PoliticalFeatureState[]>(politicalStates);
  const dynamicRef = useRef({ characterPoints, assetPoints, characterMarkers, assetMarkers });
  const semanticRef = useRef<SemanticRuntimeContext | null>(null);
  const countyInteractionRef = useRef<CountyInteractionIndex | null>(null);
  const semanticControllerRef = useRef<MapSemanticProjectionController | null>(null);
  const selectedCountyRef = useRef(selectedCountyId);
  const overlaysRef = useRef(overlays);
  const interactionRef = useRef(interactionState);
  const reducedMotionRef = useRef(false);
  const terrainControllerRef = useRef<TerrainController | null>(null);
  const wheelCameraControllerRef = useRef<WheelCameraController | null>(null);
  const topDownLockedRef = useRef(topDownLocked);
  const terrainAvailableRef = useRef(true);

  const { terrainInput, targetTerrainPitch, wheelCameraInput } = useMapCameraSync({
    manifest,
    focusRequest,
    topDownLocked,
    northResetRequestId,
    mapRef,
    terrainControllerRef,
    wheelCameraControllerRef,
    topDownLockedRef,
    reducedMotionRef,
    terrainAvailableRef,
    onWarning,
  });

  const applyCurrentPresentation = useCallback((): void => {
    semanticControllerRef.current?.syncPresentation();
  }, []);
  const refreshSemanticSubjects = useCallback((): void => {
    semanticControllerRef.current?.refreshSubjects();
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onSelectLocation,
      onSelectCharacter,
      onViewportChange,
      onWarning,
      onTerrainAvailabilityChange,
      onSelectCounty,
      onChooseTravelDestination,
    };
  }, [onChooseTravelDestination, onSelectCharacter, onSelectCounty, onSelectLocation, onTerrainAvailabilityChange, onViewportChange, onWarning]);

  useEffect(() => {
    selectedCountyRef.current = selectedCountyId;
    overlaysRef.current = overlays;
    interactionRef.current = interactionState;
    const controller = semanticControllerRef.current;
    if (controller) {
      controller.syncSelection();
      controller.syncPresentation();
      controller.refreshSubjects();
    }
  }, [interactionState, overlays, selectedCountyId, selectedLocationId]);

  useEffect(() => {
    routeRef.current = { routePlan, journey };
    const map = mapRef.current;
    if (map?.isStyleLoaded()) syncJourneyLayers(map, manifest, routePlan, journey);
  }, [journey, manifest, routePlan]);

  useEffect(() => {
    const previous = politicalRef.current;
    politicalRef.current = politicalStates;
    semanticControllerRef.current?.syncPoliticalStates(previous);
  }, [politicalStates]);

  useEffect(() => {
    dynamicRef.current = { characterPoints, assetPoints, characterMarkers, assetMarkers };
    refreshSemanticSubjects();
  }, [assetMarkers, assetPoints, characterMarkers, characterPoints, refreshSemanticSubjects]);

  useEffect(() => {
    if (!containerRef.current) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mediaQuery.matches;
    let cameraCleanup = () => {};
    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (mapRef.current) {
        cameraCleanup();
        cameraCleanup = configureCk3Camera(mapRef.current, event.matches, targetTerrainPitch);
        terrainControllerRef.current?.requestSync(terrainInput(), true);
        wheelCameraControllerRef.current?.update(wheelCameraInput());
      }
    };
    mediaQuery.addEventListener('change', handleReducedMotionChange);

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: createLocalMapStyle(manifest),
        center: initialViewport ? [initialViewport.longitude, initialViewport.latitude] : [0, 0],
        zoom: initialViewport?.zoom ?? 0,
        ...createCk3MapOptions(manifest, reducedMotionRef.current),
        localIdeographFontFamily: 'Noto Sans CJK SC, Microsoft YaHei, sans-serif',
        attributionControl: false,
        cooperativeGestures: false,
        transformRequest: (url) => ({
          url: url.startsWith('/') ? new URL(url, window.location.href).href : url,
        }),
      });
    } catch (error) {
      mediaQuery.removeEventListener('change', handleReducedMotionChange);
      setInitializationError(true);
      console.error('[MapCanvas] 地图画布初始化失败', error);
      callbacksRef.current.onWarning('地图画布无法初始化，正文与人物卷宗不受影响');
      return;
    }
    setInitializationError(false);
    mapRef.current = map;
    cameraCleanup = configureCk3Camera(map, reducedMotionRef.current, targetTerrainPitch);
    const wheelCameraController = createWheelCameraController(map, wheelCameraInput());
    wheelCameraControllerRef.current = wheelCameraController;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    const semanticController = createMapSemanticProjectionController({
      map,
      manifest,
      semanticRef,
      countyInteractionRef,
      getPresentation: () => mapPresentationFor({
        zoom: map.getZoom(),
        overlays: overlaysRef.current,
        selectedCountyId: selectedCountyRef.current,
      }),
      getSelectedCountyId: () => selectedCountyRef.current,
      getPoliticalStates: () => politicalRef.current,
      getCharacterPoints: () => dynamicRef.current.characterPoints,
      getAssetPoints: () => dynamicRef.current.assetPoints,
      getCharacterMarkers: () => dynamicRef.current.characterMarkers,
      getAssetMarkers: () => dynamicRef.current.assetMarkers,
      hasRoute: () => Boolean(routeRef.current.routePlan || routeRef.current.journey),
      onInitializationError: setSemanticInitializationError,
      onWarning: (message) => callbacksRef.current.onWarning(message),
    });
    semanticControllerRef.current = semanticController;
    const landmarkController = createLandmarkRuntimeController(map, manifest);
    let terrainController: TerrainController | null = null;
    let terrainSurfaceController: TerrainSurfaceController | null = null;
    let materialSurfaceFailed = false;

    const handleMapError = (event: MapLibreErrorEvent) => {
      const terrainEvent = event as MapLibreErrorEvent & { sourceId?: string };
      const message = event.error?.message ?? '';
      if (terrainEvent.sourceId === MATERIAL_TERRAIN_SOURCE || /agot-material-terrain/i.test(message)) {
        materialSurfaceFailed = true;
        terrainSurfaceController?.disable('近景地形材质不可用');
        return;
      }
      if (terrainEvent.sourceId === 'agot-dem' || /agot-dem|terrain(?:-rgb)?\s+(?:decode|tile)/i.test(message)) {
        terrainControllerRef.current?.disable('DEM 地形不可用');
        return;
      }
      if (/404|not found/i.test(message)) return;
      callbacksRef.current.onWarning('部分地图图块未能载入，可继续浏览其他区域');
    };
    const handleMoveEnd = () => {
      const center = map.getCenter();
      callbacksRef.current.onViewportChange({ longitude: center.lng, latitude: center.lat, zoom: map.getZoom() });
      semanticController.refreshSubjects();
      landmarkController.sync('moveend');
    };
    const handleZoomEnd = (event?: { agotWheelCamera?: boolean }) => {
      landmarkController.sync('zoomend');
      if (event?.agotWheelCamera) {
        terrainControllerRef.current?.requestSync(terrainInput());
      } else {
        terrainControllerRef.current?.requestSync(terrainInput(), true);
      }
      semanticController.syncZoom();
    };
    const handleCountyClick = (event: MapLayerMouseEvent) => {
      const foregroundLayers = [CHARACTER_POINT_LAYER, ASSET_POINT_LAYER, SELECTED_COUNTY_LOCATION_LAYER]
        .filter((layerId) => Boolean(map.getLayer(layerId)));
      if (foregroundLayers.length && map.queryRenderedFeatures(event.point, { layers: foregroundLayers }).length) return;
      const baronyId = event.features?.[0]?.properties?.baronyId;
      if (typeof baronyId !== 'string') return;
      const index = countyInteractionRef.current;
      const countyId = index?.countyIdForBarony(baronyId);
      if (!index || !countyId) return;
      callbacksRef.current.onSelectCounty(countyId);
      if (interactionRef.current === 'pick-travel-destination') {
        const destinationId = index.primaryLocationForCounty(countyId);
        if (destinationId) callbacksRef.current.onChooseTravelDestination(destinationId);
      }
    };
    const handleExpandedLocationClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.id;
      if (typeof locationId !== 'string') return;
      const selected = countyInteractionRef.current?.selectedCountyForLocation(locationId);
      if (selected) callbacksRef.current.onSelectLocation(selected.countyId, locationId);
    };
    const handleBlankMapClick = (event: MapMouseEvent) => {
      const interactiveLayers = [COUNTY_HIT_LAYER, SELECTED_COUNTY_LOCATION_LAYER, CHARACTER_POINT_LAYER, ASSET_POINT_LAYER]
        .filter((layerId) => Boolean(map.getLayer(layerId)));
      if (interactiveLayers.length && map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length === 0) {
        callbacksRef.current.onSelectCounty(null);
      }
    };
    const handleCharacterClick = (event: MapLayerMouseEvent) => {
      const characterId = event.features?.[0]?.properties?.characterId;
      if (typeof characterId === 'string' && (characterId.startsWith('agot:') || characterId.startsWith('save:'))) {
        callbacksRef.current.onSelectCharacter(characterId as CharacterId);
      }
    };
    const handleAssetClick = (event: MapLayerMouseEvent) => {
      const locationId = event.features?.[0]?.properties?.locationId;
      if (typeof locationId !== 'string') return;
      const selected = countyInteractionRef.current?.selectedCountyForLocation(locationId);
      if (selected) callbacksRef.current.onSelectLocation(selected.countyId, locationId);
    };
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { map.getCanvas().style.cursor = ''; };
    const handleTerrainZoom = () => {
      terrainController?.requestSync(terrainInput());
      terrainSurfaceController?.requestSync(map.getZoom());
      semanticController.syncPresentation();
    };
    const handleSourceData = (event: MapSourceDataEvent) => {
      terrainSurfaceController?.handleSourceData(event.sourceId);
    };

    map.on('error', handleMapError);
    map.on('sourcedata', handleSourceData);
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleZoomEnd);
    map.on('click', handleBlankMapClick);
    map.on('click', COUNTY_HIT_LAYER, handleCountyClick);
    map.on('mouseenter', COUNTY_HIT_LAYER, showPointer);
    map.on('mouseleave', COUNTY_HIT_LAYER, clearPointer);
    const initializeLocationLayers = () => {
      styleReadyRef.current = true;
      const handleTerrainUnavailable = () => {
        terrainAvailableRef.current = false;
        callbacksRef.current.onTerrainAvailabilityChange(false);
        callbacksRef.current.onWarning('当前使用二维地图');
      };
      terrainController = createTerrainController(map, { onUnavailable: handleTerrainUnavailable });
      terrainControllerRef.current = terrainController;
      terrainSurfaceController = createTerrainSurfaceController(map, {
        onUnavailable: (reason) => callbacksRef.current.onWarning(`${reason}，已保留远景地图`),
      });
      map.on('zoom', handleTerrainZoom);
      terrainController.syncNow(terrainInput(), true);
      if (materialSurfaceFailed) terrainSurfaceController.disable('近景地形材质不可用');
      else terrainSurfaceController.syncNow(map.getZoom());
      map.on('click', SELECTED_COUNTY_LOCATION_LAYER, handleExpandedLocationClick);
      map.on('mouseenter', SELECTED_COUNTY_LOCATION_LAYER, showPointer);
      map.on('mouseleave', SELECTED_COUNTY_LOCATION_LAYER, clearPointer);
      syncJourneyLayers(map, manifest, routeRef.current.routePlan, routeRef.current.journey);
      semanticController.syncPresentation();
      map.on('click', CHARACTER_POINT_LAYER, handleCharacterClick);
      map.on('click', ASSET_POINT_LAYER, handleAssetClick);
      map.on('mouseenter', CHARACTER_POINT_LAYER, showPointer);
      map.on('mouseleave', CHARACTER_POINT_LAYER, clearPointer);
      map.on('mouseenter', ASSET_POINT_LAYER, showPointer);
      map.on('mouseleave', ASSET_POINT_LAYER, clearPointer);
      void landmarkController.initialize();
      void semanticController.initialize();
    };
    map.on('load', initializeLocationLayers);

    let resizeFrame: number | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      resizeFrame ??= requestAnimationFrame(() => {
        resizeFrame = null;
        map.resize();
      });
    });
    resizeObserver?.observe(containerRef.current);

    return () => {
      resizeObserver?.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      mediaQuery.removeEventListener('change', handleReducedMotionChange);
      cameraCleanup();
      map.off('error', handleMapError);
      map.off('sourcedata', handleSourceData);
      map.off('zoom', handleTerrainZoom);
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleZoomEnd);
      map.off('click', handleBlankMapClick);
      map.off('click', COUNTY_HIT_LAYER, handleCountyClick);
      map.off('mouseenter', COUNTY_HIT_LAYER, showPointer);
      map.off('mouseleave', COUNTY_HIT_LAYER, clearPointer);
      map.off('click', SELECTED_COUNTY_LOCATION_LAYER, handleExpandedLocationClick);
      map.off('mouseenter', SELECTED_COUNTY_LOCATION_LAYER, showPointer);
      map.off('mouseleave', SELECTED_COUNTY_LOCATION_LAYER, clearPointer);
      map.off('click', CHARACTER_POINT_LAYER, handleCharacterClick);
      map.off('click', ASSET_POINT_LAYER, handleAssetClick);
      map.off('mouseenter', CHARACTER_POINT_LAYER, showPointer);
      map.off('mouseleave', CHARACTER_POINT_LAYER, clearPointer);
      map.off('mouseenter', ASSET_POINT_LAYER, showPointer);
      map.off('mouseleave', ASSET_POINT_LAYER, clearPointer);
      map.off('load', initializeLocationLayers);
      styleReadyRef.current = false;
      landmarkController.destroy();
      semanticController.destroy();
      semanticControllerRef.current = null;
      terrainSurfaceController?.destroy();
      terrainController?.destroy();
      terrainControllerRef.current = null;
      wheelCameraController.destroy();
      wheelCameraControllerRef.current = null;
      map.stop();
      map.remove();
      mapRef.current = null;
    };
  }, [applyCurrentPresentation, manifest, refreshSemanticSubjects]);

  useEffect(() => {
    if (mapRef.current && styleReadyRef.current) {
      applyCurrentPresentation();
      refreshSemanticSubjects();
    }
  }, [applyCurrentPresentation, overlays, refreshSemanticSubjects, selectedCountyId]);

  return { containerRef, mapRef, styleReadyRef, initializationError, semanticInitializationError };
}
