import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type pg from 'pg';
import { z } from 'zod';

const healthSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['up', 'down']),
});

export const healthRoutes =
  (pool: pg.Pool): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/health',
      {
        config: { rateLimit: false },
        // Healthcheck Docker дёргает маршрут каждые 30 с — не засоряем им лог.
        logLevel: 'warn',
        schema: {
          tags: ['Служебное'],
          summary: 'Состояние приложения и соединения с БД',
          response: { 200: healthSchema, 503: healthSchema },
        },
      },
      async (request, reply) => {
        try {
          await pool.query('SELECT 1');
          return { status: 'ok' as const, database: 'up' as const };
        } catch (error) {
          request.log.warn({ err: error }, 'Проверка здоровья: БД недоступна');
          return reply.status(503).send({ status: 'unavailable', database: 'down' });
        }
      },
    );
  };
