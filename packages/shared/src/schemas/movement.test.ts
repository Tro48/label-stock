import { describe, expect, it } from 'vitest';
import { INT32_MAX } from './fields';
import { createMovementSchema } from './movement';

const accepts = (input: unknown) => createMovementSchema.safeParse(input).success;

describe('createMovementSchema', () => {
  describe('consumption', () => {
    it('принимает отрицательную дельту', () => {
      expect(createMovementSchema.parse({ reason: 'consumption', delta: -5 })).toEqual({
        reason: 'consumption',
        delta: -5,
      });
    });

    it.each([5, 0, 1.5, -INT32_MAX - 1])('отклоняет дельту %s', (delta) => {
      expect(accepts({ reason: 'consumption', delta })).toBe(false);
    });

    it('отклоняет без дельты, даже если передан setQuantity', () => {
      expect(accepts({ reason: 'consumption', setQuantity: 5 })).toBe(false);
    });
  });

  describe('print', () => {
    it('принимает положительную дельту и дату печати', () => {
      expect(
        createMovementSchema.parse({ reason: 'print', delta: 100, printedAt: '2028-02-29' }),
      ).toEqual({ reason: 'print', delta: 100, printedAt: '2028-02-29' });
    });

    it.each([-5, 0, INT32_MAX + 1])('отклоняет дельту %s', (delta) => {
      expect(accepts({ reason: 'print', delta })).toBe(false);
    });

    it('отклоняет невалидную дату печати', () => {
      expect(accepts({ reason: 'print', delta: 1, printedAt: '2026-02-29' })).toBe(false);
    });
  });

  describe('correction', () => {
    it.each([-3, 3])('принимает дельту %s', (delta) => {
      expect(accepts({ reason: 'correction', delta })).toBe(true);
    });

    it('отклоняет нулевую дельту', () => {
      expect(accepts({ reason: 'correction', delta: 0 })).toBe(false);
    });
  });

  describe('inventory', () => {
    it.each([0, 42, INT32_MAX])('принимает setQuantity = %s', (setQuantity) => {
      expect(createMovementSchema.parse({ reason: 'inventory', setQuantity })).toEqual({
        reason: 'inventory',
        setQuantity,
      });
    });

    it.each([-1, 1.5, Number.NaN, '5', INT32_MAX + 1])('отклоняет setQuantity = %s', (value) => {
      expect(accepts({ reason: 'inventory', setQuantity: value })).toBe(false);
    });

    it('отклоняет инвентаризацию с дельтой вместо setQuantity', () => {
      expect(accepts({ reason: 'inventory', delta: 5 })).toBe(false);
    });
  });

  it('created через API запрещён', () => {
    expect(accepts({ reason: 'created', delta: 10 })).toBe(false);
  });

  it.each([['unknown'], [''], [undefined], [null]])('отклоняет reason = %s', (reason) => {
    expect(accepts({ reason, delta: 1 })).toBe(false);
  });

  it('обрезает комментарий и пустой превращает в null', () => {
    const parsed = createMovementSchema.parse({ reason: 'consumption', delta: -1, comment: '  ' });
    expect(parsed.comment).toBeNull();
  });
});
