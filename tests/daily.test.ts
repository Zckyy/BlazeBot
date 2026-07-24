import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getDb, initDatabase } from '../src/services/database/db.js';
import { claimDaily } from '../src/services/database/repositories/economy.js';

initDatabase(':memory:');

describe('daily streaks', () => {
  test('starts at one and does not change during the cooldown', () => {
    const first = claimDaily('guild', 'new-user');
    assert.equal(first.dailyStreak, 1);
    assert.equal(first.alreadyClaimed, false);

    const repeated = claimDaily('guild', 'new-user');
    assert.equal(repeated.dailyStreak, 1);
    assert.equal(repeated.alreadyClaimed, true);
  });

  test('increments within the grace window and resets after it', () => {
    claimDaily('guild', 'returning-user');
    getDb()
      .prepare(
        `UPDATE economy_balances
         SET last_daily_at = datetime('now', '-25 hours')
         WHERE guild_id = ? AND user_id = ?`,
      )
      .run('guild', 'returning-user');

    assert.equal(claimDaily('guild', 'returning-user').dailyStreak, 2);

    getDb()
      .prepare(
        `UPDATE economy_balances
         SET last_daily_at = datetime('now', '-49 hours')
         WHERE guild_id = ? AND user_id = ?`,
      )
      .run('guild', 'returning-user');

    assert.equal(claimDaily('guild', 'returning-user').dailyStreak, 1);
  });
});
