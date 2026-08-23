import type { MapOverlayPreferences } from './mapInteraction.ts'
import { DUCHY_MAX_ZOOM, LOCAL_MIN_ZOOM } from './semanticZoom.ts'

export const STRATEGIC_MAX_ZOOM = DUCHY_MAX_ZOOM
export { LOCAL_MIN_ZOOM }

export type MapPresentationBand = 'strategic' | 'county' | 'local'

export interface MapPresentation {
  band: MapPresentationBand
  politicalSurface: boolean
  countyLabels: boolean
  internalLocations: boolean
  roads: boolean
  characters: boolean
  assets: boolean
}

export function mapPresentationFor(input: {
  zoom: number
  overlays: MapOverlayPreferences
  selectedCountyId: string | null
}): MapPresentation {
  const band = input.zoom < STRATEGIC_MAX_ZOOM
    ? 'strategic'
    : input.zoom < LOCAL_MIN_ZOOM ? 'county' : 'local'
  const hasCounty = input.selectedCountyId !== null
  return {
    band,
    politicalSurface: band !== 'local' && input.overlays.political,
    countyLabels: band !== 'strategic',
    internalLocations: band === 'local' && hasCounty,
    roads: input.overlays.roads,
    characters: band !== 'strategic' && input.overlays.characters,
    assets: band !== 'strategic' && input.overlays.assets,
  }
}
