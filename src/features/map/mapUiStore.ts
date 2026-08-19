import { create } from 'zustand'

import type { MapMode } from './mapLayers'
import type { RoutePlan } from './routing/types'

export type ActiveDrawer = 'map' | 'character' | null

export interface MapViewport {
  longitude: number
  latitude: number
  zoom: number
}

interface MapUiState {
  activeDrawer: 'map' | 'character' | null
  selectedLocationId: string | null
  lastViewport: MapViewport | null
  mapMode: MapMode
  routePreview: RoutePlan | null
  travelIntent: 'reroute' | null
  openMap: (locationId?: string) => void
  openCharacterDrawer: () => void
  closeDrawer: () => void
  toggleMap: () => void
  toggleCharacter: () => void
  selectLocation: (id: string | null) => void
  rememberViewport: (viewport: MapViewport) => void
  setMapMode: (mode: MapMode) => void
  previewRoute: (route: RoutePlan | null) => void
  beginReroute: () => void
  clearTravelIntent: () => void
}

export const useMapUiStore = create<MapUiState>((set) => ({
  activeDrawer: null,
  selectedLocationId: null,
  lastViewport: null,
  mapMode: 'terrain',
  routePreview: null,
  travelIntent: null,
  openMap: (locationId) => set((state) => ({
    activeDrawer: 'map',
    selectedLocationId: locationId ?? state.selectedLocationId,
  })),
  openCharacterDrawer: () => set({ activeDrawer: 'character' }),
  closeDrawer: () => set({ activeDrawer: null }),
  toggleMap: () => set((state) => ({ activeDrawer: state.activeDrawer === 'map' ? null : 'map' })),
  toggleCharacter: () => set((state) => ({ activeDrawer: state.activeDrawer === 'character' ? null : 'character' })),
  selectLocation: (id) => set({ selectedLocationId: id }),
  rememberViewport: (viewport) => set({ lastViewport: viewport }),
  setMapMode: (mapMode) => set({ mapMode }),
  previewRoute: (routePreview) => set({ routePreview }),
  beginReroute: () => set({ travelIntent: 'reroute', selectedLocationId: null, mapMode: 'travel' }),
  clearTravelIntent: () => set({ travelIntent: null }),
}))
