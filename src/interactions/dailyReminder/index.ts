import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, time } from 'discord.js';
import type { ComponentInteraction } from '../index.js';
import { getNextDailyClaimAt } from '../../services/database/repositories/economy.js';
import {
  deleteDailyReminder,
  upsertDailyReminder,
} from '../../services/database/repositories/dailyReminders.js';
import { DAILY_REMINDER_PREFIX, dailyReminderCustomId, parseDailyReminderCustomId } from './ids.js';

export { DAILY_REMINDER_PREFIX };

export async function handleDailyReminderInteraction(
  interaction: ComponentInteraction,
): Promise<void> {
  if (!interaction.isButton()) return;

  const parsed = parseDailyReminderCustomId(interaction.customId);
  if (!parsed) return;

  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({
      content: "That reminder button belongs to someone else's `/daily` claim.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Daily reminders can only be managed from a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.action === 'cancel') {
    const removed = deleteDailyReminder(interaction.guildId, interaction.user.id);
    await interaction.update({
      content: removed ? '🔕 Your `/daily` reminder was cancelled.' : 'No pending reminder found.',
      components: [],
    });
    return;
  }

  const dueAt = getNextDailyClaimAt(interaction.guildId, interaction.user.id);
  if (!dueAt || dueAt.getTime() <= Date.now()) {
    await interaction.reply({
      content: 'Your `/daily` reward is already available — claim it now!',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  upsertDailyReminder(interaction.guildId, interaction.user.id, dueAt);
  await interaction.reply({
    content: `🔔 I'll DM you when your \`/daily\` reward is ready ${time(dueAt, 'R')}.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(dailyReminderCustomId('cancel', interaction.user.id))
          .setLabel('Cancel reminder')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
