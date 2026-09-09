import type { ApiConfig } from '../../types/game';
import { anthropicAdapter } from './anthropic';
import { openAiCompatibleAdapter } from './openAiCompatible';
import { isUnavailableModelError, type ModelCompletionRequest, type ModelProviderAdapter } from './types';

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

export async function requestModelCompletion(request: ModelCompletionRequest): Promise<string> {
  const scoped = composeRequestSignal(request.signal, request.timeoutMs ?? 90_000);
  try {
    const adapter = getModelProviderAdapter(request.config);
    const aliasKey = modelAliasKey(request.config);
    const cachedModel = resolvedModelAliases.get(aliasKey);
    const effectiveRequest = cachedModel
      ? {
        ...request,
        config: { ...request.config, model: cachedModel },
        maxTokens: outputBudgetForModel(cachedModel, request.maxTokens),
        signal: scoped.signal,
      }
      : {
        ...request,
        maxTokens: outputBudgetForModel(request.config.model, request.maxTokens),
        signal: scoped.signal,
      };
    try {
      const output = await adapter.complete(effectiveRequest);
      if (!output.trim()) throw new EmptyModelOutputError(effectiveRequest.config.model);
      return output;
    } catch (error) {
      const canFallback = isUnavailableModelError(error) || error instanceof EmptyModelOutputError;
      if (cachedModel || !canFallback || scoped.signal.aborted) throw error;
      const configuredFallback = request.config.fallbackModel?.trim();
      let fallbackModel = configuredFallback;
      if (!fallbackModel) {
        let models: string[];
        try {
          models = await adapter.listModels(request.config, scoped.signal);
        } catch {
          throw error;
        }
        fallbackModel = chooseFallbackModel(request.config.model, models);
      }
      if (!fallbackModel || fallbackModel === request.config.model) throw error;
      const fallbackRequest = {
        ...request,
        config: { ...request.config, model: fallbackModel },
        maxTokens: outputBudgetForModel(fallbackModel, request.maxTokens),
        signal: scoped.signal,
      };
      console.warn(`模型 ${request.config.model} 不可用或未返回内容，当前会话改用 ${fallbackModel}。`);
      let output: string;
      try {
        output = await adapter.complete(fallbackRequest);
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
  } finally {
    scoped.cleanup();
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
