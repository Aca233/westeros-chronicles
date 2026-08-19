import type {
  MapPixelPoint,
  MapRouteEdge,
  MapRouteShard,
  RoutePreference,
  TravelMode,
} from '../types'

export interface RouteRequest {
  from: string
  to: string
  preference: RoutePreference
  travelMode: TravelMode
  via?: string[]
  season?: string
}

export interface RouteLeg {
  index: number
  edgeId: string
  from: string
  to: string
  distance: number
  days: number
  cost: number
  risk: number
  roadLevel: MapRouteEdge['roadLevel']
  crossing: MapRouteEdge['crossing']
  seasonTags: string[]
  fromPoint: MapPixelPoint
  toPoint: MapPixelPoint
}

export interface RoutePlan {
  ok: true
  id: string
  from: string
  to: string
  preference: RoutePreference
  travelMode: TravelMode
  via: string[]
  season?: string
  legs: RouteLeg[]
  totalDistance: number
  totalDays: number
  totalCost: number
  totalRisk: number
  graphHash: string
}

export type RouteFailureCode = 'invalid_request' | 'unknown_location' | 'no_route' | 'data_error' | 'cancelled'

export interface RouteFailure {
  ok: false
  code: RouteFailureCode
  reason: string
  from: string
  to: string
  failedAt?: string
}

export type RouteResult = RoutePlan | RouteFailure
export type RouteGraph = MapRouteShard

export interface RouteWorkerPlanMessage {
  type: 'plan'
  requestId: string
  request: RouteRequest
}

export interface RouteWorkerCancelMessage {
  type: 'cancel'
  requestId: string
}

export type RouteWorkerRequest = RouteWorkerPlanMessage | RouteWorkerCancelMessage

export interface RouteWorkerSuccessResponse {
  type: 'result'
  requestId: string
  result: RoutePlan
}

export interface RouteWorkerFailureResponse {
  type: 'failure'
  requestId: string
  failure: RouteFailure
}

export type RouteWorkerResponse = RouteWorkerSuccessResponse | RouteWorkerFailureResponse
