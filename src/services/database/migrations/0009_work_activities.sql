CREATE TABLE IF NOT EXISTS work_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activity TEXT NOT NULL CHECK (activity IN ('typing', 'fishing', 'connect4')),
  available_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id, activity)
);

CREATE TABLE IF NOT EXISTS work_typing_challenges (
  challenge_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  expires_at TEXT,
  completed_at TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_work_typing_owner
  ON work_typing_challenges (guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_stacks (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS connect4_games (
  game_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  board TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost', 'draw', 'expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rewarded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_connect4_owner
  ON connect4_games (guild_id, user_id, status, updated_at DESC);
