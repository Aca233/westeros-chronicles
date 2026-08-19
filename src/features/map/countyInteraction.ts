import type {
  MapLocationSearchEntry,
  SemanticMembership,
  SemanticMembershipIndex,
  SemanticTitle,
} from './types.ts'

export interface CountyInteractionIndex {
  primaryLocationByCountyId: ReadonlyMap<string, string>
  countyIdByBaronyId: ReadonlyMap<string, string>
  primaryLocationForBarony: (baronyId: string) => string | undefined
}

type CountySemanticContext = Pick<SemanticMembershipIndex, 'titles' | 'memberships'>

const LOCATION_TYPE_PRIORITY: Record<MapLocationSearchEntry['type'], number> = {
  castle: 7,
  city: 6,
  town: 5,
  port: 4,
  landmark: 3,
  village: 2,
  ruin: 1,
  region: 0,
}

function normalizedName(value: string): string {
  return value
    .replace(/伯爵领$/u, '')
    .replace(/[\s·'’\-]/gu, '')
    .toLocaleLowerCase('zh-CN')
}

function countyTitles(titles: readonly SemanticTitle[]): ReadonlyMap<string, SemanticTitle> {
  return new Map(titles
    .filter((title) => title.rank === 'county')
    .map((title) => [title.titleId, title]))
}

function candidateOrder(
  title: SemanticTitle | undefined,
  left: MapLocationSearchEntry,
  right: MapLocationSearchEntry,
): number {
  const titleName = title ? normalizedName(title.name) : ''
  const leftMatchesTitle = titleName !== '' && normalizedName(left.name) === titleName
  const rightMatchesTitle = titleName !== '' && normalizedName(right.name) === titleName
  return Number(rightMatchesTitle) - Number(leftMatchesTitle)
    || right.importance - left.importance
    || LOCATION_TYPE_PRIORITY[right.type] - LOCATION_TYPE_PRIORITY[left.type]
    || left.id.localeCompare(right.id)
}

export function buildCountyInteractionIndex(
  entries: readonly MapLocationSearchEntry[],
  semantic: CountySemanticContext,
): CountyInteractionIndex {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const titleByCountyId = countyTitles(semantic.titles)
  const countyIdByBaronyId = new Map<string, string>()
  const candidatesByCountyId = new Map<string, MapLocationSearchEntry[]>()

  for (const membership of semantic.memberships) {
    if (!membership.countyId) continue
    countyIdByBaronyId.set(membership.baronyId, membership.countyId)
    const entry = entryById.get(membership.locationId)
    if (!entry) continue
    const candidates = candidatesByCountyId.get(membership.countyId) ?? []
    candidates.push(entry)
    candidatesByCountyId.set(membership.countyId, candidates)
  }

  const primaryLocationByCountyId = new Map<string, string>()
  for (const [countyId, candidates] of [...candidatesByCountyId].sort(([left], [right]) => left.localeCompare(right))) {
    const primary = [...candidates].sort((left, right) => candidateOrder(titleByCountyId.get(countyId), left, right))[0]
    if (primary) primaryLocationByCountyId.set(countyId, primary.id)
  }

  return {
    primaryLocationByCountyId,
    countyIdByBaronyId,
    primaryLocationForBarony(baronyId: string): string | undefined {
      const countyId = countyIdByBaronyId.get(baronyId)
      return countyId ? primaryLocationByCountyId.get(countyId) : undefined
    },
  }
}
