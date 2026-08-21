import type { CharacterId } from '../../../domain/characterId'
import type { ItemPlacement, ItemTransport } from '../../items/types'
import type { WorldDate } from '../../../domain/worldDate'
import type { WorldLocationRef } from '../../../domain/worldLocation'
import type { RoutePlan } from '../routing/types'

export type JourneyStatus = 'planned' | 'travelling' | 'paused' | 'interrupted' | 'arrived'

export interface ActiveJourney {
  routePlan: RoutePlan
  currentLeg: number
  progressDays: number
  status: JourneyStatus
  companions: CharacterId[]
  vehicleIds: string[]
  startedAt: WorldDate
  interruptedBy?: string
  locationLabels?: Record<string, string>
}

export type TravelStateCommand =
  | { type: 'PLAN_TRAVEL'; routePlan: RoutePlan; companions?: CharacterId[]; vehicleIds?: string[]; locationLabels?: Record<string, string> }
  | { type: 'START_TRAVEL'; routePlan?: RoutePlan; companions?: CharacterId[]; vehicleIds?: string[]; locationLabels?: Record<string, string> }
  | { type: 'PAUSE_TRAVEL'; reason?: string }
  | { type: 'RESUME_TRAVEL' }
  | { type: 'REROUTE_TRAVEL'; routePlan: RoutePlan; locationLabels?: Record<string, string> }
  | { type: 'RETURN_TRAVEL'; routePlan: RoutePlan; locationLabels?: Record<string, string> }
  | { type: 'ADVANCE_TRAVEL'; days: number }
  | { type: 'CANCEL_PLANNED_TRAVEL' }

export interface JourneyCharacterPosition {
  id: CharacterId
  alive: boolean
  locationId?: string | null
}

export interface JourneyWorldState {
  journey?: ActiveJourney
  playerLocation: WorldLocationRef
  vehicles: Record<string, ItemTransport>
  itemPlacements?: Readonly<Record<string, ItemPlacement>>
  knownLocationIds: ReadonlySet<string>
  characters?: readonly JourneyCharacterPosition[]
  interruption?: string
}

export interface JourneyCharacterMove {
  characterId: CharacterId
  locationId: string
  sceneLocation?: string
}

export interface AtomicWorldPatch {
  journey?: ActiveJourney
  playerLocation: WorldLocationRef
  vehicleLocations: Record<string, WorldLocationRef>
  characterMoves: JourneyCharacterMove[]
  reachedLocationIds: string[]
  elapsedDays: number
  changed: boolean
}
