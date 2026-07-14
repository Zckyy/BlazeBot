export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';
export type Suit = 'H' | 'D' | 'C' | 'S';

export interface Card {
  rank: Rank;
  suit: Suit;
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['H', 'D', 'C', 'S'];

/**
 * Draws from an infinite shoe (with replacement) — the stateless button flow
 * can't track deck depletion across presses, so replacement sampling is the
 * honest model.
 */
export function drawCard(rng: () => number = Math.random): Card {
  const rank = RANKS[Math.floor(rng() * RANKS.length)];
  const suit = SUITS[Math.floor(rng() * SUITS.length)];
  return { rank, suit };
}

function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** Aces count 11, dropping to 1 as needed; `soft` = an ace is still counted as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

/** A natural: exactly two cards totalling 21. */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Dealer draws until reaching 17 or more (stands on soft 17). */
export function playDealerHand(dealerCards: Card[], rng: () => number = Math.random): Card[] {
  const hand = [...dealerCards];
  while (handValue(hand).total < 17) {
    hand.push(drawCard(rng));
  }
  return hand;
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer_bust';

/** Resolves a finished round. Assumes the dealer hand has already been played out. */
export function resolveHand(playerCards: Card[], dealerCards: Card[]): Outcome {
  if (isBust(playerCards)) return 'bust';
  if (isBlackjack(playerCards)) {
    return isBlackjack(dealerCards) ? 'push' : 'blackjack';
  }
  if (isBust(dealerCards)) return 'dealer_bust';
  const player = handValue(playerCards).total;
  const dealer = handValue(dealerCards).total;
  if (player > dealer) return 'win';
  if (player < dealer) return 'lose';
  return 'push';
}

/**
 * Net-winnings multiplier on the stake: blackjack pays 3:2, ordinary wins 1:1,
 * push 0 (stake back), losses -1 (stake already deducted at deal time).
 */
export function payoutRatio(outcome: Outcome): number {
  switch (outcome) {
    case 'blackjack':
      return 1.5;
    case 'win':
    case 'dealer_bust':
      return 1;
    case 'push':
      return 0;
    case 'lose':
    case 'bust':
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Compact card codec for customId state — 2 chars per card (rank token + suit).
// '10' uses the token 'T' so every rank is exactly one character.
// ---------------------------------------------------------------------------

const RANK_TO_TOKEN: Record<Rank, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', '10': 'T', J: 'J', Q: 'Q', K: 'K',
};
const TOKEN_TO_RANK: Record<string, Rank> = Object.fromEntries(
  Object.entries(RANK_TO_TOKEN).map(([rank, token]) => [token, rank as Rank]),
);

export function encodeHand(hand: Card[]): string {
  return hand.map((card) => RANK_TO_TOKEN[card.rank] + card.suit).join('');
}

export function decodeHand(encoded: string): Card[] | undefined {
  if (encoded.length === 0 || encoded.length % 2 !== 0) return undefined;
  const hand: Card[] = [];
  for (let i = 0; i < encoded.length; i += 2) {
    const rank = TOKEN_TO_RANK[encoded[i]];
    const suit = encoded[i + 1] as Suit;
    if (!rank || !SUITS.includes(suit)) return undefined;
    hand.push({ rank, suit });
  }
  return hand;
}
