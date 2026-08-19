import React from 'react'
import { Boxes, Compass, Layers3, Mountain, Route, Shield, Users } from 'lucide-react'

import { LocationSearch } from './LocationSearch'
import type { MapMode } from './mapLayers'

interface MapToolbarProps {
  mode: MapMode
  topDownLocked: boolean
  terrainAvailable: boolean
  onModeChange: (mode: MapMode) => void
  onSelectLocation: (id: string) => void
  onToggleTopDown: () => void
  onResetNorth: () => void
}

const MODES: Array<{ id: MapMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'terrain', label: '地形', icon: Mountain },
  { id: 'political', label: '政治', icon: Shield },
  { id: 'characters', label: '人物', icon: Users },
  { id: 'travel', label: '旅行', icon: Route },
  { id: 'assets', label: '资产', icon: Boxes },
]

export const MapToolbar: React.FC<MapToolbarProps> = ({
  mode,
  topDownLocked,
  terrainAvailable,
  onModeChange,
  onSelectLocation,
  onToggleTopDown,
  onResetNorth,
}) => (
  <div className="map-toolbar">
    <LocationSearch onSelect={onSelectLocation} />
    <div className="map-toolbar-actions">
      <div className="map-mode-tabs" role="tablist" aria-label="地图模式">
        {MODES.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              data-active={mode === item.id}
              onClick={() => onModeChange(item.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
      <div className="map-camera-controls" aria-label="地图视角">
        <button
          type="button"
          aria-pressed={topDownLocked}
          disabled={!terrainAvailable}
          onClick={onToggleTopDown}
          title={terrainAvailable ? '锁定俯视' : '当前设备使用二维地图'}
        >
          <Layers3 className="h-3.5 w-3.5" />
          <span>俯视</span>
        </button>
        <button type="button" onClick={onResetNorth} aria-label="地图归北" title="归北">
          <Compass className="h-3.5 w-3.5" />
          <span>归北</span>
        </button>
      </div>
    </div>
  </div>
)
