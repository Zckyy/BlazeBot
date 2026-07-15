import { getDb } from '../db.js';

export interface InventoryStack {
  itemId: string;
  quantity: number;
  updatedAt: string;
}

interface InventoryStackRow {
  item_id: string;
  quantity: number;
  updated_at: string;
}

export function getStack(guildId: string, userId: string, itemId: string): number {
  const row = getDb()
    .prepare(
      'SELECT quantity FROM inventory_stacks WHERE guild_id = ? AND user_id = ? AND item_id = ?',
    )
    .get(guildId, userId, itemId) as { quantity: number } | undefined;
  return row?.quantity ?? 0;
}

export function getStacks(guildId: string, userId: string): InventoryStack[] {
  const rows = getDb()
    .prepare(
      `SELECT item_id, quantity, updated_at FROM inventory_stacks
       WHERE guild_id = ? AND user_id = ? AND quantity > 0
       ORDER BY updated_at DESC, item_id`,
    )
    .all(guildId, userId) as InventoryStackRow[];
  return rows.map((row) => ({
    itemId: row.item_id,
    quantity: row.quantity,
    updatedAt: row.updated_at,
  }));
}

export function addStack(guildId: string, userId: string, itemId: string, amount: number): number {
  assertPositiveInteger(amount);
  const row = getDb()
    .prepare(
      `INSERT INTO inventory_stacks (guild_id, user_id, item_id, quantity, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET
         quantity = quantity + excluded.quantity,
         updated_at = datetime('now')
       RETURNING quantity`,
    )
    .get(guildId, userId, itemId, amount) as { quantity: number };
  return row.quantity;
}

export function removeStack(
  guildId: string,
  userId: string,
  itemId: string,
  amount: number,
): number | undefined {
  assertPositiveInteger(amount);
  const row = getDb()
    .prepare(
      `UPDATE inventory_stacks
       SET quantity = quantity - ?, updated_at = datetime('now')
       WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity >= ?
       RETURNING quantity`,
    )
    .get(amount, guildId, userId, itemId, amount) as { quantity: number } | undefined;
  if (!row) return undefined;
  if (row.quantity === 0) {
    getDb()
      .prepare('DELETE FROM inventory_stacks WHERE guild_id = ? AND user_id = ? AND item_id = ?')
      .run(guildId, userId, itemId);
  }
  return row.quantity;
}

export function sellStackForDollars(
  guildId: string,
  userId: string,
  itemId: string,
  quantity: number,
  unitValue: number,
): { remainingQuantity: number; dollars: number; dollarsGained: number } | undefined {
  assertPositiveInteger(quantity);
  assertPositiveInteger(unitValue);
  const db = getDb();
  return db.transaction(() => {
    const remainingQuantity = removeStack(guildId, userId, itemId, quantity);
    if (remainingQuantity === undefined) return undefined;
    const dollarsGained = quantity * unitValue;
    db.prepare(
      `INSERT INTO economy_balances (guild_id, user_id, dollars, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id) DO UPDATE SET
         dollars = dollars + excluded.dollars,
         updated_at = datetime('now')`,
    ).run(guildId, userId, dollarsGained);
    const { dollars } = db
      .prepare('SELECT dollars FROM economy_balances WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId) as { dollars: number };
    return { remainingQuantity, dollars, dollarsGained };
  })();
}

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Quantity must be a positive whole number');
  }
}
