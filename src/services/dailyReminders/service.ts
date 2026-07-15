import type { Client } from 'discord.js';
import { logger } from '../../core/logger.js';
import {
  claimNextDueDailyReminder,
  markDailyReminderDelivered,
  markDailyReminderFailed,
  scheduleDailyReminderRetry,
  type ClaimedDailyReminder,
} from '../database/repositories/dailyReminders.js';

const POLL_INTERVAL_MS = 60_000;
const MAX_REMINDERS_PER_POLL = 100;
const MAX_DELIVERY_ATTEMPTS = 5;
const DISCORD_CANNOT_DM_USER = 50_007;

let pollTimer: NodeJS.Timeout | undefined;
let pollInProgress = false;

export function startDailyReminderService(client: Client<true>): void {
  if (pollTimer) return;

  void pollForDailyReminders(client);
  pollTimer = setInterval(() => void pollForDailyReminders(client), POLL_INTERVAL_MS);
  logger.info('Daily reminder service started');
}

export function stopDailyReminderService(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = undefined;
  logger.info('Daily reminder service stopped');
}

async function pollForDailyReminders(client: Client<true>): Promise<void> {
  if (pollInProgress) return;
  pollInProgress = true;

  try {
    for (let processed = 0; processed < MAX_REMINDERS_PER_POLL; processed += 1) {
      const reminder = claimNextDueDailyReminder();
      if (!reminder) break;
      await deliverDailyReminder(client, reminder);
    }
  } catch (error) {
    logger.error({ err: error }, 'Daily reminder polling failed');
  } finally {
    pollInProgress = false;
  }
}

async function deliverDailyReminder(
  client: Client<true>,
  reminder: ClaimedDailyReminder,
): Promise<void> {
  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send('🔔 Your `/daily` reward is ready to claim!');
    markDailyReminderDelivered(reminder);
    logger.info({ guildId: reminder.guildId, userId: reminder.userId }, 'Delivered daily reminder');
  } catch (error) {
    const errorMessage = describeError(error);
    const permanentFailure =
      discordErrorCode(error) === DISCORD_CANNOT_DM_USER ||
      reminder.attemptCount >= MAX_DELIVERY_ATTEMPTS;

    if (permanentFailure) {
      markDailyReminderFailed(reminder, errorMessage);
      logger.warn(
        {
          err: error,
          guildId: reminder.guildId,
          userId: reminder.userId,
          attempts: reminder.attemptCount,
        },
        'Daily reminder delivery failed permanently',
      );
      return;
    }

    const retryAt = new Date(Date.now() + retryDelayMs(reminder.attemptCount));
    scheduleDailyReminderRetry(reminder, retryAt, errorMessage);
    logger.warn(
      {
        err: error,
        guildId: reminder.guildId,
        userId: reminder.userId,
        attempts: reminder.attemptCount,
        retryAt,
      },
      'Daily reminder delivery failed; retry scheduled',
    );
  }
}

function retryDelayMs(attemptCount: number): number {
  const minutes = Math.min(2 ** Math.max(0, attemptCount - 1), 60);
  return minutes * 60_000;
}

function discordErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'number' ? error.code : undefined;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_000);
}
