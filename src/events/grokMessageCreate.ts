import type { BotEvent } from '../types/event.js';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getActiveAiConversationByThreadId } from '../services/database/repositories/aiChat.js';
import { continueGrokConversation } from '../services/aiChat/chat.js';
import { aiErrorMessage } from '../services/aiChat/errors.js';
import { splitDiscordMessage } from '../services/aiChat/format.js';
import { enqueueConversation } from '../services/aiChat/queue.js';

const MAX_PROMPT_LENGTH = 4_000;
const USER_COOLDOWN_MS = 5_000;
const lastPromptAt = new Map<string, number>();

export const event: BotEvent<'messageCreate'> = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guildId || !message.channel.isThread()) return;
    const conversation = getActiveAiConversationByThreadId(message.channelId);
    if (!conversation) return;
    if (conversation.ownerUserId !== message.author.id) return;
    if (!loadConfig().aiChatEnabled) return;

    const content = message.content.trim();
    if (!content) return;
    if (content.length > MAX_PROMPT_LENGTH) {
      await message.reply({
        content: `Please keep Grok prompts under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const cooldownKey = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const last = lastPromptAt.get(cooldownKey) ?? 0;
    if (now - last < USER_COOLDOWN_MS) {
      await message.reply({
        content: 'Give Grok a few seconds before sending another message.',
        allowedMentions: { parse: [] },
      });
      return;
    }
    lastPromptAt.set(cooldownKey, now);

    await message.channel.sendTyping();
    const typingTimer = setInterval(() => void message.channel.sendTyping(), 8_000);
    try {
      const response = await enqueueConversation(conversation.id, () =>
        continueGrokConversation(conversation, {
          discordMessageId: message.id,
          userId: message.author.id,
          message: content,
        }),
      );
      const chunks = splitDiscordMessage(response.text);
      await message.reply({ content: chunks[0], allowedMentions: { parse: [] } });
      for (const chunk of chunks.slice(1)) {
        await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
      }
    } catch (error) {
      logger.warn(
        { err: error, conversationId: conversation.id, messageId: message.id },
        'Grok conversation turn failed',
      );
      await message.reply({ content: aiErrorMessage(error), allowedMentions: { parse: [] } });
    } finally {
      clearInterval(typingTimer);
    }
  },
};
