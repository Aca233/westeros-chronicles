import type { SelectedCountyLocations } from './countyInteraction.ts'
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type { SemanticTitle } from './types.ts'

export interface CountyViewModel {
  id: string
  name: string
  hegemonName?: string
  empireName?: string
  kingdomName?: string
  duchyName?: string
  primaryLocationId: string
  locations: SelectedCountyLocations['locations']
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
}

export function buildCountyViewModel(input: {
  countyId: string
  titles: readonly SemanticTitle[]
  selectedCounty: SelectedCountyLocations
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
}): CountyViewModel {
  const titleById = new Map(input.titles.map((title) => [title.titleId, title]))
  const county = titleById.get(input.countyId)
  const locationIds = new Set(input.selectedCounty.locations.map((entry) => entry.id))
  const primary = input.selectedCounty.locations.find((entry) => entry.isPrimary)
  const semanticLocation = input.selectedCounty.locations[0]
  const countyName = county?.name ?? primary?.name ?? semanticLocation?.name ?? input.countyId
  const normalizedCountyName = /伯爵领$/u.test(countyName) ? countyName : `${countyName}伯爵领`
  const duchy = input.selectedCounty.duchyId ? titleById.get(input.selectedCounty.duchyId) : undefined
  const kingdom = input.selectedCounty.kingdomId ? titleById.get(input.selectedCounty.kingdomId) : undefined
  const empire = input.selectedCounty.empireId ? titleById.get(input.selectedCounty.empireId) : undefined
  const hegemon = input.selectedCounty.hegemonId ? titleById.get(input.selectedCounty.hegemonId) : undefined
  return {
    id: input.countyId,
    name: normalizedCountyName,
    ...(hegemon ? { hegemonName: hegemon.name } : {}),
    ...(empire ? { empireName: empire.name } : {}),
    ...(kingdom ? { kingdomName: kingdom.name } : {}),
    ...(duchy ? { duchyName: duchy.name } : {}),
    primaryLocationId: input.selectedCounty.primaryLocationId,
    locations: input.selectedCounty.locations,
    characters: input.characters.filter((entry) => locationIds.has(entry.locationId)),
    assets: input.assets.filter((entry) => locationIds.has(entry.locationId)),
    ...(input.politicalState ? { politicalState: input.politicalState } : {}),
  }
}
