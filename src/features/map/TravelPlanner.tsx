import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Clock3,
  MapPin,
  Navigation,
  Plus,
  Route,
  Search,
  Undo2,
  X,
} from 'lucide-react'

import { useGameStore } from '../../store/useGameStore'
import type { CharacterId } from '../characters/types'
import { createPendingWorldTransaction, pendingTravelTransactionFor, travelCommandToWorldIntent } from '../world/worldTransactionQueue'
import { sameWorldLocation } from './locationResolver'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import { RouteClient, RoutePlanningError } from './routing/routeClient'
import type { RoutePlan } from './routing/types'
import type { MapLocationSearchEntry, RoutePreference, TravelMode } from './types'
import type { TravelStateCommand } from './travel/types'

interface TravelPlannerProps {
  destinationId: string
  originId: string
  season: string
}

const ROUTE_PREFERENCES: Array<{ id: RoutePreference; label: string }> = [
  { id: 'fastest', label: '最快' },
  { id: 'safest', label: '最安全' },
  { id: 'cheapest', label: '最省钱' },
]

const TRAVEL_MODES: Array<{ id: TravelMode; label: string }> = [
  { id: 'walk', label: '步行' },
  { id: 'horse', label: '骑马' },
  { id: 'carriage', label: '马车' },
  { id: 'ship', label: '航船' },
]

let sharedRouteClient: RouteClient | undefined

function routeClient(): RouteClient {
  sharedRouteClient ??= new RouteClient()
  return sharedRouteClient
}

function commandRoute(command: TravelStateCommand | null): RoutePlan | null {
  if (!command || !('routePlan' in command) || !command.routePlan) return null
  return command.routePlan
}

function moveEntry(entries: MapLocationSearchEntry[], from: number, to: number): MapLocationSearchEntry[] {
  if (to < 0 || to >= entries.length) return entries
  const next = [...entries]
  const [entry] = next.splice(from, 1)
  next.splice(to, 0, entry)
  return next
}

