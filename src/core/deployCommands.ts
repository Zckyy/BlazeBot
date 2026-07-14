import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { loadCommands } from './commandLoader.js';
import { logger } from './logger.js';

const config = loadConfig();
const commands = await loadCommands();
const body = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(config.discordToken);

if (config.discordGuildId) {
  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
    body,
  });
  logger.info(
    { count: body.length, guildId: config.discordGuildId },
    'Deployed guild slash commands (instant)',
  );
} else {
  await rest.put(Routes.applicationCommands(config.discordClientId), { body });
  logger.info({ count: body.length }, 'Deployed global slash commands (~1h to propagate)');
}
