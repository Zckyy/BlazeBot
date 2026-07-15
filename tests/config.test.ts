import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/core/config.js';

const baseEnv = {
  DISCORD_TOKEN: 'discord-test-token',
  DISCORD_CLIENT_ID: 'discord-client-id',
};

test('requires an OpenRouter key only when AI chat is enabled', () => {
  assert.throws(() => loadConfig({ ...baseEnv, AI_CHAT_ENABLED: 'true' }), /OPENROUTER_API_KEY/);
  assert.doesNotThrow(() => loadConfig({ ...baseEnv, AI_CHAT_ENABLED: 'false' }));
});

test('uses cost-conscious OpenRouter defaults', () => {
  const config = loadConfig({
    ...baseEnv,
    AI_CHAT_ENABLED: 'true',
    OPENROUTER_API_KEY: 'openrouter-test-key',
  });

  assert.equal(config.openRouterModel, 'deepseek/deepseek-v4-flash');
  assert.equal(config.aiWebSearchEnabled, true);
  assert.equal(config.aiMaxOutputTokens, 700);
  assert.equal(config.aiContextTokenBudget, 12_000);
});
