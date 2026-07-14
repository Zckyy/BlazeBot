import { loadConfig } from './core/config.js';
import { createClient } from './core/client.js';
import { loadCommands } from './core/commandLoader.js';
import { loadEvents } from './core/eventLoader.js';
import { logger } from './core/logger.js';
import { initDatabase } from './services/database/db.js';

const config = loadConfig();

initDatabase();

const client = createClient();
client.commands = await loadCommands();
await loadEvents(client);

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

await client.login(config.discordToken);
