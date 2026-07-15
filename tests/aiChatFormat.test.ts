import assert from 'node:assert/strict';
import test from 'node:test';
import { splitDiscordMessage } from '../src/services/aiChat/format.js';

test('leaves a short Discord message unchanged', () => {
  assert.deepEqual(splitDiscordMessage('hello'), ['hello']);
});

test('splits long messages below the requested limit', () => {
  const chunks = splitDiscordMessage('word '.repeat(100), 80);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 80));
  assert.equal(chunks.join(' ').replaceAll(/\s+/g, ' ').trim(), 'word '.repeat(100).trim());
});

test('balances code fences across chunks', () => {
  const chunks = splitDiscordMessage(`\`\`\`ts\n${'const value = 1;\n'.repeat(20)}\`\`\``, 100);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => (chunk.match(/\`\`\`/g)?.length ?? 0) % 2 === 0));
});
