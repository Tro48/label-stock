import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import type { Counterparty, CreateLabelInput, Label } from '@label-stock/shared';
import { buildApp } from '../src/app';
import { createPool } from '../src/db/client';

export interface TestContext {
  app: FastifyInstance;
  pool: pg.Pool;
}

/**
 * Поднимает приложение на общем тестовом PostgreSQL и чистит таблицы перед каждым тестом.
 * Возвращает объект, поля которого заполняются в beforeAll.
 */
export function useTestApp(options: { rateLimitMaxPerMinute?: number } = {}): TestContext {
  const context = {} as TestContext;

  beforeAll(async () => {
    context.pool = createPool({
      connectionString: inject('databaseUrl'),
      max: 10,
      statementTimeoutMs: 10_000,
    });
    context.app = await buildApp({
      pool: context.pool,
      logger: false,
      rateLimitMaxPerMinute: options.rateLimitMaxPerMinute ?? 100_000,
    });
    await context.app.ready();
  });

  beforeEach(async () => {
    await context.pool.query('TRUNCATE stock_movements, labels, counterparties CASCADE');
  });

  afterAll(async () => {
    await context.app?.close();
    await context.pool?.end();
  });

  return context;
}

export async function createCounterparty(app: FastifyInstance, name = 'Ромашка') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/counterparties',
    payload: { name },
  });
  return response.json<Counterparty>();
}

export async function createLabel(
  app: FastifyInstance,
  overrides: Partial<CreateLabelInput> = {},
): Promise<Label> {
  const counterpartyId = overrides.counterpartyId ?? (await createCounterparty(app)).id;
  const response = await app.inject({
    method: 'POST',
    url: '/api/labels',
    payload: { counterpartyId, printedAt: '2026-11-01', quantity: 100, ...overrides },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Позиция не создана: ${response.statusCode} ${response.body}`);
  }
  return response.json<Label>();
}

export function postMovement(app: FastifyInstance, labelId: string, payload: object) {
  return app.inject({ method: 'POST', url: `/api/labels/${labelId}/movements`, payload });
}

/** Журнал позиции прямо из БД, мимо API: проверяем, что лишних записей не появилось. */
export async function readJournal(pool: pg.Pool, labelId: string) {
  const result = await pool.query<{ delta: number; quantity_after: number; reason: string }>(
    'SELECT delta, quantity_after, reason FROM stock_movements WHERE label_id = $1 ORDER BY created_at, id',
    [labelId],
  );
  return result.rows;
}

export async function readQuantity(pool: pg.Pool, labelId: string): Promise<number> {
  const result = await pool.query<{ quantity: number }>(
    'SELECT quantity FROM labels WHERE id = $1',
    [labelId],
  );
  return result.rows[0]!.quantity;
}

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
