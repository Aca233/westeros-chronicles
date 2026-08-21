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
  return reasoning && !content.includes('<think>')
    ? `<think>\n${reasoning}\n</think>\n\n${content}`
    : content;
}

export async function responseError(response: Response, label: string): Promise<Error> {
  const detail = await response.text().catch(() => '');
  return new Error(`${label} (${response.status}): ${detail || '未知错误'}`);
}
