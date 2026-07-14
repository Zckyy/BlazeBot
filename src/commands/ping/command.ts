import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong! and round-trip latency'),

  async execute(interaction) {
    const start = Date.now();
    await interaction.deferReply();
    const roundTrip = Date.now() - start;
    const gateway = Math.round(interaction.client.ws.ping);
    await interaction.editReply(`Pong! Round-trip: ${roundTrip}ms | Gateway: ${gateway}ms`);
  },
};
