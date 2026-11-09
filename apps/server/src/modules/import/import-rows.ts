import {
  CSV_COLUMNS,
  IMPORT_MAX_ROWS,
  REQUIRED_CSV_COLUMNS,
  barcodeSchema,
  commentSchema,
  counterpartyNameSchema,
  layoutNumberSchema,
  parseRuOrIsoDate,
  quantitySchema,
  ERROR_CODES,
  type CsvColumn,
  type ImportRowError,
} from '@label-stock/shared';
import type { z } from 'zod';
import { AppError } from '../../shared/errors';

export interface ImportRow {
  /** Номер строки в файле, как его показывает Excel (заголовок — строка 1). */
  line: number;
  counterpartyName: string;
  layoutNumber: string | null;
  barcode: string | null;
  printedAt: string;
  quantity: number;
  comment: string | null;
}

// Выгрузка экранирует формулы апострофом (`'=…`); при загрузке снимаем его, чтобы файл
// возвращался без изменений.
const ESCAPED_FORMULA = /^'(?=[=+\-@\t\r'])/;
// Excel может сохранить «1 200» с пробелом между разрядами; \s покрывает и неразрывные пробелы.
const DIGIT_GROUP_SEPARATORS = /\s/g;

const invalidFile = (message: string) => new AppError(400, ERROR_CODES.validation, message);

function mapHeader(header: readonly string[]): Map<CsvColumn, number> {
  const normalized = header.map((title) => title.trim().toLocaleLowerCase('ru'));
  const indexes = new Map<CsvColumn, number>();
  for (const [column, title] of Object.entries(CSV_COLUMNS) as [CsvColumn, string][]) {
    const index = normalized.indexOf(title.toLocaleLowerCase('ru'));
    if (index !== -1) indexes.set(column, index);
  }
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !indexes.has(column));
  if (missing.length > 0) {
    const titles = missing.map((column) => `«${CSV_COLUMNS[column]}»`).join(', ');
    throw invalidFile(`В первой строке файла нет столбцов: ${titles}`);
  }
  return indexes;
}

function firstIssue(result: z.ZodSafeParseResult<unknown>): string {
  return result.success ? '' : (result.error.issues[0]?.message ?? 'Некорректное значение');
}

/**
 * Разбирает записи CSV в строки импорта; ошибки собираются построчно, а не по первой.
 * lines — номера строк Excel для записей (см. parseCsvWithLines); по умолчанию записи идут подряд.
 */
export function toImportRows(
  records: readonly string[][],
  lines: readonly number[] = records.map((_record, index) => index + 1),
): {
  rows: ImportRow[];
  errors: ImportRowError[];
} {
  const [header, ...dataRecords] = records;
  if (!header) throw invalidFile('Файл пустой');
  if (dataRecords.length === 0) throw invalidFile('В файле нет строк с данными');
  if (dataRecords.length > IMPORT_MAX_ROWS) {
    throw invalidFile(`В файле больше ${IMPORT_MAX_ROWS} строк, разбейте его на части`);
  }
  const indexes = mapHeader(header);
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  dataRecords.forEach((record, index) => {
    const line = lines[index + 1] ?? index + 2;
    const cell = (column: CsvColumn) => {
      const columnIndex = indexes.get(column);
      const raw = columnIndex === undefined ? '' : (record[columnIndex] ?? '');
      return raw.replace(ESCAPED_FORMULA, '');
    };
    const fail = (column: CsvColumn, message: string) =>
      errors.push({ line, message: `${CSV_COLUMNS[column]}: ${message}` });

    const counterpartyName = counterpartyNameSchema.safeParse(cell('counterparty'));
    const layoutNumber = layoutNumberSchema.safeParse(cell('layoutNumber'));
    const barcode = barcodeSchema.safeParse(cell('barcode'));
    const printedAt = parseRuOrIsoDate(cell('printedAt'));
    const quantityText = cell('quantity').replace(DIGIT_GROUP_SEPARATORS, '');
    const quantity = quantitySchema.safeParse(
      /^\d+$/.test(quantityText) ? Number(quantityText) : NaN,
    );
    const comment = commentSchema.safeParse(cell('comment'));

    const errorsBefore = errors.length;
    if (!counterpartyName.success) fail('counterparty', firstIssue(counterpartyName));
    if (!layoutNumber.success) fail('layoutNumber', firstIssue(layoutNumber));
    if (!barcode.success) fail('barcode', firstIssue(barcode));
    if (!printedAt) fail('printedAt', 'ожидается дата вида 01.11.2026');
    if (!quantity.success) fail('quantity', 'ожидается целое число не меньше нуля');
    if (!comment.success) fail('comment', firstIssue(comment));
    if (errors.length > errorsBefore) return;

    rows.push({
      line,
      counterpartyName: counterpartyName.data!,
      layoutNumber: layoutNumber.data ?? null,
      barcode: barcode.data ?? null,
      printedAt: printedAt!,
      quantity: quantity.data!,
      comment: comment.data ?? null,
    });
  });

  return { rows, errors };
}

/** Один номер макета или штрихкод не может встречаться в файле дважды. */
export function findDuplicatesInFile(rows: readonly ImportRow[]): ImportRowError[] {
  const errors: ImportRowError[] = [];
  const seen = { layoutNumber: new Map<string, number>(), barcode: new Map<string, number>() };
  const titles = { layoutNumber: 'Номер макета', barcode: 'Штрихкод' };
  for (const row of rows) {
    for (const field of ['layoutNumber', 'barcode'] as const) {
      const value = row[field];
      if (!value) continue;
      const firstLine = seen[field].get(value);
      if (firstLine === undefined) seen[field].set(value, row.line);
      else {
        errors.push({
          line: row.line,
          message: `${titles[field]} ${value} уже есть в строке ${firstLine}`,
        });
      }
    }
  }
  return errors;
}
