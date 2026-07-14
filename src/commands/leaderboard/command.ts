import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { getLeaderboard } from '../../services/database/repositories/userLevels.js';

const PAGE_SIZE = 10;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the most active members by XP')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const page = interaction.options.getInteger('page') ?? 1;
    const entries = getLeaderboard(interaction.guildId, PAGE_SIZE, (page - 1) * PAGE_SIZE);

    if (entries.length === 0) {
      await interaction.reply(
        page === 1 ? 'No one has earned XP yet — start chatting!' : `Page ${page} is empty.`,
      );
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = entries.map((entry) => {
      const marker = medals[entry.rank - 1] ?? `**#${entry.rank}**`;
      return `${marker} <@${entry.userId}> — Level ${entry.level} (${entry.xp} XP)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Page ${page}` })
      .setColor(0xf0a020);

    await interaction.reply({ embeds: [embed] });
  },
};
