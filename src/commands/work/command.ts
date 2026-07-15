import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { workHubView } from '../../interactions/work/hub.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Open the work hub and complete activities for XP'),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command only works in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      ...workHubView(interaction.guildId, interaction.user.id),
      flags: MessageFlags.Ephemeral,
    });
  },
};
