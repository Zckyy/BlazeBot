import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { adjustChips, getBalance } from '../../services/database/repositories/economy.js';
import { getEquippedMultiplier } from '../../services/database/repositories/inventory.js';
import {
  resolveSpin,
  SLOT_PAYOUTS,
  spinReels,
  TWO_CHERRY_PAYOUT,
} from '../../services/casino/slots.js';
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

export function slotsView(guildId: string, userId: string): CasinoView {
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
    .setColor(outcome.won ? WIN_COLOR : LOSE_COLOR);

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

export async function playSlotsAndRender(
  interaction: CasinoInteraction,
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  const chips = getBalance(guildId, userId)?.chips ?? 0;
  if (!(await ensureCanBet(interaction, chips, amount))) return;
  const outcome = runSlotsSpin(guildId, userId, amount);
  await update(interaction, slotsResultView(userId, amount, outcome));
}
