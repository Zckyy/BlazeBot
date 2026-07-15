import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { closeDatabase, initDatabase } from '../src/services/database/db.js';

test('migrates active legacy conversations and preserves historical usage', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blazebot-openrouter-migration-'));
  const filename = path.join(directory, 'migration.sqlite');
  const migrationsDirectory = path.join(process.cwd(), 'src', 'services', 'database', 'migrations');

  try {
    const legacy = new Database(filename);
    legacy.exec(
      `CREATE TABLE migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    for (const migration of [
      '0001_init.sql',
      '0002_leveling.sql',
      '0003_economy.sql',
      '0004_ai_chat.sql',
      '0005_ai_web_search_usage.sql',
    ]) {
      legacy.exec(readFileSync(path.join(migrationsDirectory, migration), 'utf8'));
      legacy.prepare('INSERT INTO migrations (id) VALUES (?)').run(migration);
    }
    legacy
      .prepare(
        `INSERT INTO ai_conversations
          (guild_id, parent_channel_id, thread_id, owner_user_id, model, reasoning_effort)
         VALUES ('guild', 'channel', 'thread', 'user', 'legacy-model', 'low')`,
      )
      .run();
    legacy
      .prepare(
        `INSERT INTO ai_usage
          (guild_id, user_id, provider_response_id, model, latency_ms, estimated_cost_usd,
           server_side_tool_calls)
         VALUES ('guild', 'user', 'resp', 'legacy-model', 100, 0.11, 2)`,
      )
      .run();
    legacy.close();

    const migrated = initDatabase(filename);
    const conversation = migrated
      .prepare('SELECT provider, model, reasoning_effort FROM ai_conversations')
      .get() as { provider: string; model: string; reasoning_effort: string };
    const usage = migrated
      .prepare('SELECT provider, estimated_cost_usd, exact_cost_usd FROM ai_usage')
      .get() as { provider: string; estimated_cost_usd: number; exact_cost_usd: number | null };

    assert.deepEqual(conversation, {
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      reasoning_effort: 'none',
    });
    assert.deepEqual(usage, {
      provider: 'legacy',
      estimated_cost_usd: 0.11,
      exact_cost_usd: null,
    });
  } finally {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
  }
});
