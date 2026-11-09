import { describe, expect, it } from 'vitest';
import { formatDate, formatDelta, formatQuantity } from './format';

// ru-RU разделяет тысячи неразрывным пробелом.
const NBSP = ' ';
const MINUS = '−';

describe('formatQuantity', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1_200, `1${NBSP}200`],
    [1_234_567, `1${NBSP}234${NBSP}567`],
    [2_147_483_647, `2${NBSP}147${NBSP}483${NBSP}647`],
  ])('%s → %s', (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });

  it('дробную часть не показывает', () => {
    expect(formatQuantity(12.7)).toBe('13');
  });
});

describe('formatDelta', () => {
  it('положительная — с плюсом', () => {
    expect(formatDelta(500)).toBe('+500');
    expect(formatDelta(1_500)).toBe(`+1${NBSP}500`);
  });

  it('отрицательная — с типографским минусом, а не дефисом', () => {
    expect(formatDelta(-30)).toBe(`${MINUS}30`);
    expect(formatDelta(-12_000)).toBe(`${MINUS}12${NBSP}000`);
    expect(formatDelta(-30)).not.toContain('-');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('formatDate', () => {
  it('ISO-дата → ДД.ММ.ГГГГ', () => {
    expect(formatDate('2026-11-01')).toBe('01.11.2026');
  });

  it('не ISO-дата возвращается как есть', () => {
    expect(formatDate('мусор')).toBe('мусор');
  });
});
