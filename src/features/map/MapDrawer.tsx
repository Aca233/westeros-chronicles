import React, { useCallback, useEffect, useState } from 'react'
import { Map as MapIcon, RotateCcw, X } from 'lucide-react'

import { MapCanvas } from './MapCanvas'
import { LocationDetails } from './LocationDetails'
import { MapToolbar } from './MapToolbar'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import type { MapManifest } from './types'
import { useGameStore } from '../../store/useGameStore'

export const MapDrawer: React.FC = () => {
  const activeDrawer = useMapUiStore((state) => state.activeDrawer)
  const selectedLocationId = useMapUiStore((state) => state.selectedLocationId)
  const lastViewport = useMapUiStore((state) => state.lastViewport)
  const mapMode = useMapUiStore((state) => state.mapMode)
  const routePreview = useMapUiStore((state) => state.routePreview)
  const closeDrawer = useMapUiStore((state) => state.closeDrawer)
  const selectLocation = useMapUiStore((state) => state.selectLocation)
  const rememberViewport = useMapUiStore((state) => state.rememberViewport)
  const setMapMode = useMapUiStore((state) => state.setMapMode)
  const [manifest, setManifest] = useState<MapManifest | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const routeOriginId = useGameStore((state) => state.gameState.lord.location.locationId)
  const currentSeason = useGameStore((state) => state.gameState.currentSeason)
  const activeJourney = useGameStore((state) => state.gameState.activeJourney)
  const pendingTravelCommand = useGameStore((state) => state.pendingTravelCommand)
  const pendingRoutePlan = pendingTravelCommand && 'routePlan' in pendingTravelCommand
    ? pendingTravelCommand.routePlan ?? null
    : null
  const displayedRoute = routePreview ?? pendingRoutePlan ?? activeJourney?.routePlan ?? null

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    setLoadError(false)
    mapRepository.loadManifest()
      .then((loadedManifest) => {
        if (!cancelled) setManifest(loadedManifest)
      })
      .catch(() => {
        if (!cancelled) {
          setManifest(null)
          setLoadError(true)
        }
      })
    return () => { cancelled = true }
  }, [activeDrawer, reloadKey])

  const retry = useCallback(() => {
    mapRepository.clear('/data/agot-map/manifest.json')
    setReloadKey((value) => value + 1)
  }, [])

  if (activeDrawer !== 'map') return null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="维斯特洛地图">
      <button
        type="button"
        className="modal-backdrop absolute inset-0 w-full cursor-default"
        aria-label="收起维斯特洛地图"
        onClick={closeDrawer}
      />
      <section className="map-drawer-panel absolute left-0 top-0 flex h-full flex-col border-r border-hairline-bright bg-ink shadow-[32px_0_80px_rgba(0,0,0,0.45)]">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline/70 px-4 select-none">
          <div className="flex min-w-0 items-center gap-2.5">
            <MapIcon className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <div className="min-w-0">
              <div className="eyebrow truncate">维斯特洛地图</div>
              <div className="mt-0.5 truncate text-[10px] text-parchment-faint">离线地形与领地资料</div>
            </div>
          </div>
          <button type="button" onClick={closeDrawer} className="btn-ghost !px-1.5" aria-label="收起维斯特洛地图">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-[#101611]">
          {manifest && !loadError ? (
            <MapCanvas
              manifest={manifest}
              selectedLocationId={selectedLocationId}
              initialViewport={lastViewport}
              onSelectLocation={selectLocation}
              onViewportChange={rememberViewport}
              onWarning={setWarning}
              mode={mapMode}
              routePlan={displayedRoute}
              journey={activeJourney?.routePlan.id === displayedRoute?.id ? activeJourney : undefined}
            />
          ) : loadError ? (
            <div className="map-load-state" role="alert">
              <MapIcon className="h-8 w-8 text-gold" aria-hidden="true" />
              <strong>地图资料未能载入</strong>
              <span>正文与人物卷宗仍可正常使用。</span>
              <button type="button" className="btn-ghost map-retry-button" onClick={retry}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                重新载入
              </button>
            </div>
          ) : (
            <div className="map-load-state" aria-live="polite">
              <span className="map-loading-mark" aria-hidden="true" />
              <strong>正在展开地图</strong>
              <span>读取本地地形与地点索引</span>
            </div>
          )}
          {manifest && !loadError && (
            <MapToolbar mode={mapMode} onModeChange={setMapMode} onSelectLocation={selectLocation} />
          )}
          {manifest && !loadError && (mapMode === 'characters' || mapMode === 'assets') && (
            <div className="map-mode-empty" role="status">
              {mapMode === 'characters' ? '人物位置等待统一世界状态接入' : '资产位置等待统一世界状态接入'}
            </div>
          )}
          {manifest && !loadError && selectedLocationId && (
            <LocationDetails
              locationId={selectedLocationId}
              routeOriginId={routeOriginId}
              season={currentSeason}
              onClose={() => selectLocation(null)}
            />
          )}
          {warning && manifest && (
            <div className="map-warning" role="status">{warning}</div>
          )}
        </div>
      </section>
    </div>
  )
}
