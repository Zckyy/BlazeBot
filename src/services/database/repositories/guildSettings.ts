import { getDb } from '../db.js';

export interface GuildSettings {
  guildId: string;
  locale: string | null;
  updatedAt: string;
}

interface GuildSettingsRow {
  guild_id: string;
  locale: string | null;
  updated_at: string;
}

export function getGuildSettings(guildId: string): GuildSettings | undefined {
  const row = getDb()
    .prepare('SELECT guild_id, locale, updated_at FROM guild_settings WHERE guild_id = ?')
    .get(guildId) as GuildSettingsRow | undefined;
  if (!row) return undefined;
  return { guildId: row.guild_id, locale: row.locale, updatedAt: row.updated_at };
}

export function upsertGuildSettings(guildId: string, settings: { locale?: string | null }): void {
  getDb()
    .prepare(
      `INSERT INTO guild_settings (guild_id, locale, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(guild_id) DO UPDATE SET
         locale = excluded.locale,
         updated_at = excluded.updated_at`,
    )
    .run(guildId, settings.locale ?? null);
}
