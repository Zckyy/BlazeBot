ALTER TABLE economy_balances
  ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0;

UPDATE economy_balances
SET daily_streak = 1
WHERE last_daily_at IS NOT NULL;
