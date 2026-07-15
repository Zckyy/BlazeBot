export const DAILY_REMINDER_PREFIX = 'daily-reminder';

export type DailyReminderAction = 'set' | 'cancel';

export function dailyReminderCustomId(action: DailyReminderAction, userId: string): string {
  return `${DAILY_REMINDER_PREFIX}:${action}:${userId}`;
}

export function parseDailyReminderCustomId(
  customId: string,
): { action: DailyReminderAction; userId: string } | undefined {
  const [prefix, action, userId, extra] = customId.split(':');
  if (
    prefix !== DAILY_REMINDER_PREFIX ||
    (action !== 'set' && action !== 'cancel') ||
    !userId ||
    extra !== undefined
  ) {
    return undefined;
  }
  return { action, userId };
}
