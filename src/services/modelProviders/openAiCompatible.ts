import type { ModelCompletionRequest, ModelProviderAdapter } from './types';
import { normalizeModelOutput, responseError } from './types';

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function appendDelta(payload: any, state: { reasoning: string; content: string }): void {
  const delta = payload?.choices?.[0]?.delta;
  if (!delta) return;
  state.reasoning += delta.reasoning_content || delta.reasoning || delta.thought || delta.thinking || '';
  state.content += delta.content || '';
}

async function readSse(response: Response, onChunk?: (partialText: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法创建流式读取器');
  const decoder = new TextDecoder('utf-8');
  const state = { reasoning: '', content: '' };
  let buffer = '';
  let doneEvent = false;
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.replace(/^data:\s*/, '');
    if (data === '[DONE]') { doneEvent = true; return; }
    try {
      appendDelta(JSON.parse(data), state);
      onChunk?.(normalizeModelOutput(state.reasoning, state.content));
    } catch {
      // Ignore a malformed provider event while preserving the stream.
    }
  };
  while (!doneEvent) {
    const next = await reader.read();
    buffer += decoder.decode(next.value, { stream: !next.done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    lines.forEach(consume);
    if (next.done) break;
  }
  if (buffer.trim()) consume(buffer);
  return normalizeModelOutput(state.reasoning, state.content);
}

export const openAiCompatibleAdapter: ModelProviderAdapter = {
  id: 'openai-compatible',
  async complete(request: ModelCompletionRequest): Promise<string> {
    const response = await fetch(endpoint(request.config.baseUrl || 'https://api.openai.com/v1', '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.config.model || 'gpt-4o',
        messages: request.messages,
        temperature: request.config.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: request.stream,
      }),
      signal: request.signal,
    });
    if (!response.ok) throw await responseError(response, 'API 接口错误');
    if (request.stream) return readSse(response, request.onChunk);
    const payload = await response.json();
    const message = payload?.choices?.[0]?.message;
    return normalizeModelOutput(
      message?.reasoning_content || message?.reasoning || '',
      message?.content || '',
    );
  },
  async listModels(config, signal) {
    const response = await fetch(endpoint(config.baseUrl, '/models'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal,
    });
    if (!response.ok) throw await responseError(response, '拉取模型失败');
    const payload = await response.json();
    return Array.isArray(payload?.data)
      ? payload.data.map((model: { id?: unknown }) => model.id).filter((id: unknown): id is string => typeof id === 'string')
      : [];
  },
};
