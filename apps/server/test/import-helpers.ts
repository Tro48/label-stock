import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { ImportResult } from '@label-stock/shared';

export const CSV_HEADER = 'Контрагент;№ макета;Штрихкод;Дата печати;Остаток;Комментарий';

/** CSV из строк данных под стандартным заголовком; строки уже записаны через `;`. */
export function csvOf(...lines: string[]): string {
  return [CSV_HEADER, ...lines].join('\r\n') + '\r\n';
}

export function postImport(
  app: FastifyInstance,
  csv: string,
  {
    dryRun,
    contentType = 'text/csv; charset=utf-8',
  }: { dryRun?: boolean; contentType?: string } = {},
) {
  return app.inject({
    method: 'POST',
    url: dryRun === undefined ? '/api/import.csv' : `/api/import.csv?dryRun=${dryRun}`,
    headers: { 'content-type': contentType },
    payload: csv,
  });
}

/** Загрузка, которая обязана ответить 200: возвращает отчёт. */
export async function importCsv(
  app: FastifyInstance,
  csv: string,
  options: { dryRun?: boolean } = {},
): Promise<ImportResult> {
  const response = await postImport(app, csv, options);
  if (response.statusCode !== 200) {
    throw new Error(`Загрузка не прошла: ${response.statusCode} ${response.body}`);
  }
  return response.json<ImportResult>();
}

export interface StoredLabel {
  id: string;
  counterparty: string;
  layoutNumber: string | null;
  barcode: string | null;
  printedAt: string;
  quantity: number;
  comment: string | null;
  version: number;
  deleted: boolean;
}

/** Все позиции прямо из БД, мимо API: проверяем, что откат действительно ничего не оставил. */
export async function readLabels(pool: pg.Pool): Promise<StoredLabel[]> {
  const result = await pool.query<StoredLabel>(
    `SELECT l.id, c.name AS counterparty, l.layout_number AS "layoutNumber", l.barcode,
            l.printed_at::text AS "printedAt", l.quantity, l.comment, l.version,
            l.deleted_at IS NOT NULL AS deleted
       FROM labels l JOIN counterparties c ON c.id = l.counterparty_id
      ORDER BY l.created_at, l.layout_number NULLS LAST, l.id`,
  );
  return result.rows;
}

export async function readCounterpartyNames(pool: pg.Pool): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    'SELECT name FROM counterparties ORDER BY name',
  );
  return result.rows.map((row) => row.name);
}

/** Журнал с комментариями: проверяем, что загрузка подписывает движения. */
export async function readJournalWithComments(pool: pg.Pool, labelId: string) {
  const result = await pool.query<{ delta: number; reason: string; comment: string | null }>(
    'SELECT delta, reason, comment FROM stock_movements WHERE label_id = $1 ORDER BY created_at, id',
    [labelId],
  );
  return result.rows;
}

/** Снимок всех таблиц: до и после неудачной загрузки он должен совпасть. */
export async function snapshotDatabase(pool: pg.Pool) {
  const [labels, counterparties, movements] = await Promise.all([
    pool.query('SELECT * FROM labels ORDER BY id'),
    pool.query('SELECT * FROM counterparties ORDER BY id'),
    pool.query('SELECT * FROM stock_movements ORDER BY id'),
  ]);
  return { labels: labels.rows, counterparties: counterparties.rows, movements: movements.rows };
}
