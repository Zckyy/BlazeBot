import 'dotenv/config';

export interface Config {
  discordToken: string;
  discordClientId: string;
  /** Test server ID for guild-scoped command deployment; undefined = deploy globally. */
  discordGuildId?: string;
  logLevel: string;
  aiChatEnabled: boolean;
  xaiApiKey?: string;
  xaiModel: string;
  xaiReasoningEffort: 'none' | 'low';
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
  if (aiChatEnabled && !env.XAI_API_KEY) {
    throw new Error('Missing required environment variable when AI chat is enabled: XAI_API_KEY');
  }

  const reasoningEffort = env.XAI_REASONING_EFFORT || 'none';
  if (reasoningEffort !== 'none' && reasoningEffort !== 'low') {
    throw new Error('XAI_REASONING_EFFORT must be either "none" or "low"');
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    discordGuildId: env.DISCORD_GUILD_ID || undefined,
    logLevel: env.LOG_LEVEL || 'info',
    aiChatEnabled,
    xaiApiKey: env.XAI_API_KEY || undefined,
    xaiModel: env.XAI_MODEL || 'grok-4.3',
    xaiReasoningEffort: reasoningEffort,
    aiMaxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 1_000, 'AI_MAX_OUTPUT_TOKENS'),
    aiContextTokenBudget: positiveInteger(
      env.AI_CONTEXT_TOKEN_BUDGET,
      30_000,
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
