import { describe, expect, it } from 'vitest';
import {
  barcodeSchema,
  commentSchema,
  COMMENT_MAX_LENGTH,
  counterpartyNameSchema,
  COUNTERPARTY_NAME_MAX_LENGTH,
  deltaSchema,
  INT32_MAX,
  isoDateSchema,
  LAYOUT_NUMBER_MAX_LENGTH,
  layoutNumberSchema,
  quantitySchema,
  uuidSchema,
} from './fields';
import { BARCODE_MAX_LENGTH } from '../barcode';

describe('layoutNumberSchema', () => {
  it.each([
    ['ведущие нули сохраняются', '007', '007'],
    ['пробелы по краям обрезаются', ' 007 ', '007'],
    ['таб и перевод строки по краям', '\t123\n', '123'],
    ['ноль', '0', '0'],
    [
      'максимальная длина',
      '9'.repeat(LAYOUT_NUMBER_MAX_LENGTH),
      '9'.repeat(LAYOUT_NUMBER_MAX_LENGTH),
    ],
  ])('%s', (_name, input, expected) => {
    expect(layoutNumberSchema.parse(input)).toBe(expected);
  });

  it.each([
    ['пустая строка', ''],
    ['только пробелы', '   '],
  ])('%s → null', (_name, input) => {
    expect(layoutNumberSchema.parse(input)).toBeNull();
  });

  it('null проходит как null', () => {
    expect(layoutNumberSchema.parse(null)).toBeNull();
  });

  it.each([
    ['буквы', '12a'],
    ['кириллица', 'А12'],
    ['пробел внутри', '12 34'],
    ['минус', '-1'],
    ['дробь', '1.5'],
    ['запятая', '1,5'],
    ['плюс', '+1'],
    ['экспонента', '1e3'],
    ['арабско-индийские цифры', '١٢٣'],
    ['длиннее лимита', '1'.repeat(LAYOUT_NUMBER_MAX_LENGTH + 1)],
  ])('отклоняет: %s', (_name, input) => {
    expect(layoutNumberSchema.safeParse(input).success).toBe(false);
  });

  it.each([123, undefined, true])('отклоняет не строку: %s', (input) => {
    expect(layoutNumberSchema.safeParse(input).success).toBe(false);
  });
});

describe('barcodeSchema', () => {
  it('нормализует пробелы и кириллицу', () => {
    expect(barcodeSchema.parse(' ФИС 123\n')).toBe('ABC123');
  });

  it.each([
    ['пустая строка', ''],
    ['только управляющие символы', '\t\r\n\u0000​'],
  ])('%s → null', (_name, input) => {
    expect(barcodeSchema.parse(input)).toBeNull();
  });

  it('null проходит как null', () => {
    expect(barcodeSchema.parse(null)).toBeNull();
  });

  it(`ровно ${BARCODE_MAX_LENGTH} символов после нормализации проходит`, () => {
    const value = '1'.repeat(BARCODE_MAX_LENGTH);
    expect(barcodeSchema.parse(value)).toBe(value);
  });

  it(`длиннее ${BARCODE_MAX_LENGTH} после нормализации — ошибка`, () => {
    expect(barcodeSchema.safeParse('1'.repeat(BARCODE_MAX_LENGTH + 1)).success).toBe(false);
  });

  it('длинный сырой ввод из пробелов, который после нормализации укладывается в лимит, проходит', () => {
    const raw = `${' '.repeat(100)}${'1'.repeat(BARCODE_MAX_LENGTH)}${' '.repeat(92)}`;
    expect(raw).toHaveLength(256);
    expect(barcodeSchema.parse(raw)).toBe('1'.repeat(BARCODE_MAX_LENGTH));
  });

  it('сырой ввод длиннее 256 отклоняется до нормализации, даже если там одни пробелы', () => {
    expect(barcodeSchema.safeParse(`1${' '.repeat(256)}`).success).toBe(false);
  });

  it.each([123, undefined, {}])('отклоняет не строку: %s', (input) => {
    expect(barcodeSchema.safeParse(input).success).toBe(false);
  });
});

describe('quantitySchema', () => {
  it.each([0, 1, 100, INT32_MAX])('принимает %s', (value) => {
    expect(quantitySchema.parse(value)).toBe(value);
  });

  it.each([
    ['отрицательное', -1],
    ['дробное', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['больше int32', INT32_MAX + 1],
    ['больше safe integer', Number.MAX_SAFE_INTEGER + 2],
    ['строка "5"', '5'],
    ['null', null],
    ['пустая строка', ''],
  ])('отклоняет %s', (_name, value) => {
    expect(quantitySchema.safeParse(value).success).toBe(false);
  });
});

describe('deltaSchema', () => {
  it.each([-INT32_MAX, -1, 0, 1, INT32_MAX])('принимает %s', (value) => {
    expect(deltaSchema.parse(value)).toBe(value);
  });

  it.each([-INT32_MAX - 1, INT32_MAX + 1, 0.5, Number.NaN, '1'])('отклоняет %s', (value) => {
    expect(deltaSchema.safeParse(value).success).toBe(false);
  });
});

describe('isoDateSchema', () => {
  it.each(['2028-02-29', '2026-11-01'])('принимает %s', (value) => {
    expect(isoDateSchema.parse(value)).toBe(value);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-04-31', 'мусор', '', 20261101, null])(
    'отклоняет %s',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('commentSchema', () => {
  it('обрезает пробелы, пустое превращает в null', () => {
    expect(commentSchema.parse('  текст  ')).toBe('текст');
    expect(commentSchema.parse('   ')).toBeNull();
    expect(commentSchema.parse(null)).toBeNull();
  });

  it('отклоняет комментарий длиннее лимита', () => {
    expect(commentSchema.safeParse('я'.repeat(COMMENT_MAX_LENGTH)).success).toBe(true);
    expect(commentSchema.safeParse('я'.repeat(COMMENT_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe('counterpartyNameSchema', () => {
  it('обрезает пробелы', () => {
    expect(counterpartyNameSchema.parse('  Ромашка ')).toBe('Ромашка');
  });

  it.each([
    ['пустая строка', ''],
    ['только пробелы', '   '],
    ['длиннее лимита', 'я'.repeat(COUNTERPARTY_NAME_MAX_LENGTH + 1)],
    ['не строка', 42],
  ])('отклоняет: %s', (_name, value) => {
    expect(counterpartyNameSchema.safeParse(value).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('принимает UUID v4', () => {
    expect(uuidSchema.safeParse('0b5c2f1e-8a4d-4c3b-9f2e-1a2b3c4d5e6f').success).toBe(true);
  });

  it.each(['', 'not-a-uuid', '0b5c2f1e8a4d4c3b9f2e1a2b3c4d5e6f', "1' OR '1'='1"])(
    'отклоняет %s',
    (value) => {
      expect(uuidSchema.safeParse(value).success).toBe(false);
    },
  );
});
