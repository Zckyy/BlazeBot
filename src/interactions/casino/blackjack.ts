import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { adjustChips, getBalance } from '../../services/database/repositories/economy.js';
import { getEquippedMultiplier } from '../../services/database/repositories/inventory.js';
import {
  decodeHand,
  drawCard,
  encodeHand,
  isBust,
  handValue,
  isBlackjack,
  payoutRatio,
  playDealerHand,
  resolveHand,
  type Card,
  type Outcome,
} from '../../services/casino/blackjack.js';
import { encodeCasinoId } from './ids.js';
import {
  backToGamesButton,
  betAmountRow,
  ensureCanBet,
  GOLD,
  LOSE_COLOR,
  update,
  WIN_COLOR,
  type CasinoInteraction,
  type CasinoView,
} from './shared.js';

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

export function blackjackBetView(guildId: string, userId: string): CasinoView {
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

export function blackjackTableView(
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

export function blackjackResultView(
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
    .setColor(ratio > 0 ? WIN_COLOR : ratio === 0 ? GOLD : LOSE_COLOR);

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
export function settleBlackjack(
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

export async function dealBlackjackAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (!(await ensureCanBet(interaction, chips, amount))) return;
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

/** Decodes the in-flight hand state carried in a bj-hit / bj-stand customId. */
function decodeRoundArgs(
  args: string[],
): { playerCards: Card[]; dealerCards: Card[]; amount: number } | undefined {
  const [playerStr, dealerStr, amountStr] = args;
  const playerCards = playerStr ? decodeHand(playerStr) : undefined;
  const dealerCards = dealerStr ? decodeHand(dealerStr) : undefined;
  const amount = Number(amountStr);
  if (!playerCards || !dealerCards || !Number.isInteger(amount) || amount < 1) return undefined;
  return { playerCards, dealerCards, amount };
}

export async function hitAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  args: string[],
): Promise<void> {
  const round = decodeRoundArgs(args);
  if (!round) return;
  const { playerCards, dealerCards, amount } = round;
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
}

export async function standAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  args: string[],
): Promise<void> {
  const round = decodeRoundArgs(args);
  if (!round) return;
  const { playerCards, dealerCards: upcards, amount } = round;
  // Hole card is drawn now — with an infinite shoe this is equivalent to
  // having drawn it at deal time, and it matches the reveal-at-end UX.
  const dealerCards = playDealerHand([upcards[0], drawCard()]);
  const outcome = resolveHand(playerCards, dealerCards);
  const settled = settleBlackjack(guildId, userId, amount, outcome);
  await update(
    interaction,
    blackjackResultView(userId, playerCards, dealerCards, amount, outcome, settled),
  );
}
