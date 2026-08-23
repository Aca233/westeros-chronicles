import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Map as MapIcon, RotateCcw, X } from 'lucide-react'

import { MapCanvas, prewarmMapRuntime } from './MapCanvas'
import { MapErrorBoundary } from './MapErrorBoundary'
import { LocationSearch } from './LocationSearch'
import { buildCountyInteractionIndex } from './countyInteraction'
import { mapPixelToLngLat } from './coordinates'
import { DEFAULT_MAP_OVERLAYS, type MapFocusTarget } from './mapInteraction'
import type { MapFocusRequest, MapViewport } from './mapUiStore'
import { mapRepository } from './repository'
import type { MapLocationSearchEntry, MapManifest, SemanticMembershipIndex } from './types'

interface MapLocationPickerProps {
  initialLocationId: string | null
  onConfirm: (entry: MapLocationSearchEntry) => void
  onClose: () => void
}

interface PickerSelection { countyId: string | null; locationId: string | null }

const EMPTY_SELECTION: PickerSelection = { countyId: null, locationId: null }

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({ initialLocationId, onConfirm, onClose }) => {
  const [manifest, setManifest] = useState<MapManifest | null>(null)
  const [mapLocations, setMapLocations] = useState<MapLocationSearchEntry[]>([])
  const [semanticIndex, setSemanticIndex] = useState<SemanticMembershipIndex | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selection, setSelection] = useState<PickerSelection>(EMPTY_SELECTION)
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null)
  const focusSequence = useRef(0)
  const handledFocusRequest = useRef(0)
  const bootstrapApplied = useRef(false)

  useEffect(() => {
    prewarmMapRuntime()
    let cancelled = false
    setLoadError(false); setWarning(null); setSelection(EMPTY_SELECTION); setFocusRequest(null)
    handledFocusRequest.current = 0
    bootstrapApplied.current = false
    Promise.all([mapRepository.loadManifest(), mapRepository.loadSearchIndex(), mapRepository.loadSemanticIndex()])
      .then(([loadedManifest, locations, semantic]) => {
        if (cancelled) return
        setManifest(loadedManifest); setMapLocations(locations); setSemanticIndex(semantic)
      })
      .catch(() => {
        if (!cancelled) { setManifest(null); setMapLocations([]); setSemanticIndex(null); setLoadError(true) }
      })
    return () => { cancelled = true }
  }, [reloadKey])

  // 打开时若已有锚点，飞到该地点并选中其伯爵领
  useEffect(() => {
    if (!manifest || mapLocations.length === 0 || !semanticIndex || bootstrapApplied.current) return
    bootstrapApplied.current = true
    if (!initialLocationId || !semanticIndex.byLocationId.get(initialLocationId)?.countyId) return
    focusSequence.current += 1
    setFocusRequest({ id: focusSequence.current, target: { kind: 'location', locationId: initialLocationId } })
  }, [initialLocationId, manifest, mapLocations.length, semanticIndex])

  const countyInteraction = useMemo(
    () => mapLocations.length > 0 && semanticIndex ? buildCountyInteractionIndex(mapLocations, semanticIndex) : null,
    [mapLocations, semanticIndex],
  )

  // 搜索定位与初始定位共用：飞行之外还要同步选中状态
  useEffect(() => {
    if (!focusRequest || focusRequest.id === handledFocusRequest.current || !semanticIndex || !countyInteraction) return
    handledFocusRequest.current = focusRequest.id
    const target = focusRequest.target
    if (target.kind === 'county') {
      if (!countyInteraction.locationsForCounty(target.countyId)) { setWarning('伯爵领资料未记录'); return }
      setSelection({ countyId: target.countyId, locationId: null }); setWarning(null); return
    }
    const membership = semanticIndex.byLocationId.get(target.locationId)
    if (!membership?.countyId) { setWarning('该地点缺少伯爵领归属资料'); return }
    setSelection({ countyId: membership.countyId, locationId: target.locationId }); setWarning(null)
  }, [countyInteraction, focusRequest, semanticIndex])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSelectCounty = useCallback((countyId: string | null) => {
    setSelection(countyId ? { countyId, locationId: null } : EMPTY_SELECTION)
  }, [])
  const handleSelectLocation = useCallback((countyId: string, locationId: string) => {
    setSelection({ countyId, locationId })
  }, [])
  const noop = useCallback(() => {}, [])

  const retry = useCallback(() => {
    mapRepository.clear()
    setManifest(null); setLoadError(false); setWarning(null); setReloadKey((value) => value + 1)
  }, [])

  const handleSearchTarget = useCallback((target: MapFocusTarget) => {
    focusSequence.current += 1
    setFocusRequest({ id: focusSequence.current, target })
  }, [])

  const pickedEntry = selection.locationId
    ? mapLocations.find((entry) => entry.id === selection.locationId) ?? null
    : null

  const initialViewport = useMemo((): MapViewport | null => {
    if (!manifest) return null
    const bounds = manifest.westerosBounds
    const [longitude, latitude] = mapPixelToLngLat({
      mapX: (bounds.minX + bounds.maxX) / 2,
      mapY: (bounds.minY + bounds.maxY) / 2,
    }, manifest)
    // 缩放 0 让整张地图（维斯特洛+厄斯索斯）尽收眼底；bounds 中心现在落在两大陆之间的海面，
    // 仅以其中一块大陆为默认取景反而遮蔽另一块。
    return { longitude, latitude, zoom: 0 }
  }, [manifest])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink" role="dialog" aria-modal="true" aria-label="在地图上选择开局地点">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline/70 bg-ink-2 px-4 select-none">
        <div className="flex min-w-0 items-center gap-2.5">
          <MapIcon className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <div className="min-w-0">
            <div className="eyebrow truncate">地图选点</div>
            <div className="mt-0.5 truncate text-[10px] text-parchment-faint">点击伯爵领展开辖内地点，再点击地点作为开局锚点</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost !px-1.5" aria-label="关闭地图选点"><X className="h-4 w-4" /></button>
      </header>
      <div className="relative min-h-0 flex-1 bg-[#101611]">
        {manifest && !loadError ? (
          <MapErrorBoundary resetKey={reloadKey} onRetry={retry}>
            <MapCanvas
              key={reloadKey}
              manifest={manifest}
              selectedCountyId={selection.countyId}
              selectedLocationId={selection.locationId}
              initialViewport={initialViewport}
              focusRequest={focusRequest}
              onSelectCounty={handleSelectCounty}
              onSelectLocation={handleSelectLocation}
              onSelectCharacter={noop}
              onViewportChange={noop}
              onWarning={setWarning}
              onTerrainAvailabilityChange={noop}
              overlays={DEFAULT_MAP_OVERLAYS}
              interactionState="browse"
              onChooseTravelDestination={noop}
              topDownLocked
              northResetRequestId={0}
            />
          </MapErrorBoundary>
        ) : loadError ? (
          <div className="map-load-state" role="alert">
            <MapIcon className="h-8 w-8 text-gold" aria-hidden="true" />
            <strong>地图资料未能载入</strong>
            <span>可改用搜索框选择地点。</span>
            <button type="button" className="btn-ghost map-retry-button" onClick={retry}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />重新载入地图</button>
          </div>
        ) : (
          <div className="map-load-state" aria-live="polite">
            <span className="map-loading-mark" aria-hidden="true" />
            <strong>正在展开地图</strong>
            <span>读取本地地形与伯爵领索引</span>
          </div>
        )}

        {manifest && !loadError && (
          <div className="map-toolbar">
            <LocationSearch onSelect={handleSearchTarget} />
          </div>
        )}

        {pickedEntry && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 border-t border-hairline bg-ink-2/95 px-4 py-3 backdrop-blur-sm">
            <Check className="h-4 w-4 shrink-0 text-gold-bright" aria-hidden="true" />
            <span className="min-w-0 truncate font-serif text-xs text-parchment">已选定：<strong className="text-gold-bright">{pickedEntry.name}</strong></span>
            <button type="button" onClick={onClose} className="btn-ghost shrink-0">取消</button>
            <button type="button" onClick={() => onConfirm(pickedEntry)} className="btn-decree shrink-0 !px-4 !py-1.5 !text-[11px]">定为开局地点</button>
          </div>
        )}
        {warning && manifest && <div className="map-warning" role="status">{warning}</div>}
      </div>
    </div>
  )
}
