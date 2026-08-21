import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/services/modelProviders/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
const { getModelProviderAdapter, requestModelCompletion } = await import(moduleUrl);

function streamResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const messages = [
  { role: 'system', content: '只输出事实' },
  { role: 'user', content: '继续' },
];

test('OpenAI-compatible adapter uses chat completions, bearer auth and parses SSE', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return streamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"推理"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"正文"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const config = { provider: 'deepseek', baseUrl: 'https://example.test/v1/', apiKey: 'secret', model: 'demo', temperature: 0.7 };
  const partials = [];
  const output = await requestModelCompletion({ config, messages, stream: true, maxTokens: 300, onChunk: (value) => partials.push(value) });
  assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(calls[0].init.body).stream, true);
  assert.equal(output, '<think>\n推理\n</think>\n\n正文');
  assert.equal(partials.at(-1), output);
});

test('Anthropic adapter uses messages protocol and parses content block streaming', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return streamResponse([
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"判断"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"结果"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
  };
  const config = { provider: 'claude', baseUrl: 'https://api.anthropic.com/v1/', apiKey: 'anthropic-secret', model: 'claude-test', temperature: 0.5 };
  const output = await requestModelCompletion({ config, messages, stream: true, maxTokens: 400 });
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'anthropic-secret');
  assert.ok(calls[0].init.headers['anthropic-version']);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.system, '只输出事实');
  assert.deepEqual(body.messages, [{ role: 'user', content: '继续' }]);
  assert.equal(body.stream, true);
  assert.equal(output, '<think>\n判断\n</think>\n\n结果');
});

test('Anthropic non-streaming response joins thinking and text blocks', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    content: [
      { type: 'thinking', thinking: '规则判断' },
      { type: 'text', text: '<state_cmd>[]</state_cmd>' },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const output = await requestModelCompletion({
    config: { provider: 'claude', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'key', model: 'claude-test', temperature: 0.2 },
    messages,
    stream: false,
    maxTokens: 200,
  });
  assert.equal(output, '<think>\n规则判断\n</think>\n\n<state_cmd>[]</state_cmd>');
});

test('provider selection is explicit and parent cancellation reaches fetch', async () => {
  assert.equal(getModelProviderAdapter({ provider: 'claude' }).id, 'anthropic');
  for (const provider of ['openai', 'deepseek', 'siliconflow', 'custom']) {
    assert.equal(getModelProviderAdapter({ provider }).id, 'openai-compatible');
  }
  let observedSignal;
  globalThis.fetch = async (_url, init) => {
    observedSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  };
  const controller = new AbortController();
  const pending = requestModelCompletion({
    config: { provider: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'key', model: 'model', temperature: 0.2 },
    messages,
    stream: false,
    maxTokens: 20,
    signal: controller.signal,
    timeoutMs: 60_000,
  });
  controller.abort(new DOMException('cancelled', 'AbortError'));
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  assert.equal(observedSignal.aborted, true);
});

test('provider request times out through the same abort boundary', async () => {
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  await assert.rejects(
    requestModelCompletion({
      config: { provider: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'key', model: 'model', temperature: 0.2 },
      messages,
      stream: false,
      maxTokens: 20,
      timeoutMs: 5,
    }),
    (error) => error?.name === 'TimeoutError',
  );
});
