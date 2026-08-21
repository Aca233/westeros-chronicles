import type { ModelCompletionRequest, ModelMessage, ModelProviderAdapter } from './types';
import { normalizeModelOutput, responseError } from './types';

const ANTHROPIC_VERSION = '2023-06-01';

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function anthropicMessages(messages: readonly ModelMessage[]) {
  return {
    system: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n') || undefined,
    messages: messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
  };
}

function readBlocks(blocks: any[]): { reasoning: string; content: string } {
  const state = { reasoning: '', content: '' };
  for (const block of blocks ?? []) {
    if (block?.type === 'thinking') state.reasoning += block.thinking || '';
    if (block?.type === 'text') state.content += block.text || '';
  }
  return state;
}

async function readSse(response: Response, onChunk?: (partialText: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法创建流式读取器');
  const decoder = new TextDecoder('utf-8');
  const state = { reasoning: '', content: '' };
  let buffer = '';
  let stopped = false;
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    try {
      const payload = JSON.parse(trimmed.replace(/^data:\s*/, ''));
      if (payload?.type === 'message_stop') { stopped = true; return; }
      if (payload?.type !== 'content_block_delta') return;
      if (payload.delta?.type === 'thinking_delta') state.reasoning += payload.delta.thinking || '';
      if (payload.delta?.type === 'text_delta') state.content += payload.delta.text || '';
      onChunk?.(normalizeModelOutput(state.reasoning, state.content));
    } catch {
      // Ignore a malformed provider event while preserving the stream.
    }
  };
  while (!stopped) {
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

export const anthropicAdapter: ModelProviderAdapter = {
  id: 'anthropic',
  async complete(request: ModelCompletionRequest): Promise<string> {
    const converted = anthropicMessages(request.messages);
    const response = await fetch(endpoint(request.config.baseUrl || 'https://api.anthropic.com/v1', '/messages'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': request.config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: request.config.model,
        system: converted.system,
        messages: converted.messages,
        temperature: request.config.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: request.stream,
      }),
      signal: request.signal,
    });
    if (!response.ok) throw await responseError(response, 'Anthropic 接口错误');
    if (request.stream) return readSse(response, request.onChunk);
    const payload = await response.json();
    const state = readBlocks(payload?.content);
    return normalizeModelOutput(state.reasoning, state.content);
  },
  async listModels(config, signal) {
    const response = await fetch(endpoint(config.baseUrl || 'https://api.anthropic.com/v1', '/models'), {
      method: 'GET',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal,
    });
    if (!response.ok) throw await responseError(response, '拉取模型失败');
    const payload = await response.json();
    return Array.isArray(payload?.data)
      ? payload.data.map((model: { id?: unknown }) => model.id).filter((id: unknown): id is string => typeof id === 'string')
      : [];
  },
};
