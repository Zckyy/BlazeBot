import 'dotenv/config';

export interface Config {
  discordToken: string;
  discordClientId: string;
  /** Test server ID for guild-scoped command deployment; undefined = deploy globally. */
  discordGuildId?: string;
  logLevel: string;
  aiChatEnabled: boolean;
  openRouterApiKey?: string;
  openRouterModel: string;
  aiWebSearchEnabled: boolean;
  aiMaxOutputTokens: number;
  aiContextTokenBudget: number;
  aiMaxConcurrentRequests: number;
  aiDailyBudgetUsd: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const aiChatEnabled = env.AI_CHAT_ENABLED?.toLowerCase() === 'true';
  if (aiChatEnabled && !env.OPENROUTER_API_KEY) {
    throw new Error(
      'Missing required environment variable when AI chat is enabled: OPENROUTER_API_KEY',
    );
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    discordGuildId: env.DISCORD_GUILD_ID || undefined,
    logLevel: env.LOG_LEVEL || 'info',
    aiChatEnabled,
    openRouterApiKey: env.OPENROUTER_API_KEY || undefined,
    openRouterModel: env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
    aiWebSearchEnabled: env.AI_WEB_SEARCH_ENABLED?.toLowerCase() !== 'false',
    aiMaxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 700, 'AI_MAX_OUTPUT_TOKENS'),
    aiContextTokenBudget: positiveInteger(
      env.AI_CONTEXT_TOKEN_BUDGET,
      12_000,
      'AI_CONTEXT_TOKEN_BUDGET',
    ),
    aiMaxConcurrentRequests: positiveInteger(
      env.AI_MAX_CONCURRENT_REQUESTS,
      2,
      'AI_MAX_CONCURRENT_REQUESTS',
    ),
    aiDailyBudgetUsd: nonNegativeNumber(env.AI_DAILY_BUDGET_USD, 1, 'AI_DAILY_BUDGET_USD'),
  };
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}
