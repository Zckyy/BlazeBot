import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { adjustDollars, getBalance } from '../../services/database/repositories/economy.js';
import { addItem, ownsItem } from '../../services/database/repositories/inventory.js';
import { getShopItem, SHOP_ITEMS } from '../../services/casino/items.js';

const itemChoices = SHOP_ITEMS.map((item) => ({ name: item.name, value: item.id }));

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('The item shop')
    .addSubcommand((sub) => sub.setName('list').setDescription('Browse the shop'))
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy an item with dollars')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('Item to buy')
            .setRequired(true)
            .addChoices(...itemChoices),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    if (interaction.options.getSubcommand() === 'list') {
      const lines = SHOP_ITEMS.map(
        (item) => `**${item.name}** — $${item.priceDollars}\n*${item.description}*`,
      );
      const embed = new EmbedBuilder()
        .setTitle('🛒 Item Shop')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: 'Buy with /shop buy • earn dollars via /cashout' })
        .setColor(0x9b59b6);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const item = getShopItem(interaction.options.getString('item', true))!;
    if (ownsItem(interaction.guildId, interaction.user.id, item.id)) {
      await interaction.reply(`You already own **${item.name}**.`);
      return;
    }

    const dollars = getBalance(interaction.guildId, interaction.user.id)?.dollars ?? 0;
    if (dollars < item.priceDollars) {
      await interaction.reply(
        `❌ **${item.name}** costs $${item.priceDollars} but you only have $${dollars}.`,
      );
      return;
    }

    const remaining = adjustDollars(interaction.guildId, interaction.user.id, -item.priceDollars);
    addItem(interaction.guildId, interaction.user.id, item.id);
    await interaction.reply(
      `🛍️ You bought **${item.name}**! ($${remaining} left)\n` +
        `Equip it with \`/inventory equip\` to activate its bonus.`,
    );
  },
};
