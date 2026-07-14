import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../../src/services/database/db.js';
import {
  addXp,
  getLeaderboard,
  getRank,
  getUserLevel,
} from '../../src/services/database/repositories/userLevels.js';

describe('userLevels repository', () => {
  beforeAll(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  it('returns undefined for an unknown user', () => {
    expect(getUserLevel('g1', 'missing')).toBeUndefined();
    expect(getRank('g1', 'missing')).toBeUndefined();
  });

  it('creates a row and accumulates XP', () => {
    addXp('g1', 'u1', 20);
    const result = addXp('g1', 'u1', 30);
    expect(result.userLevel).toMatchObject({ guildId: 'g1', userId: 'u1', xp: 50, level: 0 });
    expect(result.leveledUp).toBe(false);
  });

  it('detects a level-up when crossing the threshold', () => {
    const result = addXp('g1', 'u1', 60); // 50 + 60 = 110 >= 100
    expect(result.userLevel.level).toBe(1);
    expect(result.previousLevel).toBe(0);
    expect(result.leveledUp).toBe(true);
  });

  it('orders the leaderboard by XP descending with ranks', () => {
    addXp('g1', 'u2', 500);
    addXp('g1', 'u3', 5);
    const board = getLeaderboard('g1');
    expect(board.map((e) => e.userId)).toEqual(['u2', 'u1', 'u3']);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('paginates the leaderboard with correct rank offsets', () => {
    const page2 = getLeaderboard('g1', 2, 2);
    expect(page2).toHaveLength(1);
    expect(page2[0]).toMatchObject({ userId: 'u3', rank: 3 });
  });

  it('computes 1-indexed rank', () => {
    expect(getRank('g1', 'u2')).toBe(1);
    expect(getRank('g1', 'u1')).toBe(2);
    expect(getRank('g1', 'u3')).toBe(3);
  });

  it('isolates guilds from each other', () => {
    addXp('g2', 'u1', 999);
    expect(getUserLevel('g1', 'u1')!.xp).toBe(110);
    expect(getLeaderboard('g2')).toHaveLength(1);
  });
});
