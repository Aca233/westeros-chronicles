import { create } from 'zustand'
import type { RoutePlan } from './routing/types'
import type { CharacterId } from '../characters/types'
import {
  DEFAULT_MAP_OVERLAYS,
  EMPTY_MAP_SELECTION,
  clearSelectedLocation,
  selectCounty as countySelection,
  selectMapLocation,
  type MapFocusTarget,
  type MapInteractionState,
  type MapOverlayPreferences,
  type MapSelection,
} from './mapInteraction.ts'

export type ActiveDrawer = 'map' | 'character' | 'asset' | null
export interface MapViewport { longitude: number; latitude: number; zoom: number }
export interface MapFocusRequest { id: number; target: MapFocusTarget }

interface MapUiState {
  activeDrawer: ActiveDrawer
  selection: MapSelection
  overlays: MapOverlayPreferences
  interactionState: MapInteractionState
  focusRequest: MapFocusRequest | null
  focusRequestSequence: number
  selectedAssetId: string | null
  assetSourceCharacterId: CharacterId | null
  returnDrawer: Exclude<ActiveDrawer, 'asset'>
  lastViewport: MapViewport | null
  topDownLocked: boolean
  northResetRequestId: number
  routePreview: RoutePlan | null
  travelTargetLocationId: string | null
  travelPickOriginLocationId: string | null
  openMap: (target?: MapFocusTarget) => void
  openCharacterDrawer: () => void
  openAsset: (assetId: string, sourceCharacterId?: CharacterId | null) => void
  returnFromAsset: () => void
  closeDrawer: () => void
  toggleMap: () => void
  toggleCharacter: () => void
  selectCounty: (countyId: string | null) => void
  selectLocation: (countyId: string, locationId: string) => void
  clearLocation: () => void
  clearSelection: () => void
  rememberViewport: (viewport: MapViewport) => void
  setOverlay: (key: keyof MapOverlayPreferences, enabled: boolean) => void
  toggleTopDown: () => void
  requestNorthReset: () => void
  previewRoute: (route: RoutePlan | null) => void
  beginTravelPlanning: (locationId: string) => void
  beginDestinationPick: () => void
  chooseTravelDestination: (locationId: string) => void
  cancelDestinationPick: () => void
  closeTravelPlanning: () => void
  dismissMapContext: () => boolean
}

export const useMapUiStore = create<MapUiState>((set, get) => ({
  activeDrawer: null,
  selection: EMPTY_MAP_SELECTION,
  overlays: DEFAULT_MAP_OVERLAYS,
  interactionState: 'browse',
  focusRequest: null,
  focusRequestSequence: 0,
  selectedAssetId: null,
  assetSourceCharacterId: null,
  returnDrawer: null,
  lastViewport: null,
  topDownLocked: false,
  northResetRequestId: 0,
  routePreview: null,
  travelTargetLocationId: null,
  travelPickOriginLocationId: null,
  openMap: (target) => set((state) => {
    const focusRequestSequence = target ? state.focusRequestSequence + 1 : state.focusRequestSequence
    return {
      activeDrawer: 'map',
      focusRequest: target ? { id: focusRequestSequence, target } : null,
      focusRequestSequence,
      selectedAssetId: null,
      assetSourceCharacterId: null,
      returnDrawer: null,
    }
  }),
  openCharacterDrawer: () => set({ activeDrawer: 'character' }),
  openAsset: (selectedAssetId, assetSourceCharacterId = null) => set((state) => ({
    activeDrawer: 'asset', selectedAssetId, assetSourceCharacterId,
    returnDrawer: state.activeDrawer === 'asset' ? state.returnDrawer : state.activeDrawer,
  })),
  returnFromAsset: () => set((state) => ({ activeDrawer: state.returnDrawer, selectedAssetId: null, assetSourceCharacterId: null, returnDrawer: null })),
  closeDrawer: () => set({ activeDrawer: null, selectedAssetId: null, assetSourceCharacterId: null, returnDrawer: null }),
  toggleMap: () => set((state) => ({ activeDrawer: state.activeDrawer === 'map' ? null : 'map' })),
  toggleCharacter: () => set((state) => ({ activeDrawer: state.activeDrawer === 'character' ? null : 'character' })),
  selectCounty: (countyId) => set({ selection: countyId ? countySelection(countyId) : EMPTY_MAP_SELECTION }),
  selectLocation: (countyId, locationId) => set({ selection: selectMapLocation(countyId, locationId) }),
  clearLocation: () => set((state) => ({ selection: clearSelectedLocation(state.selection) })),
  clearSelection: () => set({ selection: EMPTY_MAP_SELECTION }),
  rememberViewport: (lastViewport) => set({ lastViewport }),
  setOverlay: (key, enabled) => set((state) => ({ overlays: { ...state.overlays, [key]: enabled } })),
  toggleTopDown: () => set((state) => ({ topDownLocked: !state.topDownLocked })),
  requestNorthReset: () => set((state) => ({ northResetRequestId: state.northResetRequestId + 1 })),
  previewRoute: (routePreview) => set({ routePreview }),
  beginTravelPlanning: (travelTargetLocationId) => set({ travelTargetLocationId, interactionState: 'browse' }),
  beginDestinationPick: () => set((state) => ({ interactionState: 'pick-travel-destination', travelPickOriginLocationId: state.travelTargetLocationId })),
  chooseTravelDestination: (travelTargetLocationId) => set({ travelTargetLocationId, interactionState: 'browse', travelPickOriginLocationId: null }),
  cancelDestinationPick: () => set((state) => ({ travelTargetLocationId: state.travelPickOriginLocationId, interactionState: 'browse', travelPickOriginLocationId: null })),
  closeTravelPlanning: () => set({ travelTargetLocationId: null, travelPickOriginLocationId: null, interactionState: 'browse', routePreview: null }),
  dismissMapContext: () => {
    const state = get()
    if (state.interactionState === 'pick-travel-destination') { state.cancelDestinationPick(); return true }
    if (state.travelTargetLocationId) { state.closeTravelPlanning(); return true }
    if (state.selection.locationId) { state.clearLocation(); return true }
    if (state.selection.countyId) { state.clearSelection(); return true }
    return false
  },
}))
