import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { closeDatabase, initDatabase } from '../src/services/database/db.js';
import {
  beginAiUserMessage,
  completeAiTurn,
  countCompletedAiMessages,
  createAiConversation,
  getActiveAiConversationByThreadId,
  getAiContextMessages,
  getGuildAiSpendToday,
  recordAiUsage,
  resetAiConversation,
} from '../src/services/database/repositories/aiChat.js';

before(() => initDatabase(':memory:'));
after(() => closeDatabase());

test('persists, completes, and resets a conversation turn', () => {
  const conversation = createAiConversation({
    guildId: 'guild',
    parentChannelId: 'channel',
    threadId: 'thread',
    ownerUserId: 'user',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    reasoningEffort: 'none',
  });
  assert.equal(getActiveAiConversationByThreadId('thread')?.id, conversation.id);
  assert.equal(getActiveAiConversationByThreadId('thread')?.provider, 'openrouter');
  assert.equal(
    beginAiUserMessage({
      conversationId: conversation.id,
      discordMessageId: 'message',
      authorUserId: 'user',
      content: 'Remember this',
      contextSegment: 0,
    }),
    true,
  );
  assert.equal(
    beginAiUserMessage({
      conversationId: conversation.id,
      discordMessageId: 'message',
      authorUserId: 'user',
      content: 'Duplicate',
      contextSegment: 0,
    }),
    false,
  );
  completeAiTurn({
    conversationId: conversation.id,
    discordMessageId: 'message',
    assistantContent: 'Remembered',
    contextSegment: 0,
  });

  assert.equal(countCompletedAiMessages(conversation.id, 0), 2);
  assert.deepEqual(getAiContextMessages(conversation.id, 0, 10_000), [
    { role: 'user', content: 'Remember this', authorUserId: 'user' },
    { role: 'assistant', content: 'Remembered', authorUserId: null },
  ]);
  assert.equal(resetAiConversation(conversation.id)?.contextSegment, 1);
  assert.deepEqual(getAiContextMessages(conversation.id, 1, 10_000), []);

  recordAiUsage({
    conversationId: conversation.id,
    guildId: 'guild',
    userId: 'user',
    providerResponseId: 'gen-test',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    inputTokens: 100,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    outputTokens: 20,
    serverSideToolCalls: 0,
    latencyMs: 100,
    estimatedCostUsd: 0.5,
    exactCostUsd: 0.2,
  });
  assert.equal(getGuildAiSpendToday('guild'), 0.2);
});
