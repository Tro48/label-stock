import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createPool } from '../src/db/client';
import { createCounterparty, MISSING_ID, useTestApp } from './helpers';

const LEAK_MARKERS = [
  'stack',
  'at ',
  'node_modules',
  'SELECT',
  'select',
  'ECONNREFUSED',
  '127.0.0.1',
];

function expectNoLeak(body: string) {
  for (const marker of LEAK_MARKERS) expect(body).not.toContain(marker);
}

describe('ошибки и служебные маршруты', () => {
  const context = useTestApp();

  it('/api/health → 200 при живой БД', async () => {
    const response = await context.app.inject({ url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('неизвестный /api/xxx → 404 JSON', async () => {
    const response = await context.app.inject({ url: '/api/xxx' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', message: expect.any(String) });
  });

  it('битый JSON → 400 в общем формате', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { 'content-type': 'application/json' },
      payload: '{"counterpartyId": ',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    });
    expectNoLeak(response.body);
  });

  it('тело не объект → 400', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/counterparties',
      headers: { 'content-type': 'application/json' },
      payload: '"просто строка"',
    });
    expect(response.statusCode).toBe(400);
  });

  it('ошибка валидации: details с полями', async () => {
    const counterparty = await createCounterparty(context.app);
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: { counterpartyId: counterparty.id, printedAt: 'мусор', quantity: -1 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { printedAt: expect.any(String), quantity: expect.any(String) },
    });
  });

  it('404 по позиции — в общем формате { code, message }', async () => {
    const response = await context.app.inject({ url: `/api/labels/${MISSING_ID}` });
    expect(Object.keys(response.json()).sort()).toEqual(['code', 'message']);
  });
});

describe('необработанная ошибка → 500 без деталей', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool({
      connectionString: 'postgres://u:p@127.0.0.1:1/db',
      max: 1,
      statementTimeoutMs: 1000,
    });
    app = await buildApp({ pool, logger: false, rateLimitMaxPerMinute: 1000 });
    app.get('/api/test-boom', () => {
      throw new Error('секрет: postgres://admin:hunter2@db/labels');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('исключение в обработчике → 500 INTERNAL_ERROR без стека и текста ошибки', async () => {
    const response = await app.inject({ url: '/api/test-boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
    expect(response.body).not.toContain('hunter2');
    expectNoLeak(response.body);
  });
});

describe('БД недоступна', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool({
      connectionString: 'postgres://u:p@127.0.0.1:1/db',
      max: 2,
      statementTimeoutMs: 1000,
    });
    app = await buildApp({ pool, logger: false, rateLimitMaxPerMinute: 1000 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('/api/health → 503', async () => {
    const response = await app.inject({ url: '/api/health' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable', database: 'down' });
  });

  it.each([
    ['GET список', { method: 'GET' as const, url: '/api/labels' }],
    ['GET карточка', { method: 'GET' as const, url: `/api/labels/${MISSING_ID}` }],
    [
      'POST контрагент',
      { method: 'POST' as const, url: '/api/counterparties', payload: { name: 'X' } },
    ],
    ['GET CSV', { method: 'GET' as const, url: '/api/export.csv' }],
  ])('%s → 500 без стека, SQL и адреса БД', async (_name, request) => {
    const response = await app.inject(request);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
    expectNoLeak(response.body);
  });

  it('валидация срабатывает до БД: невалидный запрос → 400, а не 500', async () => {
    const response = await app.inject({ url: '/api/labels/abc' });
    expect(response.statusCode).toBe(400);
  });
});

describe('rate limit', () => {
  const context = useTestApp({ rateLimitMaxPerMinute: 3 });

  it('4-й запрос в минуту → 429 RATE_LIMITED', async () => {
    const statuses: number[] = [];
    let lastBody = '';
    for (let index = 0; index < 4; index++) {
      const response = await context.app.inject({ url: '/api/counterparties' });
      statuses.push(response.statusCode);
      lastBody = response.body;
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(JSON.parse(lastBody)).toMatchObject({
      code: 'RATE_LIMITED',
      message: expect.any(String),
    });
  });

  it('/api/health не ограничивается', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => context.app.inject({ url: '/api/health' })),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
  });
});
