import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { initDatabase } from '../src/services/database/db.js';
import {
  completeTypingChallenge,
  completeTriviaChallenge,
  completeUnscrambleChallenge,
  createTypingChallenge,
  performFishingActivity,
  saveConnect4Turn,
  startConnect4Game,
  startTypingChallenge,
  startTriviaChallenge,
  startUnscrambleChallenge,
  tryClaimCooldown,
} from '../src/services/database/repositories/workActivities.js';
import {
  getStack,
  sellStackForDollars,
} from '../src/services/database/repositories/stackableInventory.js';
import { getBalance } from '../src/services/database/repositories/economy.js';
import { getUserLevel } from '../src/services/database/repositories/userLevels.js';
import { FISH } from '../src/services/work/config.js';
import { selectFish } from '../src/services/work/fishing.js';
import {
  chooseBotMove,
  emptyBoard,
  hasWinner,
  parseBoard,
  placePiece,
  serializeBoard,
} from '../src/services/work/connect4.js';
import { isCorrectTypingAnswer } from '../src/services/work/typing.js';
import { prepareTriviaQuestion, selectTriviaQuestion } from '../src/services/work/trivia.js';
import { isCorrectUnscrambleAnswer, scrambleWord } from '../src/services/work/unscramble.js';

initDatabase(':memory:');

describe('work activity rules', () => {
  test('typing comparison ignores case and surrounding whitespace only', () => {
    assert.equal(isCorrectTypingAnswer('  Architecture ', 'architecture'), true);
    assert.equal(isCorrectTypingAnswer('archi tecture', 'architecture'), false);
  });

  test('fish selection respects weight boundaries', () => {
    assert.equal(selectFish(() => 0).id, 'fish_minnow');
    assert.equal(selectFish(() => 0.5).id, 'fish_trout');
    assert.equal(selectFish(() => 0.8).id, 'fish_salmon');
    assert.equal(selectFish(() => 0.95).id, 'fish_golden_carp');
  });

  test('Connect Four detects horizontal, vertical, and diagonal wins', () => {
    const horizontal = parseBoard('000000000000000000000000000000000001111000');
    assert.equal(hasWinner(horizontal, 1), true);

    let vertical = emptyBoard();
    for (let move = 0; move < 4; move += 1) vertical = placePiece(vertical, 0, 2)!;
    assert.equal(hasWinner(vertical, 2), true);

    const diagonal = emptyBoard();
    diagonal[35] = 1;
    diagonal[29] = 1;
    diagonal[23] = 1;
    diagonal[17] = 1;
    assert.equal(hasWinner(diagonal, 1), true);
  });

  test('Connect Four bot wins immediately and blocks the player', () => {
    let botWin = emptyBoard();
    for (const column of [0, 1, 2]) botWin = placePiece(botWin, column, 2)!;
    assert.equal(
      chooseBotMove(botWin, () => 0),
      3,
    );

    let block = emptyBoard();
    for (const column of [0, 1, 2]) block = placePiece(block, column, 1)!;
    assert.equal(
      chooseBotMove(block, () => 0),
      3,
    );
  });

  test('board serialization rejects malformed state', () => {
    assert.equal(serializeBoard(emptyBoard()).length, 42);
    assert.throws(() => parseBoard('012'));
  });

  test('trivia selection and shuffling retain the correct answer', () => {
    const question = selectTriviaQuestion(() => 0);
    const correctAnswer = question.answers[question.correctIndex];
    const prepared = prepareTriviaQuestion(question, () => 0);
    assert.equal(prepared.answers[prepared.correctIndex], correctAnswer);
    assert.notDeepEqual(prepared.answers, question.answers);
  });

  test('word scrambling always changes the order and answer checks are strict', () => {
    const scrambled = scrambleWord('adventure', () => 0.999);
    assert.notEqual(scrambled, 'adventure');
    assert.deepEqual([...scrambled].sort(), [...'adventure'].sort());
    assert.equal(isCorrectUnscrambleAnswer('  Adventure ', 'adventure'), true);
    assert.equal(isCorrectUnscrambleAnswer('adven ture', 'adventure'), false);
  });
});