export const TravelPlanner: React.FC<TravelPlannerProps> = ({ destinationId, originId, season }) => {
  const [preference, setPreference] = useState<RoutePreference>('fastest')
  const [travelMode, setTravelMode] = useState<TravelMode>('horse')
  const [waypoints, setWaypoints] = useState<MapLocationSearchEntry[]>([])
  const [waypointQuery, setWaypointQuery] = useState('')
  const [waypointResults, setWaypointResults] = useState<MapLocationSearchEntry[]>([])
  const [waypointLoading, setWaypointLoading] = useState(false)
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const routeRequest = useRef(0)
  const waypointRequest = useRef(0)

  const gameState = useGameStore((state) => state.gameState)
  const activeJourney = gameState.activeJourney
  const playerLocation = gameState.lord.location
  const vehicles = gameState.lord.items.vehicles
  const isStreaming = useGameStore((state) => state.isStreaming)
  const queueWorldTransaction = useGameStore((state) => state.queueWorldTransaction)
  const cancelWorldTransaction = useGameStore((state) => state.cancelWorldTransaction)
  const playerCharacterId = (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId
  const pendingTravelTransaction = pendingTravelTransactionFor(gameState.worldRuntime.pendingTransactions, playerCharacterId)
  const pendingTravelCommand = pendingTravelTransaction?.travelCommands?.[0] ?? null
  const queueTravelCommand = (command: TravelStateCommand) => queueWorldTransaction(createPendingWorldTransaction(
    travelCommandToWorldIntent(command, playerCharacterId, `地图旅行操作：${command.type}`),
  ))
  const cancelTravelCommand = () => {
    if (pendingTravelTransaction) cancelWorldTransaction(pendingTravelTransaction.id)
  }
  const previewRoute = useMapUiStore((state) => state.previewRoute)
  const closeTravelPlanning = useMapUiStore((state) => state.closeTravelPlanning)

  const viaKey = waypoints.map((entry) => entry.id).join('|')

  useEffect(() => {
    setRoutePlan(null)
    setRouteError(null)
    previewRoute(null)
  }, [destinationId, originId, preference, previewRoute, travelMode, viaKey])

  useEffect(() => {
    const pendingRoute = commandRoute(pendingTravelCommand)
    if (pendingRoute?.to !== destinationId) return
    setRoutePlan(pendingRoute)
    previewRoute(pendingRoute)
  }, [destinationId, pendingTravelCommand, previewRoute])

  useEffect(() => {
    const request = ++waypointRequest.current
    const query = waypointQuery.trim()
    if (!query) {
      setWaypointResults([])
      setWaypointLoading(false)
      return
    }
    setWaypointLoading(true)
    const timer = window.setTimeout(() => {
      mapRepository.searchGameplayLocations(query, 8)
        .then((entries) => {
          if (request !== waypointRequest.current) return
          const selected = new Set([originId, destinationId, ...waypoints.map((entry) => entry.id)])
          setWaypointResults(entries.filter((entry) => !selected.has(entry.id)))
        })
        .catch(() => {
          if (request === waypointRequest.current) setWaypointResults([])
        })
        .finally(() => {
          if (request === waypointRequest.current) setWaypointLoading(false)
        })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [destinationId, originId, waypointQuery, viaKey, waypoints])

  useEffect(() => () => {
    routeRequest.current += 1
    sharedRouteClient?.cancelPending('路线规划器已经关闭。')
    previewRoute(null)
  }, [previewRoute])

  const coLocatedVehicleIds = useMemo(() => Object.values(vehicles)
    .filter((vehicle) => sameWorldLocation(vehicle.location, playerLocation))
    .filter((vehicle) => travelMode === 'ship'
      ? vehicle.type === 'ship'
      : travelMode === 'carriage'
        ? vehicle.type === 'wagon'
        : travelMode === 'horse'
          ? vehicle.type === 'packhorse'
          : false)
    .map((vehicle) => vehicle.id), [playerLocation, travelMode, vehicles])

  const activeForDestination = activeJourney?.routePlan.to === destinationId && activeJourney.status !== 'arrived'
  const pendingRoute = commandRoute(pendingTravelCommand)
  const pendingForDestination = pendingRoute?.to === destinationId
  const pendingElsewhere = Boolean(pendingTravelCommand && !pendingForDestination)
  const isCurrentLocation = originId === destinationId
  const isReroute = Boolean(activeJourney && activeJourney.status !== 'arrived' && !activeForDestination)
  const isReturnRoute = Boolean(activeJourney && routePlan?.to === activeJourney.routePlan.from)

  const planRoute = async () => {
    const request = ++routeRequest.current
    setRouteLoading(true)
    setRoutePlan(null)
    previewRoute(null)
    setRouteError(null)
    try {
      const plan = await routeClient().plan({
        from: originId,
        to: destinationId,
        preference,
        travelMode,
        via: waypoints.map((entry) => entry.id),
        season,
      })
      if (request === routeRequest.current) {
        setRoutePlan(plan)
        previewRoute(plan)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      if (request === routeRequest.current) {
        setRouteError(error instanceof RoutePlanningError ? error.failure.reason : '路线规划暂时不可用。')
      }
    } finally {
      if (request === routeRequest.current) setRouteLoading(false)
    }
  }

  const confirmRoute = async () => {
    if (!routePlan || pendingElsewhere) return
    setRouteLoading(true)
    setRouteError(null)
    try {
      const routeIds = new Set([routePlan.from, routePlan.to, ...routePlan.legs.flatMap((leg) => [leg.from, leg.to])])
      const entries = await mapRepository.loadSearchIndex()
      const locationLabels = Object.fromEntries(entries
        .filter((entry) => routeIds.has(entry.id))
        .map((entry) => [entry.id, entry.name]))
      if (isReroute) {
        queueTravelCommand({
          type: isReturnRoute ? 'RETURN_TRAVEL' : 'REROUTE_TRAVEL',
          routePlan,
          locationLabels,
        })
      } else {
        queueTravelCommand({
          type: 'START_TRAVEL',
          routePlan,
          companions: [],
          vehicleIds: coLocatedVehicleIds,
          locationLabels,
        })
      }
      closeTravelPlanning()
    } catch {
      setRouteError('路线地点名称未能读取，请重新规划。')
    } finally {
      setRouteLoading(false)
    }
  }

  const button = (() => {
    if (pendingTravelCommand && pendingForDestination) return {
      label: pendingTravelCommand.type === 'START_TRAVEL' ? '取消出发' : '取消这项调整',
      note: '尚未进入下一次成功对话',
      icon: Undo2,
      action: cancelTravelCommand,
      disabled: false,
    }
    if (activeForDestination) return {
      label: '当前旅程目的地', note: '可在旅程面板调整', icon: MapPin, action: () => {}, disabled: true,
    }
    if (isCurrentLocation) return {
      label: '当前所在地点', note: '无需规划旅行', icon: MapPin, action: () => {}, disabled: true,
    }
    if (pendingElsewhere) return {
      label: '先处理现有旅行调整', note: '请回到原按钮取消或等待结算', icon: Clock3, action: () => {}, disabled: true,
    }
    if (routePlan) return {
      label: isReroute ? (isReturnRoute ? '沿此路线返回' : '确认改走此路') : '开始旅行',
      note: '下一次成功对话后生效',
      icon: Navigation,
      action: confirmRoute,
      disabled: false,
    }
    return {
      label: isReroute ? '规划改道路线' : '规划路线',
      note: '先预览，再确认',
      icon: Route,
      action: planRoute,
      disabled: false,
    }
  })()
  const ButtonIcon = button.icon
  const planningDisabled = activeForDestination || isCurrentLocation || pendingForDestination || pendingElsewhere

  return (
    <section className="map-travel-planner" aria-label="旅行规划器">
      <h3>旅行规划</h3>
      {!planningDisabled && (
        <>
          <div className="map-route-controls" aria-label="路线规划选项">
            <label>
              <span>偏好</span>
              <select value={preference} onChange={(event) => setPreference(event.target.value as RoutePreference)}>
                {ROUTE_PREFERENCES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>方式</span>
              <select value={travelMode} onChange={(event) => setTravelMode(event.target.value as TravelMode)}>
                {TRAVEL_MODES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="map-waypoint-picker">
            <div className="map-waypoint-heading">
              <span>途经点</span>
              <small>按顺序经过，最多五处</small>
            </div>
            {waypoints.length > 0 && (
              <div className="map-waypoint-list">
                {waypoints.map((entry, index) => (
                  <div key={entry.id} className="map-waypoint-chip">
                    <span>{index + 1}</span>
                    <strong>{entry.name}</strong>
                    <button type="button" onClick={() => setWaypoints((current) => moveEntry(current, index, index - 1))} disabled={index === 0} aria-label={`上移途经点 ${entry.name}`}><ChevronUp /></button>
                    <button type="button" onClick={() => setWaypoints((current) => moveEntry(current, index, index + 1))} disabled={index === waypoints.length - 1} aria-label={`下移途经点 ${entry.name}`}><ChevronDown /></button>
                    <button type="button" onClick={() => setWaypoints((current) => current.filter((item) => item.id !== entry.id))} aria-label={`移除途经点 ${entry.name}`}><X /></button>
                  </div>
                ))}
              </div>
            )}
            {waypoints.length < 5 && (
              <div className="map-waypoint-search">
                <Search aria-hidden="true" />
                <input value={waypointQuery} onChange={(event) => setWaypointQuery(event.target.value)} placeholder="搜索并添加途经点" aria-label="搜索途经点" />
                {waypointLoading && <span>查找中</span>}
                {waypointQuery && !waypointLoading && waypointResults.length > 0 && (
                  <div className="map-waypoint-results">
                    {waypointResults.map((entry) => (
                      <button key={entry.id} type="button" onClick={() => {
                        setWaypoints((current) => [...current, entry])
                        setWaypointQuery('')
                        setWaypointResults([])
                      }}>
                        <Plus />
                        <span>{entry.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <button type="button" className="map-route-button" onClick={button.action} disabled={routeLoading || isStreaming || button.disabled}>
        <ButtonIcon className="h-4 w-4" />
        <span>{routeLoading ? '正在处理' : button.label}</span>
        <small><Clock3 className="h-3 w-3" />{button.note}</small>
      </button>

      {routePlan && !activeForDestination && (
        <div className="map-route-result" role="status">
          <strong>{routePlan.legs.length} 段 · {routePlan.totalDays.toFixed(1)} 天</strong>
          <span>费用 {routePlan.totalCost.toFixed(1)} · 风险 {Math.round(routePlan.totalRisk * 100)}%</span>
          {routePlan.via.length > 0 && <span>途经 {waypoints.map((entry) => entry.name).join('、')}</span>}
          <small>路线编号 {routePlan.id}</small>
        </div>
      )}
      {routeError && <div className="map-route-error" role="alert">{routeError}</div>}
    </section>
  )
}
