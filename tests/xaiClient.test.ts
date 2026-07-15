import assert from 'node:assert/strict';
import test from 'node:test';
import { XaiClient, XaiApiError } from '../src/services/xai/client.js';

test('sends a stateless Responses API request and extracts usage', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: 'resp_test',
        model: 'grok-4.3',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello from Grok' }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          input_tokens_details: { cached_tokens: 40 },
          output_tokens_details: { reasoning_tokens: 0 },
          num_server_side_tools_used: 2,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const client = new XaiClient({
    apiKey: 'test-key',
    model: 'grok-4.3',
    reasoningEffort: 'none',
    maxOutputTokens: 1_000,
    fetch: fetchMock as typeof fetch,
  });
  const response = await client.respond([{ role: 'user', content: 'Hello' }], 'conv-1');

  assert.equal(response.text, 'Hello from Grok');
  assert.deepEqual(response.usage, {
    inputTokens: 100,
    cachedInputTokens: 40,
    reasoningTokens: 0,
    outputTokens: 20,
    serverSideToolCalls: 2,
  });
  assert.equal(requestBody?.store, false);
  assert.equal(requestBody?.prompt_cache_key, 'conv-1');
  assert.deepEqual(requestBody?.reasoning, { effort: 'none' });
  assert.deepEqual(requestBody?.tools, [{ type: 'web_search' }]);
  assert.equal(requestBody?.max_tool_calls, 5);
  assert.equal(requestBody?.include, undefined);
});

test('maps provider failures to XaiApiError', async () => {
  const client = new XaiClient({
    apiKey: 'test-key',
    model: 'grok-4.3',
    reasoningEffort: 'none',
    maxOutputTokens: 100,
    fetch: (async () =>
      new Response(JSON.stringify({ error: { message: 'bad request' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
  });

  await assert.rejects(
    () => client.respond([{ role: 'user', content: 'Hello' }], 'conv-1'),
    (error: unknown) => error instanceof XaiApiError && error.status === 400,
  );
});
