import type { ApiConfig } from '../../types/game';

export interface ModelMessage {
  role: string;
  content: string;
}

export interface ModelCompletionRequest {
  config: ApiConfig;
  messages: readonly ModelMessage[];
  stream: boolean;
  maxTokens: number;
  onChunk?: (partialText: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ModelProviderAdapter {
  id: 'openai-compatible' | 'anthropic';
  complete(request: ModelCompletionRequest): Promise<string>;
  listModels(config: ApiConfig, signal?: AbortSignal): Promise<string[]>;
}

export function normalizeModelOutput(reasoning: string, content: string): string {
  void reasoning;
  return content;
}

export class ModelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'ModelApiError';
  }
}

export function isUnavailableModelError(error: unknown): error is ModelApiError {
  if (!(error instanceof ModelApiError)) return false;
  const evidence = `${error.code ?? ''} ${error.detail} ${error.message}`.toLowerCase();
  return evidence.includes('upstream_model_unavailable')
    || evidence.includes('model_not_found')
    || evidence.includes('model not found')
    || evidence.includes('unknown model');
}

export async function responseError(response: Response, label: string): Promise<Error> {
  const detail = await response.text().catch(() => '');
  let code: string | null = null;
  try {
    const payload = JSON.parse(detail) as { error?: { code?: unknown } };
    if (typeof payload.error?.code === 'string') code = payload.error.code;
  } catch {
    // Some compatible providers return plain text or an HTML gateway error.
  }
  return new ModelApiError(
    `${label} (${response.status}): ${detail || '未知错误'}`,
    response.status,
    code,
    detail,
  );
}
