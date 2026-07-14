# Casino / Economy System (Phase 2 — builds on the Leveling / XP System below)

## Context

Following the leveling system, the user wants a casino/economy layer: users gamble **chips**
(earned via a daily claim), can **cash out** winnings into **dollars**, and spend dollars in a
**shop** on cosmetic/funny items that are bound to their account. Exactly one item can be
equipped at a time, granting a casino payout multiplier, with the schema built to support more
equip slots later without a migration. First casino game: **roulette**.

This follows the same "migration + repository + service + commands" pattern as the leveling
system — [PLAN.md](PLAN.md)'s core stays untouched. Per the user, this bot only runs on one
private server, but per-guild scoping (`guild_id` + `user_id`, matching `user_levels` and
`guild_settings`) is kept for consistency with the rest of the schema and zero extra cost.

## Data model

New migration `src/services/database/migrations/0003_economy.sql`:

```sql
CREATE TABLE IF NOT EXISTS economy_balances (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chips INTEGER NOT NULL DEFAULT 0,
  dollars INTEGER NOT NULL DEFAULT 0,
  last_daily_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_inventory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  equipped_slot INTEGER,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_equipped
  ON user_inventory (guild_id, user_id, equipped_slot)
  WHERE equipped_slot IS NOT NULL;
```

- `equipped_slot` is a nullable integer (`0` = the one slot that exists today). Adding slot `1`,
  `2`, etc. later is just allowing more values — no schema change needed then.
- The **item catalog itself is not a DB table** — items are content, not user data, so they live
  in code (like the XP formula constants) as a typed list. This avoids needing admin commands to
  manage a shop table for a fixed, curated item set. If the catalog ever needs to be edited live
  without a redeploy, that's an easy follow-up (move the same shape into a migration + table).

## Item catalog — `src/services/casino/items.ts`

```ts
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  priceDollars: number;
  payoutMultiplier: number; // applied to net winnings when equipped, e.g. 1.1 = +10%
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'rabbits_foot', name: "Lucky Rabbit's Foot", description: 'Definitely not haunted. +10% winnings.', priceDollars: 50, payoutMultiplier: 1.1 },
  { id: 'tinfoil_hat', name: 'Tinfoil Hat', description: 'Blocks casino mind-control rays. +5% winnings.', priceDollars: 25, payoutMultiplier: 1.05 },
  { id: 'golden_horseshoe', name: 'Golden Horseshoe', description: 'Extremely lucky, mildly uncomfortable to hold. +20% winnings.', priceDollars: 150, payoutMultiplier: 1.2 },
  // start with ~5-8 funny items; easy to extend by appending to this list.
];

export function getShopItem(id: string): ShopItem | undefined { ... }
```

## Roulette engine — `src/services/casino/roulette.ts`

Pure, Discord-agnostic, unit-testable like [xp.ts](src/services/leveling/xp.ts):

```ts
export type RouletteColor = 'red' | 'black' | 'green'; // green = 0
export interface SpinResult { number: number; color: RouletteColor; }

export function spin(): SpinResult { /* random 0-36, color via standard European wheel mapping */ }

export type BetType = 'number' | 'color' | 'parity' | 'range';
export interface Bet { type: BetType; value: string | number; amount: number; }

/** Returns payout multiplier on the stake if won (e.g. 35 for straight number, 1 for even-money bets), 0 if lost. */
export function resolveBet(bet: Bet, result: SpinResult): number { ... }
```

Standard European single-zero rules: straight number pays 35:1, color/parity/range (red-black,
even-odd, 1-18/19-36) pay 1:1 even money; 0 loses all outside bets.

## Repositories

**`src/services/database/repositories/economy.ts`** (mirrors [userLevels.ts](src/services/database/repositories/userLevels.ts) style):

