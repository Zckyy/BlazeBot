import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ClientEvents } from 'discord.js';
import type { BotClient } from './client.js';
import type { BotEvent } from '../types/event.js';
import { logger } from './logger.js';

const DEFAULT_EVENTS_DIR = path.join(import.meta.dirname, '..', 'events');

function isBotEvent(value: unknown): value is BotEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BotEvent>;
  return typeof candidate.name === 'string' && typeof candidate.execute === 'function';
}

export async function loadEvents(
  client: BotClient,
  dir: string = DEFAULT_EVENTS_DIR,
): Promise<number> {
  if (!existsSync(dir)) {
    logger.warn({ dir }, 'Events directory not found');
    return 0;
  }

  let count = 0;
  for (const file of readdirSync(dir)) {
    if (!/\.(ts|js)$/.test(file) || file.endsWith('.d.ts')) continue;

    const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as {
      event?: unknown;
      default?: unknown;
    };
    const event = mod.event ?? mod.default;
    if (!isBotEvent(event)) {
      logger.warn({ file }, 'File does not export a valid BotEvent ({ name, execute }) — skipped');
      continue;
    }

    const handler = (...args: ClientEvents[keyof ClientEvents]) => {
      Promise.resolve(event.execute(...args)).catch((error: unknown) => {
        logger.error({ err: error, event: event.name }, 'Unhandled error in event handler');
      });
    };
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);

    count += 1;
    logger.debug({ event: event.name, once: event.once ?? false }, 'Bound event');
  }

  logger.info({ count }, 'Events bound');
  return count;
}
