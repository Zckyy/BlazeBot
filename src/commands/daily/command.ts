import { SlashCommandBuilder, time } from 'discord.js';
import type { Command } from '../../types/command.js';
import { claimDaily, DAILY_CHIPS } from '../../services/database/repositories/economy.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription(`Claim your daily ${DAILY_CHIPS} casino chips`),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const result = claimDaily(interaction.guildId, interaction.user.id);
    if (result.alreadyClaimed) {
      await interaction.reply(
        `⏳ You've already claimed today — come back ${time(result.nextClaimAt!, 'R')}.`,
      );
      return;
    }

    await interaction.reply(
      `🪙 You claimed **${DAILY_CHIPS}** chips! You now have **${result.chips}** chips.`,
    );
  },
};
