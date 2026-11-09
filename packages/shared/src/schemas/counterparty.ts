import { z } from 'zod';
import { counterpartyNameSchema, searchTextSchema } from './fields';

export const COUNTERPARTY_SUGGESTIONS_LIMIT = 20;

export const counterpartySchema = z.object({
  id: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const saveCounterpartySchema = z.object({ name: counterpartyNameSchema });

export const searchCounterpartiesQuerySchema = z.object({
  search: searchTextSchema,
});

export type Counterparty = z.infer<typeof counterpartySchema>;
export type SaveCounterpartyInput = z.input<typeof saveCounterpartySchema>;
