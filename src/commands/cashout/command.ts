import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import {
  cashOut,
  CHIPS_PER_DOLLAR,
  getBalance,
} from '../../services/database/repositories/economy.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('cashout')
    .setDescription(`Convert chips into dollars (${CHIPS_PER_DOLLAR} chips = $1)`)
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Chips to convert')
        .setRequired(true)
        .setMinValue(CHIPS_PER_DOLLAR),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const balance = getBalance(interaction.guildId, interaction.user.id);
    if ((balance?.chips ?? 0) < amount) {
      await interaction.reply(
        `❌ You only have **${balance?.chips ?? 0}** chips — can't cash out ${amount}.`,
      );
      return;
    }

    const result = cashOut(interaction.guildId, interaction.user.id, amount);
    await interaction.reply(
      `💵 Cashed out **$${result.dollarsGained}**! ` +
        `You now have 🪙 **${result.chips}** chips and 💵 **$${result.dollars}**.`,
    );
  },
};
