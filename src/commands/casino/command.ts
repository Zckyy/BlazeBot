import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { hubView } from '../../interactions/casino/index.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('casino')
    .setDescription('Open the casino and pick a game'),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }
    await interaction.reply(hubView(interaction.guildId, interaction.user.id));
  },
};
