import React, { useEffect, useRef, useState } from 'react'
import { Boxes, Layers3, Route, Shield, Users, X } from 'lucide-react'
import type { MapOverlayPreferences } from './mapInteraction'

const ITEMS = [
  { key: 'characters', label: '已知人物', icon: Users },
  { key: 'assets', label: '据点与运输工具', icon: Boxes },
  { key: 'roads', label: '道路', icon: Route },
  { key: 'political', label: '政治归属', icon: Shield },
] as const

export const MapInformationMenu: React.FC<{
  preferences: MapOverlayPreferences
  onChange: (key: keyof MapOverlayPreferences, enabled: boolean) => void
}> = ({ preferences, onChange }) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return <div className="map-information-menu" ref={rootRef}>
    <button type="button" aria-expanded={open} aria-controls="map-information-popover" onClick={() => setOpen((value) => !value)}>
      <Layers3 className="h-3.5 w-3.5" /><span>地图信息</span>
    </button>
    {open && <div id="map-information-popover" className="map-information-popover" aria-label="地图信息图层">
      <header><strong>地图信息</strong><button type="button" onClick={() => setOpen(false)} aria-label="关闭地图信息"><X /></button></header>
      {ITEMS.map((item) => {
        const Icon = item.icon
        return <button
          key={item.key}
          type="button"
          aria-pressed={preferences[item.key]}
          onClick={() => onChange(item.key, !preferences[item.key])}
        >
          <Icon /><span>{item.label}</span><span className="map-overlay-state">{preferences[item.key] ? '显示' : '隐藏'}</span>
        </button>
      })}
      <small>人物与资产只显示当前伯爵领内的已知内容</small>
    </div>}
  </div>
}
