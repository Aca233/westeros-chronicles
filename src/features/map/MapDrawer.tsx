import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapIcon, RotateCcw, X } from 'lucide-react'

import { MapCanvas, prewarmMapRuntime } from './MapCanvas'
import { MapErrorBoundary } from './MapErrorBoundary'
import { CountyDetails } from './CountyDetails'
import { LocationDetails } from './LocationDetails'
import { JourneyPanel } from './JourneyPanel'
import { MapToolbar } from './MapToolbar'
import { TravelPlanner } from './TravelPlanner'
import { useMapUiStore } from './mapUiStore'
import { mapRepository } from './repository'
import { needsCharacterNameData, needsPoliticalData } from './mapDataDemand.ts'
import type { MapManifest, MapLocationSearchEntry, SemanticMembershipIndex } from './types'
import { useGameStore } from '../../store/useGameStore'
import { StaticCharacterRepository } from '../characters/staticCharacterRepository'
import type { CharacterTitleHolderSummary, CharacterId } from '../characters/types'
import { pendingTravelTransactionFor } from '../world/worldTransactionQueue'
import { playerWorldEventViewer } from '../world/worldEventVisibility'
import {
  knownCharacterIds,
  projectKnownAssetMapPoints,
  projectKnownCharacterMapPoints,
  scopeMapSubjects,
} from './dynamicMapSubjects.ts'
import { attachPoliticalRealms, projectPoliticalState, type StaticPoliticalTitle } from './politicalProjection.ts'
import { worldContentRepository } from '../world-content/repository'
import { buildWorldAssetBaseline, createWorldBaselineSnapshot } from '../world/worldBaseline'
import { selectCountyWorldView } from '../world/worldSelectors'
import { buildCountyInteractionIndex } from './countyInteraction.ts'
import { buildCountyViewModel } from './countyViewModel.ts'
import type { MapFocusTarget } from './mapInteraction.ts'

const politicalCharacterRepository = new StaticCharacterRepository()
export { prewarmMapRuntime }

interface MapDrawerProps { onSelectCharacter: (characterId: CharacterId) => void }

