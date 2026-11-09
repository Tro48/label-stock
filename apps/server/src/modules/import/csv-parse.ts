const UTF8_BOM = '﻿';
const QUOTE = '"';

/** Excel в русской локали сохраняет CSV с `;`, в английской — с `,`. Определяем по строке заголовка. */
export function detectDelimiter(text: string): ';' | ',' {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (char: string) => firstLine.split(char).length - 1;
  return count(',') > count(';') ? ',' : ';';
}

export interface ParsedCsv {
  records: string[][];
  /** Номер строки Excel для каждой записи: пустые строки пропущены, но в нумерации учтены. */
  lines: number[];
}

/** Записи CSV как массивы ячеек, без номеров строк. */
export function parseCsv(input: string): string[][] {
  return parseCsvWithLines(input).records;
}

/**
 * Разбор CSV по RFC 4180: поля в кавычках могут содержать разделитель, кавычки (`""`) и переводы
 * строк. Пустые строки пропускаются. Запись с переводом строки внутри ячейки — одна строка Excel.
 */
export function parseCsvWithLines(input: string): ParsedCsv {
  const text = input.startsWith(UTF8_BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  const lines: number[] = [];
  let recordNumber = 0;
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;

  const endCell = () => {
    record.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    recordNumber++;
    if (record.some((value) => value.trim() !== '')) {
      records.push(record);
      lines.push(recordNumber);
    }
    record = [];
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (inQuotes) {
      if (char !== QUOTE) cell += char;
      else if (text[index + 1] === QUOTE) {
        cell += QUOTE;
        index++;
      } else inQuotes = false;
      continue;
    }
    if (char === QUOTE && cell === '') inQuotes = true;
    else if (char === delimiter) endCell();
    else if (char === '\n') endRecord();
    else if (char !== '\r') cell += char;
  }
  if (cell !== '' || record.length > 0) endRecord();
  return { records, lines };
}
