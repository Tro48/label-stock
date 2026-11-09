import { z } from 'zod';
import { paginationQuerySchema } from './common';
import {
  barcodeSchema,
  commentSchema,
  isoDateSchema,
  layoutNumberSchema,
  quantitySchema,
  searchTextSchema,
  uuidSchema,
} from './fields';

export const labelSchema = z.object({
  id: z.string(),
  counterparty: z.object({ id: z.string(), name: z.string() }),
  layoutNumber: z.string().nullable(),
  barcode: z.string().nullable(),
  printedAt: z.string(),
  quantity: z.int(),
  comment: z.string().nullable(),
  version: z.int(),
  externalId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

const counterpartyIdSchema = z.uuid({ message: 'Выберите контрагента' });

export const createLabelSchema = z.object({
  counterpartyId: counterpartyIdSchema,
  layoutNumber: layoutNumberSchema.optional(),
  barcode: barcodeSchema.optional(),
  printedAt: isoDateSchema,
  quantity: quantitySchema,
  comment: commentSchema.optional(),
});

/** Остаток здесь не меняется: только через операции с дельтой. */
export const updateLabelSchema = z.object({
  version: z.int().min(1),
  counterpartyId: counterpartyIdSchema.optional(),
  layoutNumber: layoutNumberSchema.optional(),
  barcode: barcodeSchema.optional(),
  printedAt: isoDateSchema.optional(),
  comment: commentSchema.optional(),
});

export const LABEL_SORT_FIELDS = [
  'counterparty',
  'layoutNumber',
  'barcode',
  'printedAt',
  'quantity',
  'updatedAt',
] as const;

export const listLabelsQuerySchema = paginationQuerySchema.extend({
  search: searchTextSchema,
  counterpartyId: uuidSchema.optional(),
  /** Часть названия контрагента: «холдинг» находит «ЖК Холдинг». */
  counterpartyName: searchTextSchema,
  onlyEmpty: z.stringbool().default(false),
  deleted: z.stringbool().default(false),
  sort: z.enum(LABEL_SORT_FIELDS).default('counterparty'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const barcodeParamsSchema = z.object({ code: z.string().min(1).max(256) });

export type Label = z.infer<typeof labelSchema>;
export type CreateLabelInput = z.input<typeof createLabelSchema>;
export type CreateLabelData = z.output<typeof createLabelSchema>;
export type UpdateLabelInput = z.input<typeof updateLabelSchema>;
export type UpdateLabelData = z.output<typeof updateLabelSchema>;
export type LabelSortField = (typeof LABEL_SORT_FIELDS)[number];
export type ListLabelsQuery = z.output<typeof listLabelsQuerySchema>;
/** Параметры списка на стороне клиента: до сериализации в query string. */
export interface ListLabelsParams {
  search?: string | undefined;
  counterpartyName?: string | undefined;
  onlyEmpty?: boolean;
  deleted?: boolean;
  sort?: LabelSortField;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
