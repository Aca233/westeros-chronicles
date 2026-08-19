import React, { useMemo, useState } from 'react'
import {
  CalendarDays,
  CornerUpLeft,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route,
  Undo2,
} from 'lucide-react'

import { useGameStore } from '../../store/useGameStore'
import { advanceWorldDate } from '../world/worldHistory'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import { RouteClient, RoutePlanningError } from './routing/routeClient'
import type { ActiveJourney, TravelStateCommand } from './travel/types'

interface JourneyPanelProps {
  journey: ActiveJourney
  season: string
  hasLocationDetails: boolean
}

let sharedReturnClient: RouteClient | undefined

function returnClient(): RouteClient {
  sharedReturnClient ??= new RouteClient()
  return sharedReturnClient
}

function routeCommand(command: TravelStateCommand | null): command is Extract<TravelStateCommand, { type: 'REROUTE_TRAVEL' | 'RETURN_TRAVEL' }> {
  return command?.type === 'REROUTE_TRAVEL' || command?.type === 'RETURN_TRAVEL'
}

function formatDate(date: { year: number; month: number; day: number }): string {
  return `${date.year} AC · ${date.month}月${date.day}日`
}

export const JourneyPanel: React.FC<JourneyPanelProps> = ({ journey, season, hasLocationDetails }) => {
  const [returnLoading, setReturnLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingTravelCommand = useGameStore((state) => state.pendingTravelCommand)
  const isStreaming = useGameStore((state) => state.isStreaming)
  const currentLocation = useGameStore((state) => state.gameState.lord.location)
  const currentYear = useGameStore((state) => state.gameState.currentYear)
  const currentMonth = useGameStore((state) => state.gameState.currentMonth)
  const currentDay = useGameStore((state) => state.gameState.currentDay)
  const currentDate = { year: currentYear, month: currentMonth, day: currentDay }
  const queueTravelCommand = useGameStore((state) => state.queueTravelCommand)
  const cancelTravelCommand = useGameStore((state) => state.cancelTravelCommand)
  const travelIntent = useMapUiStore((state) => state.travelIntent)
  const beginReroute = useMapUiStore((state) => state.beginReroute)
  const clearTravelIntent = useMapUiStore((state) => state.clearTravelIntent)
  const selectLocation = useMapUiStore((state) => state.selectLocation)

  const completedDays = useMemo(() => journey.routePlan.legs
    .slice(0, journey.currentLeg)
    .reduce((sum, leg) => sum + leg.days, 0) + journey.progressDays, [journey])
  const remainingDays = Math.max(0, journey.routePlan.totalDays - completedDays)
  const progress = journey.routePlan.totalDays > 0
    ? Math.min(1, completedDays / journey.routePlan.totalDays)
    : 1
  const nextLeg = journey.routePlan.legs[journey.currentLeg]
  const nextLocation = nextLeg
    ? journey.locationLabels?.[nextLeg.to] ?? nextLeg.to
    : journey.locationLabels?.[journey.routePlan.to] ?? journey.routePlan.to
  const destination = journey.locationLabels?.[journey.routePlan.to] ?? journey.routePlan.to
  const origin = journey.locationLabels?.[journey.routePlan.from] ?? journey.routePlan.from
  const estimatedArrival = formatDate(advanceWorldDate(currentDate, { days: Math.ceil(remainingDays) }))
  const pendingRoute = routeCommand(pendingTravelCommand) ? pendingTravelCommand : null
  const pendingPause = pendingTravelCommand?.type === 'PAUSE_TRAVEL'
  const pendingResume = pendingTravelCommand?.type === 'RESUME_TRAVEL'
  const pendingReturn = pendingRoute?.type === 'RETURN_TRAVEL'
  const pendingReroute = pendingRoute?.type === 'REROUTE_TRAVEL'
  const pauseBlocked = Boolean(pendingTravelCommand && !pendingPause && !pendingResume)
  const rerouteBlocked = Boolean(pendingTravelCommand && !pendingReroute)
  const returnBlocked = Boolean(pendingTravelCommand && !pendingReturn)

  const queueReturn = async () => {
    setReturnLoading(true)
    setError(null)
    try {
      const routePlan = await returnClient().plan({
        from: currentLocation.locationId,
        to: journey.routePlan.from,
        preference: journey.routePlan.preference,
        travelMode: journey.routePlan.travelMode,
        via: [],
        season,
      })
      const routeIds = new Set([routePlan.from, routePlan.to, ...routePlan.legs.flatMap((leg) => [leg.from, leg.to])])
      const entries = await mapRepository.loadSearchIndex()
      const locationLabels = Object.fromEntries(entries
        .filter((entry) => routeIds.has(entry.id))
        .map((entry) => [entry.id, entry.name]))
      queueTravelCommand({ type: 'RETURN_TRAVEL', routePlan, locationLabels })
      clearTravelIntent()
    } catch (reason) {
      setError(reason instanceof RoutePlanningError ? reason.failure.reason : '返回路线暂时无法规划。')
    } finally {
      setReturnLoading(false)
    }
  }

  const pauseOrResume = () => {
    if (pendingPause || pendingResume) {
      cancelTravelCommand()
      return
    }
    queueTravelCommand(journey.status === 'travelling'
      ? { type: 'PAUSE_TRAVEL' }
      : { type: 'RESUME_TRAVEL' })
  }

  const toggleReroute = () => {
    if (pendingReroute) {
      cancelTravelCommand()
      return
    }
    if (travelIntent === 'reroute') clearTravelIntent()
    else beginReroute()
  }

  const statusLabel = journey.status === 'travelling'
    ? '正在赶路'
    : journey.status === 'paused'
      ? '旅程已暂停'
      : '旅程被中断'
  const PauseIcon = pendingPause || pendingResume
    ? Undo2
    : journey.status === 'travelling' ? Pause : Play

  return (
    <aside className={`map-journey-panel${hasLocationDetails ? ' with-details' : ''}`} aria-label="当前旅程">
      <header>
        <span className="map-journey-icon"><Navigation /></span>
        <div>
          <small>{statusLabel}</small>
          <strong>{destination}</strong>
        </div>
        <button type="button" onClick={() => selectLocation(journey.routePlan.to)} aria-label="在地图上查看旅程目的地">
          <MapPin />
        </button>
      </header>

      <div className="map-journey-progress" aria-label={`旅程进度 ${Math.round(progress * 100)}%`}>
        <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
      </div>
      <div className="map-journey-metrics">
        <p><Route /><span>下一地点</span><strong>{nextLocation}</strong></p>
        <p><CalendarDays /><span>预计抵达</span><strong>{estimatedArrival}</strong></p>
      </div>
      <div className="map-journey-caption">
        <span>第 {Math.min(journey.currentLeg + 1, Math.max(1, journey.routePlan.legs.length))} / {Math.max(1, journey.routePlan.legs.length)} 段</span>
        <span>剩余约 {remainingDays.toFixed(1)} 天</span>
      </div>
      {journey.interruptedBy && <p className="map-journey-interruption">{journey.interruptedBy}</p>}
      {travelIntent === 'reroute' && <p className="map-journey-guidance">请选择新的目的地，再在地点详情中规划并确认改道。</p>}
      {error && <p className="map-journey-error" role="alert">{error}</p>}

      <div className="map-journey-actions">
        <button type="button" onClick={pauseOrResume} disabled={isStreaming || pauseBlocked}>
          <PauseIcon />
          {pendingPause || pendingResume ? '取消调整' : journey.status === 'travelling' ? '暂停旅程' : '继续旅程'}
        </button>
        <button type="button" onClick={toggleReroute} disabled={isStreaming || rerouteBlocked}>
          {pendingReroute || travelIntent === 'reroute' ? <Undo2 /> : <Route />}
          {pendingReroute || travelIntent === 'reroute' ? '取消改道' : '改道'}
        </button>
        <button
          type="button"
          onClick={pendingReturn ? cancelTravelCommand : queueReturn}
          disabled={isStreaming || returnLoading || returnBlocked || (!pendingReturn && currentLocation.locationId === journey.routePlan.from)}
          title={currentLocation.locationId === journey.routePlan.from ? `已经在${origin}` : undefined}
        >
          {pendingReturn ? <Undo2 /> : <CornerUpLeft />}
          {pendingReturn ? '取消返回' : returnLoading ? '规划中' : '返回'}
        </button>
      </div>
    </aside>
  )
}
