import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { adjustChips, getBalance } from '../services/database/repositories/economy.js';
import { getEquippedMultiplier } from '../services/database/repositories/inventory.js';
import { resolveBet, spin, type Bet, type BetType } from '../services/casino/roulette.js';
import { resolveSpin, SLOT_PAYOUTS, spinReels, TWO_CHERRY_PAYOUT } from '../services/casino/slots.js';
import {
  decodeHand,
  drawCard,
  encodeHand,
  handValue,
  isBlackjack,
  isBust,
  payoutRatio,
  playDealerHand,
  resolveHand,
  type Card,
  type Outcome,
} from '../services/casino/blackjack.js';

// ---------------------------------------------------------------------------
// customId codec — all flow state travels inside the customId (stateless).
// Format: casino:<userId>:<action>[:<arg>...]
// ---------------------------------------------------------------------------

export const CASINO_PREFIX = 'casino';

export interface CasinoId {
  userId: string;
  action: string;
  args: string[];
}

export function encodeCasinoId(userId: string, action: string, ...args: string[]): string {
  return [CASINO_PREFIX, userId, action, ...args].join(':');
}

export function decodeCasinoId(customId: string): CasinoId | undefined {
  const parts = customId.split(':');
  if (parts.length < 3 || parts[0] !== CASINO_PREFIX) return undefined;
  const [, userId, action, ...args] = parts;
  if (!userId || !action) return undefined;
  return { userId, action, args };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const GOLD = 0xf0a020;
const COLOR_EMOJI = { red: '🔴', black: '⚫', green: '🟢' } as const;
const PRESET_AMOUNTS = [50, 100, 250];

type CasinoView = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
};

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

function rouletteView(guildId: string, userId: string): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const embed = new EmbedBuilder()
    .setTitle('🎡 Roulette')
    .setDescription(
      `You have 🪙 **${chips}** chips.\n\n` +
        '**Payouts**\n' +
        '🎯 Straight number — 35:1\n' +
        '🔴⚫ Red/Black, Even/Odd, 1-18/19-36 — 1:1\n' +
        '🟢 Zero wipes out all outside bets. House always wins... usually.',
    )
    .setColor(GOLD);

  const bet = (type: BetType, value: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, 'bet', type, value))
      .setLabel(label)
      .setStyle(style);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        bet('color', 'red', '🔴 Red', ButtonStyle.Danger),
        bet('color', 'black', '⚫ Black'),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        bet('parity', 'even', 'Even'),
        bet('parity', 'odd', 'Odd'),
        bet('range', 'low', '1-18'),
        bet('range', 'high', '19-36'),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'num'))
          .setLabel('🎯 Straight Number (35:1)')
          .setStyle(ButtonStyle.Primary),
        backToGamesButton(userId),
      ),
    ],
  };
}

