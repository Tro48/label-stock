import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_ROWS } from '@label-stock/shared';
import { AppError } from '../../shared/errors';
import { findDuplicatesInFile, toImportRows, type ImportRow } from './import-rows';

const HEADER = ['Контрагент', '№ макета', 'Штрихкод', 'Дата печати', 'Остаток', 'Комментарий'];

/** Строка данных в порядке HEADER; незаданные ячейки — как у типичной позиции. */
function record(overrides: Partial<Record<(typeof HEADER)[number], string>> = {}): string[] {
  const values: Record<string, string> = {
    Контрагент: 'Ромашка',
    '№ макета': '007',
    Штрихкод: '4600000000015',
    'Дата печати': '01.11.2026',
    Остаток: '12',
    Комментарий: '',
    ...overrides,
  };
  return HEADER.map((title) => values[title]!);
}

function parseOne(overrides: Parameters<typeof record>[0]) {
  return toImportRows([HEADER, record(overrides)]);
}

function expectFileError(run: () => unknown, message: RegExp) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect((error as AppError).message).toMatch(message);
    return;
  }
  throw new Error('Ожидалась ошибка файла');
}

describe('toImportRows: файл целиком', () => {
  it('нет ни одной записи → «Файл пустой»', () => {
    expectFileError(() => toImportRows([]), /Файл пустой/);
  });

  it('только заголовок → нет строк с данными', () => {
    expectFileError(() => toImportRows([HEADER]), /нет строк с данными/);
  });

  it.each([
    ['Контрагент', /«Контрагент»/],
    ['Дата печати', /«Дата печати»/],
    ['Остаток', /«Остаток»/],
  ])('нет обязательного столбца %s → 400 с его названием', (missing, message) => {
    const header = HEADER.filter((title) => title !== missing);
    expectFileError(() => toImportRows([header, header.map(() => '1')]), message);
  });

  it('нет сразу нескольких обязательных — перечислены все', () => {
    expectFileError(
      () => toImportRows([['Комментарий'], ['x']]),
      /«Контрагент», «Дата печати», «Остаток»/,
    );
  });

  it('ровно IMPORT_MAX_ROWS строк — допустимо', () => {
    const records = [HEADER, ...Array.from({ length: IMPORT_MAX_ROWS }, () => record())];
    expect(toImportRows(records).rows).toHaveLength(IMPORT_MAX_ROWS);
  });

  it('на одну строку больше лимита → 400', () => {
    const records = [HEADER, ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => record())];
    expectFileError(() => toImportRows(records), /больше 10000 строк/);
  });

  it('необязательных столбцов может не быть', () => {
    const { rows, errors } = toImportRows([
      ['Контрагент', 'Дата печати', 'Остаток'],
      ['Ромашка', '01.11.2026', '5'],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        counterpartyName: 'Ромашка',
        layoutNumber: null,
        barcode: null,
        printedAt: '2026-11-01',
        quantity: 5,
        comment: null,
      },
    ]);
  });

  it('порядок столбцов любой, регистр и пробелы в заголовках не важны', () => {
    const { rows, errors } = toImportRows([
      ['  остаток ', 'ДАТА ПЕЧАТИ', 'Комментарий', '№ МАКЕТА', 'контрагент', 'Лишний'],
      ['3', '2026-11-01', 'тест', '12', 'Ромашка', 'мусор'],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      counterpartyName: 'Ромашка',
      layoutNumber: '12',
      printedAt: '2026-11-01',
      quantity: 3,
      comment: 'тест',
    });
  });

  it('короткая запись: недостающие ячейки считаются пустыми', () => {
    const { rows, errors } = toImportRows([HEADER, ['Ромашка', '', '', '01.11.2026', '1']]);
    expect(errors).toEqual([]);
    expect(rows[0]?.comment).toBeNull();
  });

  it('номер строки: заголовок — 1, первая строка данных — 2', () => {
    const { rows } = toImportRows([
      HEADER,
      record({ '№ макета': '1' }),
      record({ '№ макета': '2' }),
    ]);
    expect(rows.map((row) => row.line)).toEqual([2, 3]);
  });
});

