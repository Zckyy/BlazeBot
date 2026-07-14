import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/core/config.js';

describe('loadConfig', () => {
  const validEnv = {
    DISCORD_TOKEN: 'test-token',
    DISCORD_CLIENT_ID: '123456789',
    DISCORD_GUILD_ID: '987654321',
    LOG_LEVEL: 'debug',
  };

  it('returns config when all vars are present', () => {
    expect(loadConfig(validEnv)).toEqual({
      discordToken: 'test-token',
      discordClientId: '123456789',
      discordGuildId: '987654321',
      logLevel: 'debug',
    });
  });

  it('throws when DISCORD_TOKEN is missing', () => {
    expect(() => loadConfig({ DISCORD_CLIENT_ID: '123' })).toThrow(/DISCORD_TOKEN/);
  });

  it('throws when DISCORD_CLIENT_ID is missing', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'x' })).toThrow(/DISCORD_CLIENT_ID/);
  });

  it('lists all missing required vars in the error', () => {
    expect(() => loadConfig({})).toThrow(/DISCORD_TOKEN, DISCORD_CLIENT_ID/);
  });

  it('defaults optional vars', () => {
    const config = loadConfig({ DISCORD_TOKEN: 'x', DISCORD_CLIENT_ID: 'y' });
    expect(config.discordGuildId).toBeUndefined();
    expect(config.logLevel).toBe('info');
  });
});
