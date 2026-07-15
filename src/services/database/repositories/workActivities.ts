import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { addXp, type UserLevel } from './userLevels.js';
import { addStack } from './stackableInventory.js';
import {
  CONNECT4_GAME_TIMEOUT_MS,
  CONNECT4_REWARDS,
  TRIVIA_REWARD_XP,
  TRIVIA_TIME_LIMIT_MS,
  TYPING_CHALLENGE_OFFER_MS,
  TYPING_REWARD_XP,
  TYPING_TIME_LIMIT_MS,
  UNSCRAMBLE_REWARD_XP,
  UNSCRAMBLE_TIME_LIMIT_MS,
  type FishDefinition,
  type WorkActivityId,
} from '../../work/config.js';
import { isCorrectTypingAnswer } from '../../work/typing.js';
import { emptyBoard, parseBoard, serializeBoard, type Connect4Board } from '../../work/connect4.js';
import type { PreparedTriviaQuestion } from '../../work/trivia.js';
import { isCorrectUnscrambleAnswer } from '../../work/unscramble.js';

interface CooldownRow {
  activity: WorkActivityId;
  available_at: string;
}

export interface XpAwardResult {
  xpGained: number;
  userLevel: UserLevel;
  leveledUp: boolean;
}

export type CooldownClaim =
  { claimed: true; availableAt: Date } | { claimed: false; availableAt: Date };

export function getWorkCooldowns(
  guildId: string,
  userId: string,
): Partial<Record<WorkActivityId, Date>> {
  const rows = getDb()
    .prepare('SELECT activity, available_at FROM work_cooldowns WHERE guild_id = ? AND user_id = ?')
    .all(guildId, userId) as CooldownRow[];
  return Object.fromEntries(rows.map((row) => [row.activity, new Date(row.available_at)]));
}

export function tryClaimCooldown(
  guildId: string,
  userId: string,
  activity: WorkActivityId,
  cooldownMs: number,
  now = new Date(),
): CooldownClaim {
  return getDb().transaction(() => claimCooldown(guildId, userId, activity, cooldownMs, now))();
}

function claimCooldown(
  guildId: string,
  userId: string,
  activity: WorkActivityId,
  cooldownMs: number,
  now: Date,
): CooldownClaim {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT available_at FROM work_cooldowns
       WHERE guild_id = ? AND user_id = ? AND activity = ?`,
    )
    .get(guildId, userId, activity) as { available_at: string } | undefined;
  if (existing) {
    const availableAt = new Date(existing.available_at);
    if (availableAt.getTime() > now.getTime()) return { claimed: false, availableAt };
  }
  const availableAt = new Date(now.getTime() + cooldownMs);
  db.prepare(
    `INSERT INTO work_cooldowns (guild_id, user_id, activity, available_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id, activity) DO UPDATE SET
       available_at = excluded.available_at,
       updated_at = excluded.updated_at`,
  ).run(guildId, userId, activity, availableAt.toISOString(), now.toISOString());
  return { claimed: true, availableAt };
}

export interface TypingChallenge {
  challengeId: string;
  guildId: string;
  userId: string;
  word: string;
  createdAt: Date;
  startedAt?: Date;
  expiresAt?: Date;
  completedAt?: Date;
  outcome?: 'success' | 'failed' | 'expired';
}

interface TypingChallengeRow {
  challenge_id: string;
  guild_id: string;
  user_id: string;
  word: string;
  created_at: string;
  started_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  outcome: TypingChallenge['outcome'] | null;
}

export function createTypingChallenge(
  guildId: string,
  userId: string,
  word: string,
  now = new Date(),
): TypingChallenge {
  const challengeId = randomUUID();
  const db = getDb();
  db.transaction(() => {
    // Only the newest unstarted offer should remain usable. Completed challenges
    // are no longer needed once a new challenge is requested by the same user.
    db.prepare(
      `DELETE FROM work_typing_challenges
       WHERE guild_id = ? AND user_id = ? AND (completed_at IS NOT NULL OR started_at IS NULL)`,
    ).run(guildId, userId);
    db.prepare(
      `INSERT INTO work_typing_challenges
       (challenge_id, guild_id, user_id, word, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(challengeId, guildId, userId, word, now.toISOString());
  })();
  return { challengeId, guildId, userId, word, createdAt: now };
}

export type StartTypingResult =
  | { status: 'started'; challenge: TypingChallenge }
  | { status: 'cooldown'; availableAt: Date }
  | { status: 'invalid' | 'expired' | 'used' };

