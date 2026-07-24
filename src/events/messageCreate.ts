import type { BotEvent } from '../types/event.js';
import { logger } from '../core/logger.js';
import { addXp } from '../services/database/repositories/userLevels.js';
import { randomXpAward } from '../services/leveling/xp.js';
import { getActiveAiConversationByThreadId } from '../services/database/repositories/aiChat.js';

const XP_COOLDOWN_MS = 5_000;

// guildId:userId -> timestamp of last XP award. In-memory is fine: worst case a
// restart lets everyone earn one extra award early.
const lastAward = new Map<string, number>();

export const event: BotEvent<'messageCreate'> = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guildId) return;
    // AI threads already encourage rapid messages and must not become an XP farm.
    if (getActiveAiConversationByThreadId(message.channelId)) return;

    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const last = lastAward.get(key);
    if (last !== undefined && now - last < XP_COOLDOWN_MS) return;
    lastAward.set(key, now);

    const { userLevel, leveledUp, chipsAwarded } = addXp(
      message.guildId,
      message.author.id,
      randomXpAward(),
    );

    if (leveledUp) {
      try {
        await message.channel.send(
          `🎉 GG ${message.author}, you've reached level **${userLevel.level}** and earned 🪙 **${chipsAwarded} chips**!`,
        );
      } catch (error) {
        logger.warn({ err: error, channel: message.channelId }, 'Failed to send level-up message');
      }
    }
  },
};
