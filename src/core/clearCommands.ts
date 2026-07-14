import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const config = loadConfig();
const rest = new REST().setToken(config.discordToken);

await rest.put(Routes.applicationCommands(config.discordClientId), { body: [] });
logger.info('Cleared global slash commands');

if (config.discordGuildId) {
  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
    body: [],
  });
  logger.info({ guildId: config.discordGuildId }, 'Cleared guild slash commands');
}
