import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, time } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import {
  completeTriviaChallenge,
  startTriviaChallenge,
  type TriviaChallenge,
} from '../../services/database/repositories/workActivities.js';
import { WORK_COOLDOWNS_MS } from '../../services/work/config.js';
import { prepareTriviaQuestion, selectTriviaQuestion } from '../../services/work/trivia.js';
import { encodeWorkId } from './ids.js';
import { backToWorkRow, workHubView, workResultView } from './hub.js';
import { replyEphemeral } from './view.js';

const LABELS = ['A', 'B', 'C', 'D'] as const;

export async function startTriviaFromHub(interaction: ComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guildId) return;
  const result = startTriviaChallenge(
    interaction.guildId,
    interaction.user.id,
    prepareTriviaQuestion(selectTriviaQuestion()),
    WORK_COOLDOWNS_MS.trivia,
  );
  if (result.status === 'cooldown') {
    await interaction.update(
      workHubView(
        interaction.guildId,
        interaction.user.id,
        `⏳ Trivia is on cooldown — answer again ${time(result.availableAt, 'R')}.`,
      ),
    );
    return;
  }
  await interaction.update(triviaView(result.challenge));
}

export async function handleTriviaInteraction(
  interaction: ComponentInteraction,
  action: string,
  challengeId: string,
  argument?: string,
): Promise<void> {
  if (action !== 'trivia-answer' || !interaction.isButton() || !interaction.guildId) return;
  const result = completeTriviaChallenge(
    challengeId,
    interaction.guildId,
    interaction.user.id,
    Number(argument),
  );
  if (result.status === 'invalid') {
    await replyEphemeral(interaction, 'This is not your trivia challenge or answer choice.');
    return;
  }
  if (result.status === 'used') {
    await replyEphemeral(interaction, 'This trivia challenge has already been answered.');
    return;
  }
  if (result.status === 'success') {
    const levelUp = result.award.leveledUp
      ? ` 🎉 You reached level **${result.award.userLevel.level}**!`
      : '';
    await interaction.update(
      workResultView(
        '🧠 Trivia Complete',
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
        expired ? '🧠 Trivia Time Is Up' : '🧠 Trivia Complete',
        `${expired ? '⌛ Time ran out.' : '❌ Not quite.'} The correct answer was **${result.correctAnswer}**.`,
        expired ? 0xe67e22 : 0xe74c3c,
      ),
    );
  }
}

function triviaView(challenge: TriviaChallenge) {
  const choices = challenge.answers
    .map((answer, index) => `**${LABELS[index]}.** ${answer}`)
    .join('\n');
  const buttons = challenge.answers.map((_, index) =>
    new ButtonBuilder()
      .setCustomId(encodeWorkId('trivia-answer', challenge.challengeId, String(index)))
      .setLabel(LABELS[index])
      .setStyle(ButtonStyle.Primary),
  );
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🧠 Trivia')
        .setDescription(
          `**${challenge.question}**\n\n${choices}\n\nAnswer before ${time(challenge.expiresAt, 'R')}.`,
        )
        .setFooter({ text: challenge.category })
        .setColor(0x9b59b6),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons), backToWorkRow()],
  };
}
