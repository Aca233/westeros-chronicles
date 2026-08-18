import { PromiseCache } from './cache.ts'
import {
  parseMapLocationSearchIndex,
  parseMapLocationShard,
  parseMapManifest,
  parseMapRouteShard,
} from './schemas.ts'
import type {
  MapLocation,
  MapLocationSearchEntry,
  MapManifest,
  MapRouteShard,
} from './types'

const MANIFEST_PATH = '/data/agot-map/manifest.json'

type JsonResponse = Pick<Response, 'ok' | 'json'> & Partial<Pick<Response, 'status' | 'statusText'>>
type MapFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<JsonResponse>

export class MapDataError extends Error {
  readonly resource: string
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(message: string, resource: string, retryable: boolean, cause?: unknown) {
    super(message)
    this.name = 'MapDataError'
    this.resource = resource
    this.retryable = retryable
    this.cause = cause
  }
}

function shardPath(root: string, regionId: string): string {
  if (!/^[a-z0-9][a-z0-9_.:-]*$/i.test(regionId)) {
    throw new MapDataError('地图区域编号无效', regionId, false)
  }
  return `${root}/${encodeURIComponent(regionId)}.json`
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

export class MapRepository {
  private readonly fetcher: MapFetcher
  private readonly cache = new PromiseCache<string, unknown>()

  constructor(fetcher: MapFetcher = fetch) {
    this.fetcher = fetcher
  }

  clear(resource?: string): void {
    this.cache.clear(resource)
  }

  loadManifest(): Promise<MapManifest> {
    return this.loadJson(MANIFEST_PATH, parseMapManifest)
  }

  async loadSearchIndex(): Promise<MapLocationSearchEntry[]> {
    const manifest = await this.loadManifest()
    return this.loadJson(manifest.paths.searchIndex, parseMapLocationSearchIndex)
  }

  async searchLocations(query: string, limit = 20): Promise<MapLocationSearchEntry[]> {
    const needle = normalized(query)
    if (!needle || limit <= 0) return []
    const entries = await this.loadSearchIndex()
    return entries
      .map((entry) => {
        const values = [entry.id, entry.name, entry.englishName ?? ''].map(normalized)
        const exact = values.some((value) => value === needle)
        const prefix = values.some((value) => value.startsWith(needle))
        const contains = values.some((value) => value.includes(needle))
        return { entry, score: exact ? 3 : prefix ? 2 : contains ? 1 : 0 }
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || right.entry.importance - left.entry.importance
        || left.entry.name.localeCompare(right.entry.name, 'zh-CN'))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map(({ entry }) => entry)
  }

  async getLocation(id: string): Promise<MapLocation> {
    const entry = (await this.loadSearchIndex()).find((candidate) => candidate.id === id)
    if (!entry) throw new MapDataError(`未找到地图地点：${id}`, id, false)
    const locations = await this.loadLocationRegion(entry.regionId)
    const location = locations.find((candidate) => candidate.id === id)
    if (!location) throw new MapDataError(`地点分片缺少记录：${id}`, entry.regionId, false)
    return location
  }

  async loadLocationRegion(regionId: string): Promise<MapLocation[]> {
    const manifest = await this.loadManifest()
    const path = shardPath(manifest.paths.locations, regionId)
    return this.loadJson(path, parseMapLocationShard)
  }

  async loadRouteRegion(regionId: string): Promise<MapRouteShard> {
    const manifest = await this.loadManifest()
    const path = shardPath(manifest.paths.routes, regionId)
    return this.loadJson(path, parseMapRouteShard)
  }

  private loadJson<Value>(resource: string, parse: (value: unknown) => Value): Promise<Value> {
    return this.cache.get(resource, async () => {
      try {
        const response = await this.fetcher(resource)
        if (!response.ok) {
          const status = response.status ?? 0
          throw new MapDataError(
            `地图资料载入失败（${status || '网络错误'}）`,
            resource,
            status === 0 || status >= 500,
          )
        }
        return parse(await response.json())
      } catch (error) {
        if (error instanceof MapDataError) throw error
        throw new MapDataError('地图资料载入失败，请稍后重试', resource, true, error)
      }
    }) as Promise<Value>
  }
}

export const mapRepository = new MapRepository()
