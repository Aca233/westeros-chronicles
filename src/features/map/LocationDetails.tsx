import React, { useEffect, useMemo, useState } from 'react'
import {
  Castle,
  Clock3,
  Landmark,
  MapPin,
  Navigation,
  Route,
  Ship,
  Waves,
  X,
} from 'lucide-react'

import { buildLocationView, type LocationViewModel } from './locationViewModel'
import { mapRepository } from './repository'
import type { MapLocation, MapLocationType } from './types'

interface LocationDetailsProps {
  locationId: string
  onClose: () => void
}

const TAG_LABELS: Record<string, string> = {
  capital: '首府',
  major: '重要地点',
  wall: '长城据点',
  island: '岛屿',
  stark: '史塔克',
  targaryen: '坦格利安',
  lannister: '兰尼斯特',
  martell: '马泰尔',
  greyjoy: '葛雷乔伊',
}

function TypeIcon({ type }: { type: MapLocationType }) {
  const className = 'h-5 w-5'
  if (type === 'castle') return <Castle className={className} />
  if (type === 'port') return <Ship className={className} />
  if (type === 'landmark' || type === 'ruin') return <Landmark className={className} />
  return <MapPin className={className} />
}

export const LocationDetails: React.FC<LocationDetailsProps> = ({ locationId, onClose }) => {
  const [location, setLocation] = useState<MapLocation | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLocation(null)
    setFailed(false)
    mapRepository.getLocation(locationId)
      .then((value) => {
        if (!cancelled) setLocation(value)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [locationId])

  const view = useMemo<LocationViewModel | null>(() => location ? buildLocationView(location) : null, [location])

  return (
    <aside className="map-location-details" aria-label="地点详情">
      <div className="map-details-handle" aria-hidden="true" />
      <button type="button" className="map-details-close" onClick={onClose} aria-label="关闭地点详情">
        <X className="h-4 w-4" />
      </button>
      {failed ? (
        <div className="map-details-state" role="alert">
          <MapPin className="h-6 w-6 text-gold" />
          <strong>地点资料未能载入</strong>
          <span>地图仍可继续浏览，请重新选择地点。</span>
        </div>
      ) : !view ? (
        <div className="map-details-state" aria-live="polite">
          <span className="map-loading-mark" aria-hidden="true" />
          <span>正在读取地点资料</span>
        </div>
      ) : (
        <div className="map-details-scroll">
          <header className="map-details-heading">
            <span className="map-details-type-icon"><TypeIcon type={view.type} /></span>
            <div>
              <p>{view.typeLabel} · {view.regionLabel}</p>
              <h2>{view.name}</h2>
              {view.englishName && <small>{view.englishName}</small>}
            </div>
          </header>

          {view.description && <p className="map-location-description">{view.description}</p>}

          <div className="map-fact-chips">
            <span><Landmark className="h-3.5 w-3.5" />{view.terrainLabel}</span>
            {view.access.coastal && <span><Waves className="h-3.5 w-3.5" />沿海</span>}
            {view.access.port && <span><Ship className="h-3.5 w-3.5" />可通航港口</span>}
            {view.tags.map((tag) => <span key={tag}>{TAG_LABELS[tag] ?? tag}</span>)}
          </div>

          <section className="map-details-section">
            <h3>领地层级</h3>
            <div className="map-hierarchy-list">
              {view.hierarchy.map((entry) => (
                <div key={entry.id}>
                  <span>{entry.rankLabel}</span>
                  <strong>{entry.label}</strong>
                  <small>{entry.id}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="map-details-section">
            <h3>通行资料</h3>
            <div className="map-access-list">
              <p><Navigation className="h-3.5 w-3.5" />道路网络可在“旅行”模式查看</p>
              <p><Ship className="h-3.5 w-3.5" />{view.access.port ? '可由海路抵达' : '没有登记为港口'}</p>
            </div>
          </section>

          <section className="map-details-section map-projection-note">
            <h3>当地情报</h3>
            <p>人物、持有人、事件与资产只读取统一世界状态；当前尚未接入的数据不会在此伪造。</p>
          </section>

          <button type="button" className="map-route-button" disabled title="路线规划器将在下一批接入">
            <Route className="h-4 w-4" />
            <span>规划路线</span>
            <small><Clock3 className="h-3 w-3" />尚未接入</small>
          </button>
        </div>
      )}
    </aside>
  )
}
