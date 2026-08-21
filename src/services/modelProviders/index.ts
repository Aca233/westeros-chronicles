import type { ApiConfig } from '../../types/game';
import { anthropicAdapter } from './anthropic';
import { openAiCompatibleAdapter } from './openAiCompatible';
import type { ModelCompletionRequest, ModelProviderAdapter } from './types';

export type { ModelCompletionRequest, ModelMessage, ModelProviderAdapter } from './types';

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
    return await getModelProviderAdapter(request.config).complete({ ...request, signal: scoped.signal });
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
