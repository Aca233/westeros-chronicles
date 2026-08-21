import React from 'react'
import { Compass, Layers3 } from 'lucide-react'
import { LocationSearch } from './LocationSearch'
import { MapInformationMenu } from './MapInformationMenu'
import type { MapFocusTarget, MapOverlayPreferences } from './mapInteraction'

interface MapToolbarProps {
  overlays: MapOverlayPreferences
  topDownLocked: boolean
  terrainAvailable: boolean
  onOverlayChange: (key: keyof MapOverlayPreferences, enabled: boolean) => void
  onSelectTarget: (target: MapFocusTarget) => void
  onToggleTopDown: () => void
  onResetNorth: () => void
}

export const MapToolbar: React.FC<MapToolbarProps> = ({ overlays, topDownLocked, terrainAvailable, onOverlayChange, onSelectTarget, onToggleTopDown, onResetNorth }) => (
  <div className="map-toolbar">
    <LocationSearch onSelect={onSelectTarget} />
    <div className="map-toolbar-actions">
      <MapInformationMenu preferences={overlays} onChange={onOverlayChange} />
      <div className="map-camera-controls" aria-label="地图视角">
        <button type="button" aria-pressed={topDownLocked} disabled={!terrainAvailable} onClick={onToggleTopDown} title={terrainAvailable ? '锁定俯视' : '当前设备使用二维地图'}>
          <Layers3 className="h-3.5 w-3.5" /><span>俯视</span>
        </button>
        <button type="button" onClick={onResetNorth} aria-label="地图归北" title="归北">
          <Compass className="h-3.5 w-3.5" /><span>归北</span>
        </button>
      </div>
    </div>
  </div>
)
