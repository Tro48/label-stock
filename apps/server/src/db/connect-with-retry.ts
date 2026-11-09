import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { setTimeout as sleep } from 'node:timers/promises';

export interface RetryOptions {
  retries: number;
  delayMs: number;
  logger: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

/**
 * При `docker compose up` PostgreSQL может подниматься дольше приложения.
 * Повторяем подключение с паузой и пишем в лог понятную причину, а не падаем молча.
 */
export async function waitForDatabase(
  pool: pg.Pool,
  { retries, delayMs, logger }: RetryOptions,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      logger.info('Соединение с PostgreSQL установлено');
      return;
    } catch (error) {
      if (attempt > retries) {
        throw new Error(`PostgreSQL недоступен после ${attempt} попыток`, { cause: error });
      }
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(
        `PostgreSQL недоступен (${reason}), попытка ${attempt} из ${retries + 1}, повтор через ${delayMs} мс`,
      );
      await sleep(delayMs);
    }
  }
}
