import 'dotenv/config';

export interface Config {
  discordToken: string;
  discordClientId: string;
  /** Test server ID for guild-scoped command deployment; undefined = deploy globally. */
  discordGuildId?: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    discordGuildId: env.DISCORD_GUILD_ID || undefined,
    logLevel: env.LOG_LEVEL || 'info',
  };
}
