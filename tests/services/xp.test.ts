import { describe, expect, it } from 'vitest';
import {
  levelFromXp,
  randomXpAward,
  totalXpForLevel,
  xpForLevel,
} from '../../src/services/leveling/xp.js';

describe('xp formulas', () => {
  it('computes per-level XP requirements', () => {
    expect(xpForLevel(0)).toBe(100);
    expect(xpForLevel(1)).toBe(155);
    expect(xpForLevel(5)).toBe(475);
  });

  it('accumulates total XP per level', () => {
    expect(totalXpForLevel(0)).toBe(0);
    expect(totalXpForLevel(1)).toBe(100);
    expect(totalXpForLevel(2)).toBe(255);
  });

  it('is level 0 with no XP', () => {
    expect(levelFromXp(0)).toBe(0);
  });

  it('stays below the threshold until reached exactly', () => {
    expect(levelFromXp(99)).toBe(0);
    expect(levelFromXp(100)).toBe(1);
    expect(levelFromXp(254)).toBe(1);
    expect(levelFromXp(255)).toBe(2);
  });

  it('round-trips with totalXpForLevel', () => {
    for (const level of [1, 5, 10, 50]) {
      expect(levelFromXp(totalXpForLevel(level))).toBe(level);
      expect(levelFromXp(totalXpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('awards XP in the 15-25 range', () => {
    for (let i = 0; i < 200; i += 1) {
      const award = randomXpAward();
      expect(award).toBeGreaterThanOrEqual(15);
      expect(award).toBeLessThanOrEqual(25);
    }
  });
});
