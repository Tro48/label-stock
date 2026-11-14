import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  barcodeParamsSchema,
  createLabelResultSchema,
  createLabelSchema,
  errorResponseSchema,
  idParamsSchema,
  labelSchema,
  listLabelsQuerySchema,
  mergeDuplicatesResultSchema,
  paginatedSchema,
  updateLabelSchema,
} from '@label-stock/shared';
import type { LabelsService } from './labels.service';

const tags = ['Позиции'];

export const labelsRoutes =
  (service: LabelsService): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/labels',
      {
        schema: {
          tags,
          summary: 'Список позиций с поиском, фильтрами и сортировкой',
          querystring: listLabelsQuerySchema,
          response: { 200: paginatedSchema(labelSchema), 400: errorResponseSchema },
        },
      },
      (request) => service.list(request.query),
    );

    app.get(
      '/labels/by-barcode/:code',
      {
        schema: {
          tags,
          summary: 'Найти активную позицию по скану штрихкода',
          params: barcodeParamsSchema,
          response: { 200: labelSchema, 404: errorResponseSchema },
        },
      },
      (request) => service.getByBarcode(request.params.code),
    );

    app.get(
      '/labels/:id',
      {
        schema: {
          tags,
          summary: 'Карточка позиции',
          params: idParamsSchema,
          response: { 200: labelSchema, 400: errorResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => service.getById(request.params.id),
    );

    app.post(
      '/labels',
      {
        schema: {
          tags,
          summary: 'Создать позицию; при совпадении номера макета добавить остаток к существующей',
          body: createLabelSchema,
          response: {
            201: createLabelResultSchema,
            400: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => reply.status(201).send(await service.create(request.body)),
    );

    app.post(
      '/labels/merge-duplicates',
      {
        schema: {
          tags,
          summary: 'Найти дубли по номеру макета и объединить их в одну позицию на номер',
          response: { 200: mergeDuplicatesResultSchema },
        },
      },
      () => service.mergeDuplicatesByLayout(),
    );

    app.patch(
      '/labels/:id',
      {
        schema: {
          tags,
          summary: 'Изменить поля позиции, кроме остатка',
          params: idParamsSchema,
          body: updateLabelSchema,
          response: {
            200: labelSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) => service.update(request.params.id, request.body),
    );

    app.delete(
      '/labels/:id',
      {
        schema: {
          tags,
          summary: 'Мягко удалить позицию',
          params: idParamsSchema,
          response: { 204: z.null(), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await service.softDelete(request.params.id);
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/labels/:id/restore',
      {
        schema: {
          tags,
          summary: 'Восстановить удалённую позицию',
          params: idParamsSchema,
          response: { 200: labelSchema, 404: errorResponseSchema, 409: errorResponseSchema },
        },
      },
      (request) => service.restore(request.params.id),
    );
  };
