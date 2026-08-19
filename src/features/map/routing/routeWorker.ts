/// <reference lib="webworker" />

import { mapRepository } from '../repository'
import type { MapRouteEdge, MapRouteNode, MapRouteShard } from '../types'
import { findRoute } from './pathfinder'
import type { RouteFailure, RouteWorkerRequest, RouteWorkerResponse } from './types'

const cancelledRequests = new Set<string>()
const shardPromises = new Map<string, Promise<MapRouteShard>>()
let completeGraphPromise: Promise<MapRouteShard> | undefined

function loadShard(regionId: string): Promise<MapRouteShard> {
  const cached = shardPromises.get(regionId)
  if (cached) return cached
  const pending = mapRepository.loadRouteRegion(regionId).catch((error) => {
    shardPromises.delete(regionId)
    throw error
  })
  shardPromises.set(regionId, pending)
  return pending
}

async function loadCompleteGraph(): Promise<MapRouteShard> {
  if (completeGraphPromise) return completeGraphPromise
  completeGraphPromise = (async () => {
    const locations = await mapRepository.loadSearchIndex()
    const regionIds = [...new Set(locations.map((location) => location.regionId))].sort()
    const shards = await Promise.all(regionIds.map(loadShard))
    const nodes = new Map<string, MapRouteNode>()
    const edges = new Map<string, MapRouteEdge>()
    let graphHash = ''
    for (const shard of shards) {
      if (graphHash && shard.graphHash !== graphHash) throw new Error('地图路线分片版本不一致。')
      graphHash = shard.graphHash
      shard.nodes.forEach((node) => nodes.set(node.id, node))
      shard.edges.forEach((edge) => edges.set(edge.id, edge))
    }
    return {
      graphHash,
      nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
      edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
    }
  })().catch((error) => {
    completeGraphPromise = undefined
    throw error
  })
  return completeGraphPromise
}

function dataFailure(from: string, to: string, reason: string): RouteFailure {
  return { ok: false, code: 'data_error', reason, from, to }
}

self.addEventListener('message', async (event: MessageEvent<RouteWorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId)
    return
  }
  cancelledRequests.delete(message.requestId)
  try {
    const graph = await loadCompleteGraph()
    if (cancelledRequests.has(message.requestId)) return
    const result = findRoute(graph, message.request)
    if (cancelledRequests.has(message.requestId)) return
    const response: RouteWorkerResponse = result.ok
      ? { type: 'result', requestId: message.requestId, result }
      : { type: 'failure', requestId: message.requestId, failure: result }
    self.postMessage(response)
  } catch (error) {
    if (cancelledRequests.has(message.requestId)) return
    const response: RouteWorkerResponse = {
      type: 'failure',
      requestId: message.requestId,
      failure: dataFailure(
        message.request.from,
        message.request.to,
        error instanceof Error ? error.message : '地图路线资料载入失败。',
      ),
    }
    self.postMessage(response)
  } finally {
    cancelledRequests.delete(message.requestId)
  }
})
