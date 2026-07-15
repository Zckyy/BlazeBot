import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import {
  equipItem,
  getInventory,
  ownsItem,
  unequipSlot,
} from '../../services/database/repositories/inventory.js';
import { getShopItem, SHOP_ITEMS } from '../../services/casino/items.js';
import { getStacks } from '../../services/database/repositories/stackableInventory.js';
import { getFish } from '../../services/work/config.js';

const itemChoices = SHOP_ITEMS.map((item) => ({ name: item.name, value: item.id }));

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Your items')
    .addSubcommand((sub) => sub.setName('list').setDescription('Show your items'))
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip an item you own')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('Item to equip')
            .setRequired(true)
            .addChoices(...itemChoices),
        ),
    )
    .addSubcommand((sub) => sub.setName('unequip').setDescription('Unequip your equipped item')),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command only works in a server.' });
      return;
    }

    const { guildId } = interaction;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const inventory = getInventory(guildId, userId);
      const stacks = getStacks(guildId, userId);
      if (inventory.length === 0 && stacks.length === 0) {
        await interaction.reply(
          '🎒 Your inventory is empty — browse `/shop list` or try `/work fish`.',
        );
        return;
      }
      const lines = inventory.map((entry) => {
        const item = getShopItem(entry.itemId);
        const equipped = entry.equippedSlot !== null ? ' ✅ *equipped*' : '';
        return `**${item?.name ?? entry.itemId}**${equipped}\n*${item?.description ?? ''}*`;
      });
      const embed = new EmbedBuilder()
        .setTitle(`🎒 Inventory — ${interaction.user.username}`)
        .setColor(0x9b59b6);
      if (lines.length > 0) embed.setDescription(lines.join('\n\n'));
      if (stacks.length > 0) {
        embed.addFields({
          name: 'Resources',
          value: stacks
            .map((stack) => {
              const fish = getFish(stack.itemId);
              return fish
                ? `${fish.emoji} **${fish.name}** × ${stack.quantity} — $${fish.saleValue} each`
                : `**${stack.itemId}** × ${stack.quantity}`;
            })
            .join('\n'),
        });
      }
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'equip') {
      const item = getShopItem(interaction.options.getString('item', true))!;
      if (!ownsItem(guildId, userId, item.id)) {
        await interaction.reply(`❌ You don't own **${item.name}** — buy it in \`/shop\`.`);
        return;
      }
      equipItem(guildId, userId, item.id);
      await interaction.reply(`✅ Equipped **${item.name}** — ${item.description}`);
      return;
    }

    unequipSlot(guildId, userId);
    await interaction.reply('You unequipped your item.');
  },
};
