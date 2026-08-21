import {
  LANDMARK_MANIFEST_PATH,
  parseLandmarkManifest,
  type LandmarkModelManifest,
} from './landmarkSchemas.ts'

type JsonResponse = Pick<Response, 'ok' | 'json'> & Partial<Pick<Response, 'status' | 'statusText'>>
type LandmarkFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<JsonResponse>

export class LandmarkDataError extends Error {
  readonly resource: string
  readonly cause?: unknown

  constructor(resource: string, cause?: unknown) {
    super(`三维地标资料未能载入：${resource}`)
    this.name = 'LandmarkDataError'
    this.resource = resource
    this.cause = cause
  }
}

export class LandmarkRepository {
  private pending: Promise<LandmarkModelManifest> | null = null
  private readonly fetcher: LandmarkFetcher

  constructor(fetcher: LandmarkFetcher = (input, init) => fetch(input, init)) {
    this.fetcher = fetcher
  }

  clear(): void {
    this.pending = null
  }

  loadManifest(signal?: AbortSignal): Promise<LandmarkModelManifest> {
    if (this.pending) return this.pending
    const request = this.fetcher(LANDMARK_MANIFEST_PATH, { signal })
      .then(async (response) => {
        if (!response.ok) throw new LandmarkDataError(LANDMARK_MANIFEST_PATH, new Error(`HTTP ${response.status ?? 0}`))
        return parseLandmarkManifest(await response.json())
      })
      .catch((error) => {
        this.pending = null
        if (error instanceof LandmarkDataError) throw error
        throw new LandmarkDataError(LANDMARK_MANIFEST_PATH, error)
      })
    this.pending = request
    return request
  }
}

export const landmarkRepository = new LandmarkRepository()
