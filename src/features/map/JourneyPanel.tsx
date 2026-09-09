import React, { useMemo } from 'react'
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
import type { CharacterId } from '../characters/types'
import { pendingTravelTransactionFor } from '../world/worldTransactionQueue'
import { advanceWorldDate } from '../world/worldHistory'
import { useMapUiStore } from './mapUiStore'
import type { ActiveJourney } from './travel/types'

interface JourneyPanelProps {
  journey: ActiveJourney
  hasLocationDetails: boolean
}

function formatDate(date: { year: number; month: number; day: number }): string {
  return `${date.year} AC · ${date.month}月${date.day}日`
}

export const JourneyPanel: React.FC<JourneyPanelProps> = ({ journey, hasLocationDetails }) => {
  const gameState = useGameStore((state) => state.gameState)
  const isStreaming = useGameStore((state) => state.isStreaming)
  const currentLocation = gameState.lord.location
  const currentDate = { year: gameState.currentYear, month: gameState.currentMonth, day: gameState.currentDay }
  const cancelWorldTransaction = useGameStore((state) => state.cancelWorldTransaction)
  const playerCharacterId = (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId
  const pendingTravelTransaction = pendingTravelTransactionFor(gameState.worldRuntime.pendingTransactions, playerCharacterId)
  const pendingTravelCommand = pendingTravelTransaction?.travelCommands?.[0] ?? null
  const cancelTravelCommand = () => {
    if (pendingTravelTransaction) cancelWorldTransaction(pendingTravelTransaction.id)
  }
  const closeDrawer = useMapUiStore((state) => state.closeDrawer)
  const openMap = useMapUiStore((state) => state.openMap)

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
  const pendingPause = pendingTravelCommand?.type === 'PAUSE_TRAVEL'
  const pendingResume = pendingTravelCommand?.type === 'RESUME_TRAVEL'
  const pauseBlocked = Boolean(pendingTravelCommand && !pendingPause && !pendingResume)

  const prefillAction = (text: string) => {
    if (isStreaming) return
    window.dispatchEvent(new CustomEvent('agot:prefill-action', { detail: { text } }))
    closeDrawer()
  }

  const pauseOrResume = () => {
    if (pendingPause || pendingResume) {
      cancelTravelCommand()
      return
    }
    prefillAction(journey.status === 'travelling'
      ? `我决定暂停前往${destination}的旅程，在当前能安全停下的位置停留。请按路况、补给、同行者和当前风险结算；如果这里不能合理停留，说明原因并把决定交还给我。`
      : `我决定继续前往${destination}的旅程。请沿用我已经确定的路线和同行安排，直到出现新的重要风险或需要我决定的分岔。`)
  }

  const toggleReroute = () => {
    prefillAction(`我要改变当前前往${destination}的路线。请先根据我已知的道路、风险、时日和补给说明真正有差异的选择，再让我决定具体走法。`)
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
        <button type="button" onClick={() => openMap({ kind: 'location', locationId: journey.routePlan.to })} aria-label="在地图上查看旅程目的地">
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
      <p className="map-journey-guidance">路线与风险是旅途中的情境，不是菜单答案；你可以直接描述赶路方式、戒备和同行安排。</p>

      <div className="map-journey-actions">
        <button type="button" onClick={pauseOrResume} disabled={isStreaming || pauseBlocked}>
          <PauseIcon />
          {pendingPause || pendingResume ? '取消调整' : journey.status === 'travelling' ? '暂停旅程' : '继续旅程'}
        </button>
        <button type="button" onClick={toggleReroute} disabled={isStreaming}>
          <Route />
          改道
        </button>
        <button
          type="button"
          onClick={() => prefillAction(`我决定折返${origin}。请结合当前路况、伤病、补给、同行者和追兵，理解我如何组织这次折返。`)}
          disabled={isStreaming || currentLocation.locationId === journey.routePlan.from}
          title={currentLocation.locationId === journey.routePlan.from ? `已经在${origin}` : undefined}
        >
          <CornerUpLeft />
          折返
        </button>
      </div>
    </aside>
  )
}
