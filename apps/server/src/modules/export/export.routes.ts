import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { formatIsoDateRu, todayIsoDate } from '@label-stock/shared';
import type { LabelsRepository } from '../labels/labels.repository';
import { toCsv } from './csv';

const HEADER = ['Контрагент', '№ макета', 'Штрихкод', 'Дата печати', 'Остаток', 'Комментарий'];

export const exportRoutes =
  (labels: LabelsRepository): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/export.csv',
      {
        schema: {
          tags: ['Выгрузка'],
          summary: 'Остатки в CSV для Excel: UTF-8 с BOM, разделитель «;»',
          produces: ['text/csv'],
        },
      },
      async (_request, reply) => {
        const rows = await labels.listActiveForExport();
        const csv = toCsv(
          HEADER,
          rows.map(({ label, counterpartyName }) => [
            counterpartyName,
            label.layoutNumber,
            label.barcode,
            formatIsoDateRu(label.printedAt),
            label.quantity,
            label.comment,
          ]),
        );
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="ostatki-${todayIsoDate()}.csv"`)
          .send(csv);
      },
    );
  };
