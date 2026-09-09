import type { CharacterId } from '../characters/types'
import { SITE_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '../items/types.ts'
import type { ItemSystemState } from '../items/types'
import { worldAssetId } from '../world/worldAssetId.ts'
import type { MapBounds, MapLocationSearchEntry, MapPixelPoint } from './types'

export interface MapCharacterPoint extends MapPixelPoint {
  id: string
  characterId: CharacterId
  name: string
  locationId: string
  locationName: string
  regionId: string
  knowledge: 'confirmed' | 'stale'
  lastKnownTurn?: number
}

export interface MapAssetPoint extends MapPixelPoint {
  id: string
  assetId: string
  name: string
  assetType: 'site' | 'vehicle'
  containerTypeLabel?: string
  capacity?: number
  locationId: string
  locationName: string
  regionId: string
  itemCount: number
  knowledge: 'confirmed'
}

interface KnownCharacterState {
  id: CharacterId
  alive?: boolean
  locationId?: string | null
}

interface CharacterHistoryLike {
  turns: ReadonlyArray<{
    turn: number
    acceptedCommands: readonly unknown[]
  }>
}

export interface KnownCharacterMapInput {
  player: { id: CharacterId; name: string; locationId: string }
  characters?: readonly KnownCharacterState[]
  history: CharacterHistoryLike
  names?: ReadonlyMap<string, string>
  presentCharacterIds?: readonly CharacterId[]
  metrics?: MapSelectionMetrics
}

export interface MapSelectionMetrics {
  staticCharacterShardReads: number
  scannedDynamicCharacters: number
}

type LocationPoint = Pick<MapLocationSearchEntry, 'id' | 'name' | 'mapX' | 'mapY' | 'regionId'>

export function knownCharacterIds(
  characters: readonly KnownCharacterState[] | undefined,
  _history: CharacterHistoryLike,
): CharacterId[] {
  const ids = new Set<CharacterId>((characters ?? []).map((character) => character.id))
  return [...ids].sort()
}

export function projectKnownCharacterMapPoints(
  input: KnownCharacterMapInput,
  locations: readonly LocationPoint[],
): MapCharacterPoint[] {
  const locationById = new Map(locations.map((location) => [location.id, location]))
  const states = new Map<CharacterId, { alive: boolean; locationId?: string }>()
  if (input.metrics) {
    input.metrics.staticCharacterShardReads = 0
    input.metrics.scannedDynamicCharacters = input.characters?.length ?? 0
  }

  for (const character of input.characters ?? []) {
    states.set(character.id, {
      alive: character.alive !== false,
      ...(character.locationId ? { locationId: character.locationId } : {}),
    })
  }
  states.set(input.player.id, { alive: true, locationId: input.player.locationId })

  const lastKnownMoveTurn = (characterId: CharacterId, locationId: string): number | undefined => {
    for (let index = input.history.turns.length - 1; index >= 0; index -= 1) {
      const turn = input.history.turns[index]
      const found = turn.acceptedCommands.some((candidate) => {
        if (!candidate || typeof candidate !== 'object') return false
        const command = candidate as { type?: unknown; characterId?: unknown; locationId?: unknown }
        return command.type === 'MOVE_CHARACTER' && command.characterId === characterId && command.locationId === locationId
      })
      if (found) return turn.turn
    }
    return undefined
  }

  return [...states.entries()].flatMap(([characterId, state]) => {
    if (!state.alive || !state.locationId) return []
    const location = locationById.get(state.locationId)
    if (!location) return []
    const knowledge = characterId === input.player.id || input.presentCharacterIds?.includes(characterId)
      ? 'confirmed' as const
      : 'stale' as const
    const lastKnownTurn = knowledge === 'stale' ? lastKnownMoveTurn(characterId, location.id) : undefined
    // 离场人物不能因为后台当前状态恰好带有 locationId 就变成实时雷达。
    // 只有玩家历史中确有一次可追溯的已知移动，才保留“最后已知位置”；
    // 否则宁可不在地图显示，也不把后台真相伪装成旧情报。
    if (knowledge === 'stale' && lastKnownTurn === undefined) return []
    return [{
      id: `character:${characterId}`,
      characterId,
      name: characterId === input.player.id
        ? input.player.name
        : input.names?.get(characterId) ?? characterId,
      locationId: location.id,
      locationName: location.name,
      regionId: location.regionId,
      mapX: location.mapX,
      mapY: location.mapY,
      knowledge,
      ...(lastKnownTurn !== undefined ? { lastKnownTurn } : {}),
    }]
  }).sort((left, right) => left.characterId.localeCompare(right.characterId))
}

export function projectKnownAssetMapPoints(
  items: Pick<ItemSystemState, 'placements' | 'sites' | 'vehicles'> & Partial<Pick<ItemSystemState, 'instances'>>,
  locations: readonly LocationPoint[],
): MapAssetPoint[] {
  const locationById = new Map(locations.map((location) => [location.id, location]))
  const siteCounts = new Map<string, number>()
  const vehicleCounts = new Map<string, number>()
  for (const placement of Object.values(items.placements)) {
    if (placement.type === 'site') siteCounts.set(placement.siteId, (siteCounts.get(placement.siteId) ?? 0) + 1)
    if (placement.type === 'vehicle') vehicleCounts.set(placement.vehicleId, (vehicleCounts.get(placement.vehicleId) ?? 0) + 1)
  }

  const points: MapAssetPoint[] = []
  for (const site of Object.values(items.sites)) {
    const location = locationById.get(site.location.locationId)
    if (!location) continue
    points.push({
      id: `asset:site:${site.id}`,
      assetId: worldAssetId.site(site.id),
      name: site.name,
      assetType: 'site',
      containerTypeLabel: SITE_TYPE_LABELS[site.type],
      ...(site.capacity !== undefined ? { capacity: site.capacity } : {}),
      locationId: location.id,
      locationName: location.name,
      regionId: location.regionId,
      mapX: location.mapX,
      mapY: location.mapY,
      itemCount: siteCounts.get(site.id) ?? 0,
      knowledge: 'confirmed',
    })
  }
  for (const vehicle of Object.values(items.vehicles)) {
    const location = locationById.get(vehicle.location.locationId)
    if (!location) continue
    points.push({
      id: `asset:vehicle:${vehicle.id}`,
      assetId: worldAssetId.vehicle(vehicle.id),
      name: vehicle.name,
      assetType: 'vehicle',
      containerTypeLabel: VEHICLE_TYPE_LABELS[vehicle.type],
      capacity: vehicle.capacity,
      locationId: location.id,
      locationName: location.name,
      regionId: location.regionId,
      mapX: location.mapX,
      mapY: location.mapY,
      itemCount: vehicleCounts.get(vehicle.id) ?? 0,
      knowledge: 'confirmed',
    })
  }
  return points.sort((left, right) => left.assetId.localeCompare(right.assetId))
}

export function filterMapPointsByPixelBounds<TPoint extends MapPixelPoint>(
  points: readonly TPoint[],
  bounds: MapBounds,
): TPoint[] {
  return points.filter((point) => point.mapX >= bounds.minX
    && point.mapX <= bounds.maxX
    && point.mapY >= bounds.minY
    && point.mapY <= bounds.maxY)
}

export interface ScopedMapSubjects {
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  characterPoints: readonly MapCharacterPoint[]
  assetPoints: readonly MapAssetPoint[]
}

export function scopeMapSubjects(input: {
  countyId: string | null
  countyIdByLocationId: ReadonlyMap<string, string>
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  characterBudget?: number
  assetBudget?: number
}): ScopedMapSubjects {
  if (!input.countyId) return { characters: [], assets: [], characterPoints: [], assetPoints: [] }
  const inCounty = (locationId: string) => input.countyIdByLocationId.get(locationId) === input.countyId
  const characters = input.characters
    .filter((point) => inCounty(point.locationId))
    .sort((left, right) => left.characterId.localeCompare(right.characterId))
  const assets = input.assets
    .filter((point) => inCounty(point.locationId))
    .sort((left, right) => Number(left.assetType === 'vehicle') - Number(right.assetType === 'vehicle')
      || right.itemCount - left.itemCount
      || left.assetId.localeCompare(right.assetId))
  return {
    characters,
    assets,
    characterPoints: characters.slice(0, Math.max(0, input.characterBudget ?? 8)),
    assetPoints: assets.slice(0, Math.max(0, input.assetBudget ?? 6)),
  }
}