export function startTypingChallenge(
  challengeId: string,
  guildId: string,
  userId: string,
  cooldownMs: number,
  now = new Date(),
): StartTypingResult {
  const db = getDb();
  return db.transaction(() => {
    const challenge = getTypingChallenge(challengeId);
    if (!challenge || challenge.guildId !== guildId || challenge.userId !== userId) {
      return { status: 'invalid' } as const;
    }
    if (challenge.completedAt || challenge.startedAt) return { status: 'used' } as const;
    if (now.getTime() - challenge.createdAt.getTime() > TYPING_CHALLENGE_OFFER_MS) {
      db.prepare(
        `UPDATE work_typing_challenges SET completed_at = ?, outcome = 'expired'
         WHERE challenge_id = ? AND completed_at IS NULL`,
      ).run(now.toISOString(), challengeId);
      return { status: 'expired' } as const;
    }
    const cooldown = claimCooldown(guildId, userId, 'typing', cooldownMs, now);
    if (!cooldown.claimed)
      return { status: 'cooldown', availableAt: cooldown.availableAt } as const;
    const expiresAt = new Date(now.getTime() + TYPING_TIME_LIMIT_MS);
    const updated = db
      .prepare(
        `UPDATE work_typing_challenges SET started_at = ?, expires_at = ?
         WHERE challenge_id = ? AND started_at IS NULL AND completed_at IS NULL`,
      )
      .run(now.toISOString(), expiresAt.toISOString(), challengeId);
    if (updated.changes !== 1) return { status: 'used' } as const;
    return {
      status: 'started',
      challenge: { ...challenge, startedAt: now, expiresAt },
    } as const;
  })();
}

export type CompleteTypingResult =
  | { status: 'success'; award: XpAwardResult }
  | { status: 'failed' | 'expired' | 'invalid' | 'used'; word?: string };

export function completeTypingChallenge(
  challengeId: string,
  guildId: string,
  userId: string,
  answer: string,
  now = new Date(),
): CompleteTypingResult {
  const db = getDb();
  return db.transaction(() => {
    const challenge = getTypingChallenge(challengeId);
    if (!challenge || challenge.guildId !== guildId || challenge.userId !== userId) {
      return { status: 'invalid' } as const;
    }
    if (challenge.completedAt) return { status: 'used' } as const;
    if (!challenge.startedAt || !challenge.expiresAt) return { status: 'invalid' } as const;
    const expired = now.getTime() > challenge.expiresAt.getTime();
    const correct = !expired && isCorrectTypingAnswer(answer, challenge.word);
    const outcome = expired ? 'expired' : correct ? 'success' : 'failed';
    const updated = db
      .prepare(
        `UPDATE work_typing_challenges SET completed_at = ?, outcome = ?
         WHERE challenge_id = ? AND completed_at IS NULL`,
      )
      .run(now.toISOString(), outcome, challengeId);
    if (updated.changes !== 1) return { status: 'used' } as const;
    if (expired) return { status: 'expired', word: challenge.word } as const;
    if (!correct) return { status: 'failed', word: challenge.word } as const;
    return { status: 'success', award: awardXp(guildId, userId, TYPING_REWARD_XP) } as const;
  })();
}

function getTypingChallenge(challengeId: string): TypingChallenge | undefined {
  const row = getDb()
    .prepare('SELECT * FROM work_typing_challenges WHERE challenge_id = ?')
    .get(challengeId) as TypingChallengeRow | undefined;
  if (!row) return undefined;
  return {
    challengeId: row.challenge_id,
    guildId: row.guild_id,
    userId: row.user_id,
    word: row.word,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    outcome: row.outcome ?? undefined,
  };
}

export interface TriviaChallenge {
  challengeId: string;
  guildId: string;
  userId: string;
  questionId: string;
  category: string;
  question: string;
  answers: [string, string, string, string];
  correctIndex: number;
  selectedIndex?: number;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  outcome?: 'success' | 'failed' | 'expired';
}

interface TriviaChallengeRow {
  challenge_id: string;
  guild_id: string;
  user_id: string;
  question_id: string;
  category: string;
  question: string;
  answers_json: string;
  correct_index: number;
  selected_index: number | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  outcome: TriviaChallenge['outcome'] | null;
}

export type StartTriviaResult =
  { status: 'started'; challenge: TriviaChallenge } | { status: 'cooldown'; availableAt: Date };

