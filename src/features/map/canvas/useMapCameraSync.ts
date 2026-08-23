import { useEffect } from 'react';
import type React from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { cameraAnimation } from '../cameraProfile';
import { mapPixelToLngLat } from '../coordinates';
import { buildCountyInteractionIndex } from '../countyInteraction';
import { mapRepository } from '../repository';
import { TERRAIN_ENTER_ZOOM, terrainCameraProfile } from '../terrainProfile';
import type { TerrainController, TerrainSyncInput } from '../terrainController';
import type { MapManifest } from '../types';
import type { MapFocusRequest } from '../mapUiStore';
import type { WheelCameraController } from '../wheelCameraController';

export function useMapCameraSync(input: {
  manifest: MapManifest;
  focusRequest?: MapFocusRequest | null;
  // 地图实例就绪信号：画布挂载晚于 focusRequest 时，依赖它补跑一次飞行。
  mapReadyNonce?: number;
  topDownLocked: boolean;
  northResetRequestId: number;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  terrainControllerRef: React.MutableRefObject<TerrainController | null>;
  wheelCameraControllerRef: React.MutableRefObject<WheelCameraController | null>;
  topDownLockedRef: React.MutableRefObject<boolean>;
  reducedMotionRef: React.MutableRefObject<boolean>;
  terrainAvailableRef: React.MutableRefObject<boolean>;
  onWarning(message: string | null): void;
}) {
  const terrainInput = (): TerrainSyncInput => ({
    topDownLocked: input.topDownLockedRef.current,
    reducedMotion: input.reducedMotionRef.current,
  });
  const targetTerrainPitch = (zoom: number): number => terrainCameraProfile({
    zoom,
    topDownLocked: input.topDownLockedRef.current,
    available: input.terrainAvailableRef.current,
    terrainWasEnabled: zoom >= TERRAIN_ENTER_ZOOM,
  }).pitch;
  const wheelCameraInput = () => ({
    reducedMotion: input.reducedMotionRef.current,
    targetPitch: targetTerrainPitch,
  });

  useEffect(() => {
    input.topDownLockedRef.current = input.topDownLocked;
    input.terrainControllerRef.current?.requestSync(terrainInput(), true);
    input.wheelCameraControllerRef.current?.update(wheelCameraInput());
  }, [input.topDownLocked]);

  useEffect(() => {
    if (input.northResetRequestId > 0) input.terrainControllerRef.current?.resetNorth(terrainInput());
  }, [input.northResetRequestId]);

  useEffect(() => {
    if (!input.focusRequest || !input.mapRef.current) return;
    let cancelled = false;
    const resolveLocationId = async (): Promise<string | null> => {
      if (input.focusRequest!.target.kind === 'location') return input.focusRequest!.target.locationId;
      const [entries, semantic] = await Promise.all([
        mapRepository.loadSearchIndex(),
        mapRepository.loadSemanticIndex(),
      ]);
      return buildCountyInteractionIndex(entries, semantic).primaryLocationForCounty(input.focusRequest!.target.countyId) ?? null;
    };
    resolveLocationId().then(async (locationId) => {
      if (!locationId || cancelled || !input.mapRef.current) return;
      const location = await mapRepository.getLocation(locationId);
      if (cancelled || !input.mapRef.current) return;
      input.onWarning(null);
      const targetZoom = input.focusRequest!.target.kind === 'county' ? 3.8 : 4.8;
      const profile = terrainCameraProfile({
        zoom: targetZoom,
        topDownLocked: input.topDownLockedRef.current,
        available: input.terrainAvailableRef.current,
        terrainWasEnabled: targetZoom >= TERRAIN_ENTER_ZOOM,
      });
      input.mapRef.current.flyTo({
        center: mapPixelToLngLat(location, input.manifest),
        zoom: targetZoom,
        pitch: profile.pitch,
        ...cameraAnimation(input.reducedMotionRef.current, 'search'),
      });
    }).catch(() => {
      if (!cancelled) input.onWarning('未能定位所选地图目标');
    });
    return () => { cancelled = true; };
  }, [input.focusRequest, input.manifest, input.mapReadyNonce]);

  return { terrainInput, targetTerrainPitch, wheelCameraInput };
}