function amountView(guildId: string, userId: string, type: BetType, value: string): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const embed = new EmbedBuilder()
    .setTitle('🎡 Roulette — place your bet')
    .setDescription(`Betting on ${describeBet(type, value)}. How many chips? (You have 🪙 **${chips}**)`)
    .setColor(GOLD);

  const amountButtons = PRESET_AMOUNTS.map((amount) =>
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, 'amt', type, value, String(amount)))
      .setLabel(String(amount))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(amount > chips),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...amountButtons,
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'amt', type, value, 'all'))
          .setLabel(`All-in (${chips})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(chips === 0),
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'custom', type, value))
          .setLabel('Custom…')
          .setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(backToRouletteButton(userId)),
    ],
  };
}

function resultView(
  guildId: string,
  userId: string,
  bet: Bet,
  outcome: { number: number; color: keyof typeof COLOR_EMOJI; won: boolean; winnings: number; multiplier: number; newChips: number },
): CasinoView {
  const outcomeLine = outcome.won
    ? `You won 🪙 **${outcome.winnings}**${outcome.multiplier > 1 ? ` (item bonus ×${outcome.multiplier})` : ''}! 🎉`
    : `You lost 🪙 **${bet.amount}**. 💸`;

  const embed = new EmbedBuilder()
    .setTitle('🎡 Roulette')
    .setDescription(
      `Bet: 🪙 **${bet.amount}** on ${describeBet(bet.type, String(bet.value))}\n\n` +
        `The ball lands on ${COLOR_EMOJI[outcome.color]} **${outcome.number}**!\n${outcomeLine}\n\n` +
        `Balance: 🪙 **${outcome.newChips}** chips`,
    )
    .setColor(outcome.won ? 0x2ecc71 : 0xe74c3c);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'again'))
          .setLabel('🎡 Spin again')
          .setStyle(ButtonStyle.Primary),
        backToGamesButton(userId),
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function slotsView(guildId: string, userId: string): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const payoutLines = Object.entries(SLOT_PAYOUTS)
    .map(([symbol, payout]) => `${symbol}${symbol}${symbol} — ${payout}:1`)
    .join('   ');
  const embed = new EmbedBuilder()
    .setTitle('🎰 Slots')
    .setDescription(
      `You have 🪙 **${chips}** chips.\n\n` +
        `**Payouts (three of a kind)**\n${payoutLines}\n` +
        `🍒🍒 any two cherries — ${TWO_CHERRY_PAYOUT}:1\n\nHow much are you putting in?`,
    )
    .setColor(GOLD);

  return {
    embeds: [embed],
    components: [
      betAmountRow(userId, chips, 's-amt', 's-custom'),
      new ActionRowBuilder<ButtonBuilder>().addComponents(backToGamesButton(userId)),
    ],
  };
}

function slotsResultView(
  guildId: string,
  userId: string,
  amount: number,
  outcome: { reels: string[]; won: boolean; winnings: number; multiplier: number; newChips: number },
): CasinoView {
  const outcomeLine = outcome.won
    ? `You won 🪙 **${outcome.winnings}**${outcome.multiplier > 1 ? ` (item bonus ×${outcome.multiplier})` : ''}! 🎉`
    : `You lost 🪙 **${amount}**. 💸`;

  const embed = new EmbedBuilder()
    .setTitle('🎰 Slots')
    .setDescription(
      `Bet: 🪙 **${amount}**\n\n` +
        `▶️ ${outcome.reels.join(' | ')} ◀️\n${outcomeLine}\n\n` +
        `Balance: 🪙 **${outcome.newChips}** chips`,
    )
    .setColor(outcome.won ? 0x2ecc71 : 0xe74c3c);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 's-again'))
          .setLabel('🎰 Spin again')
          .setStyle(ButtonStyle.Primary),
        backToGamesButton(userId),
      ),
    ],
  };
}

function runSlotsSpin(guildId: string, userId: string, amount: number) {
  const result = spinReels();
  const payoutRatio = resolveSpin(result);
  const won = payoutRatio > 0;
  // Item multipliers boost winnings only; losses are never multiplied.
  const multiplier = getEquippedMultiplier(guildId, userId);
  const winnings = won ? Math.floor(amount * payoutRatio * multiplier) : 0;
  const newChips = adjustChips(guildId, userId, won ? winnings : -amount);
  return { reels: [...result.reels], won, winnings, multiplier, newChips };
}

// ---------------------------------------------------------------------------
// Video Blackjack
// ---------------------------------------------------------------------------

const SUIT_SYMBOLS = { H: '♥', D: '♦', C: '♣', S: '♠' } as const;

function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function handLine(cards: Card[]): string {
  const { total, soft } = handValue(cards);
  return `${cards.map(cardLabel).join('  ')}  —  **Total: ${total}${soft ? ' (soft)' : ''}**`;
}

const OUTCOME_LINES: Record<Outcome, string> = {
  blackjack: '**Blackjack!** Pays 3:2 🎉',
  win: 'You beat the dealer! 🎉',
  dealer_bust: 'Dealer busts — you win! 🎉',
  push: 'Push — your stake is returned. 🤝',
  lose: 'Dealer wins. 💸',
  bust: 'Bust! Over 21. 💸',
};

function blackjackBetView(guildId: string, userId: string): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setDescription(
      `You have 🪙 **${chips}** chips.\n\n` +
        '**Rules**\n' +
        'Hit or stand — no doubles, no splits. Dealer draws to 17.\n' +
        'Win pays 1:1 • Blackjack pays 3:2 • Push returns your stake.\n\nHow much are you putting in?',
    )
    .setColor(GOLD);

  return {
    embeds: [embed],
    components: [
      betAmountRow(userId, chips, 'bj-amt', 'bj-custom'),
      new ActionRowBuilder<ButtonBuilder>().addComponents(backToGamesButton(userId)),
    ],
  };
}

function blackjackTableView(
  userId: string,
  playerCards: Card[],
  dealerUpcard: Card,
  amount: number,
): CasinoView {
  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setDescription(
      `Bet: 🪙 **${amount}** (already staked)\n\n` +
        `**Dealer:** ${cardLabel(dealerUpcard)}  🂠  —  **Showing: ${handValue([dealerUpcard]).total}**\n` +
        `**You:** ${handLine(playerCards)}\n\nHit for another card, or stand to end your turn.`,
    )
    .setColor(GOLD);

  const playerStr = encodeHand(playerCards);
  const dealerStr = encodeHand([dealerUpcard]);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'bj-hit', playerStr, dealerStr, String(amount)))
          .setLabel('🃏 Hit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'bj-stand', playerStr, dealerStr, String(amount)))
          .setLabel('✋ Stand')
          .setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function blackjackResultView(
  userId: string,
  playerCards: Card[],
  dealerCards: Card[],
  amount: number,
  outcome: Outcome,
  settled: { winnings: number; multiplier: number; newChips: number },
): CasinoView {
  const ratio = payoutRatio(outcome);
  const chipsLine =
    ratio > 0
      ? `You won 🪙 **${settled.winnings}**${settled.multiplier > 1 ? ` (item bonus ×${settled.multiplier})` : ''}!`
      : ratio === 0
        ? `🪙 **${amount}** returned.`
        : `You lost 🪙 **${amount}**.`;

  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setDescription(
      `Bet: 🪙 **${amount}**\n\n` +
        `**Dealer:** ${handLine(dealerCards)}\n` +
        `**You:** ${handLine(playerCards)}\n\n` +
        `${OUTCOME_LINES[outcome]}\n${chipsLine}\n\n` +
        `Balance: 🪙 **${settled.newChips}** chips`,
    )
    .setColor(ratio > 0 ? 0x2ecc71 : ratio === 0 ? GOLD : 0xe74c3c);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCasinoId(userId, 'bj-again'))
          .setLabel('🃏 Deal again')
          .setStyle(ButtonStyle.Primary),
        backToGamesButton(userId),
      ),
    ],
  };
}

/**
 * Settles a finished round. The stake was deducted at deal time, so wins return
 * stake + net winnings (item multiplier boosts the net part only), pushes return
 * the stake, and losses need no further movement.
 */
function settleBlackjack(
  guildId: string,
  userId: string,
  amount: number,
  outcome: Outcome,
): { winnings: number; multiplier: number; newChips: number } {
  const ratio = payoutRatio(outcome);
  const multiplier = getEquippedMultiplier(guildId, userId);
  if (ratio > 0) {
    const winnings = Math.floor(amount * ratio * multiplier);
    return { winnings, multiplier, newChips: adjustChips(guildId, userId, amount + winnings) };
  }
  if (ratio === 0) {
    return { winnings: 0, multiplier, newChips: adjustChips(guildId, userId, amount) };
  }
  return { winnings: 0, multiplier, newChips: getBalance(guildId, userId)?.chips ?? 0 };
}

// ---------------------------------------------------------------------------
// Shared buttons
// ---------------------------------------------------------------------------

/** Preset / all-in / custom bet-amount buttons shared by slots and video poker. */
function betAmountRow(
  userId: string,
  chips: number,
  amtAction: string,
  customAction: string,
): ActionRowBuilder<ButtonBuilder> {
  const amountButtons = PRESET_AMOUNTS.map((amount) =>
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, amtAction, String(amount)))
      .setLabel(String(amount))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(amount > chips),
  );
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...amountButtons,
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, amtAction, 'all'))
      .setLabel(`All-in (${chips})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(chips === 0),
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, customAction))
      .setLabel('Custom…')
      .setStyle(ButtonStyle.Primary),
  );
}

function backToGamesButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCasinoId(userId, 'hub'))
    .setLabel('⬅ Games')
    .setStyle(ButtonStyle.Secondary);
}

function backToRouletteButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCasinoId(userId, 'again'))
    .setLabel('⬅ Back')
    .setStyle(ButtonStyle.Secondary);
}

function describeBet(type: BetType, value: string): string {
  if (type === 'number') return `number **${value}**`;
  if (type === 'range') return value === 'low' ? '**1-18**' : '**19-36**';
  return `**${value}**`;
}

// ---------------------------------------------------------------------------
// Spin execution (same logic the old /roulette command used)
// ---------------------------------------------------------------------------

function runSpin(guildId: string, userId: string, bet: Bet) {
  const result = spin();
  const payoutRatio = resolveBet(bet, result);
  const won = payoutRatio > 0;
  // Item multipliers boost winnings only; losses are never multiplied.
  const multiplier = getEquippedMultiplier(guildId, userId);
  const winnings = won ? Math.floor(bet.amount * payoutRatio * multiplier) : 0;
  const newChips = adjustChips(guildId, userId, won ? winnings : -bet.amount);
  return { number: result.number, color: result.color, won, winnings, multiplier, newChips };
}

// ---------------------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------------------

type CasinoInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export async function handleCasinoInteraction(interaction: CasinoInteraction): Promise<void> {
  const decoded = decodeCasinoId(interaction.customId);
  if (!decoded || !interaction.guildId) return;

  if (decoded.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'This is not your game — start your own with `/casino`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { guildId } = interaction;
  const userId = interaction.user.id;

  switch (decoded.action) {
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

    case 'bet': {
      const [type, value] = decoded.args;
      await update(interaction, amountView(guildId, userId, type as BetType, value));
      return;
    }

    case 'amt': {
      const [type, value, amountArg] = decoded.args;
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = amountArg === 'all' ? chips : Number(amountArg);
      await spinAndRender(interaction, guildId, userId, { type: type as BetType, value, amount });
      return;
    }

    case 'custom': {
      const [type, value] = decoded.args;
      if (!interaction.isButton()) return;
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(encodeCasinoId(userId, 'modal-amt', type, value))
          .setTitle('Custom bet')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput()),
          ),
      );
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
      const [type, value] = decoded.args;
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
      const [amountArg] = decoded.args;
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = amountArg === 'all' ? chips : Number(amountArg);
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

    // ---- Video Blackjack ----

    case 'bj-amt': {
      const [amountArg] = decoded.args;
      const chips = getBalance(guildId, userId)?.chips ?? 0;
      const amount = amountArg === 'all' ? chips : Number(amountArg);
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

    case 'bj-hit': {
      const [playerStr, dealerStr, amountStr] = decoded.args;
      const playerCards = playerStr ? decodeHand(playerStr) : undefined;
      const dealerCards = dealerStr ? decodeHand(dealerStr) : undefined;
      const amount = Number(amountStr);
      if (!playerCards || !dealerCards || !Number.isInteger(amount) || amount < 1) return;
      playerCards.push(drawCard());
      if (isBust(playerCards)) {
        // Loss was settled by the up-front stake deduction; dealer never plays.
        const settled = settleBlackjack(guildId, userId, amount, 'bust');
        await update(
          interaction,
          blackjackResultView(userId, playerCards, dealerCards, amount, 'bust', settled),
        );
        return;
      }
      await update(interaction, blackjackTableView(userId, playerCards, dealerCards[0], amount));
      return;
    }

    case 'bj-stand': {
      const [playerStr, dealerStr, amountStr] = decoded.args;
      const playerCards = playerStr ? decodeHand(playerStr) : undefined;
      const upcard = dealerStr ? decodeHand(dealerStr) : undefined;
      const amount = Number(amountStr);
      if (!playerCards || !upcard || !Number.isInteger(amount) || amount < 1) return;
      // Hole card is drawn now — with an infinite shoe this is equivalent to
      // having drawn it at deal time, and it matches the reveal-at-end UX.
      const dealerCards = playDealerHand([upcard[0], drawCard()]);
      const outcome = resolveHand(playerCards, dealerCards);
      const settled = settleBlackjack(guildId, userId, amount, outcome);
      await update(
        interaction,
        blackjackResultView(userId, playerCards, dealerCards, amount, outcome, settled),
      );
      return;
    }
  }
}

