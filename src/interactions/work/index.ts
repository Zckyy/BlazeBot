import { time } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import {
  performFishingActivity,
  startConnect4Game,
} from '../../services/database/repositories/workActivities.js';
import { WORK_COOLDOWNS_MS } from '../../services/work/config.js';
import { selectFish } from '../../services/work/fishing.js';
import { connect4View, handleConnect4Interaction } from './connect4.js';
import { workHubView, workResultView } from './hub.js';
import { decodeWorkId, WORK_PREFIX } from './ids.js';
import { handleTypingInteraction, startTypingFromHub } from './typing.js';
import { replyEphemeral } from './view.js';
import { handleTriviaInteraction, startTriviaFromHub } from './trivia.js';
import { handleUnscrambleInteraction, startUnscrambleFromHub } from './unscramble.js';

export { WORK_PREFIX };

const inFlight = new Set<string>();

export async function handleWorkInteraction(interaction: ComponentInteraction): Promise<void> {
  const decoded = decodeWorkId(interaction.customId);
  if (!decoded || !interaction.guildId) return;
  const lockKey = `${interaction.guildId}:${interaction.user.id}`;
  if (inFlight.has(lockKey)) {
    await replyEphemeral(interaction, '⏳ Your previous activity action is still processing.');
    return;
  }
  inFlight.add(lockKey);
  try {
    if (decoded.action === 'hub' && interaction.isButton()) {
      await interaction.update(workHubView(interaction.guildId, interaction.user.id));
    } else if (decoded.action === 'activity' && interaction.isStringSelectMenu()) {
      await handleActivitySelection(interaction);
    } else if (decoded.action.startsWith('typing-')) {
      await handleTypingInteraction(interaction, decoded.action, decoded.sessionId);
    } else if (decoded.action.startsWith('connect4-')) {
      await handleConnect4Interaction(
        interaction,
        decoded.action,
        decoded.sessionId,
        decoded.argument,
      );
    } else if (decoded.action.startsWith('trivia-')) {
      await handleTriviaInteraction(
        interaction,
        decoded.action,
        decoded.sessionId,
        decoded.argument,
      );
    } else if (decoded.action.startsWith('unscramble-')) {
      await handleUnscrambleInteraction(interaction, decoded.action, decoded.sessionId);
    }
  } finally {
    inFlight.delete(lockKey);
  }
}

async function handleActivitySelection(interaction: ComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guildId) return;
  const activity = interaction.values[0];
  const { guildId } = interaction;
  const userId = interaction.user.id;

  if (activity === 'typing') {
    await startTypingFromHub(interaction);
    return;
  }

  if (activity === 'fishing') {
    const result = performFishingActivity(guildId, userId, selectFish(), WORK_COOLDOWNS_MS.fishing);
    if (result.status === 'cooldown') {
      await interaction.update(
        workHubView(
          guildId,
          userId,
          `⏳ The fish are hiding — cast again ${time(result.availableAt, 'R')}.`,
        ),
      );
      return;
    }
    const levelUp = result.award.leveledUp
      ? `\n🎉 You reached level **${result.award.userLevel.level}**!`
      : '';
    await interaction.update(
      workResultView(
        '🎣 Fishing Trip Complete',
        `You caught ${result.fish.emoji} **${result.fish.name}** (${result.fish.rarity})!\n\n` +
          `You earned **${result.award.xpGained} XP** and now own **${result.quantity}**. ` +
          `Sell value: **$${result.fish.saleValue}**.${levelUp}`,
        0x2ecc71,
      ),
    );
    return;
  }

  if (activity === 'trivia') {
    await startTriviaFromHub(interaction);
    return;
  }

  if (activity === 'unscramble') {
    await startUnscrambleFromHub(interaction);
    return;
  }

  if (activity === 'connect4') {
    const result = startConnect4Game(guildId, userId, WORK_COOLDOWNS_MS.connect4);
    if (result.status === 'cooldown') {
      await interaction.update(
        workHubView(
          guildId,
          userId,
          `⏳ Connect Four is on cooldown — play again ${time(result.availableAt, 'R')}.`,
        ),
      );
      return;
    }
    await interaction.update(connect4View(result.game));
  }
}
