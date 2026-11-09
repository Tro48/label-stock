import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { waitForDatabase } from './connect-with-retry';

function fakePool(results: Array<Error | 'ok'>) {
  const query = vi.fn(async () => {
    const next = results.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    return { rows: [] };
  });
  return { pool: { query } as unknown as pg.Pool, query };
}

const fakeLogger = () => ({ info: vi.fn(), warn: vi.fn() });

describe('waitForDatabase', () => {
  it('сразу возвращается, если БД доступна', async () => {
    const { pool, query } = fakePool(['ok']);
    const logger = fakeLogger();
    await waitForDatabase(pool, { retries: 3, delayMs: 0, logger });
    expect(query).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('повторяет, пока БД не поднимется, и пишет причину в лог', async () => {
    const { pool, query } = fakePool([new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), 'ok']);
    const logger = fakeLogger();
    await waitForDatabase(pool, { retries: 5, delayMs: 0, logger });
    expect(query).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0]?.[0]).toContain('ECONNREFUSED');
  });

  it('после исчерпания попыток падает с исходной причиной в cause', async () => {
    const cause = new Error('ECONNREFUSED');
    const { pool, query } = fakePool([cause, cause, cause, cause]);
    const error = await waitForDatabase(pool, { retries: 2, delayMs: 0, logger: fakeLogger() })
      .then(() => undefined)
      .catch((caught: unknown) => caught as Error);
    expect(query).toHaveBeenCalledTimes(3);
    expect(error?.message).toContain('3 попыток');
    expect(error?.cause).toBe(cause);
  });

  it('retries = 0 — одна попытка без повторов', async () => {
    const { pool, query } = fakePool([new Error('down')]);
    await expect(
      waitForDatabase(pool, { retries: 0, delayMs: 0, logger: fakeLogger() }),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
