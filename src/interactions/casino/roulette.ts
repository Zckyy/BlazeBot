import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { adjustChips, getBalance } from '../../services/database/repositories/economy.js';
import { getEquippedMultiplier } from '../../services/database/repositories/inventory.js';
import { resolveBet, spin, type Bet, type BetType } from '../../services/casino/roulette.js';
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

const COLOR_EMOJI = { red: '🔴', black: '⚫', green: '🟢' } as const;

export function rouletteView(guildId: string, userId: string): CasinoView {
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

export function amountView(
  guildId: string,
  userId: string,
  type: BetType,
  value: string,
): CasinoView {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  const embed = new EmbedBuilder()
    .setTitle('🎡 Roulette — place your bet')
    .setDescription(
      `Betting on ${describeBet(type, value)}. How many chips? (You have 🪙 **${chips}**)`,
    )
    .setColor(GOLD);

  return {
    embeds: [embed],
    components: [
      betAmountRow(userId, chips, 'amt', 'custom', [type, value]),
      new ActionRowBuilder<ButtonBuilder>().addComponents(backToRouletteButton(userId)),
    ],
  };
}

function resultView(
  userId: string,
  bet: Bet,
  outcome: {
    number: number;
    color: keyof typeof COLOR_EMOJI;
    won: boolean;
    winnings: number;
    multiplier: number;
    newChips: number;
  },
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
    .setColor(outcome.won ? WIN_COLOR : LOSE_COLOR);

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

export async function spinAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  bet: Bet,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (!(await ensureCanBet(interaction, chips, bet.amount))) return;
  const outcome = runSpin(guildId, userId, bet);
  await update(interaction, resultView(userId, bet, outcome));
}
