import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  counterpartySchema,
  errorResponseSchema,
  idParamsSchema,
  saveCounterpartySchema,
  searchCounterpartiesQuerySchema,
} from '@label-stock/shared';
import type { CounterpartiesService } from './counterparties.service';

const tags = ['Контрагенты'];

export const counterpartiesRoutes =
  (service: CounterpartiesService): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/counterparties',
      {
        schema: {
          tags,
          summary: 'Автодополнение контрагентов',
          querystring: searchCounterpartiesQuerySchema,
          response: { 200: z.array(counterpartySchema) },
        },
      },
      (request) => service.search(request.query.search),
    );

    app.post(
      '/counterparties',
      {
        schema: {
          tags,
          summary: 'Создать контрагента или вернуть существующего',
          body: saveCounterpartySchema,
          response: { 200: counterpartySchema, 201: counterpartySchema, 400: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { counterparty, created } = await service.create(request.body.name);
        return reply.status(created ? 201 : 200).send(counterparty);
      },
    );

    app.patch(
      '/counterparties/:id',
      {
        schema: {
          tags,
          summary: 'Переименовать контрагента',
          params: idParamsSchema,
          body: saveCounterpartySchema,
          response: {
            200: counterpartySchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) => service.rename(request.params.id, request.body.name),
    );
  };
