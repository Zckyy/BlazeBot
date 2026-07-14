import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import {
  getRank,
  getUserLevel,
} from '../../services/database/repositories/userLevels.js';
import { totalXpForLevel, xpForLevel } from '../../services/leveling/xp.js';

function progressBar(current: number, needed: number, width = 10): string {
  const filled = Math.min(width, Math.floor((current / needed) * width));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription("Show a member's level, XP, and server rank")
    .addUserOption((option) =>
      option.setName('user').setDescription('Member to look up (defaults to you)'),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const target = interaction.options.getUser('user') ?? interaction.user;
    const userLevel = getUserLevel(interaction.guildId, target.id);

    if (!userLevel) {
      await interaction.reply(
        target.id === interaction.user.id
          ? "You're not ranked yet — send some messages to start earning XP!"
          : `${target.username} isn't ranked yet.`,
      );
      return;
    }

    const rank = getRank(interaction.guildId, target.id)!;
    const xpIntoLevel = userLevel.xp - totalXpForLevel(userLevel.level);
    const xpNeeded = xpForLevel(userLevel.level);

    const embed = new EmbedBuilder()
      .setTitle(`Rank — ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${userLevel.level}`, inline: true },
        { name: 'Rank', value: `#${rank}`, inline: true },
        { name: 'Total XP', value: `${userLevel.xp}`, inline: true },
        {
          name: `Progress to level ${userLevel.level + 1}`,
          value: `${progressBar(xpIntoLevel, xpNeeded)} ${xpIntoLevel}/${xpNeeded} XP`,
        },
      )
      .setColor(0xf0a020);

    await interaction.reply({ embeds: [embed] });
  },
};
