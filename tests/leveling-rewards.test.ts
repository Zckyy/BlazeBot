import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { initDatabase } from '../src/services/database/db.js';
import { getBalance } from '../src/services/database/repositories/economy.js';
import { addXp } from '../src/services/database/repositories/userLevels.js';
import { LEVEL_UP_CHIPS, totalXpForLevel } from '../src/services/leveling/xp.js';

initDatabase(':memory:');

describe('level-up chip rewards', () => {
  test('awards chips once when a member gains a level', () => {
    const first = addXp('guild-single', 'user', totalXpForLevel(1));
    assert.equal(first.chipsAwarded, LEVEL_UP_CHIPS);
    assert.equal(getBalance('guild-single', 'user')?.chips, LEVEL_UP_CHIPS);

    const progress = addXp('guild-single', 'user', 1);
    assert.equal(progress.chipsAwarded, 0);
    assert.equal(getBalance('guild-single', 'user')?.chips, LEVEL_UP_CHIPS);
  });

  test('awards each crossed level when one XP grant skips levels', () => {
    const result = addXp('guild-multi', 'user', totalXpForLevel(3));
    assert.equal(result.userLevel.level, 3);
    assert.equal(result.chipsAwarded, 3 * LEVEL_UP_CHIPS);
    assert.equal(getBalance('guild-multi', 'user')?.chips, 3 * LEVEL_UP_CHIPS);
  });
});
