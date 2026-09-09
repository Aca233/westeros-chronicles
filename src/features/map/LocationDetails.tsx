import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Castle, Landmark, MapPin, Navigation, Ship, UserRound, Waves, X, Boxes } from 'lucide-react'

import { buildLocationView, type LocationViewModel } from './locationViewModel'
import { mapRepository } from './repository'
import { useGameStore } from '../../store/useGameStore'
import type { MapLocation, MapLocationType, SemanticMembership, SemanticTitle } from './types'
import type { MapAssetPoint, MapCharacterPoint } from './dynamicMapSubjects.ts'
import type { PoliticalFeatureState } from './politicalProjection.ts'
import type { CharacterId } from '../characters/types'
import type { OngoingWorldAction, WorldSituation } from '../world/livingWorldContracts'

interface LocationDetailsProps {
  locationId: string
  knownCharacters: readonly MapCharacterPoint[]
  knownAssets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
  semanticMembership?: SemanticMembership
  semanticTitles: readonly SemanticTitle[]
  knownSituations: readonly WorldSituation[]
  knownOngoingActions: readonly OngoingWorldAction[]
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
  knownSituations,
  knownOngoingActions,
  onSelectCharacter,
  onOpenAsset,
  onBackToCounty,
  onPlanTravel,
  onClose,
}) => {
  const debugEnabled = useGameStore((state) => state.debugEnabled)
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
      label: politicalState.holderName ?? '持有人未记录',
      characterId: politicalState.holderId,
      knowledge: 'confirmed',
    } : undefined,
    characters: knownCharacters.map((character) => ({
      id: character.characterId,
      label: character.name,
      characterId: character.characterId,
      knowledge: character.knowledge,
      ...(character.lastKnownTurn !== undefined ? { lastKnownDate: `第 ${character.lastKnownTurn} 回合` } : {}),
    })),
    assets: knownAssets.map((asset) => ({
      id: asset.assetId, label: `${asset.name} · ${asset.itemCount} 件物品`, knowledge: asset.knowledge,
    })),
  }, {
    now: '未记录',
    debugIntelligence: debugEnabled,
    ...(semanticMembership ? { semantic: { membership: semanticMembership, titles: semanticTitles } } : {}),
  }) : null, [debugEnabled, knownAssets, knownCharacters, location, politicalState, semanticMembership, semanticTitles])

  const prefillLivingAction = (text: string) => {
    window.dispatchEvent(new CustomEvent('agot:prefill-action', { detail: { text } }))
  }

  const situationLabel = (kind: WorldSituation['kind']) => ({
    ferry_blockade: '渡口封锁', grain_shortage: '粮食短缺', local_dispute: '地方争端',
  })[kind]
  const actionLabel = (kind: OngoingWorldAction['kind']) => ({
    transport: '运输', escort: '护送', investigation: '调查', negotiation: '交涉', relief: '救援', request_help: '求援', reroute: '改道', wait: '等待', report_blocked: '受阻报告', delegated_task: '委派事务',
  })[kind]

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
          <p className="map-location-description">先在地图中规划路线、方式与途经点；确认后只写入中央行动草稿，世界状态仍由统一回合结算。</p>
          <section className="map-details-section">
            <h3>通行资料</h3>
            <div className="map-access-list">
              <p><Navigation className="h-3.5 w-3.5" />道路网络可在地图信息中显示</p>
              <p><Ship className="h-3.5 w-3.5" />{view.access.port ? '可由海路抵达' : '没有登记为港口'}</p>
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>有关此地的人物情报</h3>
            <div className="map-intel-list">
              {view.ruler && <button type="button" onClick={() => view.ruler?.characterId && onSelectCharacter(view.ruler.characterId as CharacterId)}><UserRound /><span><small>公开统治者 · 不代表在场</small><strong>{view.ruler.label}</strong></span></button>}
              {view.characters.filter((character) => character.id !== view.ruler?.id).map((character) => <button key={character.id} type="button" onClick={() => character.characterId && onSelectCharacter(character.characterId as CharacterId)}><UserRound /><span><small>{character.stale ? `最后已知位于此地${character.lastKnownDate ? ` · ${character.lastKnownDate}` : ' · 时间未明'} · 来源：已提交行动记录` : character.knowledge === 'rumored' ? '听闻可能在此' : '已确认位于此地'}</small><strong>{character.label}</strong></span></button>)}
              {!view.ruler && view.characters.length === 0 && <p>没有你能确认的人物位置情报。</p>}
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>此地点的资产</h3>
            <div className="map-intel-list">
              {knownAssets.map((asset) => {
                const typeLabel = asset.containerTypeLabel ?? (asset.assetType === 'site' ? '据点' : '运输工具');
                const usage = asset.capacity !== undefined ? `${asset.itemCount}/${asset.capacity}` : `${asset.itemCount}`;
                return (
                  <button key={asset.assetId} type="button" onClick={() => onOpenAsset(asset.assetId)}>
                    <Boxes />
                    <span><small>{typeLabel}</small><strong>{asset.name} · 现存 {usage} 件</strong></span>
                  </button>
                );
              })}
              {knownAssets.length === 0 && <p>没有已确认的据点或运输工具。</p>}
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>已知局势</h3>
            <div className="map-intel-list">
              {knownSituations.map((situation) => (
                <div key={situation.id} className="map-access-list">
                  <p><strong>{situationLabel(situation.kind)}</strong> · {situation.stage} · 严重度 {situation.severity ?? 0}</p>
                  <p>{situation.pressure.join('；') || '暂无已知压力'}</p>
                  <p><small>局势 ID：{situation.id}</small></p>
                  <button type="button" className="map-travel-action" onClick={() => prefillLivingAction(`我亲自调查局势【${situation.id}】，查清现场事实与责任来源。`)}>调查</button>
                  {situation.kind === 'ferry_blockade' && <button type="button" className="map-travel-action" onClick={() => prefillLivingAction(`我在现场就局势【${situation.id}】交涉通行条件，不预设对方会答应。`)}>交涉通行</button>}
                  {situation.kind === 'grain_shortage' && <button type="button" className="map-travel-action" onClick={() => prefillLivingAction(`我针对局势【${situation.id}】向外请求实际粮食救援，并等待消息与运输按真实时间推进。`)}>请求救援</button>}
                </div>
              ))}
              {knownSituations.length === 0 && <p>你目前没有关于此地持续局势的可靠情报。</p>}
            </div>
          </section>
          <section className="map-details-section map-local-intelligence">
            <h3>持续行动</h3>
            <div className="map-intel-list">
              {knownOngoingActions.map((action) => (
                <div key={action.id} className="map-access-list">
                  <p><strong>{actionLabel(action.kind)}</strong> · {action.status} · 进度 {Math.round(action.progress * 100)}%</p>
                  {action.resource && <p>{action.resource.commodity} · {action.resource.quantity}</p>}
                  <p><small>行动 ID：{action.id}</small></p>
                  {action.kind === 'transport' && (action.status === 'active' || action.status === 'blocked') && <>
                    <button type="button" className="map-travel-action" onClick={() => prefillLivingAction(`我准备亲自组织护送持续行动【${action.id}】，按我的实际权限、位置和现有封锁情况结算。`)}>组织护送</button>
                    <button type="button" className="map-travel-action" onClick={() => prefillLivingAction(`我要求把持续行动【${action.id}】改走可验证的替代道路；若我没有改变运输安排的权限就拒绝执行。`)}>尝试改道</button>
                  </>}
                </div>
              ))}
              {knownOngoingActions.length === 0 && <p>你目前不知道有正在此地发生的持续行动。</p>}
            </div>
          </section>
          {debugEnabled && view.intelligence.length > 0 && (
            <section className="map-details-section map-local-intelligence" data-debug-intelligence>
              <h3>调试情报</h3>
              <div className="map-intel-list">
                {view.intelligence.map((subject) => (
                  <p key={subject.id}>
                    <small>{subject.type}{subject.debug ? ' · debug' : ''}</small>
                    <strong>{String(subject.name ?? subject.id)}</strong>
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
