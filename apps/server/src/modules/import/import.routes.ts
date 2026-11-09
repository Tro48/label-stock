import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  IMPORT_MAX_BYTES,
  errorResponseSchema,
  importQuerySchema,
  importResultSchema,
} from '@label-stock/shared';
import type { ImportService } from './import.service';

export const importRoutes =
  (service: ImportService): FastifyPluginAsyncZod =>
  async (app) => {
    // Тело — сам CSV-файл как есть: без multipart и без перекодирования в JSON.
    app.addContentTypeParser(
      ['text/csv', 'text/plain'],
      { parseAs: 'string', bodyLimit: IMPORT_MAX_BYTES },
      (_request, body, done) => done(null, body),
    );

    app.post(
      '/import.csv',
      {
        schema: {
          tags: ['Выгрузка'],
          summary:
            'Загрузить позиции из CSV (формат как у выгрузки); ?dryRun=true — только проверить',
          consumes: ['text/csv'],
          querystring: importQuerySchema,
          body: z.string(),
          response: { 200: importResultSchema, 400: errorResponseSchema, 413: errorResponseSchema },
        },
      },
      (request) => service.run(request.body, request.query.dryRun),
    );
  };
