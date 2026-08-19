import type { MapRouteEdge, MapRouteNode, RoutePreference, TravelMode } from '../types'
import {
  createRouteCostContext,
  routeEdgeWeight,
  routeHeuristicWeight,
  type RouteCostContext,
} from './costs'
import type {
  RouteFailure,
  RouteGraph,
  RouteLeg,
  RoutePlan,
  RouteRequest,
  RouteResult,
} from './types'

export type { RouteFailure, RouteGraph, RouteLeg, RoutePlan, RouteRequest, RouteResult } from './types'

interface QueueEntry {
  nodeId: string
  score: number
  cost: number
  pathKey: string
}

class MinQueue {
  private readonly values: QueueEntry[] = []

  get size(): number {
    return this.values.length
  }

  push(value: QueueEntry): void {
    this.values.push(value)
    let index = this.values.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compareQueue(this.values[parent], value) <= 0) break
      this.values[index] = this.values[parent]
      index = parent
    }
    this.values[index] = value
  }

  pop(): QueueEntry | undefined {
    if (!this.values.length) return undefined
    const first = this.values[0]
    const last = this.values.pop()
    if (!this.values.length || !last) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.values.length) break
      let child = left
      if (right < this.values.length && compareQueue(this.values[right], this.values[left]) < 0) child = right
      if (compareQueue(last, this.values[child]) <= 0) break
      this.values[index] = this.values[child]
      index = child
    }
    this.values[index] = last
    return first
  }
}

function compareQueue(left: QueueEntry, right: QueueEntry): number {
  return left.score - right.score
    || left.cost - right.cost
    || left.pathKey.localeCompare(right.pathKey)
    || left.nodeId.localeCompare(right.nodeId)
}

function failure(request: RouteRequest, code: RouteFailure['code'], reason: string, failedAt?: string): RouteFailure {
  return {
    ok: false,
    code,
    reason,
    from: typeof request.from === 'string' ? request.from : '',
    to: typeof request.to === 'string' ? request.to : '',
    ...(failedAt ? { failedAt } : {}),
  }
}

function validRequestEnum(preference: unknown, travelMode: unknown): preference is RoutePreference {
  return (preference === 'fastest' || preference === 'safest' || preference === 'cheapest')
    && (travelMode === 'walk' || travelMode === 'horse' || travelMode === 'carriage' || travelMode === 'ship')
}

function pointDistance(left: MapRouteNode, right: MapRouteNode): number {
  return Math.hypot(left.mapX - right.mapX, left.mapY - right.mapY)
}

function heuristic(node: MapRouteNode, target: MapRouteNode, context: RouteCostContext): number {
  return routeHeuristicWeight(pointDistance(node, target) / context.maxSpeed, context)
}

function reconstructEdges(
  startNodeId: string,
  targetNodeId: string,
  previous: ReadonlyMap<string, MapRouteEdge>,
): MapRouteEdge[] | undefined {
  const reversed: MapRouteEdge[] = []
  let cursor = targetNodeId
  while (cursor !== startNodeId) {
    const edge = previous.get(cursor)
    if (!edge) return undefined
    reversed.push(edge)
    cursor = edge.from
  }
  return reversed.reverse()
}

function findSegment(
  start: MapRouteNode,
  target: MapRouteNode,
  nodesById: ReadonlyMap<string, MapRouteNode>,
  adjacency: ReadonlyMap<string, readonly MapRouteEdge[]>,
  context: RouteCostContext,
): MapRouteEdge[] | undefined {
  if (start.id === target.id) return []
  const queue = new MinQueue()
  const bestCost = new Map<string, number>([[start.id, 0]])
  const bestPathKey = new Map<string, string>([[start.id, start.id]])
  const previous = new Map<string, MapRouteEdge>()
  queue.push({ nodeId: start.id, cost: 0, score: heuristic(start, target, context), pathKey: start.id })

  while (queue.size) {
    const current = queue.pop()
    if (!current) break
    const recordedCost = bestCost.get(current.nodeId)
    const recordedPath = bestPathKey.get(current.nodeId)
    if (recordedCost === undefined || current.cost > recordedCost + 1e-12 || current.pathKey !== recordedPath) continue
    if (current.nodeId === target.id) return reconstructEdges(start.id, target.id, previous)

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      const nextNode = nodesById.get(edge.to)
      if (!nextNode) continue
      const weight = routeEdgeWeight(edge, context)
      if (!Number.isFinite(weight)) continue
      const candidateCost = current.cost + weight
      const candidatePath = `${current.pathKey}>${edge.id}`
      const knownCost = bestCost.get(edge.to)
      const knownPath = bestPathKey.get(edge.to)
      const improves = knownCost === undefined
        || candidateCost < knownCost - 1e-12
        || (Math.abs(candidateCost - knownCost) <= 1e-12 && candidatePath.localeCompare(knownPath ?? '') < 0)
      if (!improves) continue
      bestCost.set(edge.to, candidateCost)
      bestPathKey.set(edge.to, candidatePath)
      previous.set(edge.to, edge)
      queue.push({
        nodeId: edge.to,
        cost: candidateCost,
        score: candidateCost + heuristic(nextNode, target, context),
        pathKey: candidatePath,
      })
    }
  }
  return undefined
}

