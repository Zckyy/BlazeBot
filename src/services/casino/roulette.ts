export type RouletteColor = 'red' | 'black' | 'green';

export interface SpinResult {
  number: number;
  color: RouletteColor;
}

// Standard European wheel red numbers; 0 is green, the rest are black.
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function colorOf(number: number): RouletteColor {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

export function spin(): SpinResult {
  const number = Math.floor(Math.random() * 37);
  return { number, color: colorOf(number) };
}

export type BetType = 'number' | 'color' | 'parity' | 'range';

export interface Bet {
  type: BetType;
  /** number 0-36 | 'red'/'black' | 'even'/'odd' | 'low' (1-18) / 'high' (19-36) */
  value: string | number;
  amount: number;
}

/**
 * Payout multiplier applied to the stake on a win (35 for straight number,
 * 1 for even-money outside bets), or 0 on a loss. Zero loses all outside bets.
 */
export function resolveBet(bet: Bet, result: SpinResult): number {
  switch (bet.type) {
    case 'number':
      return result.number === Number(bet.value) ? 35 : 0;
    case 'color':
      return result.color === bet.value ? 1 : 0;
    case 'parity': {
      if (result.number === 0) return 0;
      const parity = result.number % 2 === 0 ? 'even' : 'odd';
      return parity === bet.value ? 1 : 0;
    }
    case 'range': {
      if (result.number === 0) return 0;
      const range = result.number <= 18 ? 'low' : 'high';
      return range === bet.value ? 1 : 0;
    }
  }
}
