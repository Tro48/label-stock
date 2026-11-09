import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createMovementSchema,
  errorResponseSchema,
  idParamsSchema,
  movementResultSchema,
  movementSchema,
  paginatedSchema,
  paginationQuerySchema,
} from '@label-stock/shared';
import type { MovementsService } from './movements.service';

const tags = ['Движения остатка'];

export const movementsRoutes =
  (service: MovementsService): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/labels/:id/movements',
      {
        schema: {
          tags,
          summary: 'Изменить остаток: списание, допечатка, инвентаризация, исправление',
          params: idParamsSchema,
          body: createMovementSchema,
          response: {
            201: movementResultSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
            422: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const result = await service.apply(request.params.id, request.body);
        return reply.status(201).send(result);
      },
    );

    app.get(
      '/labels/:id/movements',
      {
        schema: {
          tags,
          summary: 'История изменений остатка позиции',
          params: idParamsSchema,
          querystring: paginationQuerySchema,
          response: { 200: paginatedSchema(movementSchema), 404: errorResponseSchema },
        },
      },
      (request) => service.list(request.params.id, request.query.page, request.query.pageSize),
    );
  };
