import React from 'react'
import { Boxes, Mountain, Route, Shield, Users } from 'lucide-react'

import { LocationSearch } from './LocationSearch'
import type { MapMode } from './mapLayers'

interface MapToolbarProps {
  mode: MapMode
  onModeChange: (mode: MapMode) => void
  onSelectLocation: (id: string) => void
}

const MODES: Array<{ id: MapMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'terrain', label: '地形', icon: Mountain },
  { id: 'political', label: '政治', icon: Shield },
  { id: 'characters', label: '人物', icon: Users },
  { id: 'travel', label: '旅行', icon: Route },
  { id: 'assets', label: '资产', icon: Boxes },
]

export const MapToolbar: React.FC<MapToolbarProps> = ({ mode, onModeChange, onSelectLocation }) => (
  <div className="map-toolbar">
    <LocationSearch onSelect={onSelectLocation} />
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
  </div>
)