describe('toImportRows: значения ячеек', () => {
  it('ведущие нули номера сохраняются, пустой номер → null', () => {
    expect(parseOne({ '№ макета': '00123' }).rows[0]?.layoutNumber).toBe('00123');
    expect(parseOne({ '№ макета': '' }).rows[0]?.layoutNumber).toBeNull();
  });

  it('штрихкод нормализуется: пробелы и русская раскладка', () => {
    expect(parseOne({ Штрихкод: ' 4600 0000 00015 ' }).rows[0]?.barcode).toBe('4600000000015');
    expect(parseOne({ Штрихкод: 'ФИС123' }).rows[0]?.barcode).toBe('ABC123');
    expect(parseOne({ Штрихкод: '' }).rows[0]?.barcode).toBeNull();
  });

  it.each([
    ['01.11.2026', '2026-11-01'],
    ['1.11.2026', '2026-11-01'],
    ['1.1.2026', '2026-01-01'],
    ['2026-11-01', '2026-11-01'],
    [' 01.11.2026 ', '2026-11-01'],
  ])('дата %j → %s', (cell, expected) => {
    expect(parseOne({ 'Дата печати': cell }).rows[0]?.printedAt).toBe(expected);
  });

  it.each([
    ['1200', 1200],
    ['1 200', 1200],
    ['1\u00a0200', 1200],
    ['1\u202f200', 1200],
    [' 7 ', 7],
    ['0', 0],
    ['2147483647', 2147483647],
  ])('остаток %j → %d', (cell, expected) => {
    expect(parseOne({ Остаток: cell }).rows[0]?.quantity).toBe(expected);
  });

  it.each([
    ['отрицательный', '-5'],
    ['дробный', '1.5'],
    ['дробный через запятую', '1,5'],
    ['пустой', ''],
    ['текст', 'много'],
    ['экспонента', '1e3'],
    ['больше int32', '2147483648'],
    ['шестнадцатеричный', '0x10'],
  ])('некорректный остаток (%s) → ошибка строки', (_name, cell) => {
    const { rows, errors } = parseOne({ Остаток: cell });
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ line: 2, message: 'Остаток: ожидается целое число не меньше нуля' }]);
  });

  it.each([
    ['несуществующий день', '31.04.2026'],
    ['американский порядок', '11/01/2026'],
    ['год двумя цифрами', '01.11.26'],
    ['пусто', ''],
    ['со временем', '01.11.2026 10:00'],
  ])('некорректная дата (%s) → ошибка строки', (_name, cell) => {
    expect(parseOne({ 'Дата печати': cell }).errors).toEqual([
      { line: 2, message: 'Дата печати: ожидается дата вида 01.11.2026' },
    ]);
  });

  it('экранированная выгрузкой формула раскрывается обратно', () => {
    const { rows } = parseOne({ Контрагент: "'=SUM(A1)", Комментарий: "'+7 999" });
    expect(rows[0]).toMatchObject({ counterpartyName: '=SUM(A1)', comment: '+7 999' });
  });

  it('апостроф без формулы после него не трогается', () => {
    expect(parseOne({ Контрагент: "'Ромашка" }).rows[0]?.counterpartyName).toBe("'Ромашка");
  });

  it('экранированный отрицательный остаток всё равно ошибка', () => {
    expect(parseOne({ Остаток: "'-5" }).errors).toHaveLength(1);
  });

  it('пробелы по краям названия и комментария обрезаются', () => {
    const { rows } = parseOne({ Контрагент: '  Ромашка ', Комментарий: '  ' });
    expect(rows[0]).toMatchObject({ counterpartyName: 'Ромашка', comment: null });
  });

  it('NUL в названии или комментарии → ошибка строки, а не исключение', () => {
    const { rows, errors } = parseOne({ Контрагент: 'Ром\0ашка', Комментарий: 'a\0' });
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { line: 2, message: 'Контрагент: Недопустимый символ' },
      { line: 2, message: 'Комментарий: Недопустимый символ' },
    ]);
  });

  it('все ошибки одной строки собираются, а не только первая', () => {
    const { errors } = parseOne({
      Контрагент: '',
      '№ макета': '12a',
      Штрихкод: 'x'.repeat(65),
      'Дата печати': 'вчера',
      Остаток: '-1',
      Комментарий: 'к'.repeat(1001),
    });
    expect(errors.map((error) => error.message.split(':')[0])).toEqual([
      'Контрагент',
      '№ макета',
      'Штрихкод',
      'Дата печати',
      'Остаток',
      'Комментарий',
    ]);
    expect(errors.every((error) => error.line === 2)).toBe(true);
  });

  it('номер длиннее 20 цифр и сверхдлинный сырой штрихкод → ошибки', () => {
    expect(parseOne({ '№ макета': '1'.repeat(21) }).errors).toHaveLength(1);
    expect(parseOne({ Штрихкод: '1'.repeat(257) }).errors).toHaveLength(1);
  });

  it('плохая строка не мешает разобрать соседние', () => {
    const { rows, errors } = toImportRows([
      HEADER,
      record({ '№ макета': '1' }),
      record({ '№ макета': '2', Остаток: 'x' }),
      record({ '№ макета': '3' }),
    ]);
    expect(rows.map((row) => row.line)).toEqual([2, 4]);
    expect(errors.map((error) => error.line)).toEqual([3]);
  });
});

