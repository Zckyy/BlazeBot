import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ButtonInteraction,
  EmbedBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { encodeCasinoId } from './ids.js';

export const GOLD = 0xf0a020;
export const WIN_COLOR = 0x2ecc71;
export const LOSE_COLOR = 0xe74c3c;
export const PRESET_AMOUNTS = [50, 100, 250];

export type CasinoView = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
};

export type CasinoInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

/**
 * Preset / all-in / custom bet-amount buttons shared by every game.
 * `prefixArgs` are extra customId args placed before the amount (e.g. the
 * roulette bet type/value); the custom button gets the same prefix args.
 */
export function betAmountRow(
  userId: string,
  chips: number,
  amtAction: string,
  customAction: string,
  prefixArgs: string[] = [],
): ActionRowBuilder<ButtonBuilder> {
  const amountButtons = PRESET_AMOUNTS.map((amount) =>
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, amtAction, ...prefixArgs, String(amount)))
      .setLabel(String(amount))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(amount > chips),
  );
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...amountButtons,
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, amtAction, ...prefixArgs, 'all'))
      .setLabel(`All-in (${chips})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(chips === 0),
    new ButtonBuilder()
      .setCustomId(encodeCasinoId(userId, customAction, ...prefixArgs))
      .setLabel('Custom…')
      .setStyle(ButtonStyle.Primary),
  );
}

export function backToGamesButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCasinoId(userId, 'hub'))
    .setLabel('⬅ Games')
    .setStyle(ButtonStyle.Secondary);
}

export function customAmountModal(userId: string, action: string, ...args: string[]): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(encodeCasinoId(userId, action, ...args))
    .setTitle('Custom bet')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput()));
}

export function amountInput(): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Chips to bet')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(9);
}

export function parsePositiveInt(raw: string, min = 1): number | undefined {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min) return undefined;
  return value;
}

/** Parses a bet-amount customId arg ('all' or an integer ≥ 1). */
export function parseAmountArg(arg: string | undefined, chips: number): number | undefined {
  if (arg === 'all') return chips;
  return arg === undefined ? undefined : parsePositiveInt(arg);
}

/**
 * Validates `amount` against the balance; replies with an ephemeral error and
 * returns false if the bet can't be placed.
 */
export async function ensureCanBet(
  interaction: CasinoInteraction,
  chips: number,
  amount: number,
): Promise<boolean> {
  if (!Number.isInteger(amount) || amount < 1 || amount > chips) {
    await replyEphemeral(
      interaction,
      `❌ You have 🪙 **${chips}** chips — you can't bet ${amount}. Try \`/daily\`.`,
    );
    return false;
  }
  return true;
}

export async function update(interaction: CasinoInteraction, view: CasinoView): Promise<void> {
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

export async function replyEphemeral(
  interaction: CasinoInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
