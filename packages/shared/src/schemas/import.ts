import { z } from 'zod';

/** Столбцы CSV — одни и те же для выгрузки и загрузки, чтобы файл ходил туда-обратно через Excel. */
export const CSV_COLUMNS = {
  counterparty: 'Контрагент',
  layoutNumber: '№ макета',
  barcode: 'Штрихкод',
  printedAt: 'Дата печати',
  quantity: 'Остаток',
  comment: 'Комментарий',
} as const;

export type CsvColumn = keyof typeof CSV_COLUMNS;

export const REQUIRED_CSV_COLUMNS: readonly CsvColumn[] = ['counterparty', 'printedAt', 'quantity'];

export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_REPORTED_ERRORS = 100;

export const importQuerySchema = z.object({
  // Пробный прогон: всё проверяется и считается в транзакции, которая затем откатывается.
  dryRun: z.stringbool().default(false),
});

export const importRowErrorSchema = z.object({
  line: z.int(),
  message: z.string(),
});

export const importResultSchema = z.object({
  applied: z.boolean(),
  created: z.int(),
  updated: z.int(),
  unchanged: z.int(),
  errors: z.array(importRowErrorSchema),
  errorsTruncated: z.boolean(),
});

export type ImportRowError = z.infer<typeof importRowErrorSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
