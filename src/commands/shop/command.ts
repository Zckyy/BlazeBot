import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { adjustDollars, getBalance } from '../../services/database/repositories/economy.js';
import { addItem, ownsItem } from '../../services/database/repositories/inventory.js';
import {
  getStack,
  sellStackForDollars,
} from '../../services/database/repositories/stackableInventory.js';
import { getShopItem, SHOP_ITEMS } from '../../services/casino/items.js';
import { FISH, getFish } from '../../services/work/config.js';

const itemChoices = SHOP_ITEMS.map((item) => ({ name: item.name, value: item.id }));
const fishChoices = FISH.map((fish) => ({
  name: `${fish.name} ($${fish.saleValue} each)`,
  value: fish.id,
}));

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
    )
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('Sell fish from your inventory for dollars')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('Fish to sell')
            .setRequired(true)
            .addChoices(...fishChoices),
        )
        .addIntegerOption((o) =>
          o.setName('quantity').setDescription('How many to sell (default: 1)').setMinValue(1),
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
        .addFields({
          name: '🎣 Fish market',
          value: FISH.map(
            (fish) => `${fish.emoji} **${fish.name}** — sell for $${fish.saleValue}`,
          ).join('\n'),
        })
        .setFooter({ text: 'Buy with /shop buy • sell fish with /shop sell' })
        .setColor(0x9b59b6);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.options.getSubcommand() === 'sell') {
      const fish = getFish(interaction.options.getString('item', true))!;
      const quantity = interaction.options.getInteger('quantity') ?? 1;
      const owned = getStack(interaction.guildId, interaction.user.id, fish.id);
      if (owned < quantity) {
        await interaction.reply(
          `❌ You tried to sell **${quantity} ${fish.name}**, but you only own **${owned}**.`,
        );
        return;
      }
      const result = sellStackForDollars(
        interaction.guildId,
        interaction.user.id,
        fish.id,
        quantity,
        fish.saleValue,
      );
      if (!result) {
        await interaction.reply('❌ Your inventory changed before the sale completed. Try again.');
        return;
      }
      await interaction.reply(
        `${fish.emoji} Sold **${quantity} ${fish.name}** for **$${result.dollarsGained}**. ` +
          `You have **${result.remainingQuantity}** left and **$${result.dollars}** total.`,
      );
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
