import { getDb } from '../db.js';
import { getShopItem } from '../../casino/items.js';

export interface InventoryEntry {
  itemId: string;
  equippedSlot: number | null;
  acquiredAt: string;
}

interface InventoryRow {
  item_id: string;
  equipped_slot: number | null;
  acquired_at: string;
}

export function getInventory(guildId: string, userId: string): InventoryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT item_id, equipped_slot, acquired_at FROM user_inventory
       WHERE guild_id = ? AND user_id = ? ORDER BY acquired_at`,
    )
    .all(guildId, userId) as InventoryRow[];
  return rows.map((row) => ({
    itemId: row.item_id,
    equippedSlot: row.equipped_slot,
    acquiredAt: row.acquired_at,
  }));
}

export function ownsItem(guildId: string, userId: string, itemId: string): boolean {
  return (
    getDb()
      .prepare(
        'SELECT 1 FROM user_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?',
      )
      .get(guildId, userId, itemId) !== undefined
  );
}

export function addItem(guildId: string, userId: string, itemId: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_inventory (guild_id, user_id, item_id)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .run(guildId, userId, itemId);
}

/** Equips an owned item into `slot`, unequipping whatever occupied that slot. Throws if not owned. */
export function equipItem(guildId: string, userId: string, itemId: string, slot = 0): void {
  const db = getDb();
  if (!ownsItem(guildId, userId, itemId)) throw new Error('Item not owned');
  db.transaction(() => {
    db.prepare(
      `UPDATE user_inventory SET equipped_slot = NULL
       WHERE guild_id = ? AND user_id = ? AND equipped_slot = ?`,
    ).run(guildId, userId, slot);
    db.prepare(
      `UPDATE user_inventory SET equipped_slot = ?
       WHERE guild_id = ? AND user_id = ? AND item_id = ?`,
    ).run(slot, guildId, userId, itemId);
  })();
}

export function unequipSlot(guildId: string, userId: string, slot = 0): void {
  getDb()
    .prepare(
      `UPDATE user_inventory SET equipped_slot = NULL
       WHERE guild_id = ? AND user_id = ? AND equipped_slot = ?`,
    )
    .run(guildId, userId, slot);
}

/** Product of payout multipliers across all equipped slots (1 if nothing equipped). */
export function getEquippedMultiplier(guildId: string, userId: string): number {
  const rows = getDb()
    .prepare(
      `SELECT item_id FROM user_inventory
       WHERE guild_id = ? AND user_id = ? AND equipped_slot IS NOT NULL`,
    )
    .all(guildId, userId) as { item_id: string }[];
  return rows.reduce((mult, row) => mult * (getShopItem(row.item_id)?.payoutMultiplier ?? 1), 1);
}
