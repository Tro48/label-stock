// Excel в русской локали открывает такой файл двойным кликом без мастера импорта:
// BOM включает UTF-8, `;` — системный разделитель списков, CRLF — привычный перевод строки.
const UTF8_BOM = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

const NEEDS_QUOTING = /[";\r\n]/;
// Ячейка с `=`, `+`, `-`, `@` в начале Excel исполняет как формулу (CSV injection).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export type CsvCell = string | number | null;

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return String(cell);
  const safe = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return NEEDS_QUOTING.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(SEPARATOR));
  return UTF8_BOM + lines.join(LINE_BREAK) + LINE_BREAK;
}
