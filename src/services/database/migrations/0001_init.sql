CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  locale TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
