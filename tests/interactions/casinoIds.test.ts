import { describe, expect, it } from 'vitest';
import { decodeCasinoId, encodeCasinoId } from '../../src/interactions/casino/ids.js';

describe('casino customId codec', () => {
  it('round-trips an id with args', () => {
    const id = encodeCasinoId('12345', 'amt', 'color', 'red', '100');
    expect(id).toBe('casino:12345:amt:color:red:100');
    expect(decodeCasinoId(id)).toEqual({
      userId: '12345',
      action: 'amt',
      args: ['color', 'red', '100'],
    });
  });

  it('round-trips an id without args', () => {
    expect(decodeCasinoId(encodeCasinoId('99', 'hub'))).toEqual({
      userId: '99',
      action: 'hub',
      args: [],
    });
  });

  it('rejects ids from other features', () => {
    expect(decodeCasinoId('blackjack:123:hit')).toBeUndefined();
    expect(decodeCasinoId('somethingelse')).toBeUndefined();
  });

  it('rejects malformed ids', () => {
    expect(decodeCasinoId('casino')).toBeUndefined();
    expect(decodeCasinoId('casino:123')).toBeUndefined();
    expect(decodeCasinoId('casino::action')).toBeUndefined();
    expect(decodeCasinoId('casino:123:')).toBeUndefined();
  });
});
