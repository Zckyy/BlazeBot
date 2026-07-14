import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getBalance } from '../../services/database/repositories/economy.js';
import type { BetType } from '../../services/casino/roulette.js';
import { decodeCasinoId, encodeCasinoId } from './ids.js';
import {
  amountInput,
  customAmountModal,
  GOLD,
  parseAmountArg,
  parsePositiveInt,
  replyEphemeral,
  update,
  type CasinoInteraction,
  type CasinoView,
} from './shared.js';
import { amountView, rouletteView, spinAndRender } from './roulette.js';
import { playSlotsAndRender, slotsView } from './slots.js';
import {
  blackjackBetView,
  dealBlackjackAndRender,
  hitAndRender,
  standAndRender,
} from './blackjack.js';

export { CASINO_PREFIX, decodeCasinoId, encodeCasinoId } from './ids.js';

export function hubView(guildId: string, userId: string): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const embed = new EmbedBuilder()
    .setTitle('🎰 BlazeBot Casino')
    .setDescription(
      `Welcome to the casino! You have 🪙 **${chips}** chips.\n\n` +
        'Pick a game below. Need chips? Try `/daily`.',
    )
    .setColor(GOLD);

  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeCasinoId(userId, 'game'))
    .setPlaceholder('Pick a game')
    .addOptions(
      {
        label: 'Roulette',
        value: 'roulette',
        emoji: '🎡',
        description: 'Bet on numbers, colors, and more',
      },
      {
        label: 'Slots',
        value: 'slots',
        emoji: '🎰',
        description: 'Match three symbols for the big payouts',
      },
      {
        label: 'Blackjack',
        value: 'blackjack',
        emoji: '🃏',
        description: 'Hit or stand — beat the dealer to 21',
      },
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

// One casino action per user at a time — rapid double-clicks on a settling
// button (e.g. blackjack Stand) would otherwise pay out twice.
const inFlight = new Set<string>();

export async function handleCasinoInteraction(interaction: CasinoInteraction): Promise<void> {
  const decoded = decodeCasinoId(interaction.customId);
  if (!decoded || !interaction.guildId) return;

  if (decoded.userId !== interaction.user.id) {
    await replyEphemeral(interaction, 'This is not your game — start your own with `/casino`.');
    return;
  }

  const { guildId } = interaction;
  const userId = interaction.user.id;
  const lockKey = `${guildId}:${userId}`;
  if (inFlight.has(lockKey)) {
    await replyEphemeral(interaction, '⏳ Hold on — your previous action is still processing.');
    return;
  }
  inFlight.add(lockKey);
  try {
    await dispatch(interaction, decoded.action, decoded.args, guildId, userId);
  } finally {
    inFlight.delete(lockKey);
  }
}

async function dispatch(
  interaction: CasinoInteraction,
  action: string,
  args: string[],
  guildId: string,
  userId: string,
): Promise<void> {
  switch (action) {
    case 'hub':
      await update(interaction, hubView(guildId, userId));
      return;

    case 'game': {
      if (!interaction.isStringSelectMenu()) return;
      const picked = interaction.values[0];
      if (picked === 'slots') await update(interaction, slotsView(guildId, userId));
      else if (picked === 'blackjack') await update(interaction, blackjackBetView(guildId, userId));
      else await update(interaction, rouletteView(guildId, userId));
      return;
    }

    case 'again':
      await update(interaction, rouletteView(guildId, userId));
      return;

    case 's-again':
      await update(interaction, slotsView(guildId, userId));
      return;

    case 'bj-again':
      await update(interaction, blackjackBetView(guildId, userId));
      return;

    // ---- Roulette ----

    case 'bet': {
      const [type, value] = args;
      await update(interaction, amountView(guildId, userId, type as BetType, value));
      return;
    }

    case 'amt': {
      const [type, value, amountArg] = args;
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = parseAmountArg(amountArg, chips);
      if (amount === undefined) return;
      await spinAndRender(interaction, guildId, userId, { type: type as BetType, value, amount });
      return;
    }

    case 'custom': {
      const [type, value] = args;
      if (!interaction.isButton()) return;
      await interaction.showModal(customAmountModal(userId, 'modal-amt', type, value));
      return;
    }

    case 'num': {
      if (!interaction.isButton()) return;
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(encodeCasinoId(userId, 'modal-num'))
          .setTitle('Straight number bet (pays 35:1)')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('number')
                .setLabel('Number (0-36)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput()),
          ),
      );
      return;
    }

    case 'modal-amt': {
      if (!interaction.isModalSubmit()) return;
      const [type, value] = args;
      const amount = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
      if (amount === undefined) {
        await replyEphemeral(interaction, '❌ Enter a whole number of chips (e.g. 375).');
        return;
      }
      await spinAndRender(interaction, guildId, userId, { type: type as BetType, value, amount });
      return;
    }

    case 'modal-num': {
      if (!interaction.isModalSubmit()) return;
      const number = parsePositiveInt(interaction.fields.getTextInputValue('number'), 0);
      const amount = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
      if (number === undefined || number > 36) {
        await replyEphemeral(interaction, '❌ The number must be between 0 and 36.');
        return;
      }
      if (amount === undefined) {
        await replyEphemeral(interaction, '❌ Enter a whole number of chips (e.g. 375).');
        return;
      }
      await spinAndRender(interaction, guildId, userId, { type: 'number', value: number, amount });
      return;
    }

    // ---- Slots ----

    case 's-amt': {
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = parseAmountArg(args[0], chips);
      if (amount === undefined) return;
      await playSlotsAndRender(interaction, guildId, userId, amount);
      return;
    }

    case 's-custom': {
      if (!interaction.isButton()) return;
      await interaction.showModal(customAmountModal(userId, 's-modal'));
      return;
    }

    case 's-modal': {
      if (!interaction.isModalSubmit()) return;
      const amount = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
      if (amount === undefined) {
        await replyEphemeral(interaction, '❌ Enter a whole number of chips (e.g. 375).');
        return;
      }
      await playSlotsAndRender(interaction, guildId, userId, amount);
      return;
    }

    // ---- Blackjack ----

    case 'bj-amt': {
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = parseAmountArg(args[0], chips);
      if (amount === undefined) return;
      await dealBlackjackAndRender(interaction, guildId, userId, amount);
      return;
    }

    case 'bj-custom': {
      if (!interaction.isButton()) return;
      await interaction.showModal(customAmountModal(userId, 'bj-modal'));
      return;
    }

    case 'bj-modal': {
      if (!interaction.isModalSubmit()) return;
      const amount = parsePositiveInt(interaction.fields.getTextInputValue('amount'));
      if (amount === undefined) {
        await replyEphemeral(interaction, '❌ Enter a whole number of chips (e.g. 375).');
        return;
      }
      await dealBlackjackAndRender(interaction, guildId, userId, amount);
      return;
    }

    case 'bj-hit':
      await hitAndRender(interaction, guildId, userId, args);
      return;

    case 'bj-stand':
      await standAndRender(interaction, guildId, userId, args);
      return;
  }
}
