CREATE TABLE IF NOT EXISTS daily_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  claimed_at TEXT,
  next_attempt_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  delivered_at TEXT,
  failed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_reminders_due
  ON daily_reminders (due_at)
  WHERE delivered_at IS NULL AND failed_at IS NULL;
