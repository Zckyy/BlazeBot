import { loadConfig } from './core/config.js';
import { createClient } from './core/client.js';
import { loadCommands } from './core/commandLoader.js';
import { loadEvents } from './core/eventLoader.js';
import { logger } from './core/logger.js';
import { initDatabase } from './services/database/db.js';
import {
  startDailyReminderService,
  stopDailyReminderService,
} from './services/dailyReminders/service.js';

const config = loadConfig();

initDatabase();

const client = createClient();
client.commands = await loadCommands();
await loadEvents(client);

client.once('clientReady', (readyClient) => {
  startDailyReminderService(readyClient);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  stopDailyReminderService();
  client.destroy();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

await client.login(config.discordToken);