async function dealBlackjackAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (amount < 1 || amount > chips) {
    await replyEphemeral(
      interaction,
      `❌ You have 🪙 **${chips}** chips — you can't bet ${amount}. Try \`/daily\`.`,
    );
    return;
  }
  // Stake is taken up front so abandoning the hand mid-play can't dodge a loss.
  adjustChips(guildId, userId, -amount);
  const playerCards = [drawCard(), drawCard()];
  const upcard = drawCard();
  if (isBlackjack(playerCards)) {
    // Natural — resolve immediately; the dealer's full hand decides push vs. 3:2 win.
    const dealerCards = playDealerHand([upcard, drawCard()]);
    const outcome = resolveHand(playerCards, dealerCards);
    const settled = settleBlackjack(guildId, userId, amount, outcome);
    await update(
      interaction,
      blackjackResultView(userId, playerCards, dealerCards, amount, outcome, settled),
    );
    return;
  }
  await update(interaction, blackjackTableView(userId, playerCards, upcard, amount));
}

async function playSlotsAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (amount < 1 || amount > chips) {
    await replyEphemeral(
      interaction,
      `❌ You have 🪙 **${chips}** chips — you can't bet ${amount}. Try \`/daily\`.`,
    );
    return;
  }
  const outcome = runSlotsSpin(guildId, userId, amount);
  await update(interaction, slotsResultView(guildId, userId, amount, outcome));
}

function customAmountModal(userId: string, action: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(encodeCasinoId(userId, action))
    .setTitle('Custom bet')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput()));
}

async function spinAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  bet: Bet,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (bet.amount < 1 || bet.amount > chips) {
    await replyEphemeral(
      interaction,
      `❌ You have 🪙 **${chips}** chips — you can't bet ${bet.amount}. Try \`/daily\`.`,
    );
    return;
  }
  const outcome = runSpin(guildId, userId, bet);
  await update(interaction, resultView(guildId, userId, bet, outcome));
}

async function update(interaction: CasinoInteraction, view: CasinoView): Promise<void> {
  if (interaction.isModalSubmit()) {
    if (interaction.isFromMessage()) {
      await interaction.update(view);
    } else {
      await interaction.reply(view);
    }
    return;
  }
  await interaction.update(view);
}

async function replyEphemeral(interaction: CasinoInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function amountInput(): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Chips to bet')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(9);
}

function parsePositiveInt(raw: string, min = 1): number | undefined {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min) return undefined;
  return value;
}
