import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Castle,
  Clock3,
  Landmark,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route,
  Ship,
  Undo2,
  Waves,
  X,
} from 'lucide-react'

import { buildLocationView, type LocationViewModel } from './locationViewModel'
import { sameWorldLocation } from './locationResolver'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import { RouteClient, RoutePlanningError } from './routing/routeClient'
import type { RoutePlan } from './routing/types'
import type { MapLocation, MapLocationType, RoutePreference, TravelMode } from './types'
import { useGameStore } from '../../store/useGameStore'
import type { TravelStateCommand } from './travel/types'

interface LocationDetailsProps {
  locationId: string
  routeOriginId: string
  season: string
  onClose: () => void
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

const TAG_LABELS: Record<string, string> = {
  capital: '首府',
  major: '重要地点',
  wall: '长城据点',
  island: '岛屿',
  stark: '史塔克',
  targaryen: '坦格利安',
  lannister: '兰尼斯特',
  martell: '马泰尔',
  greyjoy: '葛雷乔伊',
}

function TypeIcon({ type }: { type: MapLocationType }) {
  const className = 'h-5 w-5'
  if (type === 'castle') return <Castle className={className} />
  if (type === 'port') return <Ship className={className} />
  if (type === 'landmark' || type === 'ruin') return <Landmark className={className} />
  return <MapPin className={className} />
}

function commandRoute(command: TravelStateCommand | null): RoutePlan | null {
  if (!command || !('routePlan' in command) || !command.routePlan) return null
  return command.routePlan
}

export const LocationDetails: React.FC<LocationDetailsProps> = ({ locationId, routeOriginId, season, onClose }) => {
  const [location, setLocation] = useState<MapLocation | null>(null)
  const [failed, setFailed] = useState(false)
  const [preference, setPreference] = useState<RoutePreference>('fastest')
  const [travelMode, setTravelMode] = useState<TravelMode>('horse')
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const routeRequest = useRef(0)
  const activeJourney = useGameStore((state) => state.gameState.activeJourney)
  const pendingTravelCommand = useGameStore((state) => state.pendingTravelCommand)
  const playerLocation = useGameStore((state) => state.gameState.lord.location)
  const vehicles = useGameStore((state) => state.gameState.lord.items.vehicles)
  const isStreaming = useGameStore((state) => state.isStreaming)
  const queueTravelCommand = useGameStore((state) => state.queueTravelCommand)
  const cancelTravelCommand = useGameStore((state) => state.cancelTravelCommand)
  const preview = useMapUiStore((state) => state.routePreview)
  const previewRouteSet = useMapUiStore((state) => state.previewRoute)

  useEffect(() => {
    let cancelled = false
    setLocation(null)
    setFailed(false)
    setRoutePlan(null)
    setRouteError(null)
    setRouteLoading(false)
    previewRouteSet(null)
    routeRequest.current += 1
    sharedRouteClient?.cancelPending('已选择新的目的地。')
    mapRepository.getLocation(locationId)
      .then((value) => {
        if (!cancelled) setLocation(value)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      routeRequest.current += 1
      sharedRouteClient?.cancelPending('地点详情已经关闭。')
      previewRouteSet(null)
    }
  }, [locationId, previewRouteSet])

  useEffect(() => {
    const pendingRoute = commandRoute(pendingTravelCommand)
    if (pendingRoute?.to === locationId) {
      setRoutePlan(pendingRoute)
      previewRouteSet(pendingRoute)
    }
  }, [locationId, pendingTravelCommand, previewRouteSet])

  const view = useMemo<LocationViewModel | null>(() => location ? buildLocationView(location) : null, [location])

  const planRoute = async () => {
    const request = ++routeRequest.current
    setRouteLoading(true)
    setRoutePlan(null)
    previewRouteSet(null)
    setRouteError(null)
    try {
      const plan = await routeClient().plan({
        from: routeOriginId,
        to: locationId,
        preference,
        travelMode,
        via: [],
        season,
      })
      if (request === routeRequest.current) {
        setRoutePlan(plan)
        previewRouteSet(plan)
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

  const isCurrentLocation = routeOriginId === locationId
  const activeForDestination = activeJourney?.routePlan.to === locationId && activeJourney.status !== 'arrived'
  const pendingRoute = commandRoute(pendingTravelCommand)
  const pendingForDestination = pendingRoute?.to === locationId
  const pendingAppliesHere = pendingRoute ? pendingForDestination : activeForDestination
  const isReturnRoute = Boolean(activeJourney && routePlan?.to === activeJourney.routePlan.from)
  const isReroute = Boolean(activeJourney && activeJourney.status !== 'arrived' && !activeForDestination)

  const queueRouteAction = async () => {
    if (!routePlan) return
    setRouteLoading(true)
    try {
      const routeIds = new Set([routePlan.from, routePlan.to, ...routePlan.legs.flatMap((leg) => [leg.from, leg.to])])
      const entries = await mapRepository.loadSearchIndex()
      const locationLabels = Object.fromEntries(entries
        .filter((entry) => routeIds.has(entry.id))
        .map((entry) => [entry.id, entry.name]))
      if (isReroute) {
        queueTravelCommand({ type: isReturnRoute ? 'RETURN_TRAVEL' : 'REROUTE_TRAVEL', routePlan, locationLabels })
      } else {
        queueTravelCommand({ type: 'START_TRAVEL', routePlan, companions: [], vehicleIds: coLocatedVehicleIds, locationLabels })
      }
    } catch {
      setRouteError('路线地点名称未能读取，请重新规划。')
    } finally {
      setRouteLoading(false)
    }
  }

  const routeButton = (() => {
    if (pendingTravelCommand && pendingAppliesHere) {
      return {
        label: pendingTravelCommand.type === 'START_TRAVEL' ? '取消出发' : '取消这项调整',
        note: '尚未进入下一次成功对话',
        icon: Undo2,
        action: cancelTravelCommand,
      }
    }
    if (activeForDestination && activeJourney) {
      if (activeJourney.status === 'travelling') return { label: '暂停旅程', note: '下一次成功对话后生效', icon: Pause, action: () => queueTravelCommand({ type: 'PAUSE_TRAVEL' }) }
      if (activeJourney.status === 'paused' || activeJourney.status === 'interrupted') return { label: '继续旅程', note: '下一次成功对话后生效', icon: Play, action: () => queueTravelCommand({ type: 'RESUME_TRAVEL' }) }
    }
    if (isCurrentLocation && !activeForDestination) return { label: '当前所在地点', note: '无需规划旅行', icon: MapPin, action: () => {} }
    if (routePlan) return {
      label: isReroute ? (isReturnRoute ? '沿此路线返回' : '改走这条路线') : '开始旅行',
      note: '下一次成功对话后出发',
      icon: Navigation,
      action: queueRouteAction,
    }
    return { label: isReroute ? '规划改道路线' : '规划路线', note: '从当前位置出发', icon: Route, action: planRoute }
  })()
  const RouteButtonIcon = routeButton.icon
  const visiblePlan = routePlan ?? (preview?.to === locationId ? preview : null)

  return (
    <aside className="map-location-details" aria-label="地点详情">
      <div className="map-details-handle" aria-hidden="true" />
      <button type="button" className="map-details-close" onClick={onClose} aria-label="关闭地点详情">
        <X className="h-4 w-4" />
      </button>
      {failed ? (
        <div className="map-details-state" role="alert">
          <MapPin className="h-6 w-6 text-gold" />
          <strong>地点资料未能载入</strong>
          <span>地图仍可继续浏览，请重新选择地点。</span>
        </div>
      ) : !view ? (
        <div className="map-details-state" aria-live="polite">
          <span className="map-loading-mark" aria-hidden="true" />
          <span>正在读取地点资料</span>
        </div>
      ) : (
        <div className="map-details-scroll">
          <header className="map-details-heading">
            <span className="map-details-type-icon"><TypeIcon type={view.type} /></span>
            <div>
              <p>{view.typeLabel} · {view.regionLabel}</p>
              <h2>{view.name}</h2>
              {view.englishName && <small>{view.englishName}</small>}
            </div>
          </header>

          {view.description && <p className="map-location-description">{view.description}</p>}

          <div className="map-fact-chips">
            <span><Landmark className="h-3.5 w-3.5" />{view.terrainLabel}</span>
            {view.access.coastal && <span><Waves className="h-3.5 w-3.5" />沿海</span>}
            {view.access.port && <span><Ship className="h-3.5 w-3.5" />可通航港口</span>}
            {view.tags.map((tag) => <span key={tag}>{TAG_LABELS[tag] ?? tag}</span>)}
          </div>

          <section className="map-details-section">
            <h3>领地层级</h3>
            <div className="map-hierarchy-list">
              {view.hierarchy.map((entry) => (
                <div key={entry.id}>
                  <span>{entry.rankLabel}</span>
                  <strong>{entry.label}</strong>
                  <small>{entry.id}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="map-details-section">
            <h3>通行资料</h3>
            <div className="map-access-list">
              <p><Navigation className="h-3.5 w-3.5" />道路网络可在“旅行”模式查看</p>
              <p><Ship className="h-3.5 w-3.5" />{view.access.port ? '可由海路抵达' : '没有登记为港口'}</p>
            </div>
          </section>

          <section className="map-details-section map-projection-note">
            <h3>当地情报</h3>
            <p>人物、持有人、事件与资产只读取统一世界状态；当前尚未接入的数据不会在此伪造。</p>
          </section>

          {!activeForDestination && !pendingForDestination && (
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
          )}

          <button type="button" className="map-route-button" onClick={routeButton.action} disabled={routeLoading || isStreaming || (isCurrentLocation && !activeForDestination)}>
            <RouteButtonIcon className="h-4 w-4" />
            <span>{routeLoading ? '正在规划' : routeButton.label}</span>
            <small><Clock3 className="h-3 w-3" />{routeButton.note}</small>
          </button>
          {activeForDestination && activeJourney && (
            <div className="map-route-result map-journey-status" role="status">
              <strong>{activeJourney.status === 'travelling' ? '正在赶路' : activeJourney.status === 'paused' ? '旅程已暂停' : '旅程被中断'}</strong>
              <span>第 {Math.min(activeJourney.currentLeg + 1, activeJourney.routePlan.legs.length)} / {activeJourney.routePlan.legs.length} 段 · 本段 {activeJourney.progressDays.toFixed(1)} 天</span>
              {activeJourney.interruptedBy && <small>{activeJourney.interruptedBy}</small>}
            </div>
          )}
          {visiblePlan && !activeForDestination && (
            <div className="map-route-result" role="status">
              <strong>{visiblePlan.legs.length} 段 · {visiblePlan.totalDays.toFixed(1)} 天</strong>
              <span>花费 {visiblePlan.totalCost.toFixed(1)} · 风险 {Math.round(visiblePlan.totalRisk * 100)}%</span>
              <small>路线编号 {visiblePlan.id}</small>
            </div>
          )}
          {routeError && <div className="map-route-error" role="alert">{routeError}</div>}
        </div>
      )}
    </aside>
  )
}