```ts
getBalance(guildId, userId): { chips: number; dollars: number; lastDailyAt: string | null } | undefined
adjustChips(guildId, userId, delta): number // upserts, returns new chip balance; throws if it would go negative
claimDaily(guildId, userId): { chips: number; alreadyClaimed: boolean } // checks last_daily_at against 24h, grants a flat DAILY_CHIPS amount (500) if eligible
cashOut(guildId, userId, chipAmount): { dollars: number } // converts chips -> dollars at a fixed CHIPS_PER_DOLLAR rate (100), throws if insufficient chips
```

**`src/services/database/repositories/inventory.ts`**:

```ts
addItem(guildId, userId, itemId): void // insert, ignore if already owned
getInventory(guildId, userId): { itemId: string; equippedSlot: number | null }[]
getEquippedMultiplier(guildId, userId): number // 1 if nothing equipped, else the equipped item's payoutMultiplier (product across slots, ready for multi-slot later)
equipItem(guildId, userId, itemId, slot = 0): void // unequips whatever currently occupies that slot first
unequipSlot(guildId, userId, slot = 0): void
```

## Commands

- **`/balance`** — shows chips, dollars, embed.
- **`/daily`** — claims daily chips; replies with amount granted or time remaining until next claim.
- **`/roulette <number|color|parity|range> amount:<int> value:<...>`** — subcommands per bet
  type (matches the `SlashCommandSubcommandsOnlyBuilder` pattern already supported by the
  `Command` type). Validates bet against current chip balance, calls `spin()` + `resolveBet()`,
  applies `getEquippedMultiplier` to net winnings, updates chips via `adjustChips`, replies with
  the spin result and outcome.
- **`/cashout amount:<int>`** — converts chips to dollars via the repository, replies with new
  balances.
- **`/shop list`** / **`/shop buy item:<id>`** — lists `SHOP_ITEMS` with prices, or purchases one
  (checks dollar balance, calls `adjustDollars`-equivalent deduction + `addItem`).
- **`/inventory list`** / **`/inventory equip item:<id>`** / **`/inventory unequip`** — shows
  owned items and equip status; equip/unequip target slot `0` (the only slot today).

All commands follow the existing `Command` interface exactly like
[rank/command.ts](src/commands/rank/command.ts) and [ping/command.ts](src/commands/ping/command.ts).

## Testing

- Unit tests for `roulette.ts` (`resolveBet` for each bet type, win/lose/zero cases) — pure,
  no DB, same style as [xp.test.ts](tests/services/xp.test.ts).
- Repository tests for `economy.ts` and `inventory.ts` against an in-memory SQLite DB, same
  pattern as [userLevels.test.ts](tests/services/userLevels.test.ts): daily cooldown enforcement,
  chip adjustment (including insufficient-balance rejection), cash-out conversion, item
  purchase/equip/unequip and slot-swapping behavior.
- Manual verification: `npm run deploy-commands`, `npm run dev`, run `/daily` → `/roulette color
  value:red amount:100` → `/cashout amount:200` → `/shop buy item:rabbits_foot` → `/inventory
  equip item:rabbits_foot` → play roulette again and confirm the payout reflects the multiplier.

## Files touched (new)

- `src/services/database/migrations/0003_economy.sql`
- `src/services/database/repositories/economy.ts`
- `src/services/database/repositories/inventory.ts`
- `src/services/casino/roulette.ts`
- `src/services/casino/items.ts`
- `src/commands/balance/command.ts`
- `src/commands/daily/command.ts`
- `src/commands/roulette/command.ts`
- `src/commands/cashout/command.ts`
- `src/commands/shop/command.ts`
- `src/commands/inventory/command.ts`
- `tests/services/roulette.test.ts`
- `tests/services/economy.test.ts`
- `tests/services/inventory.test.ts`

No changes to `src/core/*`.

## Deferred (explicitly out of scope, flagged for later)

- Additional casino games (blackjack, poker, slots)
- Multiple equip slots (schema already supports it — just allow `slot > 0` and add UI for it)
- XP-multiplier items (this pass only affects casino payouts)
- Admin-configurable/editable item catalog (currently hardcoded in `items.ts`)
- Leaderboard for richest players / biggest wins

