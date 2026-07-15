import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, time } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import {
  completeUnscrambleChallenge,
  startUnscrambleChallenge,
} from '../../services/database/repositories/workActivities.js';
import { UNSCRAMBLE_TIME_LIMIT_MS, WORK_COOLDOWNS_MS } from '../../services/work/config.js';
import { scrambleWord, selectUnscrambleWord } from '../../services/work/unscramble.js';
import { encodeWorkId } from './ids.js';
import { workHubView, workResultView } from './hub.js';
import { replyEphemeral } from './view.js';

export async function startUnscrambleFromHub(interaction: ComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guildId) return;
  const word = selectUnscrambleWord();
  const result = startUnscrambleChallenge(
    interaction.guildId,
    interaction.user.id,
    word,
    scrambleWord(word),
    WORK_COOLDOWNS_MS.unscramble,
  );
  if (result.status === 'cooldown') {
    await interaction.update(
      workHubView(
        interaction.guildId,
        interaction.user.id,
        `⏳ Word Unscrambling is on cooldown — play again ${time(result.availableAt, 'R')}.`,
      ),
    );
    return;
  }
  const seconds = UNSCRAMBLE_TIME_LIMIT_MS / 1_000;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encodeWorkId('unscramble-submit', result.challenge.challengeId))
      .setTitle(`Unscramble within ${seconds} seconds`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(`Unscramble: ${result.challenge.scrambledWord}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(50),
        ),
      ),
  );
}

export async function handleUnscrambleInteraction(
  interaction: ComponentInteraction,
  action: string,
  challengeId: string,
): Promise<void> {
  if (action !== 'unscramble-submit' || !interaction.isModalSubmit() || !interaction.guildId) {
    return;
  }
  if (!interaction.isFromMessage()) {
    await replyEphemeral(interaction, 'This word challenge is no longer attached to the work hub.');
    return;
  }
  const result = completeUnscrambleChallenge(
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
        '🔀 Word Unscrambling Complete',
        `✅ Correct! You earned **${result.award.xpGained} XP**.${levelUp}`,
        0x2ecc71,
      ),
    );
    return;
  }
  if (result.status === 'expired' || result.status === 'failed') {
    const expired = result.status === 'expired';
    await interaction.update(
      workResultView(
        expired ? '🔀 Time Is Up' : '🔀 Word Unscrambling Complete',
        `${expired ? '⌛ Time ran out.' : '❌ Not quite.'} The word was **${result.word}**.`,
        expired ? 0xe67e22 : 0xe74c3c,
      ),
    );
    return;
  }
  await interaction.update(
    workResultView('🔀 Challenge Unavailable', 'This word challenge is no longer available.'),
  );
}
