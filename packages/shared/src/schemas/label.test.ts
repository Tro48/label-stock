import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './common';
import { createLabelSchema, listLabelsQuerySchema, updateLabelSchema } from './label';

const COUNTERPARTY_ID = '0b5c2f1e-8a4d-4c3b-9f2e-1a2b3c4d5e6f';
const validLabel = { counterpartyId: COUNTERPARTY_ID, printedAt: '2026-11-01', quantity: 10 };

describe('createLabelSchema', () => {
  it('минимальная позиция без номера и штрихкода валидна', () => {
    expect(createLabelSchema.parse(validLabel)).toEqual(validLabel);
  });

  it('нормализует номер, штрихкод и комментарий', () => {
    const parsed = createLabelSchema.parse({
      ...validLabel,
      layoutNumber: ' 00123 ',
      barcode: 'фис 1',
      comment: '  ',
    });
    expect(parsed).toMatchObject({ layoutNumber: '00123', barcode: 'abc1', comment: null });
  });

  it.each([
    ['без контрагента', { ...validLabel, counterpartyId: undefined }],
    ['кривой counterpartyId', { ...validLabel, counterpartyId: 'abc' }],
    ['без даты', { ...validLabel, printedAt: undefined }],
    ['дата 2026-02-29', { ...validLabel, printedAt: '2026-02-29' }],
    ['без остатка', { ...validLabel, quantity: undefined }],
    ['остаток строкой', { ...validLabel, quantity: '10' }],
    ['отрицательный остаток', { ...validLabel, quantity: -1 }],
    ['номер с буквами', { ...validLabel, layoutNumber: '12a' }],
  ])('отклоняет: %s', (_name, input) => {
    expect(createLabelSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateLabelSchema', () => {
  it('требует version', () => {
    expect(updateLabelSchema.safeParse({ comment: 'x' }).success).toBe(false);
  });

  it.each([0, -1, 1.5, '1'])('отклоняет version = %s', (version) => {
    expect(updateLabelSchema.safeParse({ version }).success).toBe(false);
  });

  it('остаток через PATCH не меняется: поле отбрасывается', () => {
    const parsed = updateLabelSchema.parse({ version: 1, quantity: 999 });
    expect(parsed).not.toHaveProperty('quantity');
  });

  it('пустая строка в номере означает «убрать номер»', () => {
    expect(updateLabelSchema.parse({ version: 1, layoutNumber: '' }).layoutNumber).toBeNull();
  });
});

describe('listLabelsQuerySchema', () => {
  it('подставляет дефолты', () => {
    expect(listLabelsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      onlyEmpty: false,
      deleted: false,
      sort: 'counterparty',
      order: 'asc',
    });
  });

  it('приводит строки из query к числам', () => {
    expect(listLabelsQuerySchema.parse({ page: '3', pageSize: '20' })).toMatchObject({
      page: 3,
      pageSize: 20,
    });
  });

  it(`pageSize = ${MAX_PAGE_SIZE} проходит, больше — нет`, () => {
    expect(listLabelsQuerySchema.safeParse({ pageSize: String(MAX_PAGE_SIZE) }).success).toBe(true);
    expect(listLabelsQuerySchema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(
      false,
    );
  });

  it.each(['0', '-1', '1.5', 'abc'])('отклоняет page = %s', (page) => {
    expect(listLabelsQuerySchema.safeParse({ page }).success).toBe(false);
  });

  it('отклоняет pageSize = 0', () => {
    expect(listLabelsQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['1', true],
    ['0', false],
  ])('onlyEmpty = "%s" → %s', (raw, expected) => {
    expect(listLabelsQuerySchema.parse({ onlyEmpty: raw }).onlyEmpty).toBe(expected);
  });

  it('onlyEmpty = "abc" — ошибка, а не молчаливое false', () => {
    expect(listLabelsQuerySchema.safeParse({ onlyEmpty: 'abc' }).success).toBe(false);
  });

  it('deleted = "true" включает режим удалённых', () => {
    expect(listLabelsQuerySchema.parse({ deleted: 'true' }).deleted).toBe(true);
  });

  it('обрезает поиск и ограничивает длину', () => {
    expect(listLabelsQuerySchema.parse({ search: '  рома  ' }).search).toBe('рома');
    expect(listLabelsQuerySchema.safeParse({ search: 'я'.repeat(201) }).success).toBe(false);
  });

  it.each([
    ['неизвестная сортировка', { sort: 'deletedAt' }],
    ['неизвестный порядок', { order: 'random' }],
    ['кривой counterpartyId', { counterpartyId: 'abc' }],
  ])('отклоняет: %s', (_name, input) => {
    expect(listLabelsQuerySchema.safeParse(input).success).toBe(false);
  });
});
