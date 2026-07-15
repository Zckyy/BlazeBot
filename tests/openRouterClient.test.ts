import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenRouterApiError, OpenRouterClient } from '../src/services/openrouter/client.js';

test('sends a tool-free Chat Completions request and extracts exact usage', async () => {
  let requestUrl: string | undefined;
  let requestBody: Record<string, unknown> | undefined;
  let authorization: string | null | undefined;
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    authorization = new Headers(init?.headers).get('Authorization');
    return new Response(
      JSON.stringify({
        id: 'gen_test',
        model: 'deepseek/deepseek-v4-flash',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Hello from BlazeBot AI',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://example.com/source',
                    title: 'Example source',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 0 },
          server_tool_use: { web_search_requests: 0 },
          cost: 0.000012,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const client = new OpenRouterClient({
    apiKey: 'test-key',
    model: 'deepseek/deepseek-v4-flash',
    maxOutputTokens: 700,
    fetch: fetchMock as typeof fetch,
  });
  const response = await client.respond([{ role: 'user', content: 'Hello' }], 'conv-1');

  assert.equal(requestUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(authorization, 'Bearer test-key');
  assert.equal(
    response.text,
    'Hello from BlazeBot AI\n\n**Sources**\n- [Example source](https://example.com/source)',
  );
  assert.deepEqual(response.citations, [
    { url: 'https://example.com/source', title: 'Example source' },
  ]);
  assert.deepEqual(response.usage, {
    inputTokens: 100,
    cachedInputTokens: 40,
    reasoningTokens: 0,
    outputTokens: 20,
    serverSideToolCalls: 0,
    costUsd: 0.000012,
  });
  assert.equal(requestBody?.session_id, 'conv-1');
  assert.equal(requestBody?.max_tokens, 700);
  assert.deepEqual(requestBody?.reasoning, { effort: 'none' });
  assert.deepEqual(requestBody?.provider, {
    require_parameters: true,
    data_collection: 'deny',
  });
  assert.equal(requestBody?.tools, undefined);
});

test('only includes the capped OpenRouter web-search tool when requested', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new OpenRouterClient({
    apiKey: 'test-key',
    model: 'deepseek/deepseek-v4-flash',
    maxOutputTokens: 700,
    fetch: (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: 'gen_search',
          model: 'deepseek/deepseek-v4-flash',
          choices: [{ message: { content: 'Current answer' } }],
          usage: { server_tool_use: { web_search_requests: 1 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch,
  });

  const response = await client.respond(
    [{ role: 'user', content: 'What happened today?' }],
    'conv-search',
    { webSearch: true },
  );

  assert.deepEqual(requestBody?.tools, [
    {
      type: 'openrouter:web_search',
      parameters: {
        engine: 'parallel',
        max_results: 3,
        max_total_results: 5,
        max_characters: 1_500,
      },
    },
  ]);
  assert.equal(response.usage.serverSideToolCalls, 1);
});

test('maps provider failures to OpenRouterApiError without exposing the API key', async () => {
  const client = new OpenRouterClient({
    apiKey: 'secret-test-key',
    model: 'deepseek/deepseek-v4-flash',
    maxOutputTokens: 100,
    fetch: (async () =>
      new Response(JSON.stringify({ error: { message: 'bad request' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
  });

  await assert.rejects(
    () => client.respond([{ role: 'user', content: 'Hello' }], 'conv-1'),
    (error: unknown) =>
      error instanceof OpenRouterApiError &&
      error.status === 400 &&
      !error.message.includes('secret-test-key'),
  );
});
