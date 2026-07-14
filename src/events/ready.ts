import type { BotEvent } from '../types/event.js';
import { logger } from '../core/logger.js';

export const event: BotEvent<'clientReady'> = {
  name: 'clientReady',
  once: true,
  execute(client) {
    logger.info(`Bot online as ${client.user.tag}`);
  },
};