function round(value: number): number {
  return Number(value.toFixed(4))
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function routeId(graphHash: string, request: RouteRequest, edges: readonly MapRouteEdge[]): string {
  return `route_${stableHash(JSON.stringify({
    graphHash,
    from: request.from,
    to: request.to,
    via: request.via ?? [],
    preference: request.preference,
    travelMode: request.travelMode,
    season: request.season?.trim() ?? '',
    edges: edges.map((edge) => edge.id),
  }))}`
}

export function findRoute(graph: RouteGraph, request: RouteRequest): RouteResult {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return failure(request, 'data_error', '路线图数据无效。')
  }
  if (typeof request.from !== 'string' || !request.from.trim() || typeof request.to !== 'string' || !request.to.trim()) {
    return failure(request, 'invalid_request', '路线起点与终点必须使用有效地点 ID。')
  }
  if (!validRequestEnum(request.preference, request.travelMode)) {
    return failure(request, 'invalid_request', '路线偏好或交通方式无效。')
  }
  if (request.via !== undefined && (!Array.isArray(request.via) || request.via.some((id) => typeof id !== 'string' || !id.trim()))) {
    return failure(request, 'invalid_request', '途经点必须使用有效地点 ID。')
  }


  const nodesById = new Map<string, MapRouteNode>()
  const nodesByLocation = new Map<string, MapRouteNode>()
  for (const node of [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node)
    if (!nodesByLocation.has(node.locationId)) nodesByLocation.set(node.locationId, node)
  }
  const from = nodesByLocation.get(request.from)
  const to = nodesByLocation.get(request.to)
  if (!from) return failure(request, 'unknown_location', `起点 ${request.from} 不存在。`, request.from)
  if (!to) return failure(request, 'unknown_location', `终点 ${request.to} 不存在。`, request.to)

  const waypointIds = request.via ?? []
  const waypoints: MapRouteNode[] = []
  for (const locationId of waypointIds) {
    const node = nodesByLocation.get(locationId)
    if (!node) return failure(request, 'unknown_location', `途经点 ${locationId} 不存在。`, locationId)
    waypoints.push(node)
  }

  const eligibleEdges = graph.edges
    .filter((edge) => edge.allowedModes.includes(request.travelMode) && nodesById.has(edge.from) && nodesById.has(edge.to))
    .sort((left, right) => left.id.localeCompare(right.id))
  const context = createRouteCostContext(eligibleEdges, request.preference, request.travelMode, request.season)
  const adjacency = new Map<string, MapRouteEdge[]>()
  for (const edge of eligibleEdges) {
    const entries = adjacency.get(edge.from) ?? []
    entries.push(edge)
    adjacency.set(edge.from, entries)
  }

  const stops = [from, ...waypoints, to]
  const routeEdges: MapRouteEdge[] = []
  for (let index = 0; index < stops.length - 1; index += 1) {
    const segment = findSegment(stops[index], stops[index + 1], nodesById, adjacency, context)
    if (!segment) {
      return failure(
        request,
        'no_route',
        `当前交通方式无法找到从 ${stops[index].locationId} 到 ${stops[index + 1].locationId} 的路线。`,
        stops[index + 1].locationId,
      )
    }
    routeEdges.push(...segment)
  }

  const legs: RouteLeg[] = routeEdges.map((edge, index) => {
    const metrics = context.metricsByEdgeId.get(edge.id)
    const edgeFrom = nodesById.get(edge.from)
    const edgeTo = nodesById.get(edge.to)
    if (!metrics || !edgeFrom || !edgeTo) throw new Error(`路线边缺少节点或成本：${edge.id}`)
    return {
      index,
      edgeId: edge.id,
      from: edgeFrom.locationId,
      to: edgeTo.locationId,
      distance: round(edge.distance),
      days: round(metrics.days),
      cost: round(metrics.cost),
      risk: round(metrics.risk),
      roadLevel: edge.roadLevel,
      crossing: edge.crossing,
      seasonTags: [...edge.seasonTags],
      fromPoint: { mapX: edgeFrom.mapX, mapY: edgeFrom.mapY },
      toPoint: { mapX: edgeTo.mapX, mapY: edgeTo.mapY },
    }
  })
  const totalRisk = 1 - legs.reduce((survival, leg) => survival * (1 - leg.risk), 1)
  const plan: RoutePlan = {
    ok: true,
    id: routeId(graph.graphHash, request, routeEdges),
    from: request.from,
    to: request.to,
    preference: request.preference,
    travelMode: request.travelMode,
    via: [...waypointIds],
    ...(request.season?.trim() ? { season: request.season.trim() } : {}),
    legs,
    totalDistance: round(legs.reduce((sum, leg) => sum + leg.distance, 0)),
    totalDays: round(legs.reduce((sum, leg) => sum + leg.days, 0)),
    totalCost: round(legs.reduce((sum, leg) => sum + leg.cost, 0)),
    totalRisk: round(totalRisk),
    graphHash: graph.graphHash,
  }
  return plan
}