describe('work activity persistence', () => {
  test('cooldown claims are atomic and isolated by activity', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = tryClaimCooldown('guild-cooldown', 'user', 'typing', 60_000, now);
    const duplicate = tryClaimCooldown('guild-cooldown', 'user', 'typing', 60_000, now);
    const fishing = tryClaimCooldown('guild-cooldown', 'user', 'fishing', 60_000, now);
    assert.equal(first.claimed, true);
    assert.equal(duplicate.claimed, false);
    assert.equal(fishing.claimed, true);
  });

  test('typing awards XP once for a timely correct answer', () => {
    const createdAt = new Date('2026-02-01T00:00:00.000Z');
    const challenge = createTypingChallenge('guild-typing', 'user', 'architecture', createdAt);
    const started = startTypingChallenge(
      challenge.challengeId,
      'guild-typing',
      'user',
      60_000,
      new Date(createdAt.getTime() + 1_000),
    );
    assert.equal(started.status, 'started');
    const completed = completeTypingChallenge(
      challenge.challengeId,
      'guild-typing',
      'user',
      'Architecture',
      new Date(createdAt.getTime() + 2_000),
    );
    assert.equal(completed.status, 'success');
    assert.equal(getUserLevel('guild-typing', 'user')?.xp, 12);
    assert.equal(
      completeTypingChallenge(
        challenge.challengeId,
        'guild-typing',
        'user',
        'architecture',
        new Date(createdAt.getTime() + 3_000),
      ).status,
      'used',
    );
    assert.equal(getUserLevel('guild-typing', 'user')?.xp, 12);
  });

  test('typing rejects a correct answer after the deadline', () => {
    const createdAt = new Date('2026-02-02T00:00:00.000Z');
    const challenge = createTypingChallenge('guild-typing-late', 'user', 'architecture', createdAt);
    const started = startTypingChallenge(
      challenge.challengeId,
      'guild-typing-late',
      'user',
      60_000,
      createdAt,
    );
    assert.equal(started.status, 'started');
    const completed = completeTypingChallenge(
      challenge.challengeId,
      'guild-typing-late',
      'user',
      'architecture',
      new Date(createdAt.getTime() + 15_001),
    );
    assert.equal(completed.status, 'expired');
    assert.equal(getUserLevel('guild-typing-late', 'user'), undefined);
  });

  test('fishing adds a stack and selling updates inventory and dollars atomically', () => {
    const fish = FISH[1];
    const result = performFishingActivity(
      'guild-fishing',
      'user',
      fish,
      60_000,
      new Date('2026-03-01T00:00:00.000Z'),
    );
    assert.equal(result.status, 'caught');
    assert.equal(getStack('guild-fishing', 'user', fish.id), 1);
    assert.equal(getUserLevel('guild-fishing', 'user')?.xp, fish.xp);
    assert.equal(
      sellStackForDollars('guild-fishing', 'user', fish.id, 2, fish.saleValue),
      undefined,
    );
    assert.equal(getStack('guild-fishing', 'user', fish.id), 1);
    const sale = sellStackForDollars('guild-fishing', 'user', fish.id, 1, fish.saleValue);
    assert.equal(sale?.dollarsGained, fish.saleValue);
    assert.equal(getStack('guild-fishing', 'user', fish.id), 0);
    assert.equal(getBalance('guild-fishing', 'user')?.dollars, fish.saleValue);
  });

  test('Connect Four terminal save awards XP only once', () => {
    const started = startConnect4Game(
      'guild-connect4',
      'user',
      60_000,
      new Date('2026-04-01T00:00:00.000Z'),
    );
    assert.equal(started.status, 'started');
    if (started.status !== 'started') return;
    let winningBoard = emptyBoard();
    for (const column of [0, 1, 2, 3]) winningBoard = placePiece(winningBoard, column, 1)!;
    const saved = saveConnect4Turn(
      started.game.gameId,
      'guild-connect4',
      'user',
      started.game.board,
      winningBoard,
      'won',
      new Date('2026-04-01T00:00:01.000Z'),
    );
    assert.equal(saved.status, 'saved');
    assert.equal(getUserLevel('guild-connect4', 'user')?.xp, 25);
    assert.equal(
      saveConnect4Turn(
        started.game.gameId,
        'guild-connect4',
        'user',
        started.game.board,
        winningBoard,
        'won',
        new Date('2026-04-01T00:00:02.000Z'),
      ).status,
      'stale',
    );
    assert.equal(getUserLevel('guild-connect4', 'user')?.xp, 25);
  });

  test('trivia validates ownership and awards XP exactly once', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const prepared = prepareTriviaQuestion(
      selectTriviaQuestion(() => 0),
      () => 0,
    );
    const started = startTriviaChallenge('guild-trivia', 'user', prepared, 60_000, now);
    assert.equal(started.status, 'started');
    if (started.status !== 'started') return;
    assert.equal(
      completeTriviaChallenge(
        started.challenge.challengeId,
        'guild-trivia',
        'other-user',
        prepared.correctIndex,
        new Date(now.getTime() + 1_000),
      ).status,
      'invalid',
    );
    assert.equal(
      completeTriviaChallenge(
        started.challenge.challengeId,
        'guild-trivia',
        'user',
        9,
        new Date(now.getTime() + 1_000),
      ).status,
      'invalid',
    );
    assert.equal(
      completeTriviaChallenge(
        started.challenge.challengeId,
        'guild-trivia',
        'user',
        prepared.correctIndex,
        new Date(now.getTime() + 2_000),
      ).status,
      'success',
    );
    assert.equal(getUserLevel('guild-trivia', 'user')?.xp, 15);
    assert.equal(
      completeTriviaChallenge(
        started.challenge.challengeId,
        'guild-trivia',
        'user',
        prepared.correctIndex,
        new Date(now.getTime() + 3_000),
      ).status,
      'used',
    );
    assert.equal(getUserLevel('guild-trivia', 'user')?.xp, 15);
  });

  test('trivia failures and expired answers award no XP', () => {
    const now = new Date('2026-05-02T00:00:00.000Z');
    const prepared = prepareTriviaQuestion(
      selectTriviaQuestion(() => 0),
      () => 0,
    );
    const failed = startTriviaChallenge('guild-trivia-failed', 'user', prepared, 60_000, now);
    assert.equal(failed.status, 'started');
    if (failed.status !== 'started') return;
    const wrongIndex = (prepared.correctIndex + 1) % 4;
    assert.equal(
      completeTriviaChallenge(
        failed.challenge.challengeId,
        'guild-trivia-failed',
        'user',
        wrongIndex,
        new Date(now.getTime() + 1_000),
      ).status,
      'failed',
    );
    const expired = startTriviaChallenge('guild-trivia-expired', 'user', prepared, 60_000, now);
    assert.equal(expired.status, 'started');
    if (expired.status !== 'started') return;
    assert.equal(
      completeTriviaChallenge(
        expired.challenge.challengeId,
        'guild-trivia-expired',
        'user',
        prepared.correctIndex,
        new Date(now.getTime() + 30_001),
      ).status,
      'expired',
    );
    assert.equal(getUserLevel('guild-trivia-failed', 'user'), undefined);
    assert.equal(getUserLevel('guild-trivia-expired', 'user'), undefined);
  });

  test('word unscrambling awards once and enforces its deadline', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const started = startUnscrambleChallenge(
      'guild-unscramble',
      'user',
      'adventure',
      'venturead',
      60_000,
      now,
    );
    assert.equal(started.status, 'started');
    if (started.status !== 'started') return;
    assert.equal(
      completeUnscrambleChallenge(
        started.challenge.challengeId,
        'guild-unscramble',
        'user',
        ' Adventure ',
        new Date(now.getTime() + 1_000),
      ).status,
      'success',
    );
    assert.equal(getUserLevel('guild-unscramble', 'user')?.xp, 12);
    assert.equal(
      completeUnscrambleChallenge(
        started.challenge.challengeId,
        'guild-unscramble',
        'user',
        'adventure',
        new Date(now.getTime() + 2_000),
      ).status,
      'used',
    );

    const expired = startUnscrambleChallenge(
      'guild-unscramble-expired',
      'user',
      'blueprint',
      'printblue',
      60_000,
      now,
    );
    assert.equal(expired.status, 'started');
    if (expired.status !== 'started') return;
    assert.equal(
      completeUnscrambleChallenge(
        expired.challenge.challengeId,
        'guild-unscramble-expired',
        'user',
        'blueprint',
        new Date(now.getTime() + 20_001),
      ).status,
      'expired',
    );
    assert.equal(getUserLevel('guild-unscramble-expired', 'user'), undefined);
  });
});