export function startTriviaChallenge(
  guildId: string,
  userId: string,
  prepared: PreparedTriviaQuestion,
  cooldownMs: number,
  now = new Date(),
): StartTriviaResult {
  const db = getDb();
  return db.transaction(() => {
    const cooldown = claimCooldown(guildId, userId, 'trivia', cooldownMs, now);
    if (!cooldown.claimed) {
      return { status: 'cooldown', availableAt: cooldown.availableAt } as const;
    }
    const challengeId = randomUUID();
    const expiresAt = new Date(now.getTime() + TRIVIA_TIME_LIMIT_MS);
    db.prepare(
      `INSERT INTO work_trivia_challenges
       (challenge_id, guild_id, user_id, question_id, category, question, answers_json,
        correct_index, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      challengeId,
      guildId,
      userId,
      prepared.id,
      prepared.category,
      prepared.question,
      JSON.stringify(prepared.answers),
      prepared.correctIndex,
      now.toISOString(),
      expiresAt.toISOString(),
    );
    return {
      status: 'started',
      challenge: {
        challengeId,
        guildId,
        userId,
        questionId: prepared.id,
        category: prepared.category,
        question: prepared.question,
        answers: prepared.answers,
        correctIndex: prepared.correctIndex,
        createdAt: now,
        expiresAt,
      },
    } as const;
  })();
}

export type CompleteTriviaResult =
  | { status: 'success'; award: XpAwardResult; correctAnswer: string }
  | { status: 'failed' | 'expired'; correctAnswer: string }
  | { status: 'invalid' | 'used' };

export function completeTriviaChallenge(
  challengeId: string,
  guildId: string,
  userId: string,
  selectedIndex: number,
  now = new Date(),
): CompleteTriviaResult {
  const db = getDb();
  return db.transaction(() => {
    const challenge = getTriviaChallenge(challengeId);
    if (
      !challenge ||
      challenge.guildId !== guildId ||
      challenge.userId !== userId ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= challenge.answers.length
    ) {
      return { status: 'invalid' } as const;
    }
    if (challenge.completedAt) return { status: 'used' } as const;
    const expired = now.getTime() > challenge.expiresAt.getTime();
    const correct = !expired && selectedIndex === challenge.correctIndex;
    const outcome = expired ? 'expired' : correct ? 'success' : 'failed';
    const updated = db
      .prepare(
        `UPDATE work_trivia_challenges
         SET selected_index = ?, completed_at = ?, outcome = ?
         WHERE challenge_id = ? AND completed_at IS NULL`,
      )
      .run(selectedIndex, now.toISOString(), outcome, challengeId);
    if (updated.changes !== 1) return { status: 'used' } as const;
    const correctAnswer = challenge.answers[challenge.correctIndex];
    if (expired) return { status: 'expired', correctAnswer } as const;
    if (!correct) return { status: 'failed', correctAnswer } as const;
    return {
      status: 'success',
      award: awardXp(guildId, userId, TRIVIA_REWARD_XP),
      correctAnswer,
    } as const;
  })();
}

function getTriviaChallenge(challengeId: string): TriviaChallenge | undefined {
  const row = getDb()
    .prepare('SELECT * FROM work_trivia_challenges WHERE challenge_id = ?')
    .get(challengeId) as TriviaChallengeRow | undefined;
  if (!row) return undefined;
  const answers = JSON.parse(row.answers_json) as unknown;
  if (
    !Array.isArray(answers) ||
    answers.length !== 4 ||
    answers.some((answer) => typeof answer !== 'string')
  ) {
    throw new Error(`Invalid stored trivia answers for challenge ${challengeId}`);
  }
  return {
    challengeId: row.challenge_id,
    guildId: row.guild_id,
    userId: row.user_id,
    questionId: row.question_id,
    category: row.category,
    question: row.question,
    answers: answers as [string, string, string, string],
    correctIndex: row.correct_index,
    selectedIndex: row.selected_index ?? undefined,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    outcome: row.outcome ?? undefined,
  };
}

export interface UnscrambleChallenge {
  challengeId: string;
  guildId: string;
  userId: string;
  word: string;
  scrambledWord: string;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  outcome?: 'success' | 'failed' | 'expired';
}

interface UnscrambleChallengeRow {
  challenge_id: string;
  guild_id: string;
  user_id: string;
  word: string;
  scrambled_word: string;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  outcome: UnscrambleChallenge['outcome'] | null;
}

export type StartUnscrambleResult =
  { status: 'started'; challenge: UnscrambleChallenge } | { status: 'cooldown'; availableAt: Date };

export function startUnscrambleChallenge(
  guildId: string,
  userId: string,
  word: string,
  scrambledWord: string,
  cooldownMs: number,
  now = new Date(),
): StartUnscrambleResult {
  const db = getDb();
  return db.transaction(() => {
    const cooldown = claimCooldown(guildId, userId, 'unscramble', cooldownMs, now);
    if (!cooldown.claimed) {
      return { status: 'cooldown', availableAt: cooldown.availableAt } as const;
    }
    const challengeId = randomUUID();
    const expiresAt = new Date(now.getTime() + UNSCRAMBLE_TIME_LIMIT_MS);
    db.prepare(
      `INSERT INTO work_unscramble_challenges
       (challenge_id, guild_id, user_id, word, scrambled_word, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      challengeId,
      guildId,
      userId,
      word,
      scrambledWord,
      now.toISOString(),
      expiresAt.toISOString(),
    );
    return {
      status: 'started',
      challenge: {
        challengeId,
        guildId,
        userId,
        word,
        scrambledWord,
        createdAt: now,
        expiresAt,
      },
    } as const;
  })();
}

export type CompleteUnscrambleResult =
  | { status: 'success'; award: XpAwardResult }
  | { status: 'failed' | 'expired'; word: string }
  | { status: 'invalid' | 'used' };

export function completeUnscrambleChallenge(
  challengeId: string,
  guildId: string,
  userId: string,
  answer: string,
  now = new Date(),
): CompleteUnscrambleResult {
  const db = getDb();
  return db.transaction(() => {
    const challenge = getUnscrambleChallenge(challengeId);
    if (!challenge || challenge.guildId !== guildId || challenge.userId !== userId) {
      return { status: 'invalid' } as const;
    }
    if (challenge.completedAt) return { status: 'used' } as const;
    const expired = now.getTime() > challenge.expiresAt.getTime();
    const correct = !expired && isCorrectUnscrambleAnswer(answer, challenge.word);
    const outcome = expired ? 'expired' : correct ? 'success' : 'failed';
    const updated = db
      .prepare(
        `UPDATE work_unscramble_challenges SET completed_at = ?, outcome = ?
         WHERE challenge_id = ? AND completed_at IS NULL`,
      )
      .run(now.toISOString(), outcome, challengeId);
    if (updated.changes !== 1) return { status: 'used' } as const;
    if (expired) return { status: 'expired', word: challenge.word } as const;
    if (!correct) return { status: 'failed', word: challenge.word } as const;
    return {
      status: 'success',
      award: awardXp(guildId, userId, UNSCRAMBLE_REWARD_XP),
    } as const;
  })();
}

function getUnscrambleChallenge(challengeId: string): UnscrambleChallenge | undefined {
  const row = getDb()
    .prepare('SELECT * FROM work_unscramble_challenges WHERE challenge_id = ?')
    .get(challengeId) as UnscrambleChallengeRow | undefined;
  if (!row) return undefined;
  return {
    challengeId: row.challenge_id,
    guildId: row.guild_id,
    userId: row.user_id,
    word: row.word,
    scrambledWord: row.scrambled_word,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    outcome: row.outcome ?? undefined,
  };
}

export function performFishingActivity(
  guildId: string,
  userId: string,
  fish: FishDefinition,
  cooldownMs: number,
  now = new Date(),
):
  | { status: 'caught'; fish: FishDefinition; quantity: number; award: XpAwardResult }
  | { status: 'cooldown'; availableAt: Date } {
  return getDb().transaction(() => {
    const cooldown = claimCooldown(guildId, userId, 'fishing', cooldownMs, now);
    if (!cooldown.claimed)
      return { status: 'cooldown', availableAt: cooldown.availableAt } as const;
    const quantity = addStack(guildId, userId, fish.id, 1);
    return {
      status: 'caught',
      fish,
      quantity,
      award: awardXp(guildId, userId, fish.xp),
    } as const;
  })();
}

export type Connect4Status = 'active' | 'won' | 'lost' | 'draw' | 'expired';
export interface Connect4Game {
  gameId: string;
  guildId: string;
  userId: string;
  board: Connect4Board;
  status: Connect4Status;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  rewardedAt?: Date;
}

interface Connect4GameRow {
  game_id: string;
  guild_id: string;
  user_id: string;
  board: string;
  status: Connect4Status;
  created_at: string;
  updated_at: string;
  expires_at: string;
  rewarded_at: string | null;
}

export type StartConnect4Result =
  | { status: 'started'; game: Connect4Game }
  | { status: 'active'; game: Connect4Game }
  | { status: 'cooldown'; availableAt: Date };

export function startConnect4Game(
  guildId: string,
  userId: string,
  cooldownMs: number,
  now = new Date(),
): StartConnect4Result {
  const db = getDb();
  return db.transaction(() => {
    db.prepare(
      `UPDATE connect4_games SET status = 'expired', updated_at = ?
       WHERE guild_id = ? AND user_id = ? AND status = 'active' AND expires_at <= ?`,
    ).run(now.toISOString(), guildId, userId, now.toISOString());
    const activeRow = db
      .prepare(
        `SELECT * FROM connect4_games
         WHERE guild_id = ? AND user_id = ? AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(guildId, userId) as Connect4GameRow | undefined;
    if (activeRow) return { status: 'active', game: toConnect4Game(activeRow) } as const;
    const cooldown = claimCooldown(guildId, userId, 'connect4', cooldownMs, now);
    if (!cooldown.claimed)
      return { status: 'cooldown', availableAt: cooldown.availableAt } as const;
    const gameId = randomUUID();
    const expiresAt = new Date(now.getTime() + CONNECT4_GAME_TIMEOUT_MS);
    const board = emptyBoard();
    db.prepare(
      `INSERT INTO connect4_games
       (game_id, guild_id, user_id, board, status, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      gameId,
      guildId,
      userId,
      serializeBoard(board),
      now.toISOString(),
      now.toISOString(),
      expiresAt.toISOString(),
    );
    return {
      status: 'started',
      game: {
        gameId,
        guildId,
        userId,
        board,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        expiresAt,
      },
    } as const;
  })();
}

export function getConnect4Game(gameId: string): Connect4Game | undefined {
  const row = getDb().prepare('SELECT * FROM connect4_games WHERE game_id = ?').get(gameId) as
    Connect4GameRow | undefined;
  return row ? toConnect4Game(row) : undefined;
}

export type SaveConnect4Result =
  | { status: 'saved'; game: Connect4Game; award?: XpAwardResult }
  | { status: 'stale' | 'invalid' | 'expired' };

export function saveConnect4Turn(
  gameId: string,
  guildId: string,
  userId: string,
  expectedBoard: Connect4Board,
  board: Connect4Board,
  status: Exclude<Connect4Status, 'expired'>,
  now = new Date(),
): SaveConnect4Result {
  const db = getDb();
  return db.transaction(() => {
    const game = getConnect4Game(gameId);
    if (!game || game.guildId !== guildId || game.userId !== userId) {
      return { status: 'invalid' } as const;
    }
    if (game.status !== 'active' || serializeBoard(game.board) !== serializeBoard(expectedBoard)) {
      return { status: 'stale' } as const;
    }
    if (game.expiresAt.getTime() <= now.getTime()) {
      db.prepare(
        `UPDATE connect4_games SET status = 'expired', updated_at = ?
         WHERE game_id = ? AND status = 'active'`,
      ).run(now.toISOString(), gameId);
      return { status: 'expired' } as const;
    }
    const expiresAt = new Date(now.getTime() + CONNECT4_GAME_TIMEOUT_MS);
    const terminal = status !== 'active';
    const updated = db
      .prepare(
        `UPDATE connect4_games SET board = ?, status = ?, updated_at = ?, expires_at = ?,
           rewarded_at = CASE WHEN ? THEN ? ELSE rewarded_at END
         WHERE game_id = ? AND status = 'active' AND board = ?`,
      )
      .run(
        serializeBoard(board),
        status,
        now.toISOString(),
        expiresAt.toISOString(),
        terminal ? 1 : 0,
        terminal ? now.toISOString() : null,
        gameId,
        serializeBoard(expectedBoard),
      );
    if (updated.changes !== 1) return { status: 'stale' } as const;
    const award = terminal ? awardXp(guildId, userId, CONNECT4_REWARDS[status]) : undefined;
    return {
      status: 'saved',
      game: {
        ...game,
        board,
        status,
        updatedAt: now,
        expiresAt,
        rewardedAt: terminal ? now : undefined,
      },
      award,
    } as const;
  })();
}

function toConnect4Game(row: Connect4GameRow): Connect4Game {
  return {
    gameId: row.game_id,
    guildId: row.guild_id,
    userId: row.user_id,
    board: parseBoard(row.board),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at),
    rewardedAt: row.rewarded_at ? new Date(row.rewarded_at) : undefined,
  };
}

function awardXp(guildId: string, userId: string, xpGained: number): XpAwardResult {
  const result = addXp(guildId, userId, xpGained);
  return { xpGained, userLevel: result.userLevel, leveledUp: result.leveledUp };
}
