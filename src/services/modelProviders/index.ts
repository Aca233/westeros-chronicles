import type { ApiConfig } from '../../types/game';
import { anthropicAdapter } from './anthropic';
import { openAiCompatibleAdapter } from './openAiCompatible';
import { isUnavailableModelError, ModelApiError, type ModelCompletionRequest, type ModelProviderAdapter } from './types';

export type { ModelCompletionRequest, ModelMessage, ModelProviderAdapter } from './types';

const resolvedModelAliases = new Map<string, string>();
const NON_CHAT_MODEL_PATTERN = /(?:embedding|whisper|tts|dall-e|image|rerank|moderation|speech|transcri)/i;
const MODEL_FAMILIES = ['deepseek', 'qwen', 'gpt', 'claude', 'gemini', 'mistral', 'llama'] as const;

class EmptyModelOutputError extends Error {
  constructor(readonly model: string) {
    super(`模型 ${model} 返回了空内容。`);
    this.name = 'EmptyModelOutputError';
  }
}

function modelAliasKey(config: ApiConfig): string {
  return `${config.provider}|${config.baseUrl.replace(/\/+$/, '').toLowerCase()}|${config.model.toLowerCase()}|${config.fallbackModel?.toLowerCase() ?? ''}`;
}

export function getResolvedModelAlias(config: ApiConfig): string | null {
  return resolvedModelAliases.get(modelAliasKey(config)) ?? null;
}

function chooseFallbackModel(requestedModel: string, models: readonly string[]): string | undefined {
  const requested = requestedModel.toLowerCase();
  const chatModels = models.filter((model) => (
    model.trim()
    && model.toLowerCase() !== requested
    && !NON_CHAT_MODEL_PATTERN.test(model)
  ));
  if (!chatModels.length) return undefined;
  const requestedFamily = MODEL_FAMILIES.find((family) => requested.includes(family));
  return [...chatModels].sort((left, right) => {
    const score = (candidate: string) => {
      const value = candidate.toLowerCase();
      let total = 0;
      if (requestedFamily && value.includes(requestedFamily)) total += 100;
      if (/chat|instruct|sonnet|reasoner/i.test(value)) total += 20;
      if (/latest|turbo/i.test(value)) total += 5;
      return total;
    };
    return score(right) - score(left);
  })[0];
}

function outputBudgetForModel(model: string, requestedMaxTokens: number): number {
  // Reasoning previews may count hidden reasoning against max_tokens and otherwise
  // exhaust a small resolver budget before emitting any visible JSON/content.
  return /(?:gemini-(?:2\.5|3)|gemini.*pro.*preview|deepseek.*r1|reasoner|(?:^|\/)o[134](?:-|$)|gpt-5)/i.test(model)
    ? Math.max(requestedMaxTokens, 8_192)
    : requestedMaxTokens;
}

export function getModelProviderAdapter(config: Pick<ApiConfig, 'provider'>): ModelProviderAdapter {
  return config.provider === 'claude' ? anthropicAdapter : openAiCompatibleAdapter;
}

function composeRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason ?? new DOMException('请求已取消', 'AbortError'));
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('模型请求超时', 'TimeoutError')), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', abortFromParent);
    },
  };
}

function defaultRequestTimeoutMs(model: string): number {
  // Gemini 3.1 Pro Preview 经部分 Vertex 中转的首字节/完整响应可能明显超过
  // 普通聊天模型。当前项目实际观测到约 125 秒的失败回包，90 秒会让客户端
  // 先行 abort，掩盖真正的上游错误；为该慢模型留出 180 秒诊断/完成窗口。
  if (/gemini-3\.1-pro(?:-preview)?/i.test(model)) return 180_000;
  return 90_000;
}

const MAX_COMPLETION_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

function retryEvidence(error: unknown): string {
  if (error instanceof ModelApiError) {
    return `${error.code ?? ''} ${error.detail} ${error.message}`.toLowerCase();
  }
  return error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : String(error).toLowerCase();
}

function isRetryableCompletionError(error: unknown): boolean {
  const evidence = retryEvidence(error);
  if (/(?:authentication failed|invalid api key|invalid_api_key|unauthorized|forbidden|permission denied)/i.test(evidence)) {
    return false;
  }
  if (error instanceof ModelApiError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status)
      || /(?:upstream_server_error|upstream_rate_limited|server_error|service_unavailable|temporarily unavailable|overloaded)/i.test(evidence);
  }
  if (error instanceof DOMException) {
    return error.name === 'TimeoutError' || error.name === 'NetworkError';
  }
  if (error instanceof TypeError && /(?:fetch|network|connection|socket)/i.test(evidence)) return true;
  return /(?:模型请求超时|网络|network|fetch failed|connection|socket|econnreset|etimedout|timeout|timed out|gateway)/i.test(evidence);
}

