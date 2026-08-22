import { PromiseCache } from './cache.ts'
import { worldContentRepository } from '../world-content/repository.ts'
import type { GameplayLocationEntry } from '../world-content/types.ts'
import {
  parseMapLocationSearchIndex,
  parseMapLocationShard,
  parseMapManifest,
  parseMapPoliticalTitles,
  parseMapRouteShard,
  parseSemanticMembership,
  parseSemanticTitles,
  buildSemanticMembershipIndex,
} from './schemas.ts'
import type { StaticPoliticalTitle } from './politicalProjection.ts'
import type { MapSearchTarget } from './mapInteraction.ts'
import type {
  MapLocation,
  MapLocationSearchEntry,
  MapManifest,
  MapRouteShard,
  SemanticMembership,
  SemanticMembershipIndex,
  SemanticTitle,
} from './types'

const MANIFEST_PATH = '/data/agot-map/manifest.json'
const POLITICAL_TITLES_PATH = '/data/agot-map/political/titles.json'

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

  constructor(fetcher: MapFetcher = (input, init) => fetch(input, init)) {
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

  /**
   * Player-facing gameplay locations compiled from world content. Search,
   * travel endpoints, and narrative links must use these; the full search
   * index stays an internal drawing/hit-testing space.
   */
  loadGameplayLocations(): Promise<GameplayLocationEntry[]> {
    return worldContentRepository.loadGameplayLocations()
  }

  searchGameplayLocations(query: string, limit = 20): Promise<GameplayLocationEntry[]> {
    return worldContentRepository.searchGameplayLocations(query, limit)
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


  async searchMapTargets(query: string, limit = 20): Promise<MapSearchTarget[]> {
    const needle = normalized(query)
    if (!needle || limit <= 0) return []
    const [locations, semantic] = await Promise.all([this.loadSearchIndex(), this.loadSemanticIndex()])
    const countyNames = new Map(semantic.titles
      .filter((title) => title.rank === 'county')
      .map((title) => [title.titleId, title.name]))
    const membershipByLocation = semantic.byLocationId
    const candidates: Array<{ result: MapSearchTarget; score: number; importance: number }> = []
    for (const title of semantic.titles) {
      if (title.rank !== 'county') continue
      const values = [title.name].map(normalized)
      const score = values.some((value) => value === needle) ? 4
        : values.some((value) => value.startsWith(needle)) ? 3
          : values.some((value) => value.includes(needle)) ? 2 : 0
      if (score) candidates.push({
        result: {
          key: `county:${title.titleId}`,
          target: { kind: 'county', countyId: title.titleId },
          name: /伯爵领$/u.test(title.name) ? title.name : `${title.name}伯爵领`,
          secondaryLabel: '伯爵领',
        },
        score,
        importance: title.importance,
      })
    }
    for (const entry of locations) {
      const values = [entry.name, entry.englishName ?? ''].map(normalized)
      const score = values.some((value) => value === needle) ? 4
        : values.some((value) => value.startsWith(needle)) ? 3
          : values.some((value) => value.includes(needle)) ? 1 : 0
      if (!score) continue
      const countyId = membershipByLocation.get(entry.id)?.countyId
      candidates.push({
        result: {
          key: `location:${entry.id}`,
          target: { kind: 'location', locationId: entry.id },
          name: entry.name,
          secondaryLabel: countyId ? countyNames.get(countyId) ?? '辖内地点' : '具体地点',
          locationType: entry.type,
        },
        score,
        importance: entry.importance,
      })
    }
    return candidates
      .sort((left, right) => right.score - left.score
        || right.importance - left.importance
        || left.result.name.localeCompare(right.result.name, 'zh-CN'))
      .slice(0, Math.max(0, Math.floor(limit)))
      .map(({ result }) => result)
  }

  async getLocation(id: string): Promise<MapLocation> {
    const entry = (await this.loadSearchIndex()).find((candidate) => candidate.id === id)
    if (!entry) throw new MapDataError(`未找到地图地点：${id}`, id, false)
    const locations = await this.loadLocationRegion(entry.regionId)
    const location = locations.find((candidate) => candidate.id === id)
    if (!location) throw new MapDataError(`地点分片缺少记录：${id}`, entry.regionId, false)
    return location
  }

  async getLocations(ids: readonly string[]): Promise<MapLocation[]> {
    const uniqueIds = [...new Set(ids)]
    return Promise.all(uniqueIds.map((id) => this.getLocation(id)))
  }

  async hasPoliticalTitles(ids: readonly string[]): Promise<Set<string>> {
    const wanted = new Set(ids)
    if (wanted.size === 0) return new Set()
    const matches = new Set<string>()
    for (const title of await this.loadPoliticalTitles()) {
      for (const id of [title.baronyId, title.countyId, title.duchyId, title.kingdomId, title.empireId, title.hegemonId]) {
        if (id && wanted.has(id)) matches.add(id)
      }
    }
    return matches
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

  loadPoliticalTitles(): Promise<StaticPoliticalTitle[]> {
    return this.loadJson(POLITICAL_TITLES_PATH, parseMapPoliticalTitles)
  }

  loadSemanticTitles(): Promise<SemanticTitle[]> {
    return this.loadManifest().then((manifest) =>
      this.loadJson(manifest.paths.semanticTitles, parseSemanticTitles))
  }

  loadSemanticMembership(): Promise<SemanticMembership[]> {
    return this.loadManifest().then((manifest) =>
      this.loadJson(manifest.paths.semanticMembership, parseSemanticMembership))
  }

  async loadSemanticIndex(): Promise<SemanticMembershipIndex> {
    const [titles, memberships] = await Promise.all([
      this.loadSemanticTitles(),
      this.loadSemanticMembership(),
    ])
    return buildSemanticMembershipIndex(titles, memberships)
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
