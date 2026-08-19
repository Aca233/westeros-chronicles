import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Map as MapIcon, RotateCcw, X } from 'lucide-react'

import { MapCanvas } from './MapCanvas'
import { MapErrorBoundary } from './MapErrorBoundary'
import { LocationDetails } from './LocationDetails'
import { JourneyPanel } from './JourneyPanel'
import { MapToolbar } from './MapToolbar'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import type { MapManifest } from './types'
import { useGameStore } from '../../store/useGameStore'
import { StaticCharacterRepository } from '../characters/staticCharacterRepository'
import type { CharacterTitleHolderSummary } from '../characters/types'
import type { CharacterId } from '../characters/types'
import {
  knownCharacterIds,
  projectKnownAssetMapPoints,
  projectKnownCharacterMapPoints,
} from './dynamicMapSubjects.ts'
import {
  projectPoliticalState,
  type StaticPoliticalTitle,
} from './politicalProjection.ts'
import type { MapLocationSearchEntry } from './types'

const politicalCharacterRepository = new StaticCharacterRepository()

interface MapDrawerProps {
  onSelectCharacter: (characterId: CharacterId) => void
}

export const MapDrawer: React.FC<MapDrawerProps> = ({ onSelectCharacter }) => {
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
  const [canvasRetryKey, setCanvasRetryKey] = useState(0)
  const [mapLocations, setMapLocations] = useState<MapLocationSearchEntry[]>([])
  const [dynamicCharacterNames, setDynamicCharacterNames] = useState<Map<string, string>>(new Map())
  const [politicalSource, setPoliticalSource] = useState<{
    titles: StaticPoliticalTitle[]
    characters: CharacterTitleHolderSummary[]
  } | null>(null)
  const routeOriginId = useGameStore((state) => state.gameState.lord.location.locationId)
  const currentSeason = useGameStore((state) => state.gameState.currentSeason)
  const activeJourney = useGameStore((state) => state.gameState.activeJourney)
  const pendingTravelCommand = useGameStore((state) => state.pendingTravelCommand)
  const worldHistory = useGameStore((state) => state.gameState.worldHistory)
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters)
  const lord = useGameStore((state) => state.gameState.lord)
  const characterTurnContext = useGameStore((state) => state.characterTurnContext)
  const currentYear = useGameStore((state) => state.gameState.currentYear)
  const currentMonth = useGameStore((state) => state.gameState.currentMonth)
  const currentDay = useGameStore((state) => state.gameState.currentDay)
  const pendingRoutePlan = pendingTravelCommand && 'routePlan' in pendingTravelCommand
    ? pendingTravelCommand.routePlan ?? null
    : null
  const displayedRoute = routePreview ?? pendingRoutePlan ?? activeJourney?.routePlan ?? null
  const politicalStates = useMemo(() => politicalSource
    ? projectPoliticalState(
      politicalSource.titles,
      politicalSource.characters,
      worldHistory,
      { year: currentYear, month: currentMonth, day: currentDay },
    )
    : [], [currentDay, currentMonth, currentYear, politicalSource, worldHistory])
  const discoveredCharacterIds = useMemo(
    () => knownCharacterIds(characterTurnContext?.characters, worldHistory),
    [characterTurnContext?.characters, worldHistory],
  )
  const discoveredCharacterKey = discoveredCharacterIds.join('|')
  const characterNames = useMemo(() => new Map<string, string>([
    ...(politicalSource?.characters.map((character) => [character.id, character.name] as const) ?? []),
    ...dynamicCharacterNames.entries(),
    ...(lord.canonicalCharacterId ? [[lord.canonicalCharacterId, lord.name] as const] : []),
  ]), [dynamicCharacterNames, lord.canonicalCharacterId, lord.name, politicalSource])
  const playerCharacterId = (lord.canonicalCharacterId
    ?? `save:${worldCharacters?.runId ?? 'current'}:player`) as CharacterId
  const characterPoints = useMemo(() => projectKnownCharacterMapPoints({
    player: { id: playerCharacterId, name: lord.name, locationId: lord.location.locationId },
    characters: characterTurnContext?.characters,
    history: worldHistory,
    names: characterNames,
  }, mapLocations), [characterNames, characterTurnContext?.characters, lord.location.locationId, lord.name, mapLocations, playerCharacterId, worldHistory])
  const assetPoints = useMemo(
    () => projectKnownAssetMapPoints(lord.items, mapLocations),
    [lord.items, mapLocations],
  )

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    setLoadError(false)
    setWarning(null)
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

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    politicalCharacterRepository.getSearchHits(discoveredCharacterIds)
      .then((hits) => {
        if (!cancelled) setDynamicCharacterNames(new Map(hits.map((hit) => [hit.id, hit.name])))
      })
      .catch(() => {
        if (!cancelled) setDynamicCharacterNames(new Map())
      })
    return () => { cancelled = true }
  }, [activeDrawer, discoveredCharacterKey])

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    mapRepository.loadSearchIndex()
      .then((locations) => {
        if (!cancelled) setMapLocations(locations)
      })
      .catch(() => {
        if (!cancelled) {
          setMapLocations([])
          setWarning('地点索引未能载入，人物与资产位置暂时不可用')
        }
      })
    return () => { cancelled = true }
  }, [activeDrawer, reloadKey])

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    Promise.all([
      mapRepository.loadPoliticalTitles(),
      politicalCharacterRepository.loadTitleHolderSummaries(),
    ])
      .then(([titles, characters]) => {
        if (!cancelled) {
          setPoliticalSource({ titles, characters })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoliticalSource(null)
          setWarning('政治归属资料未能载入，地形与旅行功能仍可使用')
        }
      })
    return () => { cancelled = true }
  }, [activeDrawer, reloadKey])

  const retry = useCallback(() => {
    mapRepository.clear('/data/agot-map/manifest.json')
    setReloadKey((value) => value + 1)
  }, [])
  const retryCanvas = useCallback(() => setCanvasRetryKey((value) => value + 1), [])

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
            <MapErrorBoundary resetKey={`${reloadKey}:${canvasRetryKey}`} onRetry={retryCanvas}>
              <MapCanvas
                key={canvasRetryKey}
                manifest={manifest}
                selectedLocationId={selectedLocationId}
                initialViewport={lastViewport}
                onSelectLocation={selectLocation}
                onSelectCharacter={onSelectCharacter}
                onViewportChange={rememberViewport}
                onWarning={setWarning}
                mode={mapMode}
                routePlan={displayedRoute}
                journey={activeJourney?.routePlan.id === displayedRoute?.id ? activeJourney : undefined}
                politicalStates={politicalStates}
                characterPoints={characterPoints}
                assetPoints={assetPoints}
              />
            </MapErrorBoundary>
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
          {manifest && !loadError && ((mapMode === 'characters' && characterPoints.length === 0)
            || (mapMode === 'assets' && assetPoints.length === 0)) && (
            <div className="map-mode-empty" role="status">
              {mapMode === 'characters' ? '当前没有可显示的已知人物位置' : '当前没有可显示的据点或运输工具'}
            </div>
          )}
          {manifest && !loadError && selectedLocationId && (
            <LocationDetails
              locationId={selectedLocationId}
              routeOriginId={routeOriginId}
              season={currentSeason}
              knownCharacters={characterPoints.filter((point) => point.locationId === selectedLocationId)}
              knownAssets={assetPoints.filter((point) => point.locationId === selectedLocationId)}
              politicalState={politicalStates.find((state) => state.titleId === selectedLocationId)}
              onSelectCharacter={onSelectCharacter}
              onClose={() => selectLocation(null)}
            />
          )}
          {manifest && !loadError && activeJourney && activeJourney.status !== 'arrived' && activeJourney.status !== 'planned' && (
            <JourneyPanel
              journey={activeJourney}
              season={currentSeason}
              hasLocationDetails={Boolean(selectedLocationId)}
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
