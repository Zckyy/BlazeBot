import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCommands } from '../../src/core/commandLoader.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'commands');

describe('loadCommands', () => {
  it('loads valid commands from a directory and skips invalid ones', async () => {
    const commands = await loadCommands(FIXTURES_DIR);
    expect(commands.size).toBe(1);
    const hello = commands.get('hello');
    expect(hello).toBeDefined();
    expect(hello!.data.name).toBe('hello');
    expect(typeof hello!.execute).toBe('function');
  });

  it('returns an empty collection for a missing directory', async () => {
    const commands = await loadCommands(path.join(FIXTURES_DIR, 'does-not-exist'));
    expect(commands.size).toBe(0);
  });

  it('loads the real ping command', async () => {
    const commands = await loadCommands(path.join(import.meta.dirname, '..', '..', 'src', 'commands'));
    expect(commands.has('ping')).toBe(true);
  });
});
