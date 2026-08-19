import { mapPixelToLngLat } from './coordinates.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type {
  MapBounds,
  MapManifest,
  SemanticMembership,
  SemanticRank,
  SemanticTitle,
} from './types'

export interface SemanticPoliticalHouse {
  houseId: string
  houseLabel: string
  holderId?: string
}

interface PoliticalHouseLabelProperties {
  featureId: number
  titleId: string
  politicalHouseId: string
  politicalHouseLabel: string
  politicalHolderId: string | null
}

export interface PoliticalHouseLabelInput {
  rank: SemanticRank
  titles: readonly SemanticTitle[]
  states: readonly PoliticalFeatureState[]
  memberships: readonly SemanticMembership[]
  pixelBounds: MapBounds
  manifest: Pick<MapManifest, 'westerosBounds'>
}

function verifiedState(state: PoliticalFeatureState): state is PoliticalFeatureState & {
  houseId: string
  houseLabel: string
} {
  return Boolean(state.houseId && state.houseLabel)
}

function stableStateOrder(left: PoliticalFeatureState, right: PoliticalFeatureState): number {
  return (left.holderId ?? '').localeCompare(right.holderId ?? '')
    || left.titleId.localeCompare(right.titleId)
}

function membershipContainsTitle(
  membership: SemanticMembership,
  title: SemanticTitle,
): boolean {
  if (title.rank === 'county') return membership.countyId === title.titleId
  if (title.rank === 'duchy') return membership.duchyId === title.titleId
  return membership.realmId === title.titleId
}

function resolvedState(state: PoliticalFeatureState & { houseId: string; houseLabel: string }): SemanticPoliticalHouse {
  return {
    houseId: state.houseId,
    houseLabel: state.houseLabel,
    ...(state.holderId ? { holderId: state.holderId } : {}),
  }
}

export function resolveSemanticPoliticalHouse(
  title: SemanticTitle,
  states: readonly PoliticalFeatureState[],
  memberships: readonly SemanticMembership[],
): SemanticPoliticalHouse | undefined {
  const directTitleId = title.politicalAnchorTitleId ?? title.titleId
  const direct = states
    .filter((state): state is PoliticalFeatureState & { houseId: string; houseLabel: string } =>
      state.effectiveTitleId === directTitleId && verifiedState(state))
    .sort(stableStateOrder)[0]
  if (direct) return resolvedState(direct)

  const descendantBaronies = new Set(
    memberships
      .filter((membership) => membershipContainsTitle(membership, title))
      .map((membership) => membership.baronyId),
  )
  const descendants = states
    .filter((state): state is PoliticalFeatureState & { houseId: string; houseLabel: string } =>
      descendantBaronies.has(state.titleId) && verifiedState(state))
  if (!descendants.length) return undefined

  const houseCounts = new Map<string, number>()
  for (const state of descendants) {
    houseCounts.set(state.houseId, (houseCounts.get(state.houseId) ?? 0) + 1)
  }
  const winningHouseId = [...houseCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
  if (!winningHouseId) return undefined
  const representative = descendants
    .filter((state) => state.houseId === winningHouseId)
    .sort(stableStateOrder)[0]
  return representative ? resolvedState(representative) : undefined
}

function titleInViewport(title: SemanticTitle, bounds: MapBounds): boolean {
  return title.mapX >= bounds.minX && title.mapX <= bounds.maxX
    && title.mapY >= bounds.minY && title.mapY <= bounds.maxY
}

export function buildPoliticalHouseLabelCollection(
  input: PoliticalHouseLabelInput,
): GeoJSON.FeatureCollection<GeoJSON.Point, PoliticalHouseLabelProperties> {
  const features = input.titles
    .filter((title) => title.rank === input.rank && titleInViewport(title, input.pixelBounds))
    .sort((left, right) => left.featureId - right.featureId)
    .flatMap((title): Array<GeoJSON.Feature<GeoJSON.Point, PoliticalHouseLabelProperties>> => {
      const politicalHouse = resolveSemanticPoliticalHouse(title, input.states, input.memberships)
      if (!politicalHouse) return []
      return [{
        type: 'Feature',
        id: title.featureId,
        geometry: { type: 'Point', coordinates: mapPixelToLngLat(title, input.manifest) },
        properties: {
          featureId: title.featureId,
          titleId: title.titleId,
          politicalHouseId: politicalHouse.houseId,
          politicalHouseLabel: politicalHouse.houseLabel,
          politicalHolderId: politicalHouse.holderId ?? null,
        },
      }]
    })
  return { type: 'FeatureCollection', features }
}

export function semanticTitlesAffectedByChanges(
  changedIds: readonly string[],
  memberships: readonly SemanticMembership[],
): ReadonlySet<string> {
  const affected = new Set<string>()
  const changed = new Set(changedIds)
  for (const membership of memberships) {
    const hierarchy = [membership.countyId, membership.duchyId, membership.realmId]
      .filter((titleId): titleId is string => Boolean(titleId))
    if (
      changed.has(membership.locationId)
      || changed.has(membership.baronyId)
      || hierarchy.some((titleId) => changed.has(titleId))
    ) {
      hierarchy.forEach((titleId) => affected.add(titleId))
    }
  }
  return affected
}
