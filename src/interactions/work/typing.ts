import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, time } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import {
  completeTypingChallenge,
  createTypingChallenge,
  startTypingChallenge,
} from '../../services/database/repositories/workActivities.js';
import { TYPING_TIME_LIMIT_MS, WORK_COOLDOWNS_MS } from '../../services/work/config.js';
import { selectTypingWord } from '../../services/work/typing.js';
import { workHubView, workResultView } from './hub.js';
import { encodeWorkId } from './ids.js';
import { replyEphemeral } from './view.js';

export async function startTypingFromHub(interaction: ComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guildId) return;
  const challenge = createTypingChallenge(
    interaction.guildId,
    interaction.user.id,
    selectTypingWord(),
  );
  const result = startTypingChallenge(
    challenge.challengeId,
    interaction.guildId,
    interaction.user.id,
    WORK_COOLDOWNS_MS.typing,
  );
  if (result.status === 'cooldown') {
    await interaction.update(
      workHubView(
        interaction.guildId,
        interaction.user.id,
        `⏳ Speed Typing is on cooldown — try again ${time(result.availableAt, 'R')}.`,
      ),
    );
    return;
  }
  if (result.status !== 'started') {
    await interaction.update(
      workHubView(
        interaction.guildId,
        interaction.user.id,
        'That typing challenge could not be started. Please try again.',
      ),
    );
    return;
  }
  await showTypingModal(interaction, result.challenge.challengeId, result.challenge.word);
}

/** Retains support for typing buttons created before the work-hub refactor. */
export async function handleTypingInteraction(
  interaction: ComponentInteraction,
  action: string,
  challengeId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  if (action === 'typing-start') {
    if (!interaction.isButton()) return;
    const result = startTypingChallenge(
      challengeId,
      interaction.guildId,
      interaction.user.id,
      WORK_COOLDOWNS_MS.typing,
    );
    if (result.status === 'cooldown') {
      await replyEphemeral(
        interaction,
        `⏳ Typing is on cooldown — try again ${time(result.availableAt, 'R')}.`,
      );
      return;
    }
    if (result.status !== 'started') {
      await replyEphemeral(interaction, 'This typing challenge is no longer available.');
      return;
    }
    await showTypingModal(interaction, challengeId, result.challenge.word);
    return;
  }

  if (action !== 'typing-submit' || !interaction.isModalSubmit()) return;
  if (!interaction.isFromMessage()) {
    await replyEphemeral(
      interaction,
      'This typing challenge is no longer attached to the work hub.',
    );
    return;
  }
  const result = completeTypingChallenge(
    challengeId,
    interaction.guildId,
    interaction.user.id,
    interaction.fields.getTextInputValue('answer'),
  );
  if (result.status === 'success') {
    const levelUp = result.award.leveledUp
      ? ` 🎉 You reached level **${result.award.userLevel.level}**!`
      : '';
    await interaction.update(
      workResultView(
        '⌨️ Speed Typing Complete',
        `✅ Correct! You earned **${result.award.xpGained} XP**.${levelUp}`,
        0x2ecc71,
      ),
    );
    return;
  }
  if (result.status === 'expired') {
    await interaction.update(
      workResultView(
        '⌨️ Time Is Up',
        `⌛ Time ran out. The word was **${result.word ?? 'unknown'}**.`,
        0xe67e22,
      ),
    );
    return;
  }
  if (result.status === 'failed') {
    await interaction.update(
      workResultView(
        '⌨️ Speed Typing Complete',
        `❌ Not quite. The correct spelling was **${result.word ?? 'unknown'}**.`,
        0xe74c3c,
      ),
    );
    return;
  }
  await interaction.update(
    workResultView('⌨️ Challenge Unavailable', 'This typing challenge is no longer available.'),
  );
}

async function showTypingModal(
  interaction: Extract<ComponentInteraction, { showModal: unknown }>,
  challengeId: string,
  word: string,
): Promise<void> {
  const seconds = TYPING_TIME_LIMIT_MS / 1_000;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encodeWorkId('typing-submit', challengeId))
      .setTitle(`Type the word within ${seconds} seconds`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(`Type: ${word}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(50),
        ),
      ),
  );
}
