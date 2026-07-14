import { describe, expect, it } from 'vitest';
import {
  decodeHand,
  drawCard,
  encodeHand,
  handValue,
  isBlackjack,
  isBust,
  payoutRatio,
  playDealerHand,
  resolveHand,
  type Card,
  type Rank,
  type Suit,
} from '../../src/services/casino/blackjack.js';

function hand(...cards: `${Rank}${Suit}`[]): Card[] {
  return cards.map((c) => ({ rank: c.slice(0, -1) as Rank, suit: c.slice(-1) as Suit }));
}

/** rng stub that returns the given values in sequence. */
function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe('blackjack hand values', () => {
  it('counts number and face cards', () => {
    expect(handValue(hand('2H', '9D'))).toEqual({ total: 11, soft: false });
    expect(handValue(hand('KH', 'QD'))).toEqual({ total: 20, soft: false });
    expect(handValue(hand('10H', 'JD'))).toEqual({ total: 20, soft: false });
  });

  it('counts an ace as 11 while it fits (soft) and drops it to 1 when it does not', () => {
    expect(handValue(hand('AH', '6D'))).toEqual({ total: 17, soft: true });
    expect(handValue(hand('AH', '6D', '9C'))).toEqual({ total: 16, soft: false });
  });

  it('handles multiple aces', () => {
    expect(handValue(hand('AH', 'AD'))).toEqual({ total: 12, soft: true });
    expect(handValue(hand('AH', 'AD', 'AC', 'AS'))).toEqual({ total: 14, soft: true });
    expect(handValue(hand('AH', 'AD', '9C', 'KS'))).toEqual({ total: 21, soft: false });
  });

  it('detects blackjack only on exactly two cards totalling 21', () => {
    expect(isBlackjack(hand('AH', 'KD'))).toBe(true);
    expect(isBlackjack(hand('AH', '10D'))).toBe(true);
    expect(isBlackjack(hand('7H', '7D', '7C'))).toBe(false);
    expect(isBlackjack(hand('KH', 'QD'))).toBe(false);
  });

  it('detects busts', () => {
    expect(isBust(hand('KH', 'QD', '5C'))).toBe(true);
    expect(isBust(hand('KH', 'QD', 'AC'))).toBe(false);
    expect(isBust(hand('AH', 'AD', '9C', 'KS'))).toBe(false);
  });
});

describe('dealer play', () => {
  it('stands immediately at 17 or more', () => {
    expect(playDealerHand(hand('KH', '7D'))).toHaveLength(2);
    expect(playDealerHand(hand('AH', '6D'))).toHaveLength(2); // soft 17 stands
    expect(playDealerHand(hand('KH', 'QD'))).toHaveLength(2);
  });

  it('draws until reaching 17+', () => {
    // rng pairs -> rank index, suit index. 0.4 * 13 = 5 -> '6'; 0 -> 'A'... force a ten: 9/13≈0.7
    const dealer = playDealerHand(hand('2H', '3D'), sequenceRng([0.7, 0, 0.7, 0]));
    // 2+3=5, draw 10 -> 15, draw 10 -> 25: stops once >= 17 (bust counts as stopped)
    expect(handValue(dealer).total).toBeGreaterThanOrEqual(17);
    expect(dealer.length).toBeGreaterThan(2);
  });

  it('never draws past 21 without stopping', () => {
    for (let i = 0; i < 200; i += 1) {
      const dealer = playDealerHand(hand('2H', '2D'));
      const { total } = handValue(dealer);
      expect(total).toBeGreaterThanOrEqual(17);
      // the hand before the last draw must have been under 17
      const beforeLast = dealer.slice(0, -1);
      if (beforeLast.length >= 2) {
        expect(handValue(beforeLast).total).toBeLessThan(17);
      }
    }
  });
});

describe('round resolution', () => {
  it('player bust always loses, even if the dealer would also bust', () => {
    expect(resolveHand(hand('KH', 'QD', '5C'), hand('KS', 'QC', '5D'))).toBe('bust');
  });

  it('natural blackjack beats an ordinary 21 and pushes against a dealer natural', () => {
    expect(resolveHand(hand('AH', 'KD'), hand('7S', '7C', '7D'))).toBe('blackjack');
    expect(resolveHand(hand('AH', 'KD'), hand('AS', 'QC'))).toBe('push');
  });

  it('dealer bust is a player win', () => {
    expect(resolveHand(hand('KH', '5D'), hand('KS', 'QC', '5C'))).toBe('dealer_bust');
  });

  it('compares totals when both stand', () => {
    expect(resolveHand(hand('KH', 'QD'), hand('KS', '9C'))).toBe('win');
    expect(resolveHand(hand('KH', '9D'), hand('KS', 'QC'))).toBe('lose');
    expect(resolveHand(hand('KH', 'QD'), hand('KS', 'QC'))).toBe('push');
  });

  it('pays 3:2 on blackjack, 1:1 on wins, 0 on push, -1 on losses', () => {
    expect(payoutRatio('blackjack')).toBe(1.5);
    expect(payoutRatio('win')).toBe(1);
    expect(payoutRatio('dealer_bust')).toBe(1);
    expect(payoutRatio('push')).toBe(0);
    expect(payoutRatio('lose')).toBe(-1);
    expect(payoutRatio('bust')).toBe(-1);
  });
});

describe('card drawing and codec', () => {
  it('draws valid cards', () => {
    for (let i = 0; i < 200; i += 1) {
      const card = drawCard();
      expect(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']).toContain(card.rank);
      expect(['H', 'D', 'C', 'S']).toContain(card.suit);
    }
  });

  it('round-trips every card in the deck', () => {
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits: Suit[] = ['H', 'D', 'C', 'S'];
    const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
    const encoded = encodeHand(deck);
    expect(encoded).toHaveLength(deck.length * 2);
    expect(decodeHand(encoded)).toEqual(deck);
  });

  it('rejects malformed input', () => {
    expect(decodeHand('')).toBeUndefined();
    expect(decodeHand('AHX')).toBeUndefined();
    expect(decodeHand('ZZ')).toBeUndefined();
    expect(decodeHand('AX')).toBeUndefined();
  });
});
