import { create } from 'zustand'

import type { MapMode } from './mapLayers'

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
  openMap: (locationId?: string) => void
  openCharacterDrawer: () => void
  closeDrawer: () => void
  toggleMap: () => void
  toggleCharacter: () => void
  selectLocation: (id: string | null) => void
  rememberViewport: (viewport: MapViewport) => void
  setMapMode: (mode: MapMode) => void
}

export const useMapUiStore = create<MapUiState>((set) => ({
  activeDrawer: null,
  selectedLocationId: null,
  lastViewport: null,
  mapMode: 'terrain',
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
}))
