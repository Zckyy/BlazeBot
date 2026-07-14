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
