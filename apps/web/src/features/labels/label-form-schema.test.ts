import { describe, expect, it } from 'vitest';
import { todayIsoDate } from '@label-stock/shared';
import { makeLabel } from '../../test/fixtures';
import {
  emptyFormValues,
  labelFormSchema,
  labelToFormValues,
  quantityInputSchema,
  type LabelFormValues,
} from './label-form-schema';

function formValues(overrides: Partial<LabelFormValues> = {}): LabelFormValues {
  return {
    counterpartyName: 'Ромашка',
    layoutNumber: '00123',
    barcode: '4600000000017',
    printedAt: '2026-11-01',
    quantity: '100',
    comment: '',
    ...overrides,
  };
}

function fieldErrors(requireQuantity: boolean, values: LabelFormValues) {
  const result = labelFormSchema(requireQuantity).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
}

describe('labelFormSchema', () => {
  it('создание: валидная форма', () => {
    expect(labelFormSchema(true).parse(formValues())).toEqual({
      counterpartyName: 'Ромашка',
      layoutNumber: '00123',
      barcode: '4600000000017',
      printedAt: '2026-11-01',
      quantity: 100,
      comment: null,
    });
  });

  it.each([
    ['пустой', ''],
    ['отрицательный', '-1'],
    ['дробный', '1.5'],
    ['буквы', 'много'],
  ])('создание: остаток %s — ошибка', (_name, quantity) => {
    expect(fieldErrors(true, formValues({ quantity }))).toEqual({
      quantity: 'Только целое число не меньше нуля',
    });
  });

  it('создание: остаток 0 — ок', () => {
    expect(labelFormSchema(true).parse(formValues({ quantity: '0' })).quantity).toBe(0);
  });

  it('редактирование: остаток не проверяется и не используется', () => {
    const parsed = labelFormSchema(false).parse(formValues({ quantity: 'мусор' }));
    expect(parsed.quantity).toBe(0);
  });

  it.each([
    ['буквы', '12a'],
    ['пробел внутри', '12 3'],
    ['минус', '-1'],
    ['дробь', '1.5'],
  ])('номер макета: %s — «Только цифры»', (_name, layoutNumber) => {
    expect(fieldErrors(true, formValues({ layoutNumber }))).toEqual({
      layoutNumber: 'Только цифры',
    });
  });

  it('номер макета: ведущие нули сохраняются', () => {
    expect(labelFormSchema(true).parse(formValues({ layoutNumber: ' 007 ' })).layoutNumber).toBe(
      '007',
    );
  });

  it('номер макета: пустой — null', () => {
    expect(labelFormSchema(true).parse(formValues({ layoutNumber: '' })).layoutNumber).toBeNull();
  });

  it('штрихкод нормализуется: пробелы и кириллица', () => {
    expect(labelFormSchema(true).parse(formValues({ barcode: ' ФИС 123 ' })).barcode).toBe(
      'ABC123',
    );
  });

  it('штрихкод: пустой — null', () => {
    expect(labelFormSchema(true).parse(formValues({ barcode: '  ' })).barcode).toBeNull();
  });

  it('контрагент обязателен', () => {
    expect(fieldErrors(true, formValues({ counterpartyName: '   ' }))).toEqual({
      counterpartyName: 'Укажите контрагента',
    });
  });

  it('некорректная дата печати — ошибка', () => {
    expect(fieldErrors(false, formValues({ printedAt: '2026-02-30' }))).toEqual({
      printedAt: 'Некорректная дата',
    });
  });
});

describe('quantityInputSchema', () => {
  it('строку с пробелами превращает в число', () => {
    expect(quantityInputSchema.parse(' 42 ')).toBe(42);
  });
});

describe('labelToFormValues / emptyFormValues', () => {
  it('позиция без номера, штрихкода и комментария — пустые строки', () => {
    const label = makeLabel({ layoutNumber: null, barcode: null, comment: null, quantity: 0 });
    expect(labelToFormValues(label)).toEqual({
      counterpartyName: 'Ромашка',
      layoutNumber: '',
      barcode: '',
      printedAt: '2026-11-01',
      quantity: '0',
      comment: '',
    });
  });

  it('пустая форма: сегодняшняя дата и переданный штрихкод', () => {
    expect(emptyFormValues('4600000000017')).toEqual({
      counterpartyName: '',
      layoutNumber: '',
      barcode: '4600000000017',
      printedAt: todayIsoDate(),
      quantity: '0',
      comment: '',
    });
    expect(emptyFormValues().barcode).toBe('');
  });
});
