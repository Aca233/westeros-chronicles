export interface MapSelection {
  countyId: string | null
  locationId: string | null
}

export interface MapOverlayPreferences {
  characters: boolean
  assets: boolean
  roads: boolean
  political: boolean
}

export type MapInteractionState = 'browse' | 'pick-travel-destination'

export type MapFocusTarget =
  | { kind: 'county'; countyId: string }
  | { kind: 'location'; locationId: string }

export const EMPTY_MAP_SELECTION: MapSelection = { countyId: null, locationId: null }
export const DEFAULT_MAP_OVERLAYS: MapOverlayPreferences = {
  characters: true,
  assets: true,
  roads: true,
  political: true,
}

export function selectCounty(countyId: string): MapSelection {
  return { countyId, locationId: null }
}

export function selectMapLocation(countyId: string, locationId: string): MapSelection {
  return { countyId, locationId }
}

export function clearSelectedLocation(selection: MapSelection): MapSelection {
  return { countyId: selection.countyId, locationId: null }
}

export function selectionContainsLocation(selection: MapSelection, countyId: string): boolean {
  return selection.countyId === countyId && selection.locationId !== null
}

export interface MapSearchTarget {
  key: string
  target: MapFocusTarget
  name: string
  secondaryLabel: string
  locationType?: import('./types.ts').MapLocationType
}
