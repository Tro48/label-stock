import { z } from 'zod';
import { uuidSchema } from './fields';

export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  notFound: 'NOT_FOUND',
  versionConflict: 'VERSION_CONFLICT',
  duplicate: 'DUPLICATE',
  labelDeleted: 'LABEL_DELETED',
  negativeStock: 'NEGATIVE_STOCK',
  obsoleteStock: 'OBSOLETE_STOCK',
  rateLimited: 'RATE_LIMITED',
  internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Какое поле дублирует и какой активной позицией оно занято — фронт показывает ссылку на неё. */
export const duplicateDetailsSchema = z.object({
  field: z.enum(['layoutNumber', 'barcode', 'name']),
  conflictingId: z.string(),
});

export type DuplicateDetails = z.infer<typeof duplicateDetailsSchema>;

export const idParamsSchema = z.object({ id: uuidSchema });

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function paginatedSchema<Item extends z.ZodType>(itemSchema: Item) {
  return z.object({
    items: z.array(itemSchema),
    total: z.int().min(0),
    page: z.int().min(1),
    pageSize: z.int().min(1),
  });
}

export interface Paginated<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}
