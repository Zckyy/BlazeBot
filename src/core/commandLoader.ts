import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Collection } from 'discord.js';
import type { Command } from '../types/command.js';
import { logger } from './logger.js';

const DEFAULT_COMMANDS_DIR = path.join(import.meta.dirname, '..', 'commands');

function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Command>;
  return (
    typeof candidate.execute === 'function' && typeof candidate.data?.name === 'string'
  );
}

export async function loadCommands(
  dir: string = DEFAULT_COMMANDS_DIR,
): Promise<Collection<string, Command>> {
  const commands = new Collection<string, Command>();
  if (!existsSync(dir)) {
    logger.warn({ dir }, 'Commands directory not found');
    return commands;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // .ts when running under tsx, .js in the compiled dist build.
    const file = ['command.ts', 'command.js']
      .map((name) => path.join(dir, entry.name, name))
      .find(existsSync);
    if (!file) {
      logger.warn({ folder: entry.name }, 'Command folder has no command.ts/command.js — skipped');
      continue;
    }

    const mod = (await import(pathToFileURL(file).href)) as {
      command?: unknown;
      default?: unknown;
    };
    const command = mod.command ?? mod.default;
    if (!isCommand(command)) {
      logger.warn({ file }, 'File does not export a valid Command ({ data, execute }) — skipped');
      continue;
    }

    commands.set(command.data.name, command);
    logger.debug({ command: command.data.name }, 'Loaded command');
  }

  logger.info({ count: commands.size }, 'Commands loaded');
  return commands;
}
