import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  time,
} from 'discord.js';
import { getWorkCooldowns } from '../../services/database/repositories/workActivities.js';
import type { WorkActivityId } from '../../services/work/config.js';
import { encodeWorkId } from './ids.js';

export function workHubView(guildId: string, userId: string, notice?: string) {
  const cooldowns = getWorkCooldowns(guildId, userId);
  const now = Date.now();
  const readiness = (activity: WorkActivityId) => {
    const availableAt = cooldowns[activity];
    return !availableAt || availableAt.getTime() <= now
      ? '✅ Ready'
      : `⏳ Ready ${time(availableAt, 'R')}`;
  };

  const embed = new EmbedBuilder()
    .setTitle('🧰 BlazeBot Work')
    .setDescription(
      `${notice ? `${notice}\n\n` : ''}` +
        'Pick an activity below to earn a small amount of XP. Each job has its own cooldown.',
    )
    .addFields(
      {
        name: `⌨️ Speed Typing — ${readiness('typing')}`,
        value: 'Correctly type a long word before the 15-second timer expires. **12 XP**',
      },
      {
        name: `🎣 Fishing — ${readiness('fishing')}`,
        value: 'Catch stackable fish worth **8–28 XP**, then sell them through `/shop sell`.',
      },
      {
        name: `🔴 Connect Four — ${readiness('connect4')}`,
        value:
          'Play against BlazeBot. Earn **25 XP** for a win, **12** for a draw, or **5** for a loss.',
      },
      {
        name: `🧠 Trivia — ${readiness('trivia')}`,
        value: 'Answer one multiple-choice question within 30 seconds. **15 XP**',
      },
      {
        name: `🔀 Word Unscrambling — ${readiness('unscramble')}`,
        value: 'Rearrange a scrambled word within 20 seconds. **12 XP**',
      },
    )
    .setFooter({ text: 'Cooldowns are separate and persist across bot restarts.' })
    .setColor(0x3498db);

  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeWorkId('activity', 'hub'))
    .setPlaceholder('Choose a work activity')
    .addOptions(
      {
        label: 'Speed Typing',
        value: 'typing',
        emoji: '⌨️',
        description: 'Type a long word before time runs out',
      },
      {
        label: 'Fishing',
        value: 'fishing',
        emoji: '🎣',
        description: 'Catch fish for XP and dollars',
      },
      {
        label: 'Connect Four',
        value: 'connect4',
        emoji: '🔴',
        description: 'Play a quick game against BlazeBot',
      },
      {
        label: 'Trivia',
        value: 'trivia',
        emoji: '🧠',
        description: 'Answer a multiple-choice question',
      },
      {
        label: 'Word Unscrambling',
        value: 'unscramble',
        emoji: '🔀',
        description: 'Rearrange the letters to find the word',
      },
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  };
}

export function workResultView(title: string, description: string, color = 0x3498db) {
  return {
    embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(color)],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeWorkId('hub', 'hub'))
          .setLabel('Back to Work')
          .setEmoji('🧰')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export function backToWorkRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodeWorkId('hub', 'hub'))
      .setLabel('Back to Work')
      .setEmoji('🧰')
      .setStyle(ButtonStyle.Secondary),
  );
}
