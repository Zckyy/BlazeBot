# Leveling / XP System

## Context

BlazeBot currently only has `/ping` and the `guild_settings` table as a reference pattern.
The user wants an engagement feature: members earn XP for chatting, level up, and can check
their rank/leaderboard. This follows the project's established "feature = migration +
repository + command(s) + optional event listener" pattern from [PLAN.md](PLAN.md) — no core
files change.

Scope for this pass (confirmed with user): text-message XP only (no voice), text-embed rank
card (no image generation), no role rewards yet (clean follow-up later since it's config-only
on top of the level calculation).

## Data model

New migration `src/services/database/migrations/0002_leveling.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  last_xp_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_levels_guild_xp ON user_levels (guild_id, xp DESC);
```

Store total accumulated XP; level is derived/cached alongside it (recomputed on every award,
matches existing `upsertGuildSettings` style — cheap since `better-sqlite3` is synchronous).

`last_xp_at` (ISO string) drives the per-user cooldown so it survives restarts (no need for an
in-memory-only cooldown map, though an in-memory `Map<guildId:userId, timestamp>` is an
acceptable/simpler alternative if the user prefers avoiding a DB write on every cooldown check —
**recommendation: in-memory Map for the cooldown gate, DB write only when XP is actually
awarded**, since checking cooldown shouldn't require a query on every single message).

## Repository — `src/services/database/repositories/userLevels.ts`

Mirrors `guildSettings.ts` style: plain functions, row-to-domain mapping.

```ts
export interface UserLevel { guildId: string; userId: string; xp: number; level: number; }

getUserLevel(guildId, userId): UserLevel | undefined
addXp(guildId, userId, amount): { userLevel: UserLevel; leveledUp: boolean; previousLevel: number }
getLeaderboard(guildId, limit, offset): (UserLevel & { rank: number })[]
getRank(guildId, userId): number | undefined   // 1-indexed position, via COUNT(*) WHERE xp > user's xp
```

`addXp` reads current row (or defaults to 0/0), computes new XP, recomputes level via the
shared formula, upserts, and returns whether a level-up occurred (for the event handler to
react to).

## Level formula — `src/services/leveling/xp.ts`

New small service module (not Discord-aware, per PLAN.md's service convention):

```ts
export function xpForLevel(level: number): number {
  return 5 * level ** 2 + 50 * level + 100;
}
export function levelFromXp(totalXp: number): number { /* loop or closed-form, level up while totalXp >= cumulative threshold */ }
export function randomXpAward(): number { /* 15-25 inclusive */ }
```

Keep this pure/testable — no DB or Discord imports — so it gets unit tests independent of
SQLite.

## XP-on-message — `src/events/messageCreate.ts`

New event listener (auto-bound by the existing `eventLoader.ts`, no core changes):

- Ignore bot messages and DMs (`message.guildId` null check).
- In-memory cooldown Map (`${guildId}:${userId}` → last award timestamp), 60s window, cleared
  naturally since it's just overwritten (no need for eviction at this scale).
- On a fresh window: call `addXp`, and if `leveledUp`, send a level-up message in the same
  channel (simplest v1 — a configurable announcement channel is a natural follow-up but adds a
  `guild_settings` column; flagging as future work, not building now per scope).

## Commands

- **`src/commands/rank/command.ts`** — `/rank [user]` optional user option. Fetches
  `getUserLevel` + `getRank`, replies with an embed: level, current XP / XP needed for next
  level, progress bar (Unicode block characters, e.g. `▰▰▰▰▱▱▱▱▱▱`), and rank position. Defaults
  to a "not ranked yet" message if no row exists.
- **`src/commands/leaderboard/command.ts`** — `/leaderboard [page]`, fetches top 10 via
  `getLeaderboard`, renders as a numbered embed list (mention + level + XP).

Both follow the existing `Command` interface (`data` + `execute`) exactly like
[ping/command.ts](src/commands/ping/command.ts).

## Testing

- Unit tests (`tests/services/xp.test.ts`) for `xpForLevel`/`levelFromXp` edge cases (0 XP,
  exact threshold, just-under threshold).
- Repository test (`tests/services/userLevels.test.ts`) against an in-memory SQLite DB
  (`initDatabase(':memory:')`, matching the existing test pattern implied by `closeDatabase()`
  in db.ts), covering: award XP, cooldown irrelevant at repo layer, level-up detection,
  leaderboard ordering, rank calculation.
- Manual verification: `npm run deploy-commands`, `npm run dev`, chat in test server to trigger
  XP + a level-up message, run `/rank` and `/leaderboard`.

## Files touched (new)

- `src/services/database/migrations/0002_leveling.sql`
- `src/services/database/repositories/userLevels.ts`
- `src/services/leveling/xp.ts`
- `src/events/messageCreate.ts`
- `src/commands/rank/command.ts`
- `src/commands/leaderboard/command.ts`
- `tests/services/xp.test.ts`
- `tests/services/userLevels.test.ts`

No changes to `src/core/*` — consistent with the project's ground rule that core stays feature-free.

## Deferred (explicitly out of scope, flagged for later)

- Voice-channel XP
- Level-up role rewards
- Configurable level-up announcement channel / message template
- Image-based rank cards
