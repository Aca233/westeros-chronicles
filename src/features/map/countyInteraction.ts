import type { MapLocationSearchEntry, SemanticMembershipIndex, SemanticTitle } from './types.ts'

export interface CountyInteractionIndex {
  primaryLocationByCountyId: ReadonlyMap<string, string>
  countyIdByBaronyId: ReadonlyMap<string, string>
  countyIdForBarony: (baronyId: string) => string | undefined
  primaryLocationForCounty: (countyId: string) => string | undefined
  locationsForCounty: (countyId: string) => SelectedCountyLocations | undefined
  selectedCountyForLocation: (locationId: string) => SelectedCountyLocations | undefined
}

export interface ExpandedCountyLocation extends MapLocationSearchEntry { isPrimary: boolean }

export interface SelectedCountyLocations {
  countyId: string
  duchyId?: string
  kingdomId?: string
  empireId?: string
  hegemonId?: string
  regionId?: string
  primaryLocationId: string
  locations: readonly ExpandedCountyLocation[]
}

type CountySemanticContext = Pick<SemanticMembershipIndex, 'titles' | 'memberships'>

const LOCATION_TYPE_PRIORITY: Record<MapLocationSearchEntry['type'], number> = {
  castle: 7, city: 6, town: 5, port: 4, landmark: 3, village: 2, ruin: 1, region: 0,
}

function normalizedName(value: string): string {
  return value.replace(/伯爵领$/u, '').replace(/[\s·'’\-]/gu, '').toLocaleLowerCase('zh-CN')
}

function countyTitles(titles: readonly SemanticTitle[]): ReadonlyMap<string, SemanticTitle> {
  return new Map(titles.filter((title) => title.rank === 'county').map((title) => [title.titleId, title]))
}

function candidateOrder(title: SemanticTitle | undefined, left: MapLocationSearchEntry, right: MapLocationSearchEntry): number {
  const titleName = title ? normalizedName(title.name) : ''
  const leftMatchesTitle = titleName !== '' && normalizedName(left.name) === titleName
  const rightMatchesTitle = titleName !== '' && normalizedName(right.name) === titleName
  return Number(rightMatchesTitle) - Number(leftMatchesTitle)
    || right.importance - left.importance
    || LOCATION_TYPE_PRIORITY[right.type] - LOCATION_TYPE_PRIORITY[left.type]
    || left.name.localeCompare(right.name, 'zh-CN')
    || left.id.localeCompare(right.id)
}

export function buildCountyInteractionIndex(
  entries: readonly MapLocationSearchEntry[],
  semantic: CountySemanticContext,
): CountyInteractionIndex {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const titleByCountyId = countyTitles(semantic.titles)
  const countyIdByBaronyId = new Map<string, string>()
  const countyIdByLocationId = new Map<string, string>()
  const ancestryByCountyId = new Map<string, Omit<SelectedCountyLocations, 'countyId' | 'primaryLocationId' | 'locations'>>()
  const candidatesByCountyId = new Map<string, MapLocationSearchEntry[]>()

  for (const membership of semantic.memberships) {
    if (!membership.countyId) continue
    countyIdByBaronyId.set(membership.baronyId, membership.countyId)
    countyIdByLocationId.set(membership.locationId, membership.countyId)
    if (!ancestryByCountyId.has(membership.countyId)) {
      ancestryByCountyId.set(membership.countyId, {
        ...(membership.duchyId ? { duchyId: membership.duchyId } : {}),
        ...(membership.kingdomId ? { kingdomId: membership.kingdomId } : {}),
        ...(membership.empireId ? { empireId: membership.empireId } : {}),
        ...(membership.hegemonId ? { hegemonId: membership.hegemonId } : {}),
        ...(membership.regionId ? { regionId: membership.regionId } : {}),
      })
    }
    const entry = entryById.get(membership.locationId)
    if (!entry) continue
    const candidates = candidatesByCountyId.get(membership.countyId) ?? []
    candidates.push(entry)
    candidatesByCountyId.set(membership.countyId, candidates)
  }

  const primaryLocationByCountyId = new Map<string, string>()
  const locationsByCountyId = new Map<string, readonly ExpandedCountyLocation[]>()
  for (const [countyId, candidates] of [...candidatesByCountyId].sort(([left], [right]) => left.localeCompare(right))) {
    const ordered = [...candidates].sort((left, right) => candidateOrder(titleByCountyId.get(countyId), left, right))
    const primary = ordered[0]
    if (!primary) continue
    primaryLocationByCountyId.set(countyId, primary.id)
    locationsByCountyId.set(countyId, ordered.map((entry) => ({ ...entry, isPrimary: entry.id === primary.id })))
  }

  const locationsForCounty = (countyId: string): SelectedCountyLocations | undefined => {
    const primaryLocationId = primaryLocationByCountyId.get(countyId)
    const locations = locationsByCountyId.get(countyId)
    if (!primaryLocationId || !locations) return undefined
    return { countyId, ...ancestryByCountyId.get(countyId), primaryLocationId, locations }
  }

  return {
    primaryLocationByCountyId,
    countyIdByBaronyId,
    countyIdForBarony: (baronyId) => countyIdByBaronyId.get(baronyId),
    primaryLocationForCounty: (countyId) => primaryLocationByCountyId.get(countyId),
    locationsForCounty,
    selectedCountyForLocation(locationId) {
      const countyId = countyIdByLocationId.get(locationId)
      return countyId ? locationsForCounty(countyId) : undefined
    },
  }
}
