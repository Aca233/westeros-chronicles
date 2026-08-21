import React, { useEffect, useRef, useState } from 'react'
import { Castle, Landmark, MapPin, Search, Ship, X } from 'lucide-react'

import { mapRepository } from './repository'
import type { MapFocusTarget, MapSearchTarget } from './mapInteraction'
import type { MapLocationType } from './types'

interface LocationSearchProps { onSelect: (target: MapFocusTarget) => void }

function LocationTypeIcon({ type }: { type?: MapLocationType }) {
  const className = 'h-3.5 w-3.5'
  if (!type || type === 'castle') return <Castle className={className} />
  if (type === 'port') return <Ship className={className} />
  if (type === 'landmark' || type === 'ruin') return <Landmark className={className} />
  return <MapPin className={className} />
}

export const LocationSearch: React.FC<LocationSearchProps> = ({ onSelect }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MapSearchTarget[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)
  const suppressNextSearch = useRef(false)

  useEffect(() => {
    const currentRequest = ++requestId.current
    if (suppressNextSearch.current) { suppressNextSearch.current = false; setLoading(false); return }
    const trimmed = query.trim()
    if (!trimmed) { setResults([]); setLoading(false); setFailed(false); return }
    setLoading(true); setFailed(false)
    const timer = window.setTimeout(() => {
      mapRepository.searchMapTargets(trimmed, 20)
        .then((items) => { if (currentRequest === requestId.current) setResults(items) })
        .catch(() => { if (currentRequest === requestId.current) { setResults([]); setFailed(true) } })
        .finally(() => { if (currentRequest === requestId.current) setLoading(false) })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [query])

  const choose = (entry: MapSearchTarget) => {
    onSelect(entry.target)
    suppressNextSearch.current = true
    setQuery(entry.name)
    setResults([])
  }
  const showResults = query.trim().length > 0 && (loading || failed || results.length > 0)
  return <div className="map-location-search">
    <Search className="map-search-leading" aria-hidden="true" />
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索地点或伯爵领" aria-label="搜索维斯特洛地点或伯爵领" autoComplete="off" spellCheck={false} />
    {query && <button type="button" className="map-search-clear" onClick={() => setQuery('')} aria-label="清空地点搜索"><X className="h-3.5 w-3.5" /></button>}
    {showResults && <div className="map-search-results" role="listbox">
      {loading ? <div className="map-search-status">正在查找地点</div>
        : failed ? <div className="map-search-status">地点索引暂时不可用</div>
          : results.map((entry) => <button key={entry.key} type="button" className="map-search-result" onClick={() => choose(entry)} role="option" aria-selected="false">
            <span className="map-result-icon"><LocationTypeIcon type={entry.locationType} /></span>
            <span className="map-result-copy"><strong>{entry.name}</strong><small>{entry.secondaryLabel}</small></span>
          </button>)}
    </div>}
  </div>
}
