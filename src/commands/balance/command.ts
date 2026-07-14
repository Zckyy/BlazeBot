import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { getBalance } from '../../services/database/repositories/economy.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show your chips and dollars'),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const balance = getBalance(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder()
      .setTitle(`💰 Balance — ${interaction.user.username}`)
      .addFields(
        { name: 'Chips', value: `🪙 ${balance?.chips ?? 0}`, inline: true },
        { name: 'Dollars', value: `💵 $${balance?.dollars ?? 0}`, inline: true },
      )
      .setColor(0x2ecc71);

    await interaction.reply({ embeds: [embed] });
  },
};
