import type {
  RouteFailure,
  RoutePlan,
  RouteRequest,
  RouteWorkerRequest,
  RouteWorkerResponse,
} from './types'

interface WorkerPort {
  postMessage(message: RouteWorkerRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<RouteWorkerResponse>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<RouteWorkerResponse>) => void): void
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  terminate(): void
}

interface PendingRoute {
  resolve: (plan: RoutePlan) => void
  reject: (error: Error) => void
  removeAbortListener?: () => void
}

export interface RoutePlanOptions {
  signal?: AbortSignal
  cancelPrevious?: boolean
}

export class RoutePlanningError extends Error {
  readonly failure: RouteFailure

  constructor(failure: RouteFailure) {
    super(failure.reason)
    this.name = 'RoutePlanningError'
    this.failure = failure
  }
}

function cancellationError(reason: string): Error {
  const error = new Error(reason)
  error.name = 'AbortError'
  return error
}

function createDefaultWorker(): WorkerPort {
  return new Worker(new URL('./routeWorker.ts', import.meta.url), { type: 'module', name: 'agot-route-planner' })
}

export class RouteClient {
  private readonly worker: WorkerPort
  private readonly pending = new Map<string, PendingRoute>()
  private sequence = 0
  private disposed = false

  constructor(workerFactory: () => WorkerPort = createDefaultWorker) {
    this.worker = workerFactory()
    this.worker.addEventListener('message', this.handleMessage)
    this.worker.addEventListener('error', this.handleError)
  }

  plan(request: RouteRequest, options: RoutePlanOptions = {}): Promise<RoutePlan> {
    if (this.disposed) return Promise.reject(new Error('路线规划器已经关闭。'))
    if (options.signal?.aborted) return Promise.reject(cancellationError('路线请求已取消。'))
    if (options.cancelPrevious !== false) this.cancelPending('已有更新的路线请求。')
    const requestId = `route-request-${++this.sequence}`
    return new Promise<RoutePlan>((resolve, reject) => {
      const pending: PendingRoute = { resolve, reject }
      if (options.signal) {
        const onAbort = () => this.cancel(requestId, '路线请求已取消。')
        options.signal.addEventListener('abort', onAbort, { once: true })
        pending.removeAbortListener = () => options.signal?.removeEventListener('abort', onAbort)
      }
      this.pending.set(requestId, pending)
      this.worker.postMessage({ type: 'plan', requestId, request })
    })
  }

  cancelPending(reason = '路线请求已取消。'): void {
    for (const requestId of [...this.pending.keys()]) this.cancel(requestId, reason)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelPending('路线规划器已经关闭。')
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.removeEventListener('error', this.handleError)
    this.worker.terminate()
  }

  private cancel(requestId: string, reason: string): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    pending.removeAbortListener?.()
    pending.reject(cancellationError(reason))
    this.worker.postMessage({ type: 'cancel', requestId })
  }

  private readonly handleMessage = (event: MessageEvent<RouteWorkerResponse>): void => {
    const response = event.data
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    this.pending.delete(response.requestId)
    pending.removeAbortListener?.()
    if (response.type === 'result') pending.resolve(response.result)
    else pending.reject(new RoutePlanningError(response.failure))
  }

  private readonly handleError = (event: ErrorEvent): void => {
    const reason = event.message || '路线规划线程发生错误。'
    for (const pending of this.pending.values()) {
      pending.removeAbortListener?.()
      pending.reject(new Error(reason))
    }
    this.pending.clear()
  }
}
