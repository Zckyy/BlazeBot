import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../../src/services/database/db.js';
import {
  addItem,
  equipItem,
  getEquippedMultiplier,
  getInventory,
  ownsItem,
  unequipSlot,
} from '../../src/services/database/repositories/inventory.js';
import { getShopItem } from '../../src/services/casino/items.js';

describe('inventory repository', () => {
  beforeAll(() => {
    initDatabase(':memory:');
  });

  afterAll(() => {
    closeDatabase();
  });

  it('starts empty with a neutral multiplier', () => {
    expect(getInventory('g1', 'u1')).toEqual([]);
    expect(ownsItem('g1', 'u1', 'rabbits_foot')).toBe(false);
    expect(getEquippedMultiplier('g1', 'u1')).toBe(1);
  });

  it('adds items idempotently', () => {
    addItem('g1', 'u1', 'rabbits_foot');
    addItem('g1', 'u1', 'rabbits_foot');
    expect(getInventory('g1', 'u1')).toHaveLength(1);
    expect(ownsItem('g1', 'u1', 'rabbits_foot')).toBe(true);
  });

  it('rejects equipping an item that is not owned', () => {
    expect(() => equipItem('g1', 'u1', 'golden_horseshoe')).toThrow('Item not owned');
  });

  it('equips an owned item and applies its multiplier', () => {
    equipItem('g1', 'u1', 'rabbits_foot');
    expect(getInventory('g1', 'u1')[0].equippedSlot).toBe(0);
    expect(getEquippedMultiplier('g1', 'u1')).toBe(getShopItem('rabbits_foot')!.payoutMultiplier);
  });

  it('swaps the equipped item when equipping another into the same slot', () => {
    addItem('g1', 'u1', 'golden_horseshoe');
    equipItem('g1', 'u1', 'golden_horseshoe');
    const inventory = getInventory('g1', 'u1');
    expect(inventory.find((e) => e.itemId === 'rabbits_foot')!.equippedSlot).toBeNull();
    expect(inventory.find((e) => e.itemId === 'golden_horseshoe')!.equippedSlot).toBe(0);
    expect(getEquippedMultiplier('g1', 'u1')).toBe(
      getShopItem('golden_horseshoe')!.payoutMultiplier,
    );
  });

  it('unequips the slot', () => {
    unequipSlot('g1', 'u1');
    expect(getEquippedMultiplier('g1', 'u1')).toBe(1);
    expect(getInventory('g1', 'u1').every((e) => e.equippedSlot === null)).toBe(true);
  });

  it('isolates inventories per guild', () => {
    expect(ownsItem('g2', 'u1', 'rabbits_foot')).toBe(false);
  });
});