describe('findDuplicatesInFile', () => {
  const row = (overrides: Partial<ImportRow>): ImportRow => ({
    line: 2,
    counterpartyName: 'Ромашка',
    layoutNumber: null,
    barcode: null,
    printedAt: '2026-11-01',
    quantity: 1,
    comment: null,
    ...overrides,
  });

  it('без повторов — пусто', () => {
    expect(
      findDuplicatesInFile([
        row({ line: 2, layoutNumber: '1', barcode: 'A' }),
        row({ line: 3, layoutNumber: '2', barcode: 'B' }),
      ]),
    ).toEqual([]);
  });

  it('пустой список — пусто', () => {
    expect(findDuplicatesInFile([])).toEqual([]);
  });

  it('повтор номера — ошибка на второй строке со ссылкой на первую', () => {
    expect(
      findDuplicatesInFile([
        row({ line: 2, layoutNumber: '7' }),
        row({ line: 5, layoutNumber: '7' }),
        row({ line: 6, layoutNumber: '7' }),
      ]),
    ).toEqual([
      { line: 5, message: 'Номер макета 7 уже есть в строке 2' },
      { line: 6, message: 'Номер макета 7 уже есть в строке 2' },
    ]);
  });

  it('повтор штрихкода, в том числе у строки без номера', () => {
    expect(
      findDuplicatesInFile([
        row({ line: 2, layoutNumber: '1', barcode: 'ABC' }),
        row({ line: 3, barcode: 'ABC' }),
      ]),
    ).toEqual([{ line: 3, message: 'Штрихкод ABC уже есть в строке 2' }]);
  });

  it('пустые номера и штрихкоды повтором не считаются', () => {
    expect(findDuplicatesInFile([row({ line: 2 }), row({ line: 3 })])).toEqual([]);
  });

  it('007 и 7 — разные номера', () => {
    expect(
      findDuplicatesInFile([
        row({ line: 2, layoutNumber: '007' }),
        row({ line: 3, layoutNumber: '7' }),
      ]),
    ).toEqual([]);
  });

  it('совпали и номер, и штрихкод — две ошибки', () => {
    expect(
      findDuplicatesInFile([
        row({ line: 2, layoutNumber: '1', barcode: 'A' }),
        row({ line: 3, layoutNumber: '1', barcode: 'A' }),
      ]),
    ).toHaveLength(2);
  });
});
