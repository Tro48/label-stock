import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createStockRequestSchema,
  errorResponseSchema,
  stockRequestResultSchema,
} from '@label-stock/shared';
import type { StockRequestsService } from './stock-requests.service';

export const stockRequestsRoutes =
  (service: StockRequestsService): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/stock-requests',
      {
        schema: {
          tags: ['Заявки'],
          summary: 'Заявка на перемещение или утилизацию: списывает остаток по всем позициям',
          body: createStockRequestSchema,
          response: {
            201: stockRequestResultSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            422: errorResponseSchema,
          },
        },
      },
      async (request, reply) => reply.status(201).send(await service.create(request.body)),
    );
  };
