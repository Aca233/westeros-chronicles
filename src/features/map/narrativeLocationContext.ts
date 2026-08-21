import { stripEmoji } from '../../services/textSanitizer.ts'
import type {
  MapLocationSearchEntry,
  SemanticMembership,
  SemanticRank,
  SemanticTitle,
  WorldLocationRef,
} from './types.ts'

export interface NarrativeLocationContext {
  placeName: string
  sceneName?: string
  countyName?: string
  duchyName?: string
  kingdomName?: string
  empireName?: string
  hegemonName?: string
}

export interface ResolveNarrativeLocationContextInput {
  location: WorldLocationRef
  locations: readonly MapLocationSearchEntry[]
  memberships: readonly SemanticMembership[]
  titles: readonly SemanticTitle[]
}

const INTERNAL_LOCATION_KEY = /\bb_[a-z0-9_]+\b/i
const INTERNAL_LOCATION_LANGUAGE = /baronyId|男爵领/i

function visibleName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = stripEmoji(value).trim()
  if (!name || INTERNAL_LOCATION_KEY.test(name) || INTERNAL_LOCATION_LANGUAGE.test(name)) return undefined
  return name
}

function titleName(
  titles: ReadonlyMap<string, SemanticTitle>,
  rank: SemanticRank,
  titleId: string | undefined,
): string | undefined {
  if (!titleId) return undefined
  return visibleName(titles.get(`${rank}:${titleId}`)?.name)
}

export function resolveNarrativeLocationContext(
  input: ResolveNarrativeLocationContextInput,
): NarrativeLocationContext {
  const locations = new Map(input.locations.map((location) => [location.id, location]))
  const placeName = visibleName(locations.get(input.location.locationId)?.name)
  if (!placeName) return { placeName: '' }

  const memberships = new Map(input.memberships.map((entry) => [entry.locationId, entry]))
  const membership = memberships.get(input.location.locationId)
  const titles = new Map(input.titles.map((title) => [`${title.rank}:${title.titleId}`, title]))

  return {
    placeName,
    sceneName: visibleName(input.location.sceneLocation),
    countyName: titleName(titles, 'county', membership?.countyId),
    duchyName: titleName(titles, 'duchy', membership?.duchyId),
    kingdomName: titleName(titles, 'kingdom', membership?.kingdomId),
    empireName: titleName(titles, 'empire', membership?.empireId),
    hegemonName: titleName(titles, 'hegemon', membership?.hegemonId),
  }
}

export function formatNarrativeLocationContext(context: NarrativeLocationContext): string {
  return stripEmoji([
    context.placeName,
    context.sceneName,
    context.countyName,
    context.duchyName,
    context.kingdomName,
    context.empireName,
    context.hegemonName,
  ].map(visibleName).filter((name): name is string => Boolean(name)).join(' · '))
}
