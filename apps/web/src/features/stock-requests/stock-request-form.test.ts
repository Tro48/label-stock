import { describe, expect, it } from 'vitest';
import { INT32_MAX } from '@label-stock/shared';
import { makeLabel } from '../../test/fixtures';
import { buildStockRequest, usableQuantity } from './stock-request-form';

const NBSP = '\u00a0';

const FIRST = makeLabel({ id: 'a', quantity: 1_200, obsoleteQuantity: 200 });
const SECOND = makeLabel({ id: 'b', quantity: 50, obsoleteQuantity: 0 });

describe('usableQuantity', () => {
  it.each([
    ['без старого макета — весь остаток', 50, 0, 50],
    ['часть — старый макет', 1_200, 200, 1_000],
    ['весь остаток — старый макет', 30, 30, 0],
    ['нулевой остаток', 0, 0, 0],
    ['граница int32', INT32_MAX, 1, INT32_MAX - 1],
  ])('%s', (_name, quantity, obsoleteQuantity, expected) => {
    expect(usableQuantity(makeLabel({ quantity, obsoleteQuantity }))).toBe(expected);
  });
});

describe('buildStockRequest', () => {
  describe('перемещение', () => {
    it('собирает позиции с количеством в порядке списка', () => {
      expect(buildStockRequest('transfer', [SECOND, FIRST], { a: '1000', b: '7' })).toEqual({
        ok: true,
        input: {
          kind: 'transfer',
          requestNumber: '',
          items: [
            { labelId: 'b', quantity: 7 },
            { labelId: 'a', quantity: 1_000 },
          ],
        },
      });
    });

    it('ровно весь годный остаток — можно', () => {
      const result = buildStockRequest('transfer', [FIRST], { a: '1000' });
      expect(result.ok).toBe(true);
    });

    it('на 1 больше годного — ошибка строки с доступным количеством', () => {
      expect(buildStockRequest('transfer', [FIRST], { a: '1001' })).toEqual({
        ok: false,
        errors: { a: `Доступно только 1${NBSP}000 шт.` },
      });
    });

    it('весь остаток — старый макет: даже 1 шт. нельзя', () => {
      const label = makeLabel({ id: 'c', quantity: 30, obsoleteQuantity: 30 });
      expect(buildStockRequest('transfer', [label], { c: '1' })).toEqual({
        ok: false,
        errors: { c: 'Доступно только 0 шт.' },
      });
    });

    it('0 — «Укажите количество больше нуля»', () => {
      expect(buildStockRequest('transfer', [SECOND], { b: '0' })).toEqual({
        ok: false,
        errors: { b: 'Укажите количество больше нуля' },
      });
    });

    it('незаполненное количество — ошибка, а не пропуск строки', () => {
      expect(buildStockRequest('transfer', [SECOND], {})).toEqual({
        ok: false,
        errors: { b: 'Только целое число не меньше нуля' },
      });
    });

    it.each([
      ['пробелы', '   '],
      ['дробное', '1.5'],
      ['с запятой', '1,5'],
      ['отрицательное', '-1'],
      ['буквы', 'abc'],
      ['экспонента', '1e2'],
    ])('%s — «Только целое число не меньше нуля»', (_name, amount) => {
      expect(buildStockRequest('transfer', [SECOND], { b: amount })).toEqual({
        ok: false,
        errors: { b: 'Только целое число не меньше нуля' },
      });
    });

    it('больше int32 — «Слишком большое число»', () => {
      expect(buildStockRequest('transfer', [SECOND], { b: String(INT32_MAX + 1) })).toEqual({
        ok: false,
        errors: { b: 'Слишком большое число' },
      });
    });

    it('пробелы вокруг и ведущие нули допустимы', () => {
      expect(buildStockRequest('transfer', [SECOND], { b: ' 007 ' })).toEqual({
        ok: true,
        input: { kind: 'transfer', requestNumber: '', items: [{ labelId: 'b', quantity: 7 }] },
      });
    });

    it('ошибки собираются по всем строкам сразу, а не по первой', () => {
      expect(buildStockRequest('transfer', [FIRST, SECOND], { a: '', b: '51' })).toEqual({
        ok: false,
        errors: { a: 'Только целое число не меньше нуля', b: 'Доступно только 50 шт.' },
      });
    });

    it('одна строка с ошибкой — запрос не собирается и для остальных', () => {
      const result = buildStockRequest('transfer', [FIRST, SECOND], { a: '1', b: '0' });
      expect(result).toEqual({ ok: false, errors: { b: 'Укажите количество больше нуля' } });
    });

    it('количество чужой позиции не подставляется', () => {
      expect(buildStockRequest('transfer', [SECOND], { a: '5' }).ok).toBe(false);
    });

    it('пустой список — пустая заявка (её отсекает сервер)', () => {
      expect(buildStockRequest('transfer', [], {})).toEqual({
        ok: true,
        input: { kind: 'transfer', requestNumber: '', items: [] },
      });
    });
  });

  describe('номер заявки 1С', () => {
    it('передаётся как введён: обрезку и пустое → null делает общая схема', () => {
      const result = buildStockRequest('transfer', [SECOND], { b: '1' }, '  ЗП-00042 ');
      expect(result.ok && result.input).toEqual({
        kind: 'transfer',
        requestNumber: '  ЗП-00042 ',
        items: [{ labelId: 'b', quantity: 1 }],
      });
    });

    it('без номера — пустая строка', () => {
      const result = buildStockRequest('transfer', [SECOND], { b: '1' });
      expect(result.ok && result.input).toMatchObject({ requestNumber: '' });
    });

    it('ошибка количества — запроса нет, номер не мешает', () => {
      expect(buildStockRequest('transfer', [SECOND], { b: '0' }, 'ЗП-1')).toEqual({
        ok: false,
        errors: { b: 'Укажите количество больше нуля' },
      });
    });

    it('у утилизации номер не уходит', () => {
      expect(buildStockRequest('disposal', [FIRST], {}, 'ЗП-1')).toEqual({
        ok: true,
        input: { kind: 'disposal', items: [{ labelId: 'a' }] },
      });
    });
  });

  describe('утилизация', () => {
    it('только id позиций, количество не нужно', () => {
      expect(buildStockRequest('disposal', [FIRST, SECOND], {})).toEqual({
        ok: true,
        input: { kind: 'disposal', items: [{ labelId: 'a' }, { labelId: 'b' }] },
      });
    });

    it('введённые количества игнорируются', () => {
      expect(buildStockRequest('disposal', [FIRST], { a: 'abc' })).toEqual({
        ok: true,
        input: { kind: 'disposal', items: [{ labelId: 'a' }] },
      });
    });

    it('пустой список — пустая заявка', () => {
      expect(buildStockRequest('disposal', [], {})).toEqual({
        ok: true,
        input: { kind: 'disposal', items: [] },
      });
    });
  });
});
