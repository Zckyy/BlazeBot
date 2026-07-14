import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { adjustChips, adjustDollars, getBalance } from '../../services/database/repositories/economy.js';

const CURRENCY_EMOJI = { chips: '🪙', dollars: '💵' } as const;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give chips or dollars to another player')
    .addUserOption((option) =>
      option.setName('user').setDescription('Who to give to').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('currency')
        .setDescription('Which currency to give')
        .setRequired(true)
        .addChoices(
          { name: 'Chips', value: 'chips' },
          { name: 'Dollars', value: 'dollars' },
        ),
    )
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const recipient = interaction.options.getUser('user', true);
    const currency = interaction.options.getString('currency', true) as 'chips' | 'dollars';
    const amount = interaction.options.getInteger('amount', true);
    const adjust = currency === 'chips' ? adjustChips : adjustDollars;
    const emoji = CURRENCY_EMOJI[currency];

    if (recipient.id === interaction.user.id) {
      await interaction.reply(`❌ You can't give ${currency} to yourself.`);
      return;
    }
    if (recipient.bot) {
      await interaction.reply(`❌ You can't give ${currency} to a bot.`);
      return;
    }

    const senderBalance = getBalance(interaction.guildId, interaction.user.id);
    const current = currency === 'chips' ? senderBalance?.chips : senderBalance?.dollars;
    if ((current ?? 0) < amount) {
      await interaction.reply(`❌ You only have ${emoji} ${current ?? 0} — can't give ${amount}.`);
      return;
    }

    const senderNewBalance = adjust(interaction.guildId, interaction.user.id, -amount);
    adjust(interaction.guildId, recipient.id, amount);

    await interaction.reply(
      `🎁 ${interaction.user} gave ${emoji} **${amount}** ${currency} to ${recipient}! ` +
        `Your balance: ${emoji} **${senderNewBalance}**.`,
    );
  },
};
