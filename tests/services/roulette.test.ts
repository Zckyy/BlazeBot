import { describe, expect, it } from 'vitest';
import { colorOf, resolveBet, spin } from '../../src/services/casino/roulette.js';

describe('roulette engine', () => {
  it('spins numbers in 0-36 with matching colors', () => {
    for (let i = 0; i < 200; i += 1) {
      const result = spin();
      expect(result.number).toBeGreaterThanOrEqual(0);
      expect(result.number).toBeLessThanOrEqual(36);
      expect(result.color).toBe(colorOf(result.number));
    }
  });

  it('maps colors per the European wheel', () => {
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
    expect(colorOf(18)).toBe('red');
    expect(colorOf(19)).toBe('red');
    expect(colorOf(10)).toBe('black');
  });

  it('pays 35:1 on a straight number hit and 0 on a miss', () => {
    expect(resolveBet({ type: 'number', value: 17, amount: 10 }, { number: 17, color: 'black' })).toBe(35);
    expect(resolveBet({ type: 'number', value: 17, amount: 10 }, { number: 18, color: 'red' })).toBe(0);
  });

  it('pays even money on color bets', () => {
    expect(resolveBet({ type: 'color', value: 'red', amount: 10 }, { number: 1, color: 'red' })).toBe(1);
    expect(resolveBet({ type: 'color', value: 'red', amount: 10 }, { number: 2, color: 'black' })).toBe(0);
  });

  it('pays even money on parity bets and zero counts as neither', () => {
    expect(resolveBet({ type: 'parity', value: 'even', amount: 10 }, { number: 4, color: 'black' })).toBe(1);
    expect(resolveBet({ type: 'parity', value: 'odd', amount: 10 }, { number: 4, color: 'black' })).toBe(0);
    expect(resolveBet({ type: 'parity', value: 'even', amount: 10 }, { number: 0, color: 'green' })).toBe(0);
  });

  it('pays even money on range bets and zero loses both', () => {
    expect(resolveBet({ type: 'range', value: 'low', amount: 10 }, { number: 18, color: 'red' })).toBe(1);
    expect(resolveBet({ type: 'range', value: 'high', amount: 10 }, { number: 19, color: 'red' })).toBe(1);
    expect(resolveBet({ type: 'range', value: 'low', amount: 10 }, { number: 19, color: 'red' })).toBe(0);
    expect(resolveBet({ type: 'range', value: 'low', amount: 10 }, { number: 0, color: 'green' })).toBe(0);
    expect(resolveBet({ type: 'range', value: 'high', amount: 10 }, { number: 0, color: 'green' })).toBe(0);
  });
});
