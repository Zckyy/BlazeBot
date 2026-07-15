CREATE TABLE work_cooldowns_new (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activity TEXT NOT NULL CHECK (activity IN ('typing', 'fishing', 'connect4', 'trivia', 'unscramble')),
  available_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id, activity)
);

INSERT INTO work_cooldowns_new (guild_id, user_id, activity, available_at, updated_at)
SELECT guild_id, user_id, activity, available_at, updated_at FROM work_cooldowns;

DROP TABLE work_cooldowns;
ALTER TABLE work_cooldowns_new RENAME TO work_cooldowns;

CREATE TABLE work_trivia_challenges (
  challenge_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  selected_index INTEGER CHECK (selected_index BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'expired'))
);

CREATE INDEX idx_work_trivia_owner
  ON work_trivia_challenges (guild_id, user_id, created_at DESC);

CREATE TABLE work_unscramble_challenges (
  challenge_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  scrambled_word TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'failed', 'expired'))
);

CREATE INDEX idx_work_unscramble_owner
  ON work_unscramble_challenges (guild_id, user_id, created_at DESC);
