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
    model: 'grok-4.3',
    reasoningEffort: 'none',
  });
  assert.equal(getActiveAiConversationByThreadId('thread')?.id, conversation.id);
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
});
