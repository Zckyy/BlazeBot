import { UNSCRAMBLE_WORDS } from './config.js';

export function selectUnscrambleWord(random = Math.random): string {
  const roll = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  return UNSCRAMBLE_WORDS[Math.floor(roll * UNSCRAMBLE_WORDS.length)];
}

export function scrambleWord(word: string, random = Math.random): string {
  const original = [...word];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shuffled = [...original];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const roll = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
      const target = Math.floor(roll * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    const result = shuffled.join('');
    if (result !== word) return result;
  }
  const pivot = original.findIndex((letter, index) => index > 0 && letter !== original[0]);
  if (pivot === -1) throw new Error('Unscramble words must contain at least two distinct letters');
  [original[0], original[pivot]] = [original[pivot], original[0]];
  return original.join('');
}

export function normalizeUnscrambleAnswer(value: string): string {
  return value.trim().toLocaleLowerCase('en-GB');
}

export function isCorrectUnscrambleAnswer(answer: string, word: string): boolean {
  return normalizeUnscrambleAnswer(answer) === normalizeUnscrambleAnswer(word);
}
