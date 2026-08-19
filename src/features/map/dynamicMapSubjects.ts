import type { CharacterId } from '../characters/types'
import type { ItemSystemState } from '../items/types'
import type { MapBounds, MapLocationSearchEntry, MapPixelPoint } from './types'

export interface MapCharacterPoint extends MapPixelPoint {
  id: string
  characterId: CharacterId
  name: string
  locationId: string
  locationName: string
  regionId: string
  knowledge: 'confirmed'
}

export interface MapAssetPoint extends MapPixelPoint {
  id: string
  assetId: string
  name: string
  assetType: 'site' | 'vehicle'
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
}

type LocationPoint = Pick<MapLocationSearchEntry, 'id' | 'name' | 'mapX' | 'mapY' | 'regionId'>

function recordCommand(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function knownCharacterIds(
  characters: readonly KnownCharacterState[] | undefined,
  history: CharacterHistoryLike,
): CharacterId[] {
  const ids = new Set<CharacterId>((characters ?? []).map((character) => character.id))
  for (const turn of history.turns) {
    for (const command of turn.acceptedCommands) {
      const record = recordCommand(command)
      const id = record?.characterId
      if (typeof id === 'string' && (id.startsWith('agot:') || id.startsWith('save:'))) ids.add(id as CharacterId)
    }
  }
  return [...ids].sort()
}

export function projectKnownCharacterMapPoints(
  input: KnownCharacterMapInput,
  locations: readonly LocationPoint[],
): MapCharacterPoint[] {
  const locationById = new Map(locations.map((location) => [location.id, location]))
  const states = new Map<CharacterId, { alive: boolean; locationId?: string }>()

  for (const turn of [...input.history.turns].sort((left, right) => left.turn - right.turn)) {
    for (const command of turn.acceptedCommands) {
      const record = recordCommand(command)
      if (!record || typeof record.characterId !== 'string') continue
      if (!record.characterId.startsWith('agot:') && !record.characterId.startsWith('save:')) continue
      const characterId = record.characterId as CharacterId
      if (record.type === 'MOVE_CHARACTER' && typeof record.locationId === 'string') {
        states.set(characterId, { alive: states.get(characterId)?.alive ?? true, locationId: record.locationId })
      } else if (record.type === 'KILL_CHARACTER' || record.type === 'CHARACTER_DIE' || record.type === 'DIE') {
        states.set(characterId, { ...states.get(characterId), alive: false })
      }
    }
  }

  for (const character of input.characters ?? []) {
    states.set(character.id, {
      alive: character.alive !== false,
      ...(character.locationId ? { locationId: character.locationId } : {}),
    })
  }
  states.set(input.player.id, { alive: true, locationId: input.player.locationId })

  return [...states.entries()].flatMap(([characterId, state]) => {
    if (!state.alive || !state.locationId) return []
    const location = locationById.get(state.locationId)
    if (!location) return []
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
      knowledge: 'confirmed' as const,
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
      assetId: site.id,
      name: site.name,
      assetType: 'site',
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
      assetId: vehicle.id,
      name: vehicle.name,
      assetType: 'vehicle',
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