function retryDelayMs(retryIndex: number): number {
  const base = Math.min(1_000 * (2 ** retryIndex), 8_000);
  return base + Math.floor(Math.random() * 500);
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('请求已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('请求已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function completeWithRetry(adapter: ModelProviderAdapter, request: ModelCompletionRequest): Promise<string> {
  const timeoutMs = request.timeoutMs ?? defaultRequestTimeoutMs(request.config.model);
  for (let attempt = 0; attempt <= MAX_COMPLETION_RETRIES; attempt += 1) {
    const scoped = composeRequestSignal(request.signal, timeoutMs);
    try {
      return await adapter.complete({ ...request, signal: scoped.signal });
    } catch (rawError) {
      const error = normalizeRequestAbort(request, scoped.signal, rawError);
      const canRetry = !request.signal?.aborted
        && attempt < MAX_COMPLETION_RETRIES
        && isRetryableCompletionError(error);
      if (!canRetry) throw error;

      const retryNumber = attempt + 1;
      const delayMs = retryDelayMs(attempt);
      console.warn(
        `模型请求临时失败，将在 ${(delayMs / 1_000).toFixed(1)} 秒后自动重试 (${retryNumber}/${MAX_COMPLETION_RETRIES})。`,
        error,
      );
      request.onChunk?.('');
      await waitForRetry(delayMs, request.signal);
    } finally {
      scoped.cleanup();
    }
  }
  throw new Error('模型自动重试流程异常结束。');
}

function isGenericAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError'
    || /(?:the user aborted a request|request (?:was )?aborted|fetch.*aborted)/i.test(error.message);
}

function normalizeRequestAbort(
  request: ModelCompletionRequest,
  scopedSignal: AbortSignal,
  error: unknown,
): unknown {
  // Explicit player cancellation always wins and preserves its original reason.
  if (request.signal?.aborted) return request.signal.reason ?? error;

  // The composed signal owns our request timeout. Some browsers replace the
  // TimeoutError reason with a generic AbortError, so recover the real reason here.
  if (scopedSignal.aborted) {
    const reason = scopedSignal.reason;
    if (reason instanceof DOMException && reason.name === 'TimeoutError') {
      const seconds = Math.round((request.timeoutMs ?? defaultRequestTimeoutMs(request.config.model)) / 1_000);
      return new Error(`模型请求超时（${seconds} 秒）。上游接口没有及时返回；请重试，若持续出现请检查中转节点、模型可用性或网络连接。`);
    }
    if (reason instanceof Error) return reason;
  }

  // fetch / browser / proxy can abort independently of our controller. Do not
  // misreport that as if the player clicked “取消”.
  if (isGenericAbortError(error)) {
    return new Error('模型请求被浏览器、网络或上游网关意外中断，并非玩家主动取消。请重试；若反复出现，请检查中转节点和网络连接。');
  }
  return error;
}

export async function requestModelCompletion(request: ModelCompletionRequest): Promise<string> {
  const adapter = getModelProviderAdapter(request.config);
  const aliasKey = modelAliasKey(request.config);
  const cachedModel = resolvedModelAliases.get(aliasKey);
  const effectiveRequest = cachedModel
    ? {
      ...request,
      config: { ...request.config, model: cachedModel },
      maxTokens: outputBudgetForModel(cachedModel, request.maxTokens),
    }
    : {
      ...request,
      maxTokens: outputBudgetForModel(request.config.model, request.maxTokens),
    };
  try {
    const output = await completeWithRetry(adapter, effectiveRequest);
      if (!output.trim()) throw new EmptyModelOutputError(effectiveRequest.config.model);
      return output;
  } catch (error) {
      const canFallback = isUnavailableModelError(error) || error instanceof EmptyModelOutputError;
      if (cachedModel || !canFallback || request.signal?.aborted) throw error;
      const configuredFallback = request.config.fallbackModel?.trim();
      let fallbackModel = configuredFallback;
      if (!fallbackModel) {
        let models: string[];
        const listScope = composeRequestSignal(request.signal, 20_000);
        try {
          models = await adapter.listModels(request.config, listScope.signal);
        } catch {
          throw error;
        } finally {
          listScope.cleanup();
        }
        fallbackModel = chooseFallbackModel(request.config.model, models);
      }
      if (!fallbackModel || fallbackModel === request.config.model) throw error;
      const fallbackRequest = {
        ...request,
        config: { ...request.config, model: fallbackModel },
        maxTokens: outputBudgetForModel(fallbackModel, request.maxTokens),
      };
      console.warn(`模型 ${request.config.model} 不可用或未返回内容，当前会话改用 ${fallbackModel}。`);
      let output: string;
      try {
        output = await completeWithRetry(adapter, fallbackRequest);
      } catch (fallbackError) {
        if (configuredFallback && (isUnavailableModelError(fallbackError) || fallbackError instanceof EmptyModelOutputError)) {
          throw new Error(`主模型 ${request.config.model} 与备用模型 ${fallbackModel} 均不可用。请在设置中重新读取模型列表。`);
        }
        throw fallbackError;
      }
      if (!output.trim()) {
        if (configuredFallback) {
          throw new Error(`主模型 ${request.config.model} 与备用模型 ${fallbackModel} 均未返回内容。请在设置中选择其他聊天模型。`);
        }
        throw new EmptyModelOutputError(fallbackModel);
      }
      resolvedModelAliases.set(aliasKey, fallbackModel);
      return output;
  }
}

export async function listProviderModels(config: ApiConfig, signal?: AbortSignal): Promise<string[]> {
  const scoped = composeRequestSignal(signal, 20_000);
  try {
    return await getModelProviderAdapter(config).listModels(config, scoped.signal);
  } finally {
    scoped.cleanup();
  }
}
