import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from '../types/command.js';

export class BotClient extends Client<true> {
  commands = new Collection<string, Command>();
}

export function createClient(): BotClient {
  return new BotClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Required for natural conversation inside dedicated AI chat threads.
      GatewayIntentBits.MessageContent,
    ],
  });
}
