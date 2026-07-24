import { getDb } from '../db.js';

export const DAILY_CHIPS = 500;
export const CHIPS_PER_DOLLAR = 100;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DAILY_STREAK_WINDOW_MS = 2 * DAILY_COOLDOWN_MS;

export interface Balance {
  chips: number;
  dollars: number;
  lastDailyAt: string | null;
  dailyStreak: number;
}

interface BalanceRow {
  chips: number;
  dollars: number;
  last_daily_at: string | null;
  daily_streak: number;
}

export function getBalance(guildId: string, userId: string): Balance | undefined {
  const row = getDb()
    .prepare(
      `SELECT chips, dollars, last_daily_at, daily_streak
       FROM economy_balances
       WHERE guild_id = ? AND user_id = ?`,
    )
    .get(guildId, userId) as BalanceRow | undefined;
  if (!row) return undefined;
  return {
    chips: row.chips,
    dollars: row.dollars,
    lastDailyAt: row.last_daily_at,
    dailyStreak: row.daily_streak,
  };
}

function ensureRow(guildId: string, userId: string): void {
  getDb()
    .prepare(
      'INSERT INTO economy_balances (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    )
    .run(guildId, userId);
}

/**
 * Atomically adds (or subtracts) from one balance column. The guard in the
 * WHERE clause means a would-go-negative adjustment updates nothing.
 */
function adjustBalance(
  column: 'chips' | 'dollars',
  guildId: string,
  userId: string,
  delta: number,
): number {
  if (!Number.isFinite(delta)) throw new Error(`Invalid ${column} adjustment: ${delta}`);
  ensureRow(guildId, userId);
  const row = getDb()
    .prepare(
      `UPDATE economy_balances
       SET ${column} = ${column} + ?, updated_at = datetime('now')
       WHERE guild_id = ? AND user_id = ? AND ${column} + ? >= 0
       RETURNING ${column} AS value`,
    )
    .get(delta, guildId, userId, delta) as { value: number } | undefined;
  if (!row) throw new Error(column === 'chips' ? 'Insufficient chips' : 'Insufficient dollars');
  return row.value;
}

/** Adds (or subtracts) chips. Throws if the balance would go negative. Returns the new chip balance. */
export function adjustChips(guildId: string, userId: string, delta: number): number {
  return adjustBalance('chips', guildId, userId, delta);
}

/** Adds (or subtracts) dollars. Throws if the balance would go negative. Returns the new dollar balance. */
export function adjustDollars(guildId: string, userId: string, delta: number): number {
  return adjustBalance('dollars', guildId, userId, delta);
}

export function claimDaily(
  guildId: string,
  userId: string,
): { chips: number; dailyStreak: number; alreadyClaimed: boolean; nextClaimAt?: Date } {
  const balance = getBalance(guildId, userId);
  const nextClaimAt = getNextDailyClaimAt(guildId, userId);
  if (balance && nextClaimAt && Date.now() < nextClaimAt.getTime()) {
    return {
      chips: balance.chips,
      dailyStreak: balance.dailyStreak,
      alreadyClaimed: true,
      nextClaimAt,
    };
  }
  ensureRow(guildId, userId);
  const claimed = getDb()
    .prepare(
      `UPDATE economy_balances
       SET chips = chips + ?,
           daily_streak = CASE
             WHEN last_daily_at IS NOT NULL
              AND unixepoch('now') - unixepoch(last_daily_at) <= ? / 1000
             THEN daily_streak + 1
             ELSE 1
           END,
           last_daily_at = datetime('now'),
           updated_at = datetime('now')
       WHERE guild_id = ? AND user_id = ?
       RETURNING chips, daily_streak`,
    )
    .get(DAILY_CHIPS, DAILY_STREAK_WINDOW_MS, guildId, userId) as {
    chips: number;
    daily_streak: number;
  };
  return {
    chips: claimed.chips,
    dailyStreak: claimed.daily_streak,
    alreadyClaimed: false,
    nextClaimAt: getNextDailyClaimAt(guildId, userId),
  };
}

export function getNextDailyClaimAt(guildId: string, userId: string): Date | undefined {
  const lastDailyAt = getBalance(guildId, userId)?.lastDailyAt;
  if (!lastDailyAt) return undefined;
  return new Date(new Date(`${lastDailyAt.replace(' ', 'T')}Z`).getTime() + DAILY_COOLDOWN_MS);
}

/** Converts chips to dollars at CHIPS_PER_DOLLAR. Throws if insufficient chips. */
export function cashOut(
  guildId: string,
  userId: string,
  chipAmount: number,
): { chips: number; dollars: number; dollarsGained: number } {
  if (chipAmount < CHIPS_PER_DOLLAR) {
    throw new Error(`Minimum cash-out is ${CHIPS_PER_DOLLAR} chips`);
  }
  // Only whole dollars convert; remainder chips stay in the balance.
  const dollarsGained = Math.floor(chipAmount / CHIPS_PER_DOLLAR);
  const chipsSpent = dollarsGained * CHIPS_PER_DOLLAR;
  const chips = adjustChips(guildId, userId, -chipsSpent);
  const dollars = adjustDollars(guildId, userId, dollarsGained);
  return { chips, dollars, dollarsGained };
}
