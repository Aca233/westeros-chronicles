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

export function payloadError(payload: unknown, label: string, status = 200): ModelApiError | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: unknown }).error;
  if (!error) return null;

  const record = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : null;
  const code = typeof record?.code === 'string' ? record.code : null;
  const message = typeof record?.message === 'string'
    ? record.message
    : typeof error === 'string'
      ? error
      : '';
  let detail: string;
  try {
    detail = JSON.stringify(payload);
  } catch {
    detail = message || String(error);
  }
  const evidence = `${code ?? ''} ${message} ${detail}`.toLowerCase();

  if (evidence.includes('upstream authentication failed')) {
    return new ModelApiError(
      `${label}：中转服务已收到请求，但连接上游模型时认证失败。请更换中转节点/模型，或让中转服务管理员修复上游账号凭据。`,
      status,
      code,
      detail,
    );
  }
  if (evidence.includes('upstream_server_error')) {
    return new ModelApiError(
      `${label}：中转服务返回了 HTTP ${status}，但响应正文明确标记为 upstream_server_error；上游模型未能完成请求。这不是成功响应，请重试或切换备用模型/节点。`,
      status,
      code,
      detail,
    );
  }
  return new ModelApiError(
    `${label}：接口返回了错误对象${code ? ` (${code})` : ''}${message ? `：${message}` : ''}`,
    status,
    code,
    detail,
  );
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
  const evidence = `${code ?? ''} ${detail}`.toLowerCase();
  if (response.status === 502 && evidence.includes('upstream authentication failed')) {
    return new ModelApiError(
      `${label} (502)：中转服务已收到请求，但它连接上游模型时认证失败。请先重试一次；若持续出现，请更换中转节点/模型，或让中转服务管理员修复上游账号凭据。`,
      response.status,
      code,
      detail,
    );
  }
  return new ModelApiError(
    `${label} (${response.status}): ${detail || '未知错误'}`,
    response.status,
    code,
    detail,
  );
}
