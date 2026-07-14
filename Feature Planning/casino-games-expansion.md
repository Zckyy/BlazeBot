# Casino Games Expansion — Slots & Video Blackjack (Phase 3 — builds on Casino/Economy System)

> **Status:** Slots is implemented and live in the hub. Video poker was implemented and then
> removed at the user's request — replaced by the Video Blackjack plan below.

## Context

The casino/economy system ([casino-economy-system.md](casino-economy-system.md)) shipped with one
game, roulette, but the hub UI ([src/interactions/casino.ts](src/interactions/casino.ts)) was
built as a game-select menu specifically so more games could be added without touching the hub's
shape. This pass adds two more: **slots** (simple, single-step — done) and **video blackjack**,
modeled on Tower Unite's casino Video Blackjack machine
(https://tower-unite.fandom.com/wiki/Video_Blackjack_(Casino)). Per the wiki, Tower Unite's
version is deliberately stripped down relative to table blackjack: deal, then **hit/stand only**
— no double-down, no splits, no insurance. That simplification is what makes it a good fit here:
it removes most of what made full blackjack heavier than the other games while keeping the core
loop.

Both games follow the same "engine in `services/casino/`, view+handler in `interactions/casino.ts`"
split roulette already established. No new commands — `/casino` is still the only entry point,
consistent with the hub pattern. No `src/core/*` changes.

## Design constraint carried over from roulette: everything is stateless

All casino flow state lives inside the button/select `customId`
(`casino:<userId>:<action>:<arg>...`), decoded per-interaction — there is no in-memory session map
and no DB-backed "current game" row. This is what makes the hub resumable after a bot restart and
keeps `interactions/casino.ts` the single source of truth for flow. Slots needs no extra state
(bet in, spin, resolve — same shape as roulette). Video blackjack does need mid-hand state (the
player's cards and the dealer's upcard must survive across hit/stand presses), so that state gets
serialized into the customId itself — see the encoding section below.

Discord caps `customId` at 100 characters. A compact card encoding (2 chars/card: rank + suit,
`T` for ten, e.g. `TH` = ten of hearts, `AS` = ace of spades) keeps the blackjack customId well
under that even in the worst realistic case: a player hand can't exceed ~11 cards before busting
(A+A+A+A+2+2+2+2+3+3+3 = 21), and only the dealer's single upcard travels mid-hand, so worst case
is roughly `casino:<19>:bj-hit:<22 chars>:<2 chars>:<9 chars>` ≈ 65 chars.

---

## Slots

### Engine — `src/services/casino/slots.ts`

Pure, Discord-agnostic, unit-testable like [roulette.ts](src/services/casino/roulette.ts):

```ts
export type SlotSymbol = '🍒' | '🍋' | '🔔' | '⭐' | '💎' | '7️⃣';

const REEL_WEIGHTS: Record<SlotSymbol, number> = {
  '🍒': 30, '🍋': 25, '🔔': 20, '⭐': 12, '💎': 8, '7️⃣': 5,
}; // higher weight = more common = lower payout

export interface SpinResult { reels: [SlotSymbol, SlotSymbol, SlotSymbol]; }

export function spinReels(): SpinResult { /* 3 independent weighted draws */ }

/** Returns payout multiplier on the stake: three-of-a-kind pays per PAYOUTS table,
 *  two matching cherries pays a small flat multiplier, anything else is 0. */
export function resolveSpin(result: SpinResult): number { ... }

const PAYOUTS: Record<SlotSymbol, number> = {
  '🍒': 3, '🍋': 5, '🔔': 8, '⭐': 15, '💎': 30, '7️⃣': 50,
}; // three-of-a-kind multiplier; tune so expected value stays under 1 (house edge)
```

Two-cherry partial payout (1.5x) is a nice slots convention (rewards near-misses) — worth
including since it's cheap and pure. Weighted RNG: cumulative-weight table + one `Math.random()`,
same technique roulette doesn't need (uniform 0-36) but is standard for weighted reels.

### View + handler additions in `interactions/casino.ts`

- Add `'Slots'` option to the `hubView` select menu (🎰 emoji, alongside Roulette).
- `slotsView(guildId, userId)`: shows balance + payout table, preset/all-in/custom bet buttons —
  reuses the exact `amountView` pattern roulette uses (same preset amounts, same custom-amount
  modal), just parameterized by game instead of bet type/value. Practically: generalize
  `amountView`/`amountInput`/`modal-amt` handling to take a `game: 'roulette' | 'slots'` discriminant
  in the customId args rather than duplicating the view function.
- `slotsResultView(...)`: shows the three reels, win/lose line, new balance — mirrors
  `resultView`, reuses `getEquippedMultiplier` for shop-item bonuses exactly like roulette does.
- New `runSlotsSpin(guildId, userId, amount)` mirrors `runSpin`: call `spinReels()` +
  `resolveSpin()`, apply equipped multiplier to winnings only, `adjustChips`, return outcome.
- Routing: `decoded.action` cases branch on a leading `game` arg (`'roulette' | 'slots'`) already
  present after generalizing `amt`/`custom`/`again` — no new top-level actions needed, just an
  extra arg threaded through the existing ones.

### Files touched (new)

- `src/services/casino/slots.ts`
- `tests/services/slots.test.ts` (weighted RNG determinism via mocked `Math.random`, payout
  table correctness, two-cherry partial payout, house-edge sanity check on expected value)

### Files touched (modified)

- `src/interactions/casino.ts` — add slots to hub menu, generalize amount/bet views to be
  game-parameterized, add slots result view + spin runner + routing branch.

---

## Video Blackjack

Modeled on Tower Unite's casino Video Blackjack machine. Its rule set (from the wiki):

1. **Deal** — player and dealer each get two cards; only the dealer's upcard shows.
2. **Hit/Stand** — hit adds a card; going over 21 busts and loses immediately. Stand ends the
   player's turn. **No double-down, no splits, no insurance** — hit/stand is the entire decision
   space, exactly like the arcade machine.
3. **Round end** — the dealer's hand is revealed and played out; higher total wins, dealer bust
   is a player win.

One deliberate deviation: Tower Unite pays a flat 5× the credit bet on any win (1→5, 3→15,
5→25 credits). That multiplier is tuned for its own arcade economy and would badly inflate ours
(roulette's even-money bets pay 1:1). BlazeBot uses standard blackjack settlement instead:
**win pays 1:1 net, natural blackjack (2-card 21) pays 3:2, push returns the stake** — consistent
with the rest of the casino's odds while keeping Tower Unite's simplified hit/stand-only flow.

### Engine — `src/services/casino/blackjack.ts`

Pure, Discord-agnostic, reusing the `Card`/`Rank`/`Suit` shapes and 2-char codec from the removed
video poker engine (same types, new module):

```ts
export type Rank = 'A' | '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
export type Suit = 'H' | 'D' | 'C' | 'S';
export interface Card { rank: Rank; suit: Suit; }

export function drawCard(rng?: () => number): Card; // infinite shoe (draw with replacement) —
  // a stateless flow can't track deck depletion across button presses, and the customId only
  // carries the player's hand + dealer upcard, so replacement sampling is the honest model

export function handValue(cards: Card[]): { total: number; soft: boolean };
  // aces count 11 then drop to 1 as needed; `soft` = an ace is currently counted as 11

export function isBlackjack(cards: Card[]): boolean; // exactly 2 cards totalling 21
export function isBust(cards: Card[]): boolean;      // total > 21

/** Dealer draws until reaching 17+ (stands on soft 17 — simplest standard rule). */
export function playDealerHand(dealerCards: Card[], rng?: () => number): Card[];

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer_bust';

export function resolveHand(playerCards: Card[], dealerCards: Card[]): Outcome;

/** Net-winnings multiplier on the stake: blackjack 1.5, win/dealer_bust 1, push 0 (stake back),
 *  lose/bust -1 (already settled by the up-front stake deduction). */
export function payoutRatio(outcome: Outcome): number;

// customId codec, same 2-char scheme as before ('T' token for ten):
export function encodeHand(hand: Card[]): string;
export function decodeHand(encoded: string): Card[] | undefined;
```

Optional `rng` params (defaulting to `Math.random`) are the same testability seam slots uses —
tests can force exact cards without touching global `Math.random`.

### customId state — player hand + dealer upcard only

```
casino:<userId>:bj-<action>:<playerCards>:<dealerUpcard>:<amount>
```

e.g. `casino:123:bj-hit:AS9D:TH:250` (player holds A♠ 9♦, dealer shows T♥, 250 chips staked).
Only the dealer's *upcard* travels mid-hand — the hole card and any dealer draws are generated
once, at resolution (stand or bust), matching the machine's UX where the dealer's hand is only
revealed at round end. With the infinite-shoe model this is also statistically equivalent to
having drawn the hole card at deal time. Worst-case length stays ~65 chars (see the stateless
section above), inside Discord's 100-char cap.

### View + handler additions in `interactions/casino.ts`

- Add `'Video Blackjack'` to the hub select menu (🃏 emoji).
- Bet view: reuse the existing `betAmountRow` helper (preset/all-in/custom + custom-amount modal)
  exactly as slots does — actions `bj-amt` / `bj-custom` / `bj-modal`.
- `blackjackTableView(userId, playerCards, dealerUpcard, amount)`: mid-hand view — both hands
  shown (dealer as `<upcard> 🂠`), player total (displaying soft totals as e.g. "7 / 17"), and a
  **Hit** / **Stand** button row carrying the encoded state.
- `blackjackResultView(...)`: final view — full dealer hand, both totals, outcome line
  (blackjack/win/push/lose/bust with the settled chip delta and item-bonus note), balance, and a
  Deal-again / Back-to-games row (`bj-again` mirrors `s-again`).
- Action branches:
  - `bj-amt` / `bj-modal` → validate the bet, **deduct the stake up front** via `adjustChips`
    (same reasoning as before: a multi-step hand must not be abandonable to dodge a loss), draw
    2 player cards + 1 dealer upcard, render the table view. If the player's initial two cards
    are a natural blackjack, resolve immediately (draw the dealer's hand to check for a push
    against a dealer natural, per standard rules).
  - `bj-hit` → decode state, draw one card, re-render the table view; if the new card busts the
    hand, skip straight to the result view (dealer doesn't need to play — the loss is already
    settled by the up-front deduction).
  - `bj-stand` → decode state, draw the dealer's hole card and play out the dealer via
    `playDealerHand`, `resolveHand` + `payoutRatio`, settle via `adjustChips` (stake + winnings
    returned on win: `floor(amount * (1 + ratio * itemMultiplier))`... concretely: push returns
    `amount`, win returns `amount + floor(amount * ratio * multiplier)` with
    `getEquippedMultiplier` applied to the net-winnings part only, never to the returned stake).
- Settlement invariant: stake out at deal, winnings+stake back at resolution — identical shape to
  how the removed video poker pass handled it, and the loss path needs no further chip movement.

### Files touched (new)

- `src/services/casino/blackjack.ts`
- `tests/services/blackjack.test.ts` (hand values incl. soft/hard ace transitions and multi-ace
  hands, blackjack/bust detection, dealer stands-on-17 behavior, every `Outcome` from
  `resolveHand`, payout ratios, codec round-trip + malformed-input rejection)

### Files touched (modified)

- `src/interactions/casino.ts` — hub menu entry, bet view wiring, table/result views,
  `bj-amt`/`bj-custom`/`bj-modal`/`bj-hit`/`bj-stand`/`bj-again` routing.

---

## Shared bet-amount UI

The slots pass already extracted `betAmountRow` (preset/all-in/custom buttons) and
`customAmountModal` as shared helpers in `interactions/casino.ts` — video blackjack's bet view
reuses them as-is with its own action names. No further generalization needed.

## Testing

- Unit tests as listed per engine above — all pure, no DB, `vitest`, mirroring
  [roulette.test.ts](tests/services/roulette.test.ts) and
  [slots.test.ts](tests/services/slots.test.ts) conventions.
- Manual verification: `npm run dev`, `/casino` → select Video Blackjack → bet → hit until bust
  (confirm immediate loss, no dealer play) → deal again → stand on a made hand → confirm the
  dealer draws to 17+, the outcome and chip settlement are right (including a push returning the
  stake exactly), and an equipped shop item multiplies net winnings only.

## Files touched (summary)

Already done (slots pass):
- `src/services/casino/slots.ts`, `tests/services/slots.test.ts`
- `src/interactions/casino.ts` (hub menu entry, slots views, shared `betAmountRow`/
  `customAmountModal` helpers)

This pass (video blackjack):
- New: `src/services/casino/blackjack.ts`, `tests/services/blackjack.test.ts`
- Modified: `src/interactions/casino.ts` (hub menu entry, table/result views, bj-* routing)

No changes to `src/core/*`, no new migrations (both games only touch existing `economy_balances`
chip balance via the existing `adjustChips`/`getEquippedMultiplier` repository functions).

## Deferred (explicitly out of scope, flagged for later)

- Poker (multiplayer table state, matchmaking, betting rounds — different scope entirely)
- Full table blackjack extras: double-down, splits, insurance (Tower Unite's machine omits them
  and so does this pass; each is an incremental addition to the same engine later)
- Finite-shoe / card-counting-relevant deck depletion (stateless flow uses an infinite shoe)
- Slots progressive jackpot / bonus rounds
- Per-game leaderboards (biggest slots win, blackjack win streaks, etc.)
- **Real card face images** (follow-up after this pass): replace the Unicode-symbol card labels
  (`A♠`, `T♥`) in blackjack's table/result views with actual card art. Approach: source a
  public-domain card-face asset set (52 faces + back, e.g. the classic "SVG-cards" deck), use
  `sharp` to composite a hand's cards into one horizontal PNG at request time (no canvas/font
  rendering needed since the source images are pre-rendered), and send it as a Discord attachment
  referenced in the embed's image field. Main constraint: an embed supports only one image, so
  both hands need to be composited into a single strip (or split across two embeds) rather than
  shown as separate text lines like today. Worth its own pass — new dependency, plus compositing
  should probably be cached per distinct hand rather than redone on every button press.
