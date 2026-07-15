export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterCitation {
  url: string;
  title?: string;
}

export interface OpenRouterUsage {
  inputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  serverSideToolCalls: number;
  costUsd?: number;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  text: string;
  citations: OpenRouterCitation[];
  usage: OpenRouterUsage;
  latencyMs: number;
}

export interface OpenRouterClientOptions {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface OpenRouterRespondOptions {
  webSearch?: boolean;
}

export class OpenRouterApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenRouterApiError';
  }
}

export class OpenRouterClient {
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(private readonly options: OpenRouterClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async respond(
    messages: OpenRouterMessage[],
    sessionId: string,
    options: OpenRouterRespondOptions = {},
  ): Promise<OpenRouterResponse> {
    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
      try {
        const body: Record<string, unknown> = {
          model: this.options.model,
          messages,
          max_tokens: this.options.maxOutputTokens,
          reasoning: { effort: 'none' },
          session_id: sessionId.slice(0, 256),
          provider: {
            require_parameters: true,
            data_collection: 'deny',
          },
        };
        if (options.webSearch) {
          body.plugins = [
            {
              id: 'web',
              engine: 'exa',
              max_results: 3,
            },
          ];
        }

        const response = await this.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
            'X-OpenRouter-Title': 'BlazeBot',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readProviderError(response);
          const error = new OpenRouterApiError(message, response.status);
          if (isRetryableStatus(response.status) && attempt < 2) {
            lastError = error;
            await delay(retryDelayMs(response, attempt));
            continue;
          }
          throw error;
        }

        const responseBody = (await response.json()) as OpenRouterResponseBody;
        const choice = responseBody.choices?.[0];
        if (choice?.error) {
          throw new OpenRouterApiError(choice.error.message || 'OpenRouter provider failed');
        }
        const text = choice?.message?.content?.trim();
        if (!text) throw new OpenRouterApiError('OpenRouter returned an empty response');
        const citations = extractCitations(choice?.message?.annotations);
        return {
          id: responseBody.id,
          model: responseBody.model || this.options.model,
          text: appendCitationLinks(text, citations),
          citations,
          usage: extractUsage(responseBody.usage, options.webSearch ? 1 : 0),
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof OpenRouterApiError) throw error;
        lastError = error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new OpenRouterApiError('OpenRouter request timed out');
        }
        if (attempt < 2) {
          await delay(500 * 2 ** attempt);
          continue;
        }
        throw new OpenRouterApiError('Could not reach OpenRouter');
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new OpenRouterApiError('OpenRouter request failed');
  }
}

interface OpenRouterResponseBody {
  id: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: OpenRouterAnnotation[];
    };
    error?: { message?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    server_tool_use?: { web_search_requests?: number };
    cost?: number;
  };
}

interface OpenRouterAnnotation {
  type?: string;
  url?: string;
  title?: string;
  url_citation?: {
    url?: string;
    title?: string;
  };
}

function extractCitations(annotations: OpenRouterAnnotation[] | undefined): OpenRouterCitation[] {
  const citations = new Map<string, OpenRouterCitation>();
  for (const annotation of annotations ?? []) {
    if (annotation.type !== 'url_citation') continue;
    const citation = annotation.url_citation ?? annotation;
    if (!citation.url || !isHttpUrl(citation.url)) continue;
    citations.set(citation.url, { url: citation.url, title: citation.title });
  }
  return [...citations.values()];
}

function appendCitationLinks(text: string, citations: OpenRouterCitation[]): string {
  const missing = citations.filter((citation) => !text.includes(citation.url)).slice(0, 5);
  if (missing.length === 0) return text;
  const links = missing.map((citation, index) => {
    const title = escapeMarkdownLabel(citation.title?.trim() || `Source ${index + 1}`);
    return `- [${title}](${citation.url})`;
  });
  return `${text}\n\n**Sources**\n${links.join('\n')}`;
}

function extractUsage(
  usage: OpenRouterResponseBody['usage'],
  webSearchFallback: number,
): OpenRouterUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    serverSideToolCalls: usage?.server_tool_use?.web_search_requests ?? webSearchFallback,
    costUsd: typeof usage?.cost === 'number' ? usage.cost : undefined,
  };
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message || body.message || `OpenRouter request failed (${response.status})`;
  } catch {
    return `OpenRouter request failed (${response.status})`;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(10_000, Math.max(0, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(10_000, Math.max(0, date - Date.now()));
  }
  return 500 * 2 ** attempt;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function escapeMarkdownLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .slice(0, 100);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
