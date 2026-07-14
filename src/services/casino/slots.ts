export type SlotSymbol = '🍒' | '🍋' | '🔔' | '⭐' | '💎' | '7️⃣';

export interface SlotsResult {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
}

// Higher weight = more common on the reel = lower payout.
const REEL_WEIGHTS: [SlotSymbol, number][] = [
  ['🍒', 30],
  ['🍋', 25],
  ['🔔', 20],
  ['⭐', 12],
  ['💎', 8],
  ['7️⃣', 5],
];

const TOTAL_WEIGHT = REEL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

/** Net-winnings multiplier on the stake for three of a kind (stake is kept on a win). */
export const SLOT_PAYOUTS: Record<SlotSymbol, number> = {
  '🍒': 3,
  '🍋': 5,
  '🔔': 8,
  '⭐': 15,
  '💎': 30,
  '7️⃣': 50,
};

/** Consolation payout for exactly two cherries. */
export const TWO_CHERRY_PAYOUT = 1.5;

function drawSymbol(rng: () => number): SlotSymbol {
  let roll = rng() * TOTAL_WEIGHT;
  for (const [symbol, weight] of REEL_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return symbol;
  }
  return REEL_WEIGHTS[REEL_WEIGHTS.length - 1][0];
}

export function spinReels(rng: () => number = Math.random): SlotsResult {
  return { reels: [drawSymbol(rng), drawSymbol(rng), drawSymbol(rng)] };
}

/**
 * Net-winnings multiplier on the stake: three of a kind pays per SLOT_PAYOUTS,
 * exactly two cherries pays the consolation multiplier, anything else loses (0).
 */
export function resolveSpin(result: SlotsResult): number {
  const [a, b, c] = result.reels;
  if (a === b && b === c) return SLOT_PAYOUTS[a];
  const cherries = result.reels.filter((symbol) => symbol === '🍒').length;
  if (cherries === 2) return TWO_CHERRY_PAYOUT;
  return 0;
}
