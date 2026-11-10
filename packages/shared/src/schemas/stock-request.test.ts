import { describe, expect, it } from 'vitest';
import { INT32_MAX } from './fields';
import {
  STOCK_REQUEST_MAX_ITEMS,
  createStockRequestSchema,
  stockRequestResultSchema,
} from './stock-request';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

/** Уникальные валидные uuid v4: последние 12 цифр — номер. */
const idOf = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;

const parse = (input: unknown) => createStockRequestSchema.safeParse(input);
const accepts = (input: unknown) => parse(input).success;
const firstMessage = (input: unknown) => parse(input).error?.issues[0]?.message;

describe('createStockRequestSchema', () => {
  describe('transfer', () => {
    it('принимает позиции с количеством и сохраняет порядок', () => {
      const input = {
        kind: 'transfer',
        items: [
          { labelId: ID_B, quantity: 3 },
          { labelId: ID_A, quantity: 1 },
        ],
      };
      expect(createStockRequestSchema.parse(input)).toEqual(input);
    });

    it.each([1, INT32_MAX])('принимает quantity = %s', (quantity) => {
      expect(accepts({ kind: 'transfer', items: [{ labelId: ID_A, quantity }] })).toBe(true);
    });

    it('quantity = 0 → «Укажите количество больше нуля»', () => {
      expect(firstMessage({ kind: 'transfer', items: [{ labelId: ID_A, quantity: 0 }] })).toBe(
        'Укажите количество больше нуля',
      );
    });

    it.each([-1, 1.5, INT32_MAX + 1, '5', null, Number.NaN, Number.POSITIVE_INFINITY])(
      'отклоняет quantity = %s',
      (quantity) => {
        expect(accepts({ kind: 'transfer', items: [{ labelId: ID_A, quantity }] })).toBe(false);
      },
    );

    it('отклоняет позицию без quantity', () => {
      expect(accepts({ kind: 'transfer', items: [{ labelId: ID_A }] })).toBe(false);
    });
  });

  describe('disposal', () => {
    it('принимает позиции без количества', () => {
      const input = { kind: 'disposal', items: [{ labelId: ID_A }, { labelId: ID_B }] };
      expect(createStockRequestSchema.parse(input)).toEqual(input);
    });

    it('лишнее quantity отбрасывается: утилизируется весь старый макет', () => {
      expect(
        createStockRequestSchema.parse({
          kind: 'disposal',
          items: [{ labelId: ID_A, quantity: 5 }],
        }),
      ).toEqual({ kind: 'disposal', items: [{ labelId: ID_A }] });
    });
  });

  describe.each(['transfer', 'disposal'] as const)('общие правила списка (%s)', (kind) => {
    const item = (labelId: string) =>
      kind === 'transfer' ? { labelId, quantity: 1 } : { labelId };
    const itemsOf = (count: number) =>
      Array.from({ length: count }, (_, index) => item(idOf(index)));

    it('пустой список → «Выберите хотя бы одну позицию»', () => {
      expect(firstMessage({ kind, items: [] })).toBe('Выберите хотя бы одну позицию');
    });

    it('одна позиция — нижняя граница', () => {
      expect(accepts({ kind, items: itemsOf(1) })).toBe(true);
    });

    it(`${STOCK_REQUEST_MAX_ITEMS} позиций — верхняя граница`, () => {
      expect(accepts({ kind, items: itemsOf(STOCK_REQUEST_MAX_ITEMS) })).toBe(true);
    });

    it(`${STOCK_REQUEST_MAX_ITEMS + 1} позиция → отказ с сообщением о лимите`, () => {
      expect(firstMessage({ kind, items: itemsOf(STOCK_REQUEST_MAX_ITEMS + 1) })).toBe(
        `Не больше ${STOCK_REQUEST_MAX_ITEMS} позиций в заявке`,
      );
    });

    it('одна позиция дважды → «Позиция указана в заявке дважды»', () => {
      expect(firstMessage({ kind, items: [item(ID_A), item(ID_B), item(ID_A)] })).toBe(
        'Позиция указана в заявке дважды',
      );
    });

    it.each(['', 'not-a-uuid', '11111111-1111-1111-1111-11111111111', 42, null])(
      'отклоняет labelId = %s',
      (labelId) => {
        expect(accepts({ kind, items: [{ labelId, quantity: 1 }] })).toBe(false);
      },
    );

    it('отклоняет позицию без labelId', () => {
      expect(accepts({ kind, items: [{ quantity: 1 }] })).toBe(false);
    });

    it.each([undefined, null, 'items', { labelId: ID_A }])('отклоняет items = %s', (items) => {
      expect(accepts({ kind, items })).toBe(false);
    });
  });

  it.each([undefined, '', 'consumption', 'TRANSFER'])('отклоняет kind = %s', (kind) => {
    expect(accepts({ kind, items: [{ labelId: ID_A, quantity: 1 }] })).toBe(false);
  });

  it.each([null, undefined, 'строка', []])('отклоняет тело %s', (body) => {
    expect(accepts(body)).toBe(false);
  });
});

describe('stockRequestResultSchema', () => {
  it('отклоняет неизвестный kind в ответе', () => {
    expect(
      stockRequestResultSchema.safeParse({ kind: 'consumption', createdAt: '', items: [] }).success,
    ).toBe(false);
  });
});
