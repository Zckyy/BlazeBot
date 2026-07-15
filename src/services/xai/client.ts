export type XaiReasoningEffort = 'none' | 'low';

export interface XaiInputMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface XaiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  serverSideToolCalls: number;
}

export interface XaiResponse {
  id: string;
  model: string;
  text: string;
  usage: XaiUsage;
  latencyMs: number;
}

export interface XaiClientOptions {
  apiKey: string;
  model: string;
  reasoningEffort: XaiReasoningEffort;
  maxOutputTokens: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class XaiApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'XaiApiError';
  }
}

export class XaiClient {
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(private readonly options: XaiClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async respond(messages: XaiInputMessage[], cacheKey: string): Promise<XaiResponse> {
    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
      try {
        const response = await this.fetchImpl('https://api.x.ai/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.options.model,
            input: messages,
            max_output_tokens: this.options.maxOutputTokens,
            reasoning: { effort: this.options.reasoningEffort },
            prompt_cache_key: cacheKey,
            store: false,
            tools: [{ type: 'web_search' }],
            max_tool_calls: 5,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readProviderError(response);
          const error = new XaiApiError(message, response.status);
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            lastError = error;
            await delay(500 * 2 ** attempt);
            continue;
          }
          throw error;
        }

        const body = (await response.json()) as XaiResponseBody;
        const text = extractOutputText(body);
        if (!text) throw new XaiApiError('xAI returned an empty response');
        return {
          id: body.id,
          model: body.model || this.options.model,
          text,
          usage: extractUsage(body.usage),
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof XaiApiError) throw error;
        lastError = error;
        if (attempt < 2 && !(error instanceof DOMException && error.name === 'AbortError')) {
          await delay(500 * 2 ** attempt);
          continue;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new XaiApiError('xAI request timed out');
        }
        throw new XaiApiError('Could not reach xAI');
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new XaiApiError('xAI request failed');
  }
}

interface XaiResponseBody {
  id: string;
  model?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    num_server_side_tools_used?: number;
  };
}

function extractOutputText(body: XaiResponseBody): string {
  return (body.output ?? [])
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text!)
    .join('\n')
    .trim();
}

function extractUsage(usage: XaiResponseBody['usage']): XaiUsage {
  return {
    inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0,
    cachedInputTokens:
      usage?.input_tokens_details?.cached_tokens ??
      usage?.prompt_tokens_details?.cached_tokens ??
      0,
    reasoningTokens:
      usage?.output_tokens_details?.reasoning_tokens ??
      usage?.completion_tokens_details?.reasoning_tokens ??
      0,
    outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0,
    serverSideToolCalls: usage?.num_server_side_tools_used ?? 0,
  };
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message || body.message || `xAI request failed (${response.status})`;
  } catch {
    return `xAI request failed (${response.status})`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
