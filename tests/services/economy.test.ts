import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../../src/services/database/db.js';
import {
  adjustChips,
  adjustDollars,
  cashOut,
  CHIPS_PER_DOLLAR,
  claimDaily,
  DAILY_CHIPS,
  getBalance,
} from '../../src/services/database/repositories/economy.js';

describe('economy repository', () => {
  beforeAll(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  it('returns undefined for unknown users', () => {
    expect(getBalance('g1', 'missing')).toBeUndefined();
  });

  it('adjusts chips up and down', () => {
    expect(adjustChips('g1', 'u1', 100)).toBe(100);
    expect(adjustChips('g1', 'u1', -40)).toBe(60);
    expect(getBalance('g1', 'u1')!.chips).toBe(60);
  });

  it('rejects adjustments that would go negative', () => {
    expect(() => adjustChips('g1', 'u1', -1000)).toThrow('Insufficient chips');
    expect(() => adjustDollars('g1', 'u1', -1)).toThrow('Insufficient dollars');
    expect(getBalance('g1', 'u1')!.chips).toBe(60); // unchanged
  });

  it('grants daily chips once, then reports already claimed', () => {
    const first = claimDaily('g1', 'u2');
    expect(first.alreadyClaimed).toBe(false);
    expect(first.chips).toBe(DAILY_CHIPS);

    const second = claimDaily('g1', 'u2');
    expect(second.alreadyClaimed).toBe(true);
    expect(second.chips).toBe(DAILY_CHIPS);
    expect(second.nextClaimAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('cashes out chips into dollars, keeping the remainder as chips', () => {
    adjustChips('g1', 'u3', 250);
    const result = cashOut('g1', 'u3', 250);
    expect(result.dollarsGained).toBe(2);
    expect(result.dollars).toBe(2);
    expect(result.chips).toBe(250 - 2 * CHIPS_PER_DOLLAR);
  });

  it('rejects cash-out below the minimum or above the balance', () => {
    expect(() => cashOut('g1', 'u3', CHIPS_PER_DOLLAR - 1)).toThrow('Minimum cash-out');
    expect(() => cashOut('g1', 'u3', 10_000)).toThrow('Insufficient chips');
  });
});
