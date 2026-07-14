import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from '../../core/logger.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'blazebot.sqlite');
const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

let db: Database.Database | undefined;

export function initDatabase(filename: string = DEFAULT_DB_PATH): Database.Database {
  if (db) return db;
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(filename), { recursive: true });
  }
  db = new Database(filename);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first');
  return db;
}

/** Test helper: close and forget the singleton so the next initDatabase() starts fresh. */
export function closeDatabase(): void {
  db?.close();
  db = undefined;
}

function runMigrations(database: Database.Database): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );

  const applied = new Set(
    (database.prepare('SELECT id FROM migrations').all() as { id: string }[]).map((row) => row.id),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO migrations (id) VALUES (?)').run(file);
    })();
    logger.info({ migration: file }, 'Applied migration');
  }
}
