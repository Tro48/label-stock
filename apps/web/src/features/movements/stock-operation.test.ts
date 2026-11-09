import { describe, expect, it } from 'vitest';
import { INT32_MAX } from '@label-stock/shared';
import { makeMovement, makeMovementResult } from '../../test/fixtures';
import {
  buildMovementInput,
  describeOperationResult,
  type StockOperation,
  type StockOperationValues,
} from './stock-operation';

const NBSP = ' ';

function values(overrides: Partial<StockOperationValues> = {}): StockOperationValues {
  return { amount: '30', printedAt: '2026-11-05', comment: '', ...overrides };
}

describe('buildMovementInput', () => {
  it('списание — отрицательная дельта', () => {
    expect(buildMovementInput('consumption', values())).toEqual({
      ok: true,
      input: { reason: 'consumption', delta: -30, comment: undefined },
    });
  });

  it('допечатка — положительная дельта и дата печати', () => {
    expect(buildMovementInput('print', values({ amount: '500' }))).toEqual({
      ok: true,
      input: { reason: 'print', delta: 500, printedAt: '2026-11-05', comment: undefined },
    });
  });

  it('допечатка без даты — printedAt undefined', () => {
    const result = buildMovementInput('print', values({ printedAt: '' }));
    expect(result).toEqual({
      ok: true,
      input: { reason: 'print', delta: 30, printedAt: undefined, comment: undefined },
    });
  });

  it('инвентаризация — setQuantity, без дельты', () => {
    expect(buildMovementInput('inventory', values({ amount: '1200' }))).toEqual({
      ok: true,
      input: { reason: 'inventory', setQuantity: 1200, comment: undefined },
    });
  });

  it('инвентаризация с 0 — ок', () => {
    expect(buildMovementInput('inventory', values({ amount: '0' }))).toEqual({
      ok: true,
      input: { reason: 'inventory', setQuantity: 0, comment: undefined },
    });
  });

  it.each(['consumption', 'print'] as const)('0 для %s — ошибка', (operation) => {
    expect(buildMovementInput(operation, values({ amount: '0' }))).toEqual({
      ok: false,
      error: 'Укажите количество больше нуля',
    });
  });

  it.each(['consumption', 'print', 'inventory'] as const)(
    'пробелы вокруг числа и ведущие нули допустимы (%s)',
    (operation) => {
      const result = buildMovementInput(operation, values({ amount: ' 007 ' }));
      expect(result.ok).toBe(true);
    },
  );

  it.each([
    ['пустое', ''],
    ['пробелы', '   '],
    ['дробное', '1.5'],
    ['дробное с запятой', '1,5'],
    ['отрицательное', '-5'],
    ['буквы', 'abc'],
    ['цифры с буквами', '12шт'],
    ['экспонента', '1e3'],
    ['плюс', '+5'],
  ])('%s количество — ошибка «Только целое число не меньше нуля»', (_name, amount) => {
    for (const operation of ['consumption', 'print', 'inventory'] as StockOperation[]) {
      expect(buildMovementInput(operation, values({ amount }))).toEqual({
        ok: false,
        error: 'Только целое число не меньше нуля',
      });
    }
  });

  it('больше int32 — ошибка', () => {
    const result = buildMovementInput('print', values({ amount: String(INT32_MAX + 1) }));
    expect(result).toEqual({ ok: false, error: 'Слишком большое число' });
  });

  it('ровно int32 — ок', () => {
    const result = buildMovementInput('consumption', values({ amount: String(INT32_MAX) }));
    expect(result).toEqual({
      ok: true,
      input: { reason: 'consumption', delta: -INT32_MAX, comment: undefined },
    });
  });

  it('комментарий обрезается, из одних пробелов — undefined', () => {
    const trimmed = buildMovementInput('consumption', values({ comment: '  брак  ' }));
    expect(trimmed.ok && trimmed.input.comment).toBe('брак');
    const blank = buildMovementInput('inventory', values({ comment: ' \n\t ' }));
    expect(blank.ok && blank.input.comment).toBeUndefined();
  });
});

describe('describeOperationResult', () => {
  it('списание', () => {
    const result = makeMovementResult({ quantity: 1_170 }, makeMovement({ delta: -30 }));
    expect(describeOperationResult('consumption', result)).toBe(
      `Списано 30 шт., остаток 1${NBSP}170 шт.`,
    );
  });

  it('допечатка', () => {
    const result = makeMovementResult(
      { quantity: 2_700 },
      makeMovement({ delta: 1_500, reason: 'print' }),
    );
    expect(describeOperationResult('print', result)).toBe(
      `Допечатано 1${NBSP}500 шт., остаток 2${NBSP}700 шт.`,
    );
  });

  it('инвентаризация с изменением', () => {
    const result = makeMovementResult(
      { quantity: 0 },
      makeMovement({ delta: -5, reason: 'inventory' }),
    );
    expect(describeOperationResult('inventory', result)).toBe('Инвентаризация: остаток 0 шт.');
  });

  it('movement=null — остаток не изменился', () => {
    const result = makeMovementResult({ quantity: 1_200 }, null);
    expect(describeOperationResult('inventory', result)).toBe(
      `Остаток не изменился: остаток 1${NBSP}200 шт.`,
    );
  });
});
