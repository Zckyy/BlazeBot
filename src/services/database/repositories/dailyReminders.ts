import { getDb } from '../db.js';

const CLAIM_TIMEOUT_MINUTES = 5;

export interface ClaimedDailyReminder {
  id: number;
  guildId: string;
  userId: string;
  dueAt: Date;
  attemptCount: number;
}

interface DailyReminderRow {
  id: number;
  guild_id: string;
  user_id: string;
  due_at: string;
  attempt_count: number;
}

export function upsertDailyReminder(guildId: string, userId: string, dueAt: Date): void {
  getDb()
    .prepare(
      `INSERT INTO daily_reminders (guild_id, user_id, due_at)
       VALUES (?, ?, datetime(?))
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         due_at = excluded.due_at,
         claimed_at = NULL,
         next_attempt_at = NULL,
         attempt_count = 0,
         delivered_at = NULL,
         failed_at = NULL,
         last_error = NULL,
         updated_at = datetime('now')`,
    )
    .run(guildId, userId, dueAt.toISOString());
}

/**
 * Atomically leases the next due reminder. A stale lease becomes available again
 * so an interrupted polling pass cannot strand a reminder indefinitely.
 */
export function claimNextDueDailyReminder(): ClaimedDailyReminder | undefined {
  const row = getDb()
    .prepare(
      `UPDATE daily_reminders
       SET claimed_at = datetime('now'),
           attempt_count = attempt_count + 1,
           updated_at = datetime('now')
       WHERE id = (
         SELECT id
         FROM daily_reminders
         WHERE due_at <= datetime('now')
           AND delivered_at IS NULL
           AND failed_at IS NULL
           AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
           AND (
             claimed_at IS NULL
             OR claimed_at <= datetime('now', '-' || ? || ' minutes')
           )
         ORDER BY due_at, id
         LIMIT 1
       )
       RETURNING id, guild_id, user_id, due_at, attempt_count`,
    )
    .get(CLAIM_TIMEOUT_MINUTES) as DailyReminderRow | undefined;

  if (!row) return undefined;
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    dueAt: sqliteUtcDate(row.due_at),
    attemptCount: row.attempt_count,
  };
}

export function markDailyReminderDelivered(reminder: ClaimedDailyReminder): void {
  getDb()
    .prepare(
      `UPDATE daily_reminders
       SET delivered_at = datetime('now'), claimed_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND due_at = datetime(?) AND delivered_at IS NULL AND failed_at IS NULL`,
    )
    .run(reminder.id, reminder.dueAt.toISOString());
}

export function scheduleDailyReminderRetry(
  reminder: ClaimedDailyReminder,
  retryAt: Date,
  errorMessage: string,
): void {
  getDb()
    .prepare(
      `UPDATE daily_reminders
       SET claimed_at = NULL,
           next_attempt_at = datetime(?),
           last_error = ?,
           updated_at = datetime('now')
       WHERE id = ? AND due_at = datetime(?) AND delivered_at IS NULL AND failed_at IS NULL`,
    )
    .run(retryAt.toISOString(), errorMessage, reminder.id, reminder.dueAt.toISOString());
}

export function markDailyReminderFailed(
  reminder: ClaimedDailyReminder,
  errorMessage: string,
): void {
  getDb()
    .prepare(
      `UPDATE daily_reminders
       SET failed_at = datetime('now'),
           claimed_at = NULL,
           last_error = ?,
           updated_at = datetime('now')
       WHERE id = ? AND due_at = datetime(?) AND delivered_at IS NULL`,
    )
    .run(errorMessage, reminder.id, reminder.dueAt.toISOString());
}

export function deleteDailyReminder(guildId: string, userId: string): boolean {
  return (
    getDb()
      .prepare('DELETE FROM daily_reminders WHERE guild_id = ? AND user_id = ?')
      .run(guildId, userId).changes > 0
  );
}

function sqliteUtcDate(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}
