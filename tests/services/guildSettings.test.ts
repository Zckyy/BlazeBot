import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../../src/services/database/db.js';
import {
  getGuildSettings,
  upsertGuildSettings,
} from '../../src/services/database/repositories/guildSettings.js';

describe('guildSettings repository', () => {
  beforeAll(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  it('returns undefined for an unknown guild', () => {
    expect(getGuildSettings('missing')).toBeUndefined();
  });

  it('inserts and reads back settings', () => {
    upsertGuildSettings('guild-1', { locale: 'en-US' });
    const settings = getGuildSettings('guild-1');
    expect(settings).toMatchObject({ guildId: 'guild-1', locale: 'en-US' });
    expect(settings!.updatedAt).toBeTruthy();
  });

  it('updates existing settings on conflict', () => {
    upsertGuildSettings('guild-1', { locale: 'de-DE' });
    expect(getGuildSettings('guild-1')!.locale).toBe('de-DE');
  });

  it('stores null when locale is omitted', () => {
    upsertGuildSettings('guild-2', {});
    expect(getGuildSettings('guild-2')!.locale).toBeNull();
  });
});
