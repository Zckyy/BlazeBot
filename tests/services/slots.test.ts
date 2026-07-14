import { describe, expect, it } from 'vitest';
import {
  resolveSpin,
  SLOT_PAYOUTS,
  spinReels,
  TWO_CHERRY_PAYOUT,
  type SlotSymbol,
} from '../../src/services/casino/slots.js';

/** rng stub that returns the given values in sequence. */
function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe('slots engine', () => {
  it('always spins three known symbols', () => {
    const symbols = Object.keys(SLOT_PAYOUTS);
    for (let i = 0; i < 200; i += 1) {
      const { reels } = spinReels();
      expect(reels).toHaveLength(3);
      for (const symbol of reels) expect(symbols).toContain(symbol);
    }
  });

  it('draws symbols deterministically from the weighted table', () => {
    // Weights: 🍒30 🍋25 🔔20 ⭐12 💎8 7️⃣5 (total 100). rng*100 lands in cumulative bands.
    expect(spinReels(sequenceRng([0, 0.3, 0.99])).reels).toEqual(['🍒', '🍋', '7️⃣']);
    expect(spinReels(sequenceRng([0.299, 0.55, 0.87])).reels).toEqual(['🍒', '🔔', '💎']);
  });

  it('pays the payout table on three of a kind', () => {
    for (const [symbol, payout] of Object.entries(SLOT_PAYOUTS)) {
      const s = symbol as SlotSymbol;
      expect(resolveSpin({ reels: [s, s, s] })).toBe(payout);
    }
  });

  it('pays the consolation multiplier on exactly two cherries', () => {
    expect(resolveSpin({ reels: ['🍒', '🍒', '🍋'] })).toBe(TWO_CHERRY_PAYOUT);
    expect(resolveSpin({ reels: ['🍒', '💎', '🍒'] })).toBe(TWO_CHERRY_PAYOUT);
    expect(resolveSpin({ reels: ['🔔', '🍒', '🍒'] })).toBe(TWO_CHERRY_PAYOUT);
  });

  it('pays nothing on mixed reels or a single cherry', () => {
    expect(resolveSpin({ reels: ['🍒', '🍋', '🔔'] })).toBe(0);
    expect(resolveSpin({ reels: ['🍋', '🔔', '⭐'] })).toBe(0);
  });

  it('keeps the expected value under 1 (house edge)', () => {
    // Exact EV over the weighted distribution: sum P(outcome) * payout.
    const weights: [SlotSymbol, number][] = [
      ['🍒', 30],
      ['🍋', 25],
      ['🔔', 20],
      ['⭐', 12],
      ['💎', 8],
      ['7️⃣', 5],
    ];
    const total = 100;
    let ev = 0;
    for (const [a, wa] of weights) {
      for (const [b, wb] of weights) {
        for (const [c, wc] of weights) {
          const p = (wa / total) * (wb / total) * (wc / total);
          ev += p * resolveSpin({ reels: [a, b, c] });
        }
      }
    }
    expect(ev).toBeLessThan(1);
  });
});
