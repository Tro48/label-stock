import { z } from 'zod';
import { plainTextSchema, quantitySchema, uuidSchema } from './fields';
import { labelSchema } from './label';
import { movementSchema } from './movement';

export const STOCK_REQUEST_KINDS = ['transfer', 'disposal'] as const;
export type StockRequestKind = (typeof STOCK_REQUEST_KINDS)[number];

export const STOCK_REQUEST_TITLES: Readonly<Record<StockRequestKind, string>> = {
  transfer: 'Заявка на перемещение со склада',
  disposal: 'Заявка на утилизацию',
};

export const STOCK_REQUEST_MAX_ITEMS = 100;
export const REQUEST_NUMBER_MAX_LENGTH = 50;

/** Номер заявки из 1С: свободный текст, пустая строка — «номера нет». */
const requestNumberSchema = plainTextSchema()
  .max(REQUEST_NUMBER_MAX_LENGTH, {
    message: `Номер заявки не длиннее ${REQUEST_NUMBER_MAX_LENGTH} символов`,
  })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const hasUniqueLabels = (items: readonly { labelId: string }[]) =>
  new Set(items.map((item) => item.labelId)).size === items.length;

function itemsSchema<Item extends z.ZodType<{ labelId: string }>>(itemSchema: Item) {
  return z
    .array(itemSchema)
    .min(1, { message: 'Выберите хотя бы одну позицию' })
    .max(STOCK_REQUEST_MAX_ITEMS, {
      message: `Не больше ${STOCK_REQUEST_MAX_ITEMS} позиций в заявке`,
    })
    .refine(hasUniqueLabels, { message: 'Позиция указана в заявке дважды' });
}

/**
 * Заявка списывает остаток сразу по всем позициям одной транзакцией: либо все, либо ничего.
 * Утилизируется весь «старый» остаток позиции, поэтому количество в ней не передаётся.
 */
export const createStockRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transfer'),
    requestNumber: requestNumberSchema,
    items: itemsSchema(
      z.object({
        labelId: uuidSchema,
        quantity: quantitySchema.min(1, { message: 'Укажите количество больше нуля' }),
      }),
    ),
  }),
  z.object({
    kind: z.literal('disposal'),
    items: itemsSchema(z.object({ labelId: uuidSchema })),
  }),
]);

export const stockRequestResultSchema = z.object({
  kind: z.enum(STOCK_REQUEST_KINDS),
  createdAt: z.string(),
  /** Номер заявки в 1С, если его ввели; у утилизации всегда null. */
  requestNumber: z.string().nullable(),
  /** В том же порядке, что и в запросе. */
  items: z.array(z.object({ label: labelSchema, movement: movementSchema })),
});

export type CreateStockRequestInput = z.input<typeof createStockRequestSchema>;
export type CreateStockRequestData = z.output<typeof createStockRequestSchema>;
export type StockRequestResult = z.infer<typeof stockRequestResultSchema>;
