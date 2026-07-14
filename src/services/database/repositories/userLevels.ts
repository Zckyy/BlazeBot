import { getDb } from '../db.js';
import { levelFromXp } from '../../leveling/xp.js';

export interface UserLevel {
  guildId: string;
  userId: string;
  xp: number;
  level: number;
}

interface UserLevelRow {
  guild_id: string;
  user_id: string;
  xp: number;
  level: number;
}

function toUserLevel(row: UserLevelRow): UserLevel {
  return { guildId: row.guild_id, userId: row.user_id, xp: row.xp, level: row.level };
}

export function getUserLevel(guildId: string, userId: string): UserLevel | undefined {
  const row = getDb()
    .prepare('SELECT guild_id, user_id, xp, level FROM user_levels WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as UserLevelRow | undefined;
  return row ? toUserLevel(row) : undefined;
}

export function addXp(
  guildId: string,
  userId: string,
  amount: number,
): { userLevel: UserLevel; leveledUp: boolean; previousLevel: number } {
  const current = getUserLevel(guildId, userId);
  const previousLevel = current?.level ?? 0;
  const xp = (current?.xp ?? 0) + amount;
  const level = levelFromXp(xp);

  getDb()
    .prepare(
      `INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(guild_id, user_id) DO UPDATE SET
         xp = excluded.xp,
         level = excluded.level,
         last_xp_at = excluded.last_xp_at,
         updated_at = excluded.updated_at`,
    )
    .run(guildId, userId, xp, level);

  return {
    userLevel: { guildId, userId, xp, level },
    leveledUp: level > previousLevel,
    previousLevel,
  };
}

export function getLeaderboard(
  guildId: string,
  limit = 10,
  offset = 0,
): (UserLevel & { rank: number })[] {
  // RANK() gives ties the same rank, matching getRank's strictly-higher count.
  const rows = getDb()
    .prepare(
      `SELECT guild_id, user_id, xp, level, RANK() OVER (ORDER BY xp DESC) AS rank
       FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?`,
    )
    .all(guildId, limit, offset) as (UserLevelRow & { rank: number })[];
  return rows.map((row) => ({ ...toUserLevel(row), rank: row.rank }));
}

/** 1-indexed rank in the guild, or undefined if the user has no XP row. */
export function getRank(guildId: string, userId: string): number | undefined {
  const user = getUserLevel(guildId, userId);
  if (!user) return undefined;
  const { higher } = getDb()
    .prepare('SELECT COUNT(*) AS higher FROM user_levels WHERE guild_id = ? AND xp > ?')
    .get(guildId, user.xp) as { higher: number };
  return higher + 1;
}