export const MapDrawer: React.FC<MapDrawerProps> = ({ onSelectCharacter }) => {
  const activeDrawer = useMapUiStore((state) => state.activeDrawer)
  const selection = useMapUiStore((state) => state.selection)
  const overlays = useMapUiStore((state) => state.overlays)
  const interactionState = useMapUiStore((state) => state.interactionState)
  const focusRequest = useMapUiStore((state) => state.focusRequest)
  const lastViewport = useMapUiStore((state) => state.lastViewport)
  const topDownLocked = useMapUiStore((state) => state.topDownLocked)
  const northResetRequestId = useMapUiStore((state) => state.northResetRequestId)
  const routePreview = useMapUiStore((state) => state.routePreview)
  const travelTargetLocationId = useMapUiStore((state) => state.travelTargetLocationId)
  const travelPickOriginLocationId = useMapUiStore((state) => state.travelPickOriginLocationId)
  const openMap = useMapUiStore((state) => state.openMap)
  const openAsset = useMapUiStore((state) => state.openAsset)
  const closeDrawer = useMapUiStore((state) => state.closeDrawer)
  const selectCounty = useMapUiStore((state) => state.selectCounty)
  const selectLocation = useMapUiStore((state) => state.selectLocation)
  const clearLocation = useMapUiStore((state) => state.clearLocation)
  const clearSelection = useMapUiStore((state) => state.clearSelection)
  const rememberViewport = useMapUiStore((state) => state.rememberViewport)
  const setOverlay = useMapUiStore((state) => state.setOverlay)
  const toggleTopDown = useMapUiStore((state) => state.toggleTopDown)
  const requestNorthReset = useMapUiStore((state) => state.requestNorthReset)
  const beginTravelPlanning = useMapUiStore((state) => state.beginTravelPlanning)
  const beginDestinationPick = useMapUiStore((state) => state.beginDestinationPick)
  const chooseTravelDestination = useMapUiStore((state) => state.chooseTravelDestination)
  const cancelDestinationPick = useMapUiStore((state) => state.cancelDestinationPick)
  const closeTravelPlanning = useMapUiStore((state) => state.closeTravelPlanning)

  const [manifest, setManifest] = useState<MapManifest | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [terrainAvailable, setTerrainAvailable] = useState(true)
  const [mapLocations, setMapLocations] = useState<MapLocationSearchEntry[]>([])
  const [semanticIndex, setSemanticIndex] = useState<SemanticMembershipIndex | null>(null)
  const [dynamicCharacterNames, setDynamicCharacterNames] = useState<Map<string, string>>(new Map())
  const [politicalSource, setPoliticalSource] = useState<{
    titles: StaticPoliticalTitle[]
    characters: CharacterTitleHolderSummary[]
  } | null>(null)
  const handledFocusRequest = useRef(0)

  const routeOriginId = useGameStore((state) => state.gameState.lord.location.locationId)
  const currentSeason = useGameStore((state) => state.gameState.currentSeason)
  const activeJourney = useGameStore((state) => state.gameState.activeJourney)
  const worldRuntime = useGameStore((state) => state.gameState.worldRuntime)
  const worldHistory = useGameStore((state) => state.gameState.worldHistory)
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters)
  const worldArtifacts = useGameStore((state) => state.gameState.worldArtifacts)
  const lord = useGameStore((state) => state.gameState.lord)
  const characterTurnContext = useGameStore((state) => state.characterTurnContext)
  const currentYear = useGameStore((state) => state.gameState.currentYear)
  const currentMonth = useGameStore((state) => state.gameState.currentMonth)
  const currentDay = useGameStore((state) => state.gameState.currentDay)
  const debugEnabled = useGameStore((state) => state.debugEnabled)

  const needsCharacters = needsCharacterNameData({
    selectedCountyId: selection.countyId,
    charactersVisible: overlays.characters,
  }) || selection.countyId !== null
  const needsPolitics = needsPoliticalData({
    politicalVisible: overlays.political,
    selectedCountyId: selection.countyId,
  })
  const playerCharacterId = (lord.canonicalCharacterId
    ?? `save:${worldCharacters?.runId ?? 'current'}:player`) as CharacterId
  const pendingTravelCommand = pendingTravelTransactionFor(worldRuntime.pendingTransactions, playerCharacterId)?.travelCommands?.[0] ?? null
  const pendingRoutePlan = pendingTravelCommand && 'routePlan' in pendingTravelCommand ? pendingTravelCommand.routePlan ?? null : null
  const displayedRoute = routePreview ?? pendingRoutePlan ?? activeJourney?.routePlan ?? null

  const politicalStates = useMemo(() => politicalSource && needsPolitics
    ? projectPoliticalState(
      politicalSource.titles,
      politicalSource.characters,
      worldHistory,
      { year: currentYear, month: currentMonth, day: currentDay },
      worldRuntime.events,
      worldRuntime.titles,
      debugEnabled ? { kind: 'system' } : playerWorldEventViewer({ lord, worldCharacters }),
    ) : [], [currentDay, currentMonth, currentYear, debugEnabled, lord.canonicalCharacterId, needsPolitics, politicalSource, worldCharacters?.runId, worldHistory, worldRuntime.events, worldRuntime.titles])

  const discoveredCharacterIds = useMemo(
    () => needsCharacters ? knownCharacterIds(characterTurnContext?.characters, worldHistory) : [],
    [characterTurnContext?.characters, needsCharacters, worldHistory],
  )
  const discoveredCharacterKey = discoveredCharacterIds.join('|')
  const characterNames = useMemo(() => new Map<string, string>([
    ...(politicalSource?.characters.map((character) => [character.id, character.name] as const) ?? []),
    ...dynamicCharacterNames.entries(),
    ...(lord.canonicalCharacterId ? [[lord.canonicalCharacterId, lord.name] as const] : []),
  ]), [dynamicCharacterNames, lord.canonicalCharacterId, lord.name, politicalSource])

  const allCharacterPoints = useMemo(() => needsCharacters ? projectKnownCharacterMapPoints({
    player: { id: playerCharacterId, name: lord.name, locationId: lord.location.locationId },
    characters: characterTurnContext?.characters,
    history: worldHistory,
    names: characterNames,
  }, mapLocations) : [], [characterNames, characterTurnContext?.characters, lord.location.locationId, lord.name, mapLocations, needsCharacters, playerCharacterId, worldHistory])
  const allAssetPoints = useMemo(() => projectKnownAssetMapPoints(lord.items, mapLocations), [lord.items, mapLocations])
  const countyIdByLocationId = useMemo(() => new Map(
    semanticIndex?.memberships.flatMap((entry) => entry.countyId ? [[entry.locationId, entry.countyId] as const] : []) ?? [],
  ), [semanticIndex])
  const scopedSubjects = useMemo(() => scopeMapSubjects({
    countyId: selection.countyId,
    countyIdByLocationId,
    characters: allCharacterPoints,
    assets: allAssetPoints,
  }), [allAssetPoints, allCharacterPoints, countyIdByLocationId, selection.countyId])

  // 地图标记始终显示全量已知人物/据点，不受伯爵领选择限制
  const mapSubjectPoints = useMemo(() => ({
    characters: allCharacterPoints,
    assets: allAssetPoints,
    characterPoints: allCharacterPoints.slice(0, 8),
    assetPoints: allAssetPoints.slice(0, 6),
  }), [allCharacterPoints, allAssetPoints])

  const countyInteraction = useMemo(() => semanticIndex
    ? buildCountyInteractionIndex(mapLocations, semanticIndex)
    : null, [mapLocations, semanticIndex])
  const selectedCounty = selection.countyId ? countyInteraction?.locationsForCounty(selection.countyId) : undefined
  const selectedPoliticalState = useMemo(() => {
    if (!selection.countyId || !semanticIndex) return undefined
    const baronyIds = new Set(semanticIndex.memberships
      .filter((entry) => entry.countyId === selection.countyId)
      .map((entry) => entry.baronyId))
    return politicalStates.find((state) => baronyIds.has(state.titleId))
  }, [politicalStates, selection.countyId, semanticIndex])
  const countyView = useMemo(() => selection.countyId && selectedCounty && semanticIndex
    ? buildCountyViewModel({
      countyId: selection.countyId,
      titles: semanticIndex.titles,
      selectedCounty,
      characters: scopedSubjects.characters,
      assets: scopedSubjects.assets,
      politicalState: selectedPoliticalState,
    }) : null, [scopedSubjects.assets, scopedSubjects.characters, selectedCounty, selectedPoliticalState, selection.countyId, semanticIndex])

  const countyWorldView = useMemo(() => {
    if (!selection.countyId || !semanticIndex) return undefined
    const characters = new Map<CharacterId, { id: CharacterId; alive: boolean; location: { locationId: string } | null }>(
      scopedSubjects.characters.map((point) => [point.characterId, { id: point.characterId, alive: true, location: { locationId: point.locationId } }]),
    )
    for (const characterId of [selectedPoliticalState?.holderId, selectedPoliticalState?.controllerId]) {
      if (characterId && !characters.has(characterId)) characters.set(characterId, { id: characterId, alive: true, location: null })
    }
    const assets = buildWorldAssetBaseline({ playerId: playerCharacterId, itemState: lord.items, worldArtifacts })
    const baseline = createWorldBaselineSnapshot({
      characters: [...characters.values()],
      titles: [{
        id: selection.countyId,
        lawfulHolderId: selectedPoliticalState?.countyHolderId ?? selectedPoliticalState?.holderId ?? null,
        controllerId: selectedPoliticalState?.controllerId ?? selectedPoliticalState?.countyHolderId ?? selectedPoliticalState?.holderId ?? null,
        contestedByIds: [...(selectedPoliticalState?.contestedByIds ?? [])],
      }],
      assets,
      knownLocationIds: mapLocations.map((entry) => entry.id),
    })
    return selectCountyWorldView(selection.countyId, {
      baseline,
      runtime: worldRuntime,
      countyIdByLocationId,
      candidateCharacterIds: new Set(scopedSubjects.characters.map((point) => point.characterId)),
    })
  }, [countyIdByLocationId, lord.items, mapLocations, playerCharacterId, scopedSubjects.characters, selectedPoliticalState, selection.countyId, semanticIndex, worldArtifacts, worldRuntime])
  const assetNames = useMemo(() => new Map(scopedSubjects.assets.map((point) => [point.assetId, point.name])), [scopedSubjects.assets])
  const travelPickOriginName = useMemo(() => travelPickOriginLocationId
    ? mapLocations.find((entry) => entry.id === travelPickOriginLocationId)?.name ?? null
    : null, [mapLocations, travelPickOriginLocationId])

  useEffect(() => {
    if (activeDrawer !== 'map') return
    setTerrainAvailable(true)
  }, [activeDrawer, reloadKey])

  useEffect(() => {
    if (activeDrawer !== 'map') return
    let cancelled = false
    setLoadError(false); setWarning(null); setTerrainAvailable(true)
    Promise.all([mapRepository.loadManifest(), mapRepository.loadSearchIndex(), mapRepository.loadSemanticIndex()])
      .then(([loadedManifest, locations, semantic]) => {
        if (cancelled) return
        setManifest(loadedManifest); setMapLocations(locations); setSemanticIndex(semantic)
      })
      .catch(() => {
        if (!cancelled) { setManifest(null); setMapLocations([]); setSemanticIndex(null); setLoadError(true) }
      })
    return () => { cancelled = true }
  }, [activeDrawer, reloadKey])

  useEffect(() => {
    if (activeDrawer !== 'map' || !needsCharacters) return
    let cancelled = false
    politicalCharacterRepository.getSearchHits(discoveredCharacterIds)
      .then((hits) => { if (!cancelled) setDynamicCharacterNames(new Map(hits.map((hit) => [hit.id, hit.name]))) })
      .catch(() => { if (!cancelled) setDynamicCharacterNames(new Map()) })
    return () => { cancelled = true }
  }, [activeDrawer, discoveredCharacterKey, needsCharacters])

  useEffect(() => {
    if (activeDrawer !== 'map' || !needsPolitics) return
    let cancelled = false
    Promise.all([
      mapRepository.loadPoliticalTitles(),
      mapRepository.loadSemanticMembership(),
      politicalCharacterRepository.loadTitleHolderSummaries(),
      worldContentRepository.loadHolderSummaries().catch(() => []),
    ]).then(([titles, memberships, characters, holderSummaries]) => {
      // Full records win; background holders fall back to lightweight summaries
      // so pruned counties keep a readable ruler name.
      const summaryCharacters = holderSummaries.map((summary) => ({
        id: summary.id,
        name: summary.name,
        dynastyId: summary.dynastyId ?? undefined,
        alive: summary.alive,
        titleIds: [...summary.titleIds],
      })).filter((summary) => !characters.some((character) => character.id === summary.id));
      if (!cancelled) setPoliticalSource({ titles: attachPoliticalRealms(titles, memberships), characters: [...characters, ...summaryCharacters] })
    }).catch(() => {
      if (!cancelled) { setPoliticalSource(null); setWarning('政治归属资料未能载入，其他地图内容仍可使用') }
    })
    return () => { cancelled = true }
  }, [activeDrawer, needsPolitics, reloadKey])

  useEffect(() => {
    if (!focusRequest || focusRequest.id === handledFocusRequest.current || !semanticIndex || !countyInteraction) return
    handledFocusRequest.current = focusRequest.id
    const target = focusRequest.target
    if (target.kind === 'county') {
      if (!countyInteraction.locationsForCounty(target.countyId)) {
        clearSelection(); setWarning('伯爵领资料未记录'); return
      }
      selectCounty(target.countyId); setWarning(null); return
    }
    const membership = semanticIndex.byLocationId.get(target.locationId)
    if (!membership?.countyId) {
      clearSelection(); setWarning('伯爵领资料未记录'); return
    }
    selectLocation(membership.countyId, target.locationId)
    setWarning(null)
  }, [clearSelection, countyInteraction, focusRequest, selectCounty, selectLocation, semanticIndex])

  const retryMap = useCallback(() => {
    mapRepository.clear(); setManifest(null); setLoadError(false); setWarning(null); setReloadKey((value) => value + 1)
  }, [])
  const handleSearchTarget = useCallback((target: MapFocusTarget) => openMap(target), [openMap])

  if (activeDrawer !== 'map') return null
  return <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="维斯特洛地图">
    <button type="button" className="modal-backdrop absolute inset-0 w-full cursor-default" aria-label="收起维斯特洛地图" onClick={closeDrawer} />
    <section className="map-drawer-panel absolute left-0 top-0 flex h-full flex-col border-r border-hairline-bright bg-ink shadow-[32px_0_80px_rgba(0,0,0,0.45)]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline/70 px-4 select-none">
        <div className="flex min-w-0 items-center gap-2.5"><MapIcon className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" /><div className="min-w-0"><div className="eyebrow truncate">维斯特洛地图</div><div className="mt-0.5 truncate text-[10px] text-parchment-faint">伯爵领、地点与旅程</div></div></div>
        <button type="button" onClick={closeDrawer} className="btn-ghost !px-1.5" aria-label="收起维斯特洛地图"><X className="h-4 w-4" /></button>
      </header>
      <div className="relative min-h-0 flex-1 bg-[#101611]">
        {manifest && !loadError ? <MapErrorBoundary resetKey={reloadKey} onRetry={retryMap}>
          <MapCanvas
            key={reloadKey}
            manifest={manifest}
            selectedCountyId={selection.countyId}
            selectedLocationId={selection.locationId}
            initialViewport={lastViewport}
            focusRequest={focusRequest}
            onSelectCounty={selectCounty}
            onSelectLocation={selectLocation}
            onSelectCharacter={onSelectCharacter}
            onViewportChange={rememberViewport}
            onWarning={setWarning}
            onTerrainAvailabilityChange={setTerrainAvailable}
            overlays={overlays}
            interactionState={interactionState}
            onChooseTravelDestination={chooseTravelDestination}
            topDownLocked={topDownLocked}
            northResetRequestId={northResetRequestId}
            routePlan={displayedRoute}
            journey={activeJourney?.routePlan.id === displayedRoute?.id ? activeJourney : undefined}
            politicalStates={politicalStates}
            characterPoints={mapSubjectPoints.characters}
            assetPoints={mapSubjectPoints.assets}
            characterMarkers={mapSubjectPoints.characterPoints}
            assetMarkers={mapSubjectPoints.assetPoints}
          />
        </MapErrorBoundary> : loadError ? <div className="map-load-state" role="alert"><MapIcon className="h-8 w-8 text-gold" aria-hidden="true" /><strong>地图资料未能载入</strong><span>正文与人物卷宗仍可正常使用。</span><button type="button" className="btn-ghost map-retry-button" onClick={retryMap}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />重新载入地图</button></div>
          : <div className="map-load-state" aria-live="polite"><span className="map-loading-mark" aria-hidden="true" /><strong>正在展开地图</strong><span>读取本地地形与伯爵领索引</span></div>}
        {manifest && !loadError && <MapToolbar overlays={overlays} topDownLocked={topDownLocked} terrainAvailable={terrainAvailable} onOverlayChange={setOverlay} onSelectTarget={handleSearchTarget} onToggleTopDown={toggleTopDown} onResetNorth={requestNorthReset} />}

        {interactionState === 'pick-travel-destination' && <div className="map-destination-pick-notice" role="status">
          <span>正在选择目的地{travelPickOriginName ? `，原目标为${travelPickOriginName}` : ''}</span>
          <button type="button" onClick={cancelDestinationPick}>取消选择</button>
        </div>}

        {selection.locationId ? <LocationDetails
          locationId={selection.locationId}
          knownCharacters={scopedSubjects.characters.filter((point) => point.locationId === selection.locationId)}
          knownAssets={scopedSubjects.assets.filter((point) => point.locationId === selection.locationId)}
          politicalState={selectedPoliticalState}
          semanticMembership={semanticIndex?.byLocationId.get(selection.locationId)}
          semanticTitles={semanticIndex?.titles ?? []}
          onSelectCharacter={onSelectCharacter}
          onOpenAsset={(assetId) => openAsset(assetId, null)}
          onBackToCounty={clearLocation}
          onPlanTravel={beginTravelPlanning}
          onClose={clearLocation}
        /> : selection.countyId && countyView ? <CountyDetails
          view={countyView}
          worldView={countyWorldView}
          characterNames={characterNames}
          assetNames={assetNames}
          onSelectLocation={selectLocation}
          onSelectCharacter={onSelectCharacter}
          onOpenAsset={(assetId) => openAsset(assetId, null)}
          onPlanTravel={beginTravelPlanning}
          onClose={clearSelection}
        /> : null}

        {travelTargetLocationId && <div className="map-travel-planner-shell">
          <div className="map-travel-planner-actions">
            <button type="button" onClick={beginDestinationPick}>在地图上选择</button>
            <button type="button" onClick={closeTravelPlanning}>关闭规划</button>
          </div>
          <TravelPlanner destinationId={travelTargetLocationId} originId={routeOriginId} season={currentSeason} />
        </div>}

        {activeJourney && activeJourney.status !== 'arrived' && activeJourney.status !== 'planned' && <JourneyPanel journey={activeJourney} season={currentSeason} hasLocationDetails={Boolean(selection.countyId || travelTargetLocationId)} />}
        {warning && manifest && <div className="map-warning" role="status">{warning}</div>}
      </div>
    </section>
  </div>
}
