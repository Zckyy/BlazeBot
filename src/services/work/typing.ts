import { TYPING_WORDS } from './config.js';

export function selectTypingWord(random = Math.random): string {
  const index = Math.min(Math.floor(random() * TYPING_WORDS.length), TYPING_WORDS.length - 1);
  return TYPING_WORDS[index];
}

export function normalizeTypingAnswer(value: string): string {
  return value.trim().toLocaleLowerCase('en-GB');
}

export function isCorrectTypingAnswer(answer: string, word: string): boolean {
  return normalizeTypingAnswer(answer) === normalizeTypingAnswer(word);
}
