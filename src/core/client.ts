import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from '../types/command.js';

export class BotClient extends Client<true> {
  commands = new Collection<string, Command>();
}

export function createClient(): BotClient {
  // Only the intents currently needed — Guilds covers slash commands,
  // GuildMessages lets the leveling system see messages (content not needed).
  return new BotClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
}
