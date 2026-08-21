import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Castle, Landmark, MapPin, Navigation, Ship, UserRound, Waves, X, Boxes } from 'lucide-react'

import { buildLocationView, type LocationViewModel } from './locationViewModel'
import { mapRepository } from './repository'
import type { MapLocation, MapLocationType, SemanticMembership, SemanticTitle } from './types'
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type { CharacterId } from '../characters/types'

interface LocationDetailsProps {
  locationId: string
  knownCharacters: readonly MapCharacterPoint[]
  knownAssets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
  semanticMembership?: SemanticMembership
  semanticTitles: readonly SemanticTitle[]
  onSelectCharacter: (characterId: CharacterId) => void
  onOpenAsset: (assetId: string) => void
  onBackToCounty: () => void
  onPlanTravel: (destinationId: string) => void
  onClose: () => void
}

const TAG_LABELS: Record<string, string> = {
  capital: '首府', major: '重要地点', wall: '长城据点', island: '岛屿', stark: '史塔克',
  targaryen: '坦格利安', lannister: '兰尼斯特', martell: '马泰尔', greyjoy: '葛雷乔伊',
}

function TypeIcon({ type }: { type: MapLocationType }) {
  const className = 'h-5 w-5'
  if (type === 'castle') return <Castle className={className} />
  if (type === 'port') return <Ship className={className} />
  if (type === 'landmark' || type === 'ruin') return <Landmark className={className} />
  return <MapPin className={className} />
}

export const LocationDetails: React.FC<LocationDetailsProps> = ({
  locationId,
  knownCharacters,
  knownAssets,
  politicalState,
  semanticMembership,
  semanticTitles,
  onSelectCharacter,
  onOpenAsset,
  onBackToCounty,
  onPlanTravel,
  onClose,
}) => {
  const [location, setLocation] = useState<MapLocation | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLocation(null)
    setFailed(false)
    mapRepository.getLocation(locationId)
      .then((value) => { if (!cancelled) setLocation(value) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [locationId])

  const view = useMemo<LocationViewModel | null>(() => location ? buildLocationView(location, {
    ruler: politicalState?.holderId ? {
      id: politicalState.holderId,
      label: politicalState.holderName ?? politicalState.holderId,
      characterId: politicalState.holderId,
      knowledge: 'confirmed',
    } : undefined,
    characters: knownCharacters.map((character) => ({
      id: character.characterId, label: character.name, characterId: character.characterId, knowledge: character.knowledge,
    })),
    assets: knownAssets.map((asset) => ({
      id: asset.assetId, label: `${asset.name} · ${asset.itemCount} 件物品`, knowledge: asset.knowledge,
    })),
  }, {
    now: '未记录',
    ...(semanticMembership ? { semantic: { membership: semanticMembership, titles: semanticTitles } } : {}),
  }) : null, [knownAssets, knownCharacters, location, politicalState, semanticMembership, semanticTitles])

  return (
    <aside className="map-location-details" aria-label="地点详情">
      <div className="map-details-handle" aria-hidden="true" />
      <button type="button" className="map-detail-back" onClick={onBackToCounty}>
        <ArrowLeft className="h-4 w-4" /><span>返回伯爵领</span>
      </button>
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
          <span className="map-loading-mark" aria-hidden="true" /><span>正在读取地点资料</span>
        </div>
      ) : (
        <div className="map-details-scroll">
          <header className="map-details-heading">
            <span className="map-details-type-icon"><TypeIcon type={view.type} /></span>
            <div><p>{view.typeLabel} · {view.regionLabel}</p><h2>{view.name}</h2>{view.englishName && <small>{view.englishName}</small>}</div>
          </header>
          {view.description && <p className="map-location-description">{view.description}</p>}
          <div className="map-fact-chips">
            <span><Landmark className="h-3.5 w-3.5" />{view.terrainLabel}</span>
            {view.access.coastal && <span><Waves className="h-3.5 w-3.5" />沿海</span>}
            {view.access.port && <span><Ship className="h-3.5 w-3.5" />可通航港口</span>}
            {view.tags.map((tag) => <span key={tag}>{TAG_LABELS[tag] ?? tag}</span>)}
          </div>
          <button type="button" className="map-travel-action" onClick={() => onPlanTravel(locationId)}>
            <Navigation className="h-4 w-4" /><span>前往这里</span>
          </button>
          <section className="map-details-section">
            <h3>通行资料</h3>
            <div className="map-access-list">
              <p><Navigation className="h-3.5 w-3.5" />道路网络可在地图信息中显示</p>
              <p><Ship className="h-3.5 w-3.5" />{view.access.port ? '可由海路抵达' : '没有登记为港口'}</p>
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>此地点的已知人物</h3>
            <div className="map-intel-list">
              {view.ruler && <button type="button" onClick={() => view.ruler?.characterId && onSelectCharacter(view.ruler.characterId as CharacterId)}><UserRound /><span><small>公开统治者</small><strong>{view.ruler.label}</strong></span></button>}
              {view.characters.filter((character) => character.id !== view.ruler?.id).map((character) => <button key={character.id} type="button" onClick={() => character.characterId && onSelectCharacter(character.characterId as CharacterId)}><UserRound /><span><small>已确认位于此地</small><strong>{character.label}</strong></span></button>)}
              {!view.ruler && view.characters.length === 0 && <p>没有已确认的人物位置情报。</p>}
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>此地点的资产</h3>
            <div className="map-intel-list">
              {knownAssets.map((asset) => <button key={asset.assetId} type="button" onClick={() => onOpenAsset(asset.assetId)}><Boxes /><span><small>{asset.assetType === 'site' ? '据点' : '运输工具'}</small><strong>{asset.name}</strong></span></button>)}
              {knownAssets.length === 0 && <p>没有已确认的据点或运输工具。</p>}
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}
